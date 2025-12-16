# Repository Guidelines

## Project Structure & Module Organization

- `src/`: React web SPA (Vite). Components live in `src/components`, hooks in `src/hooks`, API clients in `src/api/services`.
- `backend/`: Django API. Settings in `backend/config`, domain apps under `backend/api`, `accounts`, `menu`, `orders`, etc.
- `mobile/`: Mobile client sources (not part of the web build).
- Assets: `public/` for SPA statics; `backend/media/` for uploaded files in development; `docs/` for plans and checklists.
- CI: `.github/workflows/ci.yml` runs frontend lint/build and backend checks/tests against MySQL + Redis services.

## Build, Test, and Development Commands

- Install web deps: `npm ci`
- Web dev server: `npm run dev`
- Web lint: `npm run lint`
- Web build: `npm run build`
- Backend deps: `cd backend && python -m pip install -r requirements.txt`
- Backend checks/tests: `cd backend && python manage.py check --deploy && python manage.py makemigrations --check --dry-run && python manage.py test`
- Docker (local stack): from repo root, `docker compose up --build` (API, MySQL, Redis, Vite dev server).

## Coding Style & Naming Conventions

- JS/TS: Prettier + ESLint (flat config). 2-space indent via formatter; prefer single quotes. Components PascalCase; hooks camelCase with `use*`; files follow existing kebab/camel patterns.
- React: Functional components, hooks-first; follow `react-hooks` lint rules.
- Python: Django defaults; modules snake_case; keep settings via env vars.

## Testing Guidelines

- Web: No dedicated unit test suite; lint enforced. Add targeted tests near features when introduced.
- Backend: Use Django test runner (`python manage.py test`). Name tests `test_*.py` in app `tests/` directories; cover state transitions for orders, inventory, payments, notifications.
- CI uses MySQL/Redis containers—avoid reliance on local state or sqlite-only behavior.

## Commit & Pull Request Guidelines

- Commits: concise, present tense (e.g., `fix: scope eslint to web`, `feat: add bulk order tracking`). Group related changes and avoid unrelated churn.
- After completing work, ensure your changes are committed and pushed to the remote branch.
- PRs: include summary, testing notes (`npm run lint`, `npm run build`, `python manage.py test`), and screenshots/GIFs for UI updates. Link issues/tickets when available.

## Security & Configuration Tips

- Secrets: do not commit real `.env` files; use `.env.example` and `backend/.env.example` as templates.
- DB/Redis config from env (`DJANGO_DB_*`, `REDIS_URL`); Docker Compose supplies local defaults.
- Media: in dev, files served from `backend/media`; production should serve via web server or object storage.
