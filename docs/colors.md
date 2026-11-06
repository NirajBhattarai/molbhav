# Colour system

MolBhav lets a customer agent bargain with a stall agent the way a person would at an Indian street market. The palette has to say two things at once: **this is a bazaar** and **your money is safe here**.

Research behind the choices: [research/color-palette.md](research/color-palette.md).  
Tokens live in [`src/app/globals.css`](../src/app/globals.css).

## The palette

| Token                  | Light                 | Dark      | Use it for                             |
| ---------------------- | --------------------- | --------- | -------------------------------------- |
| `primary`              | indigo `#2B3A8F`      | `#8E9BFF` | Main buttons, links, focus ring        |
| `primary-foreground`   | `#FFFFFF`             | `#10132A` | Text on primary                        |
| `secondary`            | marigold `#F5A524`    | `#FBBF24` | Offers, highlights, badges             |
| `secondary-foreground` | `#14172B`             | `#10132A` | Text on secondary                      |
| `success`              | emerald `#047857`     | `#34D399` | Paid, deal done, savings               |
| `success-foreground`   | `#FFFFFF`             | `#10132A` | Text on success                        |
| `destructive`          | `#B42318`             | `#F87171` | Errors and irreversible actions only   |
| `background`           | warm paper `#FBF8F1`  | `#10132A` | Page                                   |
| `foreground`           | ink `#14172B`         | `#F3F1EA` | Body text                              |
| `card` / `popover`     | `#FFFFFF`             | `#181C38` | Raised surfaces                        |
| `muted` / `accent`     | `#EFEBE2`             | `#1E2240` | Quiet surfaces, hover backgrounds      |
| `muted-foreground`     | `#545A6E`             | `#A9AEC4` | Secondary text                         |
| `input`                | `#7C7F8E`             | `#6E7394` | Form field borders                     |
| `border`               | `#E4DFD3`             | `#2A2F52` | Decorative dividers only               |
| `hero`                 | deep indigo `#222D78` | `#181E52` | Brand panel / splash                   |
| `hero-foreground`      | `#FFFFFF`             | `#FFFFFF` | Text on hero                           |
| `hero-success`         | mint `#6EE7B7`        | `#6EE7B7` | Money and "live" on the indigo panel   |
| `awning`               | marigold at 28%       | at 9%     | Decorative wash at the top of a screen |

Token names follow [shadcn/ui theming](https://ui.shadcn.com/docs/theming) conventions, so UI kits that expect those names pick them up as-is. In Tailwind they are classes like `bg-primary`, `text-muted-foreground`, `border-input`, and `bg-success`.

## Rules for using it

1. **One indigo action per screen.** The main thing to do is `bg-primary`; everything else is outlined (`border-input bg-card`) or plain.
2. **Marigold highlights, it never acts.** Use `secondary` for an offer, a badge, or a "best price" chip — never for Pay, Send, or Confirm.
3. **Green only after money moves.** `success` is for paid, sealed, saved — not for "go" buttons.
4. **Red only for errors** and things that can't be undone.
5. **Never hard-code a hex value in a component.** Use the token class so both themes and future changes work.

## Dark mode

Dark mode follows the device setting. To force one, put `class="dark"` or `class="light"` on `<html>`. Dark colours are lighter tints of the same hues, so the meaning of each colour stays the same.

## Contrast

All pairs were checked against [WCAG 2.2](https://www.w3.org/TR/WCAG22/#contrast-minimum): 4.5:1 for text, 3:1 for component edges. Full table and sources are in the [research note](research/color-palette.md).

`border` is lighter than 3:1 on purpose: it is for decorative dividers. Anything a person has to find and use (like a text field) takes `border-input`.

## Changing the palette

1. Edit the values in both the light and dark blocks of `globals.css` (the dark values appear twice: once for the system setting and once for `.dark`).
2. Re-check every contrast pair, for example with [WebAIM's contrast checker](https://webaim.org/resources/contrastchecker/).
3. Update this document and the research note if the rationale changes.
