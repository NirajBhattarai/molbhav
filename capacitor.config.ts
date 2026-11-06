import type { CapacitorConfig } from "@capacitor/cli";

// The native app loads the deployed site: pages, API routes and secrets stay on the server, and a
// deploy reaches phones on their next launch. `capacitor/www` is only the page shown when it can't
// be reached. `npm run ios:dev` points it at this Mac's dev server instead.
const APP_URL = process.env.CAP_APP_URL?.trim() || "https://molbhav-eta.vercel.app";
const url = process.env.CAP_SERVER_URL?.trim() || APP_URL;

const config: CapacitorConfig = {
  appId: "app.molbhav",
  appName: "Molbhav",
  webDir: "capacitor/www",
  server: { url, errorPath: "index.html", cleartext: url.startsWith("http:") },
  ios: { contentInset: "never" },
};

export default config;
