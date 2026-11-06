// Open test stalls around a spot, so Home lists them and a buyer's agent can bargain with them:
//   npm run db:seed-stalls -- --lat 19.07 --lng 72.87 [--count 100]
// `--clean` removes them. Every row's id starts with "near-". The location is only an argument,
// so nobody's whereabouts end up in the repo.
import { neon } from "@neondatabase/serverless";

process.loadEnvFile?.(".env.local");
const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set (see .env.example).");
const sql = neon(url);

const arg = (name) => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
};
const clean = process.argv.includes("--clean");

/** Metres north/east of the spot, the stall's language and bargaining style, and its menu. */
const STALLS = [
  {
    id: "near-chai",
    name: "Sharma Cutting Chai",
    lang: "hi",
    style: "friendly",
    at: [120, -80],
    menu: [
      ["Cutting Chai", "chai, tea, cutting", 15, 12],
      ["Masala Chai", "chai, tea, masala tea", 25, 20],
      ["Adrak Chai", "ginger tea, chai, tea", 20, 16],
      ["Bun Maska", "bun, maska, bread butter", 30, 25],
      ["Vada Pav", "vada pav, wada pav", 20, 17],
    ],
  },
  {
    id: "near-irani",
    name: "Noor Irani Cafe",
    lang: "hi",
    style: "firm",
    at: [-260, 190],
    menu: [
      ["Irani Chai", "chai, tea", 30, 25],
      ["Bun Maska", "bun, maska, bread butter", 45, 38],
      ["Kheema Pav", "keema, kheema pav, mutton", 140, 120],
      ["Mawa Cake", "cake, mawa", 40, 34],
      ["Chicken Puff", "puff, patties", 50, 42],
    ],
  },
  {
    id: "near-annapurna",
    name: "Annapurna Veg Hotel",
    lang: "mr",
    style: "friendly",
    at: [340, 280],
    menu: [
      ["Veg Thali", "thali, meal, lunch", 180, 150],
      ["Misal Pav", "misal", 90, 75],
      ["Kanda Poha", "poha", 50, 40],
      ["Sabudana Vada", "sabudana", 70, 58],
      ["Masala Chai", "chai, tea", 20, 16],
    ],
  },
  {
    id: "near-tiffin",
    name: "Saravana Tiffin Centre",
    lang: "ta",
    style: "friendly",
    at: [-410, -150],
    menu: [
      ["Masala Dosa", "dosa, dosai", 110, 92],
      ["Idli Vada", "idli, vada", 70, 58],
      ["Medu Vada", "vada, wada", 60, 50],
      ["Onion Uttapam", "uttapam, uthappam", 100, 85],
      ["Filter Coffee", "coffee, kaapi", 35, 28],
    ],
  },
  {
    id: "near-dhaba",
    name: "Punjab Da Dhaba",
    lang: "hi",
    style: "firm",
    at: [560, -420],
    menu: [
      ["Butter Chicken", "chicken, murgh", 320, 280],
      ["Dal Makhani", "dal, daal", 220, 185],
      ["Paneer Tikka", "paneer", 260, 225],
      ["Tandoori Roti", "roti, naan", 25, 20],
      ["Sweet Lassi", "lassi", 80, 65],
    ],
  },
  {
    id: "near-biryani",
    name: "Al-Noor Biryani Centre",
    lang: "hi",
    style: "firm",
    at: [-620, 520],
    menu: [
      ["Chicken Biryani", "biryani, chicken", 240, 205],
      ["Mutton Biryani", "biryani, mutton", 340, 295],
      ["Veg Biryani", "biryani, veg", 180, 150],
      ["Egg Biryani", "biryani, egg, anda", 190, 160],
    ],
  },
  {
    id: "near-kirana",
    name: "Patel General Store",
    lang: "mr",
    style: "firm",
    at: [210, 640],
    menu: [
      ["Basmati Rice 5kg", "rice, chawal, basmati", 650, 590],
      ["Toor Dal 1kg", "dal, toor, arhar", 170, 155],
      ["Wheat Atta 5kg", "atta, flour, wheat", 290, 265],
      ["Sugar 1kg", "sugar, cheeni, shakkar", 48, 44],
      ["Milk 1L", "milk, doodh", 68, 64],
      ["Tea Powder 250g", "tea leaves, patti, tea powder", 140, 125],
    ],
  },
  {
    id: "near-momo",
    name: "Himalayan Momo Corner",
    lang: "ne",
    style: "friendly",
    at: [-150, -730],
    menu: [
      ["Veg Momo", "momo, momos, dumplings", 90, 75],
      ["Chicken Momo", "momo, momos, dumplings, chicken", 130, 110],
      ["Chicken Thukpa", "thukpa, noodle soup", 150, 125],
      ["Masala Chai", "chai, tea", 20, 16],
    ],
  },
];

