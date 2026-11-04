# Margin Worker

Cloudflare Worker that grades reflective journals with Workers AI (`@cf/meta/llama-3.1-8b-instruct-fast`). Live at `https://margin-ai.joel-prashanth0528.workers.dev`.

## Routes

- `POST /grade-journal` with `{ experience, learning, application, feelings, conclusion }` → `{ success: true, data: { rubric, reasoning, feedback, flags, marks, maxMarks } }`, or `{ success: false, message }`.
- Every other path answers 404. The extension also calls `/grade-reflective-essay` and `/grade-lab`; it falls back to Gemini or skips them when they fail.

## Run and deploy

Requires Node 20+.

```bash
cd backend/worker
npm install
npx wrangler login         # once, opens Cloudflare in the browser
npm run dev                # http://localhost:8787 (Workers AI calls go to your account and use quota)
npm run deploy             # updates margin-ai
```

The code here is the source of truth; don't edit it in the Cloudflare dashboard, or the next deploy from the repo overwrites those edits. Secrets, if one is ever needed, go in with `npx wrangler secret put NAME` (and `.dev.vars` locally, which git ignores), never in `wrangler.toml`.
