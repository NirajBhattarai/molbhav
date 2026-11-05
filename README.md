# MolBhav

**MolBhav** (मोलभाउ — "haggling") brings the bargaining of a street market to AI agents. A **customer agent** negotiates with a **stall agent** for you, the way you'd haggle at a market stall.

## How it works

1. **Customer agent:** acts for the buyer. It knows what you want, your budget and how far you're willing to go, and it bargains for the best price.
2. **Stall agent:** acts for the seller. It knows the stall's goods, its asking prices and the lowest price it will accept, and it tries to close the sale at a good margin.
3. **Negotiation:** the two agents make offers and counter-offers until they agree on a price or one side walks away.

```
 Customer ──▶ Customer Agent ⇄ offers / counter-offers ⇄ Stall Agent ◀── Stall Owner
                                       │
                                       ▼
                              Deal  or  No deal
```

## Design

- Colour system: [docs/colors.md](docs/colors.md)
- Palette research: [docs/research/color-palette.md](docs/research/color-palette.md)
- Tokens: `src/app/globals.css` (indigo actions, marigold highlights, emerald for money moved)

## Tech stack

- [Next.js](https://nextjs.org) (App Router) + TypeScript
- Tailwind CSS
- ESLint

## Getting started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser. The main page is `src/app/page.tsx`.

## Scripts

| Command         | Description               |
| --------------- | ------------------------- |
| `npm run dev`   | Start the dev server      |
| `npm run build` | Create a production build |
| `npm run start` | Run the production build  |
| `npm run lint`  | Run ESLint                |
