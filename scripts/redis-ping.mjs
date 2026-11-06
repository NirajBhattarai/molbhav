// Checks the Redis connection: `npm run redis:ping` (reads REDIS_URL from .env.local).
import { createClient } from "redis";

process.loadEnvFile?.(".env.local");
const url = process.env.REDIS_URL;
if (!url) throw new Error("REDIS_URL is not set (see .env.example).");

const client = await createClient({ url }).connect();
const key = `molbhav:ping:${Date.now()}`;
await client.set(key, "ok", { expiration: { type: "EX", value: 10 } });
console.log("PING", await client.ping(), "· write/read", await client.get(key));
await client.del(key);
await client.close();
