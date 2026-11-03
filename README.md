# Margin

AI-assisted grading and attendance tools for faculty on Aurora ERP.

## Repository

| Folder | What it is |
|---|---|
| `frontend/extension/` | Chrome (MV3) extension: the bridge to Aurora ERP and the grading UI. See [its README](frontend/extension/README.md). |
| `frontend/web/` | Landing page with a "try it" demo. Static HTML/CSS/JS, no build step. |
| `backend/api/` | FastAPI service for AI grading, accounts and usage, on Neon Postgres. See [its README](backend/api/README.md). |
| `docs/` | [Branching & releases](docs/BRANCHING.md), [brand guide](docs/BRAND.md). |
| `archive/` | Old drafts kept for reference. Not shipped. |

**What runs where:** Aurora ERP can only be reached from the faculty member's own browser, so ERP calls stay in the extension. AI grading, accounts and usage live in the backend, and both frontends call it.

## Run locally

- **Extension:** `chrome://extensions` → Developer mode → Load unpacked → select `frontend/extension/`.
- **Website:** serve `frontend/web/` with any static server (e.g. `npx serve frontend/web`). Set `apiBase` in `frontend/web/js/config.js` to your API URL plus `/v1`; until then the demo shows labelled sample output.
- **API:** see [backend/api/README.md](backend/api/README.md).
