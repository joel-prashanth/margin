# Margin Worker

Cloudflare Worker that grades journals, reflective essays and lab reports for the extension.

## Routes

- `GET /health` → `{ status: "ok" }`
- `POST /grade-journal`, `/grade-reflective-essay`, `/grade-lab` → `{ success, data }` or `{ success: false, message }`. **Answer 501** until the grading logic is moved over from the previous Worker.

## Run and deploy

Requires Node 20+.

```bash
cd backend/worker
npm install
npm run dev                # http://localhost:8787
npx wrangler login         # once, opens Cloudflare in the browser
npm run deploy             # publishes to <name>.<your-subdomain>.workers.dev
```

Secrets (for example an AI provider key) are set with `npx wrangler secret put NAME`, never in `wrangler.toml`. For local runs put them in `.dev.vars`, which git ignores.
