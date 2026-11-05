@AGENTS.md

## Skills

These skills are installed system-wide (`~/.claude/skills`), not in this repo. Use them for UI, design and branding work on MolBhav. Load the matching skill before you start the task.

| Skill                 | Use it for                                                             |
| --------------------- | ---------------------------------------------------------------------- |
| `ui-ux-pro-max`       | Designing, building or reviewing any page, component or layout         |
| `shadcn`              | Adding, composing or styling shadcn/ui components                      |
| `ui-styling`          | Tailwind styling, accessible components, dark mode                     |
| `design-system`       | Design tokens and component specs (keep in sync with `docs/colors.md`) |
| `mobile-first-design` | Responsive layouts, starting from mobile                               |
| `brand`               | Brand voice, messaging and visual identity                             |
| `design`              | Logos, icons, brand identity assets                                    |
| `banner-design`       | Social, ad and hero banners                                            |
| `slides`              | HTML presentations / pitch decks                                       |

If a skill is missing, ask the user to install it system-wide. Don't add skills to this repo.

## Conventions

- Colour tokens live in `src/app/globals.css`; see `docs/colors.md` before changing colours.
- Run `npm run format` and `npm run lint` before committing.
