/*
 * Molbhav Stall Sign: shows whether a stall is open, paused or closed.
 *
 *   - Traffic light: green open, yellow paused, red closed (green blinks while a deal is running)
 *   - 1.3" OLED: shop name, status, deal, Wi-Fi
 *   - Bluetooth beacon (BEACON.md) with the agent id and status, named with the stall's ENS label once
 *     it has one (else "MolbhavA-<agent id>"), so phones nearby know the stall with no Wi-Fi or pairing
 *   - Wi-Fi sync with the server (optional): button presses are sent up, and changes made in the app
 *     come back down, with the current deal
 *
 * Buttons: POWER opens and closes the stall. PAUSE pauses it for PAUSE_MIN minutes (press again to open).
 *
 * One firmware build serves every shop: each chip keeps its own agent id, name, server and token in
 * flash. Set them over USB (tools/provision.py, or type "help" in the serial monitor) or on the setup
 * page of the chip's hotspot.
 *
 * Boards: classic ESP32 and ESP32-S3. Settings: config.h. Wiring: ../README.md.
 */

#include <Arduino.h>
#include <Wire.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <Preferences.h>
#include <WiFiManager.h>
#include <ArduinoJson.h>
#include <NimBLEDevice.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SH110X.h>

#include "config.h"

// ---------- Types ----------

// Beacon status byte. IN_DEAL is never stored: it is shown while the stall is open and a deal is running.
enum Status : uint8_t { ST_CLOSED = 0, ST_OPEN = 1, ST_PAUSED = 2, ST_IN_DEAL = 3 };

// This chip's shop. Saved in flash (Preferences namespace "shop"), defaults from config.h.
struct Shop {
  String agentId;
  String name;
  String server;
  String token;
};

struct Deal {
  bool active;
  String id;
  String item;
  String state;  // "bargaining" or "agreed"
  long price;
};

struct Button {
  uint8_t pin;
  bool down;
  uint32_t changedAt;
};

// ---------- Hardware ----------

Adafruit_SH1106G display(128, 64, &Wire, -1);
bool screenOk = false;
WiFiManager wifiManager;
Preferences prefs;      // "sign": last status
Preferences shopPrefs;  // "shop": this chip's shop settings

Button powerButton = {PIN_BTN_POWER, false, 0};
Button pauseButton = {PIN_BTN_PAUSE, false, 0};

// Fields on the setup page. Prefer claim pack (one paste) or Wi‑Fi only + OLED code in the app.
WiFiManagerParameter fieldClaim("claim", "Claim pack from Molbhav app (optional)", "", 200);
WiFiManagerParameter fieldName("name", "Stall name (optional)", "", 40);
WiFiManagerParameter fieldAgent("agent", "Agent id (advanced)", "", 16);
WiFiManagerParameter fieldServer("server", "Server URL (advanced)", "", 100);
WiFiManagerParameter fieldToken("token", "Device token (advanced)", "", 100);

// ---------- State ----------

Shop shop;
String apName;   // setup hotspot, e.g. Molbhav-Setup-1170
String chipId;   // MAC hex for claim register
// Random secret proving this is the same chip when it claims (anyone nearby can learn the MAC).
// Kept in the "sign" namespace, so reset-shop doesn't change it; made once Wi-Fi is up, because
// the hardware random generator is only truly random while the radio runs.
String claimSecret;
String claimCode;  // 6 digits shown while waiting for the shop app
uint32_t lastClaimTry = 0;

Status status = ST_CLOSED;
uint32_t statusChangedAt = 0;
uint32_t pauseEndsAt = 0;  // millis() when a pause ends
Deal deal = {false, "", "", "", 0};
String stallName;
String upiId = "";
String ensLabel = "";  // from the server: the stall's ENS label, "" until it has one (BEACON.md)
String ensFor = "";    // the agent id that label came with (a re-setup for another shop drops it)
int dealsToday = 0;

bool wifiConnecting = false;
bool portalOpen = false;
bool serverOk = false;
bool dirty = false;  // a button change hasn't reached the server yet
uint32_t lastPoll = 0;
uint32_t lastPushTry = 0;
uint32_t restartAt = 0;  // set after new settings are saved
int beaconSent = -1;     // last status byte broadcast, -1 = not broadcasting
String nameSent;         // last scan-response name broadcast

// ---------- Small helpers ----------

bool validAgentId(const String& id) {
  if (id.length() != 16 || !id.startsWith("agent_")) return false;
  for (int i = 6; i < 16; i++) {
    char c = id[i];
    if (!((c >= '0' && c <= '9') || (c >= 'a' && c <= 'f'))) return false;
  }
  return true;
}

bool configured() { return validAgentId(shop.agentId); }
bool serverEnabled() { return shop.server.length() > 0; }

