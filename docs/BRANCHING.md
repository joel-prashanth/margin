# Branching & Release Strategy

Margin uses **trunk-based development**: one long-lived branch (`main`), short-lived work branches, and tags for releases. It suits a small team shipping a website continuously, an API with staging/production, and a Chrome extension with slow store reviews.

## Branches

| Branch | Purpose | Lifetime |
|---|---|---|
| `main` | Always releasable. Protected: no direct pushes, PR + passing CI + 1 approval. | Permanent |
| `feat/<area>-<topic>` | New functionality | Days, not weeks |
| `fix/<area>-<topic>` | Bug fixes | Hours–days |
| `chore/…`, `docs/…`, `refactor/…` | Tooling, docs, internal changes | Short |
| `hotfix/<area>-v<x.y.z>` | Patch a released version when `main` can't ship yet (rare) | Until tagged |

`<area>` is one of `ext`, `web`, `api` (or `repo` for cross-cutting work), e.g. `feat/api-journal-grading`, `fix/ext-lab-batch-retry`.

Keep branches small. If a feature takes longer than a few days, merge it in slices behind a feature flag instead of letting a branch live long.

## Pull requests

1. Branch from the latest `main`; rebase (don't merge `main` in) to stay current.
2. PR title follows [Conventional Commits](https://www.conventionalcommits.org) with the area as scope:
   `feat(api): add /grade/journal endpoint`, `fix(ext): keep lab batch running after a 429`.
3. CI runs checks only for the areas the PR touches (`extension/`, `web/`, `api/`).
4. One approval, then **squash merge**. The PR title becomes the commit on `main`, which keeps history readable and changelogs automatic.
5. Delete the branch after merge.

## Releases

Each part of the monorepo releases independently, with area-prefixed tags.

| Part | Flow |
|---|---|
| **web** | Every PR gets a preview deployment. Merging to `main` deploys to production. |
| **api** | Merging to `main` deploys to **staging**. Tag `api-vX.Y.Z` deploys to **production**. |
| **extension** | Bump `version` in `extension/manifest.json`, tag `ext-vX.Y.Z`, and CI builds the zip for Chrome Web Store upload. |

Versioning is [SemVer](https://semver.org): breaking = major, feature = minor, fix = patch. The extension and API must agree on an API version (`/v1/...`) so an older extension in the store keeps working after an API deploy.

## Database (Neon)

- Every API PR gets its own **Neon branch** (a copy-on-write clone of staging data), created by CI and deleted on merge. Migrations are tested there before they reach staging.
- Migrations (Alembic) must be **backward compatible** with the previous API release (expand → migrate → contract), because the old and new API versions overlap during deploys.

## Hotfixes

Usually just a `fix/` branch merged to `main` and tagged. Only if `main` holds unreleased work that can't ship yet: branch `hotfix/<area>-v<x.y.z>` from the last release tag, fix, tag, then cherry-pick the fix to `main`.

## Why not Git Flow?

A permanent `develop` branch and `release/*` branches add merge overhead and delay feedback. Continuous deploys for web and API, plus tags for the extension, cover the same needs with less ceremony. Revisit this if the team grows past ~8 engineers or needs parallel supported versions.
