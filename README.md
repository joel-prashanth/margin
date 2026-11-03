# Margin

AI-assisted grading and attendance tools for faculty on Aurora ERP.

## Repository

| Folder | What it is |
|---|---|
| `extension/` | Chrome (MV3) extension, the bridge to Aurora ERP. See [extension/README.md](extension/README.md). |
| `web/` | Landing page with a "try it" demo. Static HTML/CSS/JS, no build step. |
| `api/` | *(planned)* FastAPI service for AI grading, accounts and usage, backed by Neon Postgres. |
| `docs/` | [Branching & releases](docs/BRANCHING.md), [brand guide](docs/BRAND.md). |
| `archive/` | Old drafts kept for reference. Not shipped. |

## Run locally

- **Extension:** `chrome://extensions` → Developer mode → Load unpacked → select `extension/`.
- **Website:** serve `web/` with any static server, e.g. `npx serve web`, then open the printed URL. Set `apiBase` in `web/js/config.js` once the API is running; until then the demo shows labelled sample output.