// An ENS label as the server makes them: 3-29 of a-z, 0-9 and single inner hyphens.
bool validLabel(const String& s) {
  if (s.length() < 3 || s.length() > BEACON_LABEL_MAX) return false;
  if (s[0] == '-' || s[s.length() - 1] == '-') return false;
  for (size_t i = 0; i < s.length(); i++) {
    char c = s[i];
    bool ok = (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') || c == '-';
    if (!ok || (c == '-' && s[i + 1] == '-')) return false;
  }
  return true;
}

// The scan-response name: the ENS label phones resolve (<label>.molbhav.eth), else MolbhavA-<id>.
String beaconName() {
  bool mine = ensFor == shop.agentId && validLabel(ensLabel);
  return mine ? ensLabel : String(BEACON_NAME_PREFIX) + shop.agentId;
}

uint32_t pauseLeftMs() {
  int32_t left = (int32_t)(pauseEndsAt - millis());
  return (status == ST_PAUSED && left > 0) ? (uint32_t)left : 0;
}

uint32_t pauseLeftMin() { return (pauseLeftMs() + 59999) / 60000; }

uint8_t beaconByte() {
  if (status == ST_OPEN && deal.active) return ST_IN_DEAL;
  return status;
}

const char* statusName(Status s) {
  switch (s) {
    case ST_OPEN: return "open";
    case ST_PAUSED: return "paused";
    default: return "closed";
  }
}

Status statusFromName(const char* s, Status fallback) {
  if (!s) return fallback;
  if (strcmp(s, "open") == 0) return ST_OPEN;
  if (strcmp(s, "paused") == 0) return ST_PAUSED;
  if (strcmp(s, "closed") == 0) return ST_CLOSED;
  return fallback;
}

bool pressed(Button& b) {
  bool isDown = digitalRead(b.pin) == LOW;
  uint32_t now = millis();
  if (isDown == b.down || now - b.changedAt < DEBOUNCE_MS) return false;
  b.down = isDown;
  b.changedAt = now;
  return isDown;  // true only on the press edge (high→low), not on release
}

// ---------- Buzzer ----------
// On an LEDC channel. Single beeps stop from loop(), so they never hold up the sign.

const uint8_t BUZZER_CHANNEL = 0;
uint32_t beepEndsAt = 0;

void buzzerBegin() {
#if ESP_ARDUINO_VERSION_MAJOR >= 3
  ledcAttach(PIN_BUZZER, 2000, 8);
#else
  ledcSetup(BUZZER_CHANNEL, 2000, 8);
  ledcAttachPin(PIN_BUZZER, BUZZER_CHANNEL);
#endif
}

void buzz(uint32_t freq) {
#if ESP_ARDUINO_VERSION_MAJOR >= 3
  ledcWriteTone(PIN_BUZZER, freq);
#else
  ledcWriteTone(BUZZER_CHANNEL, freq);
#endif
}

void beep(int freq, int ms) {
  buzz(freq);
  beepEndsAt = millis() + ms;
}

void serviceBuzzer() {
  if (beepEndsAt && (int32_t)(millis() - beepEndsAt) >= 0) {
    buzz(0);
    beepEndsAt = 0;
  }
}

// ---------- Traffic light ----------

void lights(bool r, bool y, bool g) {
  digitalWrite(PIN_LIGHT_RED, r);
  digitalWrite(PIN_LIGHT_YELLOW, y);
  digitalWrite(PIN_LIGHT_GREEN, g);
}

void renderLights() {
  uint32_t now = millis();
  if (!configured()) {
    // Not set up yet: the three lights take turns.
    int k = (now / 400) % 3;
    lights(k == 0, k == 1, k == 2);
    return;
  }
  switch (beaconByte()) {
    case ST_OPEN: lights(0, 0, 1); break;
    case ST_PAUSED: lights(0, (now / 700) % 2 == 0, 0); break;  // slow yellow blink
    case ST_IN_DEAL: lights(0, 0, (now / 250) % 2 == 0); break;  // quick green blink
    default: lights(1, 0, 0);
  }
}

// Three rising notes and a long high one with the green light flashing: a deal was agreed.
void chime() {
  const int notes[] = {1047, 1319, 1568};  // C6, E6, G6
  for (int hz : notes) {
    lights(0, 0, 1);
    buzz(hz);
    delay(120);
    lights(0, 0, 0);
    buzz(0);
    delay(40);
  }
  lights(0, 0, 1);
  buzz(2093);  // C7
  delay(350);
  buzz(0);
}

// ---------- Screen (1.3" SH1106 OLED, 128 x 64) ----------

void screenBegin() {
  Wire.begin(PIN_OLED_SDA, PIN_OLED_SCL);
  screenOk = display.begin(OLED_ADDRESS, true) || display.begin(0x3D, true);
  Serial.println(screenOk ? "Screen ready" : "Screen not found: check SDA, SCL, VCC (3V3) and GND");
}

String fit(const String& s, int chars) { return (int)s.length() <= chars ? s : s.substring(0, chars - 1) + "."; }

String wifiLine() {
  if (portalOpen) return "Setup: " + apName;
  if (wifiConnecting) return "WiFi: connecting...";
  if (WiFi.status() != WL_CONNECTED) return "WiFi: offline";
  String s = "WiFi " + String(WiFi.RSSI()) + "dBm";
  if (serverEnabled()) s += serverOk ? " server ok" : " no server";
  if (dirty && serverEnabled()) s += " ..";
  return s;
}

// Builds the screen as text so it can be compared and only redrawn when it changes.
void screenLines(String& title, String& word, String& line1, String& line2, String& foot) {
  title = fit(stallName, 21);
  foot = fit(wifiLine(), 21);
  if (!configured()) {
    title = "Molbhav Stall Sign";
    if (claimCode.length() == 6 && WiFi.status() == WL_CONNECTED) {
      word = claimCode;
      line1 = "Enter code in shop app";
      line2 = "Molbhav → Stall sign";
    } else if (portalOpen) {
      word = "SET UP";
      line1 = "Join " + apName;
      line2 = "Pass " + String(SETUP_AP_PASSWORD);
    } else if (WiFi.status() != WL_CONNECTED) {
      word = "SET UP";
      line1 = "Connecting WiFi...";
      line2 = "Then enter code in app";
    } else {
      word = "SET UP";
      line1 = "Getting claim code...";
      line2 = serverOk ? "Talking to Molbhav" : "Server not reached yet";
    }
    return;
  }
  switch (beaconByte()) {
    case ST_OPEN:
      word = "OPEN";
      line1 = "Taking orders";
      line2 = "Deals today: " + String(dealsToday);
      break;
    case ST_PAUSED:
      word = "PAUSED";
      line1 = "Back in " + String(pauseLeftMin()) + " min";
      line2 = "Not taking orders";
      break;
    case ST_IN_DEAL:
      if (deal.state == "agreed") {
        word = "AGREED";
        line1 = fit("Pay Rs " + String(deal.price), 21);
        line2 = fit(upiId.length() ? "UPI " + upiId : deal.item, 21);
      } else {
        word = "DEAL";
        line1 = fit(deal.item, 21);
        line2 = fit("Offer Rs " + String(deal.price), 21);
      }
      break;
    default:
      word = "CLOSED";
      line1 = "Press POWER to open";
      line2 = "";
  }
}

void refreshScreen(bool force = false) {
  static uint32_t last = 0;
  static String shown;
  if (!screenOk) return;
  if (!force && millis() - last < 250) return;
  last = millis();

  String title, word, line1, line2, foot;
  screenLines(title, word, line1, line2, foot);
  String key = title + "|" + word + "|" + line1 + "|" + line2 + "|" + foot;
  if (!force && key == shown) return;
  shown = key;

  display.clearDisplay();
  display.setTextColor(SH110X_WHITE);
  display.setTextSize(1);
  display.setCursor(0, 0);
  display.print(title);
  display.drawFastHLine(0, 10, 128, SH110X_WHITE);
  display.setTextSize(2);
  display.setCursor(0, 14);
  display.print(word);
  display.setTextSize(1);
  display.setCursor(0, 34);
  display.print(line1);
  display.setCursor(0, 44);
  display.print(line2);
  display.setCursor(0, 56);
  display.print(foot);
  display.display();
}

// The whole screen lit with DEAL AGREED in black, while the chime plays.
void showDealBanner() {
  if (!screenOk) return;
  display.clearDisplay();
  display.fillRect(0, 0, 128, 64, SH110X_WHITE);
  display.setTextColor(SH110X_BLACK);
  display.setTextSize(2);
  display.setCursor(40, 12);
  display.print("DEAL");
  display.setCursor(28, 36);
  display.print("AGREED");
  display.display();
}

void dealAgreed() {
  dealsToday++;
  Serial.println("Deal agreed: chime");
  showDealBanner();
  chime();
  refreshScreen(true);
}

// ---------- Shop settings ----------

void loadShop() {
  shopPrefs.begin("shop", false);
  shop.agentId = shopPrefs.isKey("agent") ? shopPrefs.getString("agent") : String(AGENT_ID);
  shop.name = shopPrefs.isKey("name") ? shopPrefs.getString("name") : String(STALL_NAME);
  shop.server = shopPrefs.isKey("server") ? shopPrefs.getString("server") : String(SERVER_BASE_URL);
  shop.token = shopPrefs.isKey("token") ? shopPrefs.getString("token") : String(DEVICE_TOKEN);
  shop.agentId.trim();
  shop.agentId.toLowerCase();
  stallName = shop.name;
  ensLabel = shopPrefs.isKey("ens") ? shopPrefs.getString("ens") : String("");
  ensFor = shopPrefs.isKey("ensFor") ? shopPrefs.getString("ensFor") : String("");
}

// The ENS label is kept across restarts, with the agent id it belongs to.
void saveEns(const String& label) {
  if (label == ensLabel && ensFor == shop.agentId) return;
  ensLabel = label;
  ensFor = shop.agentId;
  shopPrefs.putString("ens", ensLabel);
  shopPrefs.putString("ensFor", ensFor);
}

void saveShop() {
  shopPrefs.putString("agent", shop.agentId);
  shopPrefs.putString("name", shop.name);
  shopPrefs.putString("server", shop.server);
  shopPrefs.putString("token", shop.token);
}

void printShop() {
  Serial.println("--- shop ---");
  Serial.printf("agent   %s\n", configured() ? shop.agentId.c_str() : "(not set: not broadcasting)");
  Serial.printf("name    %s\n", shop.name.c_str());
  Serial.printf("server  %s\n", serverEnabled() ? shop.server.c_str() : "(none)");
  Serial.printf("token   %s\n", shop.token.length() ? "(set)" : "(none)");
  Serial.printf("beacon  %s\n", configured() ? beaconName().c_str() : "(off)");
  Serial.printf("hotspot %s\n", apName.c_str());
  // The saved network can only be read once Wi-Fi is switched on (setupWifi), not earlier in setup().
  String saved = WiFi.getMode() == WIFI_OFF ? "" : wifiManager.getWiFiSSID(true);
  if (WiFi.getMode() == WIFI_OFF) Serial.println("wifi    (starting)");
  else if (WiFi.status() == WL_CONNECTED) Serial.printf("wifi    %s (connected, %d dBm)\n", WiFi.SSID().c_str(), WiFi.RSSI());
  else if (saved.length()) Serial.printf("wifi    %s (saved, not connected)\n", saved.c_str());
  else Serial.println("wifi    (none saved)");
  Serial.printf("screen  %s\n", screenOk ? "ok" : "not found");
  Serial.printf("status  %s\n", statusName(status));
}

// ---------- Bluetooth beacon ----------

void updateBeacon() {
  NimBLEAdvertising* advertising = NimBLEDevice::getAdvertising();

  if (!configured()) {
    if (beaconSent != -1) advertising->stop();
    beaconSent = -1;
    return;
  }

  uint8_t b = beaconByte();
  String name = beaconName();
  if (b == beaconSent && name == nameSent) return;
  beaconSent = b;

  std::string data;
  data.push_back((char)(BEACON_COMPANY_ID & 0xFF));
  data.push_back((char)(BEACON_COMPANY_ID >> 8));
  data.push_back((char)BEACON_VERSION);
  data.push_back((char)b);
  data.append(shop.agentId.c_str());

  NimBLEAdvertisementData advert;
  advert.setFlags(0x06);  // general discoverable, Bluetooth LE only
  advert.setManufacturerData(data);

  advertising->stop();
  advertising->setAdvertisementData(advert);
  if (name != nameSent) {
    NimBLEAdvertisementData response;
    response.setName(name.c_str());
    advertising->setScanResponseData(response);
    nameSent = name;
    Serial.printf("Beacon name: %s\n", name.c_str());
  }
  advertising->start();
  Serial.printf("Beacon status byte: %u\n", b);
}

void setupBeacon() {
  String name = configured() ? beaconName() : String(BEACON_NAME_PREFIX) + "setup";
  NimBLEDevice::init(name.c_str());
  NimBLEDevice::setPower(ESP_PWR_LVL_P9);

  NimBLEAdvertisementData response;
  response.setName(name.c_str());
  NimBLEDevice::getAdvertising()->setScanResponseData(response);
  nameSent = name;

  updateBeacon();
  if (configured()) Serial.printf("Broadcasting as %s\n", name.c_str());
  else Serial.println("No agent id yet: not broadcasting. Type 'help' to set one.");
}

// ---------- Status changes ----------

void setStatus(Status s, bool fromSign) {
  if (s != ST_PAUSED) pauseEndsAt = 0;
  status = s;
  statusChangedAt = millis();
  prefs.putUChar("status", s);
  if (fromSign) {
    dirty = true;
    lastPushTry = 0;
  }
  updateBeacon();
  Serial.printf("Status: %s%s\n", statusName(s), fromSign ? "" : " (from server)");
}

// POWER: closed -> open, anything else -> closed.
void pressPower() {
  beep(status == ST_CLOSED ? 2400 : 1200, 60);
  setStatus(status == ST_CLOSED ? ST_OPEN : ST_CLOSED, true);
}

// PAUSE: open -> paused for PAUSE_MIN minutes, paused -> open. Ignored while closed.
void pressPause() {
  if (status == ST_CLOSED) {
    Serial.println("Pause ignored: the stall is closed");
    for (int i = 0; i < 2; i++) {
      lights(0, 0, 0);
      delay(150);
      lights(1, 0, 0);
      delay(150);
    }
    return;
  }
  beep(1800, 60);
  if (status == ST_PAUSED) {
    setStatus(ST_OPEN, true);
  } else {
    pauseEndsAt = millis() + PAUSE_MIN * 60000UL;
    setStatus(ST_PAUSED, true);
  }
}

// ---------- Server sync ----------

bool request(const char* method, const char* path, const String& body, String& out,
             const String& secret = "") {
  if (!serverEnabled() || WiFi.status() != WL_CONNECTED) return false;

  String url = shop.server + path;
  WiFiClientSecure tls;
  WiFiClient plain;
  HTTPClient http;
  http.setConnectTimeout(HTTP_CONNECT_TIMEOUT_MS);
  http.setTimeout(HTTP_TIMEOUT_MS);

  bool begun;
  if (url.startsWith("https://")) {
    tls.setInsecure();  // see README: pin the server's certificate before real use
    begun = http.begin(tls, url);
  } else {
    begun = http.begin(plain, url);
  }
  if (!begun) return false;

  if (shop.token.length()) http.addHeader("Authorization", "Bearer " + shop.token);
  http.addHeader("X-Agent-Id", shop.agentId);
  if (secret.length()) http.addHeader("X-Claim-Secret", secret);

  int code;
  if (strcmp(method, "POST") == 0) {
    http.addHeader("Content-Type", "application/json");
    code = http.POST(body);
  } else {
    code = http.GET();
  }
  if (code >= 200 && code < 300) out = http.getString();
  http.end();

  serverOk = code >= 200 && code < 300;
  if (!serverOk) Serial.printf("%s %s failed: %d\n", method, path, code);
  return serverOk;
}

// Applies the server's view of the stall (phone app or last saved). Right after a button press
// the sign holds its local status briefly so an in-flight push isn't overwritten; then phone wins.
void applyState(const String& json) {
  JsonDocument doc;
  if (deserializeJson(doc, json)) return;

  bool holdLocal = dirty && (millis() - statusChangedAt < LOCAL_STATUS_HOLD_MS);
  if (!holdLocal && doc["status"].is<const char*>()) {
    Status next = statusFromName(doc["status"].as<const char*>(), status);
    if (next == ST_PAUSED) {
      uint32_t secs = doc["pauseSecondsLeft"] | 0;
      pauseEndsAt = millis() + secs * 1000UL;
    }
    if (next != status) {
      dirty = false;
      setStatus(next, false);
    } else if (dirty) {
      dirty = false;  // server already matches; stop retrying the button push
    }
  }

  const char* name = doc["stallName"] | "";
  if (*name) stallName = name;
  upiId = (const char*)(doc["upiId"] | "");
  // A server that predates ENS labels sends no field: keep the label the sign has.
  if (doc["ensLabel"].is<const char*>()) saveEns(doc["ensLabel"].as<const char*>());

  JsonVariant d = doc["deal"];
  if (d.isNull()) {
    deal = {false, "", "", "", 0};
  } else {
    String id = d["id"] | "";
    String state = d["state"] | "bargaining";
    bool fresh = id != deal.id;
    bool nowAgreed = state == "agreed" && (fresh || deal.state != "agreed");
    deal.active = true;
    deal.id = id;
    deal.item = (const char*)(d["item"] | "");
    deal.state = state;
    deal.price = d["price"] | 0L;
    if (nowAgreed) dealAgreed();
    else if (fresh) beep(2000, 120);  // a new bargain started
  }
  updateBeacon();
}

void pushStatus() {
  JsonDocument doc;
  doc["status"] = statusName(status);
  if (status == ST_PAUSED) doc["pauseMinutes"] = pauseLeftMin();
  String body, out;
  serializeJson(doc, body);
  if (request("POST", STATUS_PATH, body, out)) {
    dirty = false;
    applyState(out);
  }
}

void syncServer() {
  if (!configured() || !serverEnabled() || WiFi.status() != WL_CONNECTED) return;
  uint32_t now = millis();
  // Button → phone: push local change.
  if (dirty && (lastPushTry == 0 || now - lastPushTry >= PUSH_RETRY_MS)) {
    lastPushTry = now;
    pushStatus();
  }
  // Phone → sign: always poll so Open/Paused/Closed from the app reaches the lights.
  if (lastPoll == 0 || now - lastPoll >= POLL_INTERVAL_MS) {
    lastPoll = now;
    String out;
    if (request("GET", STATE_PATH, "", out)) applyState(out);
  }
}

// ---------- Wi-Fi and the setup page ----------

// Claim pack from the Molbhav shop app: mb1|agentId|token|server|name
bool applyClaimPack(const String& raw) {
  if (!raw.startsWith("mb1|")) return false;
  String rest = raw.substring(4);
  int p1 = rest.indexOf('|');
  int p2 = p1 < 0 ? -1 : rest.indexOf('|', p1 + 1);
  int p3 = p2 < 0 ? -1 : rest.indexOf('|', p2 + 1);
  if (p1 < 0 || p2 < 0 || p3 < 0) return false;
  String agent = rest.substring(0, p1);
  String token = rest.substring(p1 + 1, p2);
  String server = rest.substring(p2 + 1, p3);
  String name = rest.substring(p3 + 1);
  agent.trim();
  agent.toLowerCase();
  token.trim();
  server.trim();
  name.trim();
  while (server.endsWith("/")) server.remove(server.length() - 1);
  if (!validAgentId(agent) || !token.length() || !server.length()) return false;
  shop.agentId = agent;
  shop.token = token;
  shop.server = server;
  if (name.length()) shop.name = name;
  return true;
}

// Saved from the setup page: keep the new shop settings and restart so the beacon uses them.
void onSaveParams() {
  String pack = fieldClaim.getValue();
  pack.trim();
  if (pack.length() && applyClaimPack(pack)) {
    Serial.println("Claim pack applied");
  } else {
    String agent = fieldAgent.getValue();
    agent.trim();
    agent.toLowerCase();
    if (agent.length() && !validAgentId(agent)) {
      Serial.printf("Ignored agent id '%s': it must be agent_ + 10 hex digits\n", agent.c_str());
    } else if (agent.length()) {
      shop.agentId = agent;
    }
    String server = fieldServer.getValue();
    String token = fieldToken.getValue();
    server.trim();
    token.trim();
    while (server.endsWith("/")) server.remove(server.length() - 1);
    if (server.length()) shop.server = server;
    if (token.length()) shop.token = token;
  }
  String name = fieldName.getValue();
  name.trim();
  if (name.length()) shop.name = name;
  if (!shop.name.length()) shop.name = STALL_NAME;
  if (!shop.server.length()) shop.server = SERVER_BASE_URL;
  saveShop();
  printShop();
  stallName = shop.name;
  // Shop fields saved (claim pack / advanced). Wi‑Fi SSID is handled by onWifiSaved.
  restartAt = millis() + 2000;
}

// After the phone saves market Wi‑Fi on the portal, reboot so we join as a client and show the code.
void onWifiSaved() {
  Serial.println("Wi-Fi saved — restarting to join and show claim code");
  restartAt = millis() + 1500;
}

void setupWifi(bool forcePortal) {
  WiFi.mode(WIFI_STA);
  if (digitalRead(PIN_BTN_POWER) == LOW) {
    wifiManager.resetSettings();
    Serial.println("Saved Wi-Fi forgotten");
  }

  fieldClaim.setValue("", 200);
  fieldAgent.setValue(shop.agentId.c_str(), 16);
  fieldName.setValue(shop.name.c_str(), 40);
  fieldServer.setValue(shop.server.c_str(), 100);
  fieldToken.setValue(shop.token.c_str(), 100);
  wifiManager.addParameter(&fieldClaim);
  wifiManager.addParameter(&fieldName);
  wifiManager.addParameter(&fieldAgent);
  wifiManager.addParameter(&fieldServer);
  wifiManager.addParameter(&fieldToken);
  wifiManager.setSaveParamsCallback(onSaveParams);
  wifiManager.setSaveConfigCallback(onWifiSaved);
  wifiManager.setTitle("Molbhav Stall Sign");
  // Configure WiFi first; claim pack is optional. OLED code is used after Wi‑Fi joins.
  std::vector<const char*> menu = {"wifi", "param", "info", "exit"};
  wifiManager.setMenu(menu);
  wifiManager.setConfigPortalBlocking(false);
  wifiManager.setConnectTimeout(15);

  if (!forcePortal) {
    // Non-blocking autoConnect often opens the portal before STA joins. Connect ourselves first.
    String ssid = wifiManager.getWiFiSSID(true);
    String pass = wifiManager.getWiFiPass(true);
    if (ssid.length()) {
      Serial.printf("Joining saved Wi-Fi %s …\n", ssid.c_str());
      WiFi.begin(ssid.c_str(), pass.c_str());
      uint32_t start = millis();
      while (WiFi.status() != WL_CONNECTED && millis() - start < 20000UL) delay(200);
      if (WiFi.status() == WL_CONNECTED) {
        portalOpen = false;
        Serial.printf("Wi-Fi connected: %s\n", WiFi.localIP().toString().c_str());
        return;
      }
      Serial.println("Saved Wi-Fi did not connect — opening setup hotspot");
    }
  }

  wifiManager.startConfigPortal(apName.c_str(), SETUP_AP_PASSWORD);
  portalOpen = true;
  Serial.printf("Setup page: join Wi-Fi %s (password %s), open 192.168.4.1\n", apName.c_str(), SETUP_AP_PASSWORD);
}

// 32 hex characters from the hardware random generator, made once and kept in flash.
void ensureClaimSecret() {
  if (claimSecret.length() == 32) return;
  claimSecret = prefs.getString("claimkey", "");
  if (claimSecret.length() == 32) return;
  char hex[33];
  for (int i = 0; i < 4; i++) snprintf(hex + i * 8, 9, "%08lx", (unsigned long)esp_random());
  claimSecret = hex;
  prefs.putString("claimkey", claimSecret);
}

// After Wi‑Fi: ask Molbhav for a 6-digit code (or credentials if already claimed).
void serviceClaim() {
  if (configured() || !serverEnabled() || WiFi.status() != WL_CONNECTED) return;
  if (lastClaimTry && millis() - lastClaimTry < 5000) return;
  lastClaimTry = millis();
  ensureClaimSecret();

  String path = String(CLAIM_STATUS_PATH) + "?chip=" + chipId;
  String out;
  // First time (or expired): register to mint / refresh a code.
  if (!claimCode.length()) {
    JsonDocument doc;
    doc["chipId"] = chipId;
    String body;
    serializeJson(doc, body);
    if (!request("POST", REGISTER_PATH, body, out, claimSecret)) return;
  } else if (!request("GET", path.c_str(), "", out, claimSecret)) {
    return;
  }

  JsonDocument doc;
  if (deserializeJson(doc, out)) return;
  const char* st = doc["status"] | "";
  if (!strcmp(st, "waiting")) {
    const char* code = doc["claimCode"] | "";
    if (strlen(code) == 6) {
      claimCode = code;
      Serial.printf("Claim code: %s (enter in Molbhav shop app)\n", code);
      refreshScreen(true);
    }
    return;
  }
  if (!strcmp(st, "claimed")) {
    String agent = doc["agentId"] | "";
    String token = doc["deviceToken"] | "";
    String server = doc["server"] | shop.server.c_str();
    String name = doc["stallName"] | shop.name.c_str();
    agent.toLowerCase();
    if (!validAgentId(agent) || !token.length()) return;
    shop.agentId = agent;
    shop.token = token;
    if (server.length()) {
      shop.server = server;
      while (shop.server.endsWith("/")) shop.server.remove(shop.server.length() - 1);
    }
    if (name.length()) shop.name = name;
    stallName = shop.name;
    claimCode = "";
    saveShop();
    printShop();
    Serial.println("Claimed by shop app — restarting beacon");
    restartAt = millis() + 1500;
  }
  if (!strcmp(st, "expired")) {
    claimCode = "";
    Serial.println("Claim code expired — registering a new one");
  }
}

void serviceWifi() {
  if (!portalOpen) return;
  wifiManager.process();
  // Once market Wi‑Fi is up, leave the hotspot so we can register the claim code (or run the shop).
  if (WiFi.status() == WL_CONNECTED) {
    wifiManager.stopConfigPortal();
    portalOpen = false;
    lastPoll = 0;
    lastClaimTry = 0;
    Serial.printf("Wi-Fi connected: %s\n", WiFi.localIP().toString().c_str());
  }
}

void scanWifi() {
  Serial.println("Wi-Fi networks in range (2.4 GHz only):");
  int n = WiFi.scanNetworks();
  for (int i = 0; i < n; i++) {
    Serial.printf("  %-24s %4d dBm  ch %2d  %s\n", WiFi.SSID(i).c_str(), WiFi.RSSI(i), WiFi.channel(i),
                  WiFi.encryptionType(i) == WIFI_AUTH_OPEN ? "open" : "password");
  }
  Serial.printf("ok %d networks\n", n);
  WiFi.scanDelete();
}

// ---------- USB serial commands (used by tools/provision.py) ----------

void printHelp() {
  Serial.println("Commands:");
  Serial.println("  show                  this chip's shop settings");
  Serial.println("  open | pause | close  change the status (same as the buttons)");
  Serial.println("  deal                  play the deal-agreed chime");
  Serial.println("  set agent <agent id>  e.g. set agent agent_1a2b3c4d5e");
  Serial.println("  set name <stall name>");
  Serial.println("  set server <url>      e.g. set server https://example.com   ('-' clears)");
  Serial.println("  set token <token>     ('-' clears)");
  Serial.println("  set ens <label>       broadcast name, e.g. set ens mohd-soyeb-khan   ('-' clears)");
  Serial.println("  wifi <ssid> <pass>    join a network (no spaces in ssid)");
  Serial.println("  scan                  list Wi-Fi networks in range");
  Serial.println("  forget-wifi           forget the saved network");
  Serial.println("  reset-shop            clear this chip's shop settings");
  Serial.println("  buttons               read POWER/PAUSE pins for 5s (for wiring checks)");
  Serial.println("  restart");
}

void handleCommand(String line) {
  line.trim();
  if (!line.length()) return;

  String cmd = line, arg = "";
  int sp = line.indexOf(' ');
  if (sp > 0) {
    cmd = line.substring(0, sp);
    arg = line.substring(sp + 1);
    arg.trim();
  }

  if (cmd == "help") return printHelp();
  if (cmd == "show") return printShop();
  if (cmd == "restart") {
    Serial.println("ok restarting");
    delay(200);
    ESP.restart();
  }
  if (cmd == "open" || cmd == "pause" || cmd == "close") {
    if (!configured()) {
      Serial.println("error set an agent id first");
      return;
    }
    if (cmd == "open") setStatus(ST_OPEN, true);
    else if (cmd == "close") setStatus(ST_CLOSED, true);
    else if (status == ST_CLOSED) {
      Serial.println("error the stall is closed: open it first");
      return;
    } else {
      pauseEndsAt = millis() + PAUSE_MIN * 60000UL;
      setStatus(ST_PAUSED, true);
    }
    Serial.printf("ok %s\n", statusName(status));
    return;
  }
  if (cmd == "deal") {
    dealAgreed();
    Serial.println("ok chime");
    return;
  }
  if (cmd == "scan") return scanWifi();
  if (cmd == "forget-wifi") {
    wifiManager.resetSettings();
    Serial.println("ok wifi forgotten");
    return;
  }
  if (cmd == "reset-shop") {
    shopPrefs.clear();
    Serial.println("ok shop cleared, restart to apply");
    return;
  }
  if (cmd == "buttons") {
    Serial.printf("POWER=GPIO%d  PAUSE=GPIO%d  (1=released, 0=pressed). Press each button.\n",
                  PIN_BTN_POWER, PIN_BTN_PAUSE);
    uint32_t end = millis() + 5000;
    int lastP = -1, lastA = -1;
    while (millis() < end) {
      int p = digitalRead(PIN_BTN_POWER);
      int a = digitalRead(PIN_BTN_PAUSE);
      if (p != lastP || a != lastA) {
        Serial.printf("  POWER=%d PAUSE=%d\n", p, a);
        lastP = p;
        lastA = a;
      }
      delay(10);
    }
    Serial.println("ok buttons done");
    return;
  }
  if (cmd == "wifi") {
    int s2 = arg.indexOf(' ');
    String ssid = s2 > 0 ? arg.substring(0, s2) : arg;
    String pass = s2 > 0 ? arg.substring(s2 + 1) : "";
    WiFi.begin(ssid.c_str(), pass.c_str());  // the Wi-Fi driver saves these for next boot
    Serial.printf("ok joining %s\n", ssid.c_str());
    return;
  }
  if (cmd == "set") {
    int s2 = arg.indexOf(' ');
    String key = s2 > 0 ? arg.substring(0, s2) : arg;
    String value = s2 > 0 ? arg.substring(s2 + 1) : "";
    value.trim();
    if (value == "-") value = "";

    if (key == "agent") {
      value.toLowerCase();
      if (!validAgentId(value)) {
        Serial.println("error agent id must be agent_ + 10 hex digits (0-9, a-f)");
        return;
      }
      shop.agentId = value;
    } else if (key == "name") {
      shop.name = value.length() ? value : String(STALL_NAME);
      stallName = shop.name;
    } else if (key == "server") {
      while (value.endsWith("/")) value.remove(value.length() - 1);
      shop.server = value;
    } else if (key == "token") {
      shop.token = value;
    } else if (key == "ens") {
      value.toLowerCase();
      if (value.length() && !validLabel(value)) {
        Serial.printf("error ENS label must be 3-%d of a-z, 0-9 and single hyphens\n", BEACON_LABEL_MAX);
        return;
      }
      saveEns(value);
      updateBeacon();
      Serial.printf("ok ens saved, broadcasting as %s\n", beaconName().c_str());
      return;
    } else {
      Serial.println("error unknown setting, use agent, name, server, token or ens");
      return;
    }
    saveShop();
    Serial.printf("ok %s saved%s\n", key.c_str(), key == "agent" ? ", restart to broadcast it" : "");
    return;
  }
  Serial.println("error unknown command, type help");
}

void readSerial() {
  static String line;
  while (Serial.available()) {
    char c = Serial.read();
    if (c == '\n' || c == '\r') {
      if (line.length()) handleCommand(line);
      line = "";
    } else if (line.length() < 200) {
      line += c;
    }
  }
}

// ---------- Arduino entry points ----------

void setup() {
  Serial.begin(115200);
  delay(300);
  Serial.println("Molbhav Stall Sign starting");

  pinMode(PIN_BTN_POWER, INPUT_PULLUP);
  pinMode(PIN_BTN_PAUSE, INPUT_PULLUP);
  pinMode(PIN_LIGHT_RED, OUTPUT);
  pinMode(PIN_LIGHT_YELLOW, OUTPUT);
  pinMode(PIN_LIGHT_GREEN, OUTPUT);
  buzzerBegin();
  lights(1, 1, 1);  // lamp test while the sign starts

  uint64_t mac = ESP.getEfuseMac();  // bytes in reverse order: the last two MAC bytes are bits 32-47
  char suffix[5];
  snprintf(suffix, sizeof(suffix), "%02X%02X", (uint8_t)(mac >> 32), (uint8_t)(mac >> 40));
  apName = String(SETUP_AP_PREFIX) + suffix;
  char chip[13];
  // Stable chip id for claim register (12 hex chars from MAC).
  snprintf(chip, sizeof(chip), "%02x%02x%02x%02x%02x%02x",
           (uint8_t)mac, (uint8_t)(mac >> 8), (uint8_t)(mac >> 16),
           (uint8_t)(mac >> 24), (uint8_t)(mac >> 32), (uint8_t)(mac >> 40));
  chipId = chip;

  loadShop();

  prefs.begin("sign", false);
  uint8_t saved = prefs.getUChar("status", ST_CLOSED);
  // A pause can't be resumed after a restart (the clock starts again), so it comes back as open.
  status = (saved == ST_OPEN || saved == ST_PAUSED) ? ST_OPEN : ST_CLOSED;
  statusChangedAt = millis();

  screenBegin();
  setupBeacon();
  printShop();

  // Hold PAUSE while powering on to force the setup hotspot. Otherwise try saved Wi‑Fi first.
  bool forcePortal = digitalRead(PIN_BTN_PAUSE) == LOW;
  wifiConnecting = !forcePortal;
  refreshScreen(true);
  setupWifi(forcePortal);
  wifiConnecting = false;
  refreshScreen(true);

  beep(1568, 80);  // start beep, so you know the buzzer is wired
  Serial.println("Ready. Type 'help' for commands.");
}

void loop() {
  readSerial();

  // Read buttons before any network call — HTTP is blocking and would miss presses.
  if (configured()) {
    if (pressed(powerButton)) {
      Serial.println("Button: POWER");
      pressPower();
    }
    if (pressed(pauseButton)) {
      Serial.println("Button: PAUSE");
      pressPause();
    }
    if (status == ST_PAUSED && pauseLeftMs() == 0) {
      beep(2400, 60);
      setStatus(ST_OPEN, true);  // pause is over
    }
  }

  serviceBuzzer();
  serviceWifi();
  serviceClaim();
  syncServer();
  renderLights();
  refreshScreen();

  if (restartAt && (int32_t)(millis() - restartAt) >= 0) {
    Serial.println("Restarting with the new settings");
    delay(100);
    ESP.restart();
  }
}
