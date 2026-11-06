#pragma once
/*
 * Stall Sign settings. Change these before you upload.
 */

// ---------- Your stall ----------

// These are only defaults. Each chip keeps its own shop settings in flash, so one firmware build works
// for every shop. Set them per chip with tools/provision.py over USB, or on the setup page
// (see README.md, "Setting up a sign for a shop").

// The stall's agent id from the shop sheet: "agent_" followed by 10 lowercase hex digits.
// Leave it empty: a sign with no agent id doesn't broadcast, so phones never see a wrong shop.
#define AGENT_ID ""

// Shown at the top of the screen until the server sends the real name.
#define STALL_NAME "Molbhav Stall"

// ---------- Server (optional) ----------
// Leave SERVER_BASE_URL empty ("") to use the sign on its own: buttons, lights, screen
// and Bluetooth all work without a server.

// Default Molbhav site so a fresh chip can register a claim code after Wi‑Fi without typing a URL.
#define SERVER_BASE_URL "https://molbhav-eta.vercel.app"
#define DEVICE_TOKEN ""  // filled by claim (shop links 6-digit code) or optional claim pack / USB
#define REGISTER_PATH "/api/stall/device/register"
#define CLAIM_STATUS_PATH "/api/stall/device/claim-status"
#define STATUS_PATH "/api/stall/device/status"
#define STATE_PATH "/api/stall/device/state"

#define POLL_INTERVAL_MS 5000  // how often to pull phone/app changes onto the sign
#define PUSH_RETRY_MS 2000     // wait between retries when a button change can't be sent
// Keep this short: HTTP is blocking, so long timeouts make POWER/PAUSE feel dead.
#define HTTP_TIMEOUT_MS 5000
#define HTTP_CONNECT_TIMEOUT_MS 2500
// After a button press, the sign keeps its local status this long even if the phone
// changes it mid-flight; then the server (phone or last saved) wins.
#define LOCAL_STATUS_HOLD_MS 12000

// ---------- Wi-Fi setup hotspot ----------
// The sign opens a hotspot named SETUP_AP_PREFIX + the last 4 hex digits of the chip's MAC address,
// e.g. "Molbhav-Setup-1170", so signs in the same market don't clash. It opens when:
//   - the chip has no agent id yet, or the saved Wi-Fi isn't in range
//   - PAUSE is held while powering on (to change settings)
// Hold POWER while powering on to forget the saved Wi-Fi network.

#define SETUP_AP_PREFIX "Molbhav-Setup-"
#define SETUP_AP_PASSWORD "molbhav123"  // at least 8 characters

// ---------- Bluetooth beacon ----------
// Naming convention (BEACON.md): local name = the stall's ENS label once the server sends one that
// fits, e.g. "mohd-soyeb-khan" (phones add ".molbhav.eth"); until then "MolbhavA-<agent id>".
// Manufacturer data: [company id 0x0BAB, low byte first][version][status][agent id, 16 ASCII bytes]
// Don't change these per shop: phones look for exactly this prefix and company id.

#define BEACON_COMPANY_ID 0x0BAB
#define BEACON_VERSION 1
#define BEACON_NAME_PREFIX "MolbhavA-"
#define BEACON_LABEL_MAX 29  // a scan response holds 31 bytes; the name's header takes 2

// ---------- Pins ----------
// Parts: 1.3" SH1106 OLED (I2C), traffic-light module (R / Y / G, resistors built in),
// two push buttons (other leg to GND), passive buzzer. Picked automatically for the chip you build for.

#if CONFIG_IDF_TARGET_ESP32S3
// ESP32-S3-DevKitC-1
#define PIN_OLED_SDA 8
#define PIN_OLED_SCL 9
#define PIN_LIGHT_RED 4
#define PIN_LIGHT_YELLOW 5
#define PIN_LIGHT_GREEN 6
#define PIN_BTN_POWER 7
#define PIN_BTN_PAUSE 15
#define PIN_BUZZER 16
#else
// Classic ESP32 (DevKit / ESP32-WROOM-32). GPIO 6-11 belong to the flash chip: never use them.
#define PIN_OLED_SDA 21
#define PIN_OLED_SCL 22
#define PIN_LIGHT_RED 25
#define PIN_LIGHT_YELLOW 27
#define PIN_LIGHT_GREEN 14
#define PIN_BTN_POWER 26
#define PIN_BTN_PAUSE 33
#define PIN_BUZZER 32
#endif

// ---------- Screen ----------

#define OLED_ADDRESS 0x3C  // the code also tries 0x3D

// ---------- Pause ----------

#define PAUSE_MIN 10  // Pause shows "Back in 10 min" and opens again by itself after this long

#define DEBOUNCE_MS 30
