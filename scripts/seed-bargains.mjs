// Mock bargains so the Bargains screens have something to show: `npm run db:seed-bargains`.
// `--clean` removes them. Every mock row's id starts with "mock-". The mock stalls stay closed,
// so they never appear on Home or get matched for a real order.
import { neon } from "@neondatabase/serverless";

process.loadEnvFile?.(".env.local");
const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set (see .env.example).");
const sql = neon(url);
const clean = process.argv.includes("--clean");

const rs = (n) => `₹${n.toLocaleString("en-IN")}`;
const HANDED_OFF = "I've brought it down to {price}. It's your call now: tap Agree to take it.";

const STALLS = [
  { id: "mock-ramesh", name: "Ramesh Biryani Corner", lang: "hi", style: "firm" },
  { id: "mock-lakshmi", name: "Lakshmi Tiffins", lang: "ta", style: "friendly" },
  { id: "mock-shinde", name: "Shinde Biryani House", lang: "mr", style: "friendly" },
];
const MENU = [
  { name: "Chicken Dum Biryani", price: 260, lowest: 232 },
  { name: "Paneer Pulav", price: 220, lowest: 190 },
  { name: "Veg Biryani", price: 200, lowest: 170 },
];

async function removeMock() {
  await sql.transaction([
    sql.query(
      "DELETE FROM bargains WHERE id IN (SELECT bargain_id FROM offers WHERE stall_id LIKE 'mock-%')",
    ),
    sql.query("DELETE FROM stall_items WHERE stall_id LIKE 'mock-%'"),
    sql.query("DELETE FROM stalls WHERE id LIKE 'mock-%'"),
    sql.query("DELETE FROM users WHERE id LIKE 'mock-%'"),
  ]);
}

await removeMock();
if (clean) {
  console.log("mock bargains removed");
  process.exit(0);
}

// Mock stall owners, stalls (closed) and their menus.
for (const s of STALLS) {
  await sql.query("INSERT INTO users (id, email) VALUES ($1, $2)", [
    `mock-owner-${s.id}`,
    `${s.id}@example.test`,
  ]);
  await sql.query(
    `INSERT INTO stalls (id, owner_id, name, lang, style, is_open, device_status)
     VALUES ($1, $2, $3, $4, $5, false, 'closed')`,
    [s.id, `mock-owner-${s.id}`, s.name, s.lang, s.style],
  );
  for (const m of MENU) {
    await sql.query(
      "INSERT INTO stall_items (stall_id, name, price, lowest) VALUES ($1, $2, $3, $4)",
      [s.id, m.name, m.price, m.lowest],
    );
  }
}

// Each stall's item id by name: the mock stalls, plus the real stall if it sells it.
const items = await sql.query("SELECT id, stall_id, name, price FROM stall_items WHERE active");
const item = (stallId, name) => items.find((i) => i.stall_id === stallId && i.name === name);
const real = (await sql.query("SELECT id, name FROM stalls WHERE id NOT LIKE 'mock-%' LIMIT 1"))[0];

const minutes = (n) => new Date(Date.now() - n * 60_000);

/** One bargain: offers with their chat lines. Line = [speaker, msg | {text}, vars?, current?, status?] */
async function bargain(buyerId, { want, title, budget, ago, offers }) {
  const [b] = await sql.query(
    `INSERT INTO bargains (buyer_id, want, title, budget, buyer_lang, created_at)
     VALUES ($1, $2, $3, $4, 'en', $5) RETURNING id`,
    [buyerId, want, title, budget, minutes(ago)],
  );
  for (const o of offers) {
    const it = item(o.stall, o.item);
    if (!it) continue;
    await sql.query(
      `INSERT INTO offers (bargain_id, stall_id, item_id, status, asked, current, agent_offer, version, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 1, $8)`,
      [
        b.id,
        o.stall,
        it.id,
        o.status,
        o.asked ?? null,
        o.current ?? null,
        o.current ?? null,
        minutes(ago - 1),
      ],
    );
    let t = 0;
    for (const [speaker, msg, vars, current, status] of o.lines ?? []) {
      t += 7;
      const free = typeof msg === "object";
      await sql.query(
        `INSERT INTO turns (bargain_id, stall_id, speaker, msg, vars, text, status, current, at)
         VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9)`,
        [
          b.id,
          o.stall,
          speaker,
          free ? null : msg,
          vars ? JSON.stringify(vars) : null,
          free ? msg.text : null,
          status ?? "haggling",
          current ?? null,
          new Date(minutes(ago).getTime() + t * 1000),
        ],
      );
    }
  }
}

