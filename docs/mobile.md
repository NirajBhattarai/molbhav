# iPhone app

The iPhone app is a [Capacitor](https://capacitorjs.com) shell around the deployed site, so pages, API
routes and secrets stay on the server. A deploy reaches phones on their next launch.

| What                         | Where                      |
| ---------------------------- | -------------------------- |
| The site the app loads       | `capacitor.config.ts`      |
| The Xcode project            | `ios/`                     |
| Page shown when it's offline | `capacitor/www/index.html` |
| App icon + splash            | `ios/App/App/Assets.xcassets/` |

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
