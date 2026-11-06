# Molbhav Stall Sign (ESP32 / ESP32-S3)

A small sign for the stall counter that shows whether the stall is **open**, **paused** or **closed**.

- **Traffic light + OLED:** green open, yellow paused (with "Back in 10 min"), red closed, green blinking
  while a deal is running. When a deal is agreed, the buzzer chimes and the screen shows the price.
- **Bluetooth:** a beacon named `MolbhavA-<agent id>` carries the stall and its status, so phones nearby
  find it with no Wi-Fi and no pairing. The format is in [BEACON.md](BEACON.md).
- **Wi-Fi (optional):** button presses are sent to the server, and changes made in the app come back to
  the sign every 5 seconds, with the current deal.

## Parts

| Part                                                        | Qty   |
| ----------------------------------------------------------- | ----- |
| ESP32 DevKit (WROOM-32), or ESP32-S3-DevKitC-1              | 1     |
| 1.3" OLED, SH1106, I2C (4 pins: GND, VCC, SCL, SDA)         | 1     |
| Traffic-light LED module (R, Y, G, GND; resistors built in) | 1     |
| Push buttons                                                | 2     |
| Passive buzzer                                              | 1     |
| Breadboard + jumper wires                                   | 1 set |
| USB data cable, and a power bank for the stall              | 1 + 1 |

## Wiring

| Part            | Classic ESP32            | ESP32-S3              | Notes                               |
| --------------- | ------------------------ | --------------------- | ----------------------------------- |
| OLED VCC / GND  | 3V3 / GND                | 3V3 / GND             | 3V3, not VIN                        |
| OLED SDA / SCL  | GPIO21 / GPIO22          | GPIO8 / GPIO9         |                                     |
| Light R / Y / G | GPIO25 / GPIO27 / GPIO14 | GPIO4 / GPIO5 / GPIO6 | module GND to GND                   |
| POWER button    | GPIO26                   | GPIO7                 | other leg to GND (internal pull-up) |
| PAUSE button    | GPIO33                   | GPIO15                | other leg to GND                    |
| Buzzer + / −    | GPIO32 / GND             | GPIO16 / GND          | long leg is +                       |

Never use GPIO 6–11 on a classic ESP32: the flash memory uses them.

| Light           | Means                       |
| --------------- | --------------------------- |
| Green           | Open, taking orders         |
| Green blinking  | Open, a deal is running     |
| Yellow blinking | Paused ("Back in 10 min")   |
| Red             | Closed                      |
| R → Y → G turns | Not set up yet: no agent id |
| All three on    | Starting up (lamp test)     |

## Set up the board

### Option A: Arduino IDE