const opening = (item) => [
  "agent",
  "Namaste! I'm buying a {item} for someone nearby. What's your price?",
  { item: item.toLowerCase() },
];
const ask = (p) => ["stall", "Very good quality, handmade. {price}.", { price: rs(p) }, p];
const counter = (p, was) => [
  "agent",
  "Other stalls here are lower. Can you do {price}?",
  { price: rs(p) },
  was,
];
const last = (p) => ["stall", "No, no. {price}, last price.", { price: rs(p) }, p];
const handOff = (p) => ["agent", HANDED_OFF, { price: rs(p) }, p];
const overBudget = (p, budget) => [
  "agent",
  "{price} is their last price, {amount} over your budget. Tell me if you can go higher.",
  { price: rs(p), amount: rs(p - budget) },
  p,
];
const agreed = (p) => [
  ["agent", "I'll take this deal at {price}.", { price: rs(p) }, p, "agreed"],
  ["stall", "Okay, {price}. Deal.", { price: rs(p) }, p, "agreed"],
];
const declinedLine = (p) => [
  "agent",
  "I found it cheaper at another stall. Thank you!",
  null,
  p,
  "declined",
];

const realChicken = real && item(real.id, "Chicken Dum Biryani");
const realPaneer = real && item(real.id, "Paneer Pulav");
const realVeg = real && item(real.id, "Veg Biryani");

const buyers = await sql.query("SELECT id, email FROM users WHERE id NOT LIKE 'mock-%'");
for (const u of buyers) {
  // 1. Live: one deal ready to Agree, one over budget, one said no, one still waiting.
  await bargain(u.id, {
    want: "Ek chicken biryani, 230 tak",
    title: "Chicken Dum Biryani",
    budget: 230,
    ago: 3,
    offers: [
      realChicken && {
        stall: real.id,
        item: "Chicken Dum Biryani",
        status: "haggling",
        asked: realChicken.price,
        current: 225,
        lines: [
          opening("Chicken Dum Biryani"),
          ask(realChicken.price),
          counter(225, realChicken.price),
          last(225),
          handOff(225),
        ],
      },
      {
        stall: "mock-ramesh",
        item: "Chicken Dum Biryani",
        status: "haggling",
        asked: 260,
        current: 248,
        lines: [
          opening("Chicken Dum Biryani"),
          ask(260),
          counter(240, 260),
          last(248),
          overBudget(248, 230),
        ],
      },
      {
        stall: "mock-lakshmi",
        item: "Chicken Dum Biryani",
        status: "declined",
        lines: [
          opening("Chicken Dum Biryani"),
          ["stall", { text: "Sorry, biryani is finished for today." }, null, null, "declined"],
        ],
      },
      // No price yet: the screen shows "Waiting for their price", then the app seeds it live.
      { stall: "mock-shinde", item: "Chicken Dum Biryani", status: "haggling" },
    ].filter(Boolean),
  });

  // 2. Agreed, waiting for the buyer to pay.
  await bargain(u.id, {
    want: "Paneer pulav for two",
    title: "Paneer Pulav",
    budget: null,
    ago: 125,
    offers: [
      {
        stall: "mock-lakshmi",
        item: "Paneer Pulav",
        status: "agreed",
        asked: 220,
        current: 195,
        lines: [
          opening("Paneer Pulav"),
          ask(220),
          counter(195, 220),
          last(195),
          handOff(195),
          ...agreed(195),
        ],
      },
      realPaneer && {
        stall: real.id,
        item: "Paneer Pulav",
        status: "declined",
        asked: realPaneer.price,
        current: 200,
        lines: [
          opening("Paneer Pulav"),
          ask(realPaneer.price),
          counter(195, realPaneer.price),
          last(200),
          handOff(200),
          declinedLine(200),
        ],
      },
    ].filter(Boolean),
  });

  // 3. Paid yesterday.
  await bargain(u.id, {
    want: "Veg biryani",
    title: "Veg Biryani",
    budget: 190,
    ago: 60 * 26,
    offers: [
      {
        stall: "mock-shinde",
        item: "Veg Biryani",
        status: "paid",
        asked: 200,
        current: 180,
        lines: [
          opening("Veg Biryani"),
          ask(200),
          counter(175, 200),
          last(180),
          handOff(180),
          ...agreed(180),
        ],
      },
      realVeg && {
        stall: real.id,
        item: "Veg Biryani",
        status: "declined",
        asked: realVeg.price,
        current: 185,
        lines: [
          opening("Veg Biryani"),
          ask(realVeg.price),
          counter(180, realVeg.price),
          last(185),
          handOff(185),
          declinedLine(185),
        ],
      },
    ].filter(Boolean),
  });
  console.log("seeded 3 bargains for", u.email);
}
