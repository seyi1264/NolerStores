# NolerStores

Minimal developer README

Quick start

1. Copy `.env.example` to `.env` and fill values.

2. Install dependencies:

```bash
npm ci
```

3. Run locally:

```bash
npm run dev
# Open http://localhost:4000 and the static HTML in the browser
```

Tests

Tests use an in-memory SQLite DB. Run:

```bash
npm test
```

Migrations

The `migrations/` folder contains SQL files for Postgres. Run them with:

```bash
DATABASE_URL=postgres://... npm run migrate
```

Deploy (Fly)

Set `FLY_API_TOKEN` as a repository secret then push to `main` — the GitHub Actions workflow will run tests and deploy.

Manual deploy via flyctl:

```bash
flyctl deploy --app nolerstores-xwlgba
```

Admin CLI

Approve a review from CLI:

```bash
ADMIN_SECRET=your_secret API_BASE=http://localhost:4000 node bin/approveReview.js <review-id>
```
# NolerStores