# iPhone app

The iPhone app is a [Capacitor](https://capacitorjs.com) shell around the deployed site, so pages, API
routes and secrets stay on the server. A deploy reaches phones on their next launch.

Its native jobs today: **Bluetooth LE** scanning for stall-sign beacons (Safari can’t do that), and the
usual camera / mic permissions for UPI QR and spoken orders.

| What                         | Where                              |
| ---------------------------- | ---------------------------------- |
| The site the app loads       | `capacitor.config.ts`              |
| The Xcode project            | `ios/`                             |
| Page shown when it's offline | `capacitor/www/index.html`         |
| App icon + splash            | `ios/App/App/Assets.xcassets/`     |
| Beacon format (firmware)     | `firmware/stall-sign/BEACON.md`    |
| Parse a beacon               | `src/lib/ble/beacon.ts`            |
| Scan while ordering          | `src/lib/ble/scan.ts` → Want sheet |

## Running it

Xcode must be the active developer tool, once: `sudo xcode-select -s /Applications/Xcode.app`.

```bash
npm run ios:dev    # load this Mac's dev server (phone and Mac on one Wi-Fi network)
npm run ios:sync   # load the deployed site (CAP_APP_URL / default in capacitor.config.ts)
npm run ios:open   # open Xcode, pick your iPhone, press Run
npm run ios:assets # regenerate app icon, splash, and web icons from the brand mark
```

Set `CAP_APP_URL` if the production site is not `https://molbhav-eta.vercel.app`.

The first time, choose your team under **App → Signing & Capabilities**, and on the iPhone trust the
developer in **Settings → General → VPN & Device Management**. A free Apple ID's app stops opening after
7 days; run it again from Xcode.

Sign-in needs the page's address allowed in the Magic dashboard, for `npm run ios:dev` as well.

## Finding nearby stalls (BLE)

1. Profile → discovery set to **Nearby agents** (default).
2. Open **Speak your order**. The app scans for adverts named `MolbhavA-<agent id>` / company `0x0BAB`
   (see `BEACON.md`).
3. Open or in-deal signs are listed as “Stalls heard nearby: N”. Their agent ids are posted with the
   order as `agents` so bargaining can ask those stalls first — no market search needed when beacons
   are heard.
4. The iOS Simulator has no Bluetooth; use a real iPhone next to a flashing stall sign.
