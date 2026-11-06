# iPhone app

The iPhone app is a [Capacitor](https://capacitorjs.com) shell around the deployed site, so pages, API
routes and secrets stay on the server. A deploy reaches phones on their next launch.

| What                      | Where                              |
| ------------------------- | ---------------------------------- |
| The site the app loads    | `capacitor.config.ts`              |
| The Xcode project         | `ios/`                             |
| Offline fallback          | `capacitor/www/index.html`         |
| Beacon format             | `firmware/stall-sign/BEACON.md`    |
| BLE parse / scan          | `src/lib/ble/beacon.ts`, `scan.ts` |
| Sign → server open/closed | `POST /api/stall/device/status`    |

## Running it

```bash
npm run ios:dev    # load this Mac's :3000 (same Wi‑Fi)
npm run ios:sync   # load the deployed site
npm run ios:open   # Xcode → Run on iPhone
```

## Why “Closed” on the sign still showed Open in the app

The buyer home **Open/Closed** line comes from Postgres `is_open`, not from Bluetooth.

Pressing the sign’s button updates the BLE status byte immediately, but the app list only flips when
the sign POSTs to `/api/stall/device/status` (or you toggle Live in the shop UI). Wire the sign with
`SERVER_BASE_URL` + the **Device token** shown on the shop screen.

BLE “Stalls heard nearby” only counts open/in-deal status bytes; closed/paused removes that agent.
