# Margin Brand

**Idea:** the margin of a page is where a teacher writes the grade. Margin's look is built from the tools of that moment: ink, paper, a red pen and a highlighter.

## Logo

| File | Use |
|---|---|
| `web/assets/logo-mark.svg` | App icon, favicon, avatars, anywhere square |
| `web/assets/logo.svg` | Header/lockup with the "Margin" wordmark |
| `extension/assets/icons/icon{16,32,48,128}.png` | Chrome extension icons (rendered from the mark) |

The mark is an ink tile with a **red margin rule** on the left and an **M whose last stroke becomes a red-pen check**: "graded".

- Keep clear space of at least ¼ of the tile width around the mark.
- Don't recolor, rotate or add effects to the mark. On dark backgrounds the ink tile still works as is.
- Minimum size: 16px for the mark, 96px wide for the lockup.
- `logo.svg` sets the wordmark as live text in Fraunces. Convert it to outlines (Figma/Illustrator) before using it in print, slides or anywhere the font isn't loaded.

## Color

| Token | Hex | Role |
|---|---|---|
| Ink | `#1B1E3C` | Primary: text, buttons, dark surfaces |
| Ink soft | `#2E3260` | Secondary ink, borders on dark |
| Paper | `#FAF7F0` | Page background |
| Paper raised | `#FFFDF8` | Cards |
| Red pen | `#E8483B` | Accent: marks, icons, large text, button underline |
| Red pen (text) | `#B8322A` | Red for small text on paper (meets WCAG AA) |
| Highlighter | `#F6D44A` | Secondary accent: highlights, emphasis, labels on ink |
| Graphite | `#5A6072` | Muted text |
| Rule | `#E7E0CF` | Borders, dividers |
| Notebook blue | `#CFDBF3` | Ruled lines |
| Sage | `#2F7D5B` | Success states |

Use red sparingly, the way a teacher would: for marks and calls to action, not large fills. Never put small red `#E8483B` text on paper; use `#B8322A`.

Dark mode swaps the page to deep ink (`#12142A`) with paper-colored text; tokens live in `web/css/tokens.css`.

## Type

| Family | Use |
|---|---|
| **Fraunces** (600) | Headlines, wordmark |
| **Instrument Sans** (400–700) | Body and UI |
| **Caveat** (700) | Handwritten margin notes, scores, small accents only |

All three are free on Google Fonts. Caveat is decoration. Never set body copy or anything longer than a short phrase in it.
