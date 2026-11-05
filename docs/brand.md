# Logo

![Molbhav mark](../public/brand/molbhav-mark.svg)

**The idea.** Two speech bubbles, yours and the stall's, overlap. Where they meet is the deal: an emerald
lens with a check. Molbhav is bargaining by conversation, and the mark shows both sides talking until they
land in the middle.

**Colours** come from the palette in [colors.md](colors.md):

| Part           | Light                                    | Dark                  | Why                               |
| -------------- | ---------------------------------------- | --------------------- | --------------------------------- |
| Your bubble    | indigo `#2b3a8f` (white on indigo tiles) | white                 | Trust, you                        |
| Stall's bubble | marigold `#f5a524`                       | `#fbbf24`             | The bazaar                        |
| The deal       | emerald `#047857`, white check           | `#10b981`, dark check | Money that moved, a deal done     |
| Tile / splash  | deep indigo `#222d78`                    | same                  | The brand panel colour (`--hero`) |

## Files

| Where                                                    | What                                                                    |
| -------------------------------------------------------- | ----------------------------------------------------------------------- |
| `src/components/brand/logo.tsx`                          | `LogoMark` and `Logo` (mark + wordmark) for the app; uses theme colours |
| `src/components/brand/block-print.tsx`                   | Marigold block-print pattern for hero atmosphere                        |
| `src/app/icon.svg`                                       | Browser tab icon (Next.js App Router)                                   |
| `public/brand/molbhav-icon.svg`                          | App-icon tile                                                           |
| `public/brand/molbhav-mark.svg`, `molbhav-mark-dark.svg` | The bare mark for light and dark backgrounds                            |

## Rules

- Keep clear space around the mark of at least the width of the lens.
- Don't recolour the bubbles, rotate the mark or add effects (shadows, gradients, outlines).
- Below 24 px, use the tile (`molbhav-icon.svg`) rather than the bare mark.
- The wordmark is Bricolage Grotesque Bold, set as live text next to the mark.

## Regenerating

Change the geometry in both `scripts/logo/generate.py` and `logo.tsx`, then:

```sh
python3 scripts/logo/generate.py /tmp/molbhav-logo
cp /tmp/molbhav-logo/web/icon.svg src/app/icon.svg
cp /tmp/molbhav-logo/brand/*.svg public/brand/
```