async function removeSeeded() {
  await sql.transaction([
    sql.query(
      "DELETE FROM bargains WHERE id IN (SELECT bargain_id FROM offers WHERE stall_id LIKE 'near-%')",
    ),
    sql.query("DELETE FROM stall_items WHERE stall_id LIKE 'near-%'"),
    sql.query("DELETE FROM stalls WHERE id LIKE 'near-%'"),
    sql.query("DELETE FROM users WHERE id LIKE 'near-%'"),
  ]);
}

await removeSeeded();
if (clean) {
  console.log("nearby test stalls removed");
  process.exit(0);
}

const lat = Number(arg("lat"));
const lng = Number(arg("lng"));
if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
  throw new Error("Pass the spot to seed around: --lat <degrees> --lng <degrees>");
}
// Metres to degrees: one degree of latitude is ~111 km; longitude shrinks with the cosine.
const north = (m) => m / 111_320;
const east = (m) => m / (111_320 * Math.cos((lat * Math.PI) / 180));

// `--count 100` fills up to that many with more stalls of the same kinds, about one in six closed,
// so the Home list can be tried at market size.
const count = Math.max(STALLS.length, Number(arg("count")) || STALLS.length);
const OWNERS = [
  "Gupta",
  "Shaikh",
  "Iyer",
  "Pawar",
  "Khan",
  "Joshi",
  "Thapa",
  "Reddy",
  "Desai",
  "Ali",
];
const all = [...STALLS];
for (let n = STALLS.length; n < count; n++) {
  const base = STALLS[n % STALLS.length];
  const kind = base.name.split(" ").slice(1).join(" ");
  const angle = n * 2.399; // golden angle: spreads the stalls evenly around the spot
  const metres = 150 + ((n * 97) % 1800);
  all.push({
    ...base,
    id: `near-${n}`,
    name: `${OWNERS[n % OWNERS.length]} ${kind}`,
    at: [Math.round(Math.cos(angle) * metres), Math.round(Math.sin(angle) * metres)],
    open: n % 6 !== 0,
    // Prices move a little from stall to stall, so "From ₹…" differs.
    menu: base.menu.map(([name, words, price, lowest]) => {
      const k = 1 + (((n * 7) % 5) - 2) / 20;
      const p = Math.max(5, Math.round(price * k));
      return [name, words, p, Math.min(p, Math.max(1, Math.round(lowest * k)))];
    }),
  });
}

for (const s of all) {
  const open = s.open ?? true;
  const owner = `near-owner-${s.id}`;
  await sql.query("INSERT INTO users (id, email) VALUES ($1, $2)", [owner, `${s.id}@example.test`]);
  await sql.query(
    `INSERT INTO stalls (id, owner_id, name, lang, style, upi_id, lat, lng, is_open, device_status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      s.id,
      owner,
      s.name,
      s.lang,
      s.style,
      `${s.id}@upi.test`,
      lat + north(s.at[0]),
      lng + east(s.at[1]),
      open,
      open ? "open" : "closed",
    ],
  );
  await sql.query(
    `INSERT INTO stall_items (stall_id, name, words, price, lowest)
     SELECT $1, * FROM unnest($2::text[], $3::text[], $4::int[], $5::int[])`,
    [
      s.id,
      s.menu.map((m) => m[0]),
      s.menu.map((m) => m[1]),
      s.menu.map((m) => m[2]),
      s.menu.map((m) => m[3]),
    ],
  );
  if (all.length <= 20) {
    const metres = Math.round(Math.hypot(...s.at));
    console.log(`${s.name.padEnd(24)} ${String(metres).padStart(4)} m  ${s.menu.length} items`);
  }
}
const closed = all.filter((s) => s.open === false).length;
console.log(
  `\n${all.length} stalls seeded (${all.length - closed} open). Remove them with: npm run db:seed-stalls -- --clean`,
);
