# Colour palette research

First research pass for MolBhav's visual system. Goal: pick colours that say **Indian street market** and **your money is safe** at the same time — because the product is both a bazaar bargain and a payment flow.

## Product framing

MolBhav (मोलभाउ — "haggling") lets a customer agent negotiate with a stall agent the way a person would haggle at a market stall. The UI will eventually cover offers, counters, sealed deals, and payment. Colours therefore have to work for food-and-stall energy **and** for trust around money.

## Competitive landscape

Indian apps people already have on their phone own these colours:

| App      | Colour             | Source                                                                                                                    |
| -------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| Swiggy   | orange `#FF5200`   | [Swiggy master brand guidelines](https://www.swiggy.com/corporate/wp-content/uploads/2026/07/master-brand-guidelines.pdf) |
| Zomato   | red `#E23744`      | [color.codes.in](https://color.codes.in/brands/zomato)                                                                    |
| PhonePe  | purple `#5F259F`   | [color.codes.in](https://color.codes.in/brands/phonepe)                                                                   |
| Paytm    | sky blue `#00BAF2` | [color.codes.in](https://color.codes.in/brands/paytm)                                                                     |
| Razorpay | blue `#3395FF`     | [color.codes.in](https://color.codes.in/brands/razorpay)                                                                  |
| CRED     | black and silver   | [color.codes.in](https://color.codes.in/brands/cred)                                                                      |

Only Swiggy's value comes from an official guideline; the others are from an aggregator and may be approximate.

**Implication:** orange or red as primary reads as food delivery; sky blue reads as Paytm; purple as PhonePe. MolBhav needs to sit apart from all of them.

## Colour meaning in finance UIs

Industry consensus (design blogs, not controlled studies):

- **Blue builds trust**, which is why most fintechs use it — and why plain blue blends in ([We and the Color](https://weandthecolor.com/color-psychology-in-fintech-branding-how-the-right-palette-builds-user-trust/209146)).
- **Green means money and growth** ([Progress](https://www.progress.com/blogs/how-choose-right-colors-fintech)).
- **Red, orange and yellow read as warnings** in finance apps ([Windmill](https://windmill.digital/psychology-of-color-in-financial-app-design/)). Warm colours must stay off anything that moves money (Pay, Send, Confirm).

## Colours that feel Indian, not just warm

- **Indigo** was once called India's "blue gold" for its place in the dye trade ([Birla Opus](https://www.birlaopus.com/blog/colours-of-india-for-homes)). It carries blue's trust while being deeper and more Indian than the sky blues of Paytm and Razorpay.
- **Marigold** is the colour of garlands and turmeric in every market ([cultural colour palettes](https://abacktools.com/tools/design/color-tools/cultural-color-palettes)). It brings the bazaar in — as a highlight, not as an action colour.

## Options rejected

| Option                                            | Why it failed                                                                                    |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Terracotta and cream (recipe / cooking palette)   | Warm and appetising, but too close to Swiggy / Zomato; orange on a Pay button reads as a warning |
| Dark slate with gold and purple (generic fintech) | Purple sits next to PhonePe; dark-default feels like a generic AI app                            |
| Peacock teal                                      | Indian and distinctive, but a green-blue primary would blur with emerald used for "paid"         |

## Decision

| Role                | Hue                   | Why                                                                   |
| ------------------- | --------------------- | --------------------------------------------------------------------- |
| Primary / actions   | Indigo `#2B3A8F`      | Trust + Indian dye heritage; distinct from Paytm / Razorpay sky blues |
| Highlights / offers | Marigold `#F5A524`    | Bazaar signal; never used on money buttons                            |
| Money moved         | Emerald `#047857`     | Paid, deal done, savings — only after money moves                     |
| Errors              | Deep red `#B42318`    | Errors and irreversible actions only                                  |
| Page surface        | Warm paper `#FBF8F1`  | Soft market-stall paper, not clinical white                           |
| Brand panel         | Deep indigo `#222D78` | Hero / splash surface; white text at ~11:1                            |

Dark mode uses lighter tints of the same hues so meaning stays stable across themes.

## Contrast gates

All text pairs target [WCAG 2.2](https://www.w3.org/TR/WCAG22/#contrast-minimum) AA: **4.5:1** for text, **3:1** for interactive edges. Decorative `border` may sit under 3:1; form fields use `input` instead.

Verified pairs (light / dark):

| Pair                       | Light | Dark  |
| -------------------------- | ----- | ----- |
| Body text on background    | 16.68 | 16.18 |
| Text on primary            | 9.98  | 7.21  |
| Primary as link text       | 9.41  | 7.21  |
| Text on secondary          | 8.67  | 10.95 |
| Text on success            | 5.48  | 9.51  |
| Muted text on background   | 6.46  | 8.30  |
| Input border on background | 3.75  | 3.96  |

## Usage rules that fell out of the research

1. **One indigo action per screen** — main CTA is `primary`; everything else is outlined or plain.
2. **Marigold highlights, it never acts** — offers and badges only; never Pay / Send / Confirm.
3. **Green only after money moves.**
4. **Red only for errors** and irreversible actions.
5. **Never hard-code hex in components** — use semantic tokens so light/dark and future retunes stay consistent.

## Next steps

Token definitions and implementation notes live in [../colors.md](../colors.md). Tokens themselves live in `src/app/globals.css`.