1. Install [Arduino IDE 2](https://www.arduino.cc/en/software).
2. **Settings → Additional boards manager URLs**, add
   `https://espressif.github.io/arduino-esp32/package_esp32_index.json`.
3. **Tools → Board → Boards Manager**, install **esp32 by Espressif Systems**.
4. **Tools → Manage Libraries**, install:
   - **NimBLE-Arduino** by h2zero, version **1.4.3** (pick it in the version list; 2.x changed its API)
   - **Adafruit SH110X** (say yes when it offers **Adafruit GFX**)
   - **WiFiManager** by tzapu
   - **ArduinoJson** by Benoit Blanchon (version 7)
5. Open `stall_sign/stall_sign.ino`.
6. In the **Tools** menu choose:
   - Board: **ESP32S3 Dev Module**, or **ESP32 Dev Module** for a classic ESP32
   - Partition Scheme: **Huge APP (3MB No OTA/1MB SPIFFS)**
   - USB CDC On Boot: **Disabled** (S3 only)
   - Port: the board's port (on an S3 board, use the USB-C port labelled **UART** or **COM**)
7. Press **Upload**, then open **Serial Monitor** at 115200 to see logs. Shop settings don't go in the code:
   set them per chip after uploading (see "Setting up a sign for a shop").

### Option B: PlatformIO

```bash
pip install platformio          # or install the PlatformIO extension in VS Code
cd firmware/stall-sign
pio run -e esp32dev -t upload             # classic ESP32: builds and flashes
pio run -e esp32-s3-devkitc-1 -t upload   # ESP32-S3
pio device monitor              # logs at 115200
```

On a Mac the board shows up as `/dev/cu.usbserial-*` (CP2102) or `/dev/cu.wchusbserial-*` (CH340). If it
doesn't appear, install the driver for the USB chip on your board. If the upload doesn't start, hold **BOOT**, tap **RESET**, release **BOOT**, and try again.

## Setting up a sign for a shop

Every chip runs the **same firmware**. What makes a sign belong to one shop is saved in the chip's flash:

| Setting  | Example                          | Required |
| -------- | -------------------------------- | -------- |
| Agent id | `agent_1a2b3c4d5e`               | Yes      |
| Name     | `Ramesh Sabzi`                   | No       |
| Server   | `https://molbhav-eta.vercel.app` | No       |
| Token    | the shop's device token          | No       |

A chip with no agent id **doesn't broadcast**, so a new or wiped sign is never mistaken for a stall. Its
screen says "SET UP" and the red, yellow and green lights take turns.

### Many signs: over USB (recommended)

Flash once, then set each chip with one command:

```bash
cd firmware/stall-sign
pio run -e esp32dev -t upload          # same firmware on every chip
python3 tools/provision.py --port /dev/cu.usbserial-0001 \
  --agent agent_1a2b3c4d5e --name "Ramesh Sabzi" \
  --wifi MarketWiFi --wifi-pass secret
```

It sets the shop, restarts the sign and prints what the sign now holds, ending with
`Done. This sign now broadcasts as MolbhavA-agent_1a2b3c4d5e`. Add `--server` and `--token` once the
server endpoints exist. Write the agent id on a sticker on the back of the sign.

You can also type the same commands yourself in the serial monitor (`pio device monitor`):

```
help                                       list the commands
show                                       this chip's shop, Wi-Fi, screen and status
set agent agent_1a2b3c4d5e
set name Ramesh Sabzi
set server https://molbhav-eta.vercel.app  ('-' clears it)
set token <token>                          ('-' clears it)
wifi MarketWiFi secret                     join a network (name without spaces)
scan                                       list the Wi-Fi networks the sign can see
open | pause | close                       same as the buttons
deal                                       play the deal-agreed chime and banner
restart
reset-shop                                 clear the shop (stops broadcasting after a restart)
forget-wifi
```

### At the stall: from a phone (recommended)

No long tokens to type. The sign shows a **6-digit code**; you enter it in the Molbhav shop app.

1. In Molbhav (shop), finish UPI so the stall has an agent id.
2. Power the sign (or hold **PAUSE** while plugging in). It opens hotspot **Molbhav-Setup-XXXX**
   (XXXX is on the screen). Password: `molbhav123`.
3. Join the hotspot → open `192.168.4.1` → **Configure WiFi** (market Wi‑Fi only). You can leave
   agent/token empty.
4. Phone back on normal Wi‑Fi / cellular. Sign screen shows a **6-digit code**.
5. Molbhav shop → **Stall sign** → type the code → **Link sign**.
6. Sign loads agent + device token from the server and starts broadcasting `MolbhavA-<agent id>`.

**Offline fallback:** before joining the hotspot, copy **Claim pack** from the shop screen, paste it
into the sign’s setup page as one field (no app link step).

To forget the Wi-Fi network, hold **POWER** while plugging the sign in.

## Configure (`stall_sign/config.h`)

These are build-time defaults. Per-shop values come from flash (above) and override them.

| Setting                         | What it does                                                      |
| ------------------------------- | ----------------------------------------------------------------- |
| `AGENT_ID`, `STALL_NAME`        | Defaults for a chip that hasn't been set up. Keep `AGENT_ID` `""` |
| `SERVER_BASE_URL`               | Default server for new chips                                      |
| `SETUP_AP_PREFIX` / `_PASSWORD` | Setup hotspot name prefix and password                            |
| `BEACON_*`                      | The Molbhav beacon format. Don't change per shop                  |
| `PIN_*`                         | Pins for the OLED, light, buttons and buzzer                      |
| `PAUSE_MIN`                     | How long a pause lasts before the stall opens again (10 min)      |
| `OLED_ADDRESS`                  | I2C address of the screen (0x3C; 0x3D is tried too)               |

## Using it

| Press                        | What happens                                                                                              |
| ---------------------------- | --------------------------------------------------------------------------------------------------------- |
| POWER                        | Closed → open (high beep). Open or paused → closed (low beep)                                             |
| PAUSE                        | Open → paused for 10 min, then it opens by itself. Paused → open. Ignored while closed (red blinks twice) |
| Hold PAUSE while plugging in | Opens the setup hotspot to change the shop or Wi-Fi                                                       |
| Hold POWER while plugging in | Forgets the saved Wi-Fi network                                                                           |

Over USB you can do the same with `open`, `pause` and `close`, and play the deal chime with `deal`.

The beacon status byte is `1` open, `2` paused, `0` closed, `3` open with a deal running. It changes the
moment a button is pressed, even with no Wi-Fi. A change the server hasn't received yet is retried every 5
seconds.

## Server API the sign expects

Both requests send `Authorization: Bearer <token>` and `X-Agent-Id: <agent id>`.

**`POST /api/stall/device/status`**, sent when a button is pressed:

```json
{ "status": "paused", "pauseMinutes": 10 }
```

`status` is `open`, `paused` or `closed`; `pauseMinutes` comes only with `paused`. The server should save
it for the stall that owns the token and reply with the same body as the GET below.

**`GET /api/stall/device/state`**, every 5 seconds:

```json
{
  "status": "open",
  "pauseSecondsLeft": 0,
  "stallName": "Ramesh Sabzi",
  "upiId": "ramesh@upi",
  "deal": { "id": "deal_123", "item": "Tomatoes, 1 kg", "price": 120, "state": "bargaining" }
}
```

`deal` is `null` when no deal is running; `state` is `bargaining` or `agreed`. While a deal runs, the green
light blinks and the beacon says `3`. The sign beeps once when a new deal starts; when it is agreed, it
plays a chime, shows DEAL AGREED, then the price and UPI ID, and adds one to "Deals today".

The app implements these routes. Fresh chips default `SERVER_BASE_URL` to `https://molbhav-eta.vercel.app`.
After Wi‑Fi, the sign registers and shows a claim code; the shop app links it and the server returns the
device token automatically. USB `set token` / claim pack still work for advanced setups.

## Troubleshooting

| Problem                                    | Fix                                                                                                                                                                                 |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Board gets no power from a C-to-C cable    | Use the C-to-A cable; some boards lack the USB-C CC resistors                                                                                                                       |
| Power bank switches off after a while      | Turn on its low-current mode, or use a bank that has one                                                                                                                            |
| A button does nothing                      | Its other leg must go to GND. Watch the serial monitor: each press prints `Status: ...`                                                                                             |
| Sign doesn't join Wi-Fi                    | Type `show` to see the saved network name (check for typos) and `scan` to see what the sign can find. It only sees 2.4 GHz: on an iPhone hotspot turn on **Maximize Compatibility** |
| Screen stays blank or shows an old picture | Check SDA → GPIO21, SCL → GPIO22, VCC → 3V3; `show` says `screen not found` if it is not answering                                                                                  |
| "Sketch too big" when uploading            | Choose the **Huge APP** partition scheme                                                                                                                                            |
| No logs in Serial Monitor                  | Set the monitor to 115200. On an S3 board, plug into the **UART** port and set USB CDC On Boot to Disabled                                                                          |

HTTPS requests skip certificate checks (`setInsecure()`), which is fine for testing. Before real use, add
the server's root certificate with `tls.setCACert(...)` in `sign.cpp`.
