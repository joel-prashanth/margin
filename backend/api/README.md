# Margin API

FastAPI service for AI grading, accounts and usage. Built as **one app split into modules**: each feature lives in `app/modules/<name>/` (router, schemas, services) and can be split into its own service later if it needs to scale independently.

```
app/
  main.py              app factory, CORS, router registration (/v1 prefix)
  core/
    config.py          settings from environment / .env
    db.py              SQLAlchemy engine + session for Neon Postgres
  modules/
    system/            /health
    grading/           /v1/grade/* (being ported from the extension)
migrations/            Alembic (reads DATABASE_URL from settings)
tests/
```

Planned modules: `auth` (accounts), `usage` (metering for pricing), and a `jobs` worker for batch grading.

## Run locally

Requires [uv](https://docs.astral.sh/uv/getting-started/installation/). It installs Python 3.12 (pinned in `.python-version`) and the exact package versions in `uv.lock`.

```bash
cd backend/api
uv sync                           # create .venv and install everything
copy .env.example .env            # then fill in values (cp on macOS/Linux)

uv run uvicorn app.main:app --reload   # http://localhost:8000/docs
uv run pytest
uv run ruff check .
```

Dependencies: `uv add <package>` (or `uv add --dev <tool>`) updates `pyproject.toml` and `uv.lock` together; commit both. CI runs `uv sync --locked` and fails if they disagree.

**Windows with Smart App Control:** if `uv sync` or `uv run` fails with "An Application Control policy has blocked this file", create the venv with Python's own launcher first, then sync into it:

```bash
uv python install 3.12
& "$(uv python find 3.12)" -m venv .venv   # PowerShell
uv sync
```

The API starts without a database. `/health` reports `"database": "not_configured"` until `DATABASE_URL` is set.

## Database (Neon)

1. Create a Neon project and copy the connection string (Dashboard → Connect).
2. Paste it into `.env` as `DATABASE_URL=…` exactly as Neon shows it (`postgresql://…?sslmode=require`); the app switches it to the psycopg driver.
3. `alembic revision --autogenerate -m "describe change"` after adding models, then `alembic upgrade head`.

Each API pull request gets its own Neon branch for testing migrations (see [docs/BRANCHING.md](../../docs/BRANCHING.md)).

## API contract

- `GET /health` → `{ status, environment, database }`
- `POST /v1/grade/journal` → body `{ content: { experience, feelings, learning, application, conclusion } }`, returns `{ rubric, reasoning, feedback, flags }`. **Currently answers 501** until the grading logic is ported.

The website demo calls this endpoint when `apiBase` in `frontend/web/js/config.js` is set to `<api-url>/v1`.
