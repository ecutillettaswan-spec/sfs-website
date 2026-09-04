# Students Feeding Students

The Students Feeding Students website and private SFS Mission Control for operating the snack-cabinet program at Oak Park and River Forest High School.

**Solidarity. Not charity.**

## What is included

- Public SFS website at `/`
- Private, role-based Mission Control at `/mission-control`
- Legacy `/tracker` redirect and idempotent Google Sheet history import
- Manual cabinet inventory and field checks
- Route/task handoffs and volunteer assignments
- Evidence-gated depletion forecasts and purchasing recommendations
- Donation-to-purchase impact attribution
- Anonymous cabinet QR feedback without student accounts or tracking
- Review-gated public impact dashboard, weekly reports, and monthly PDFs
- Off/Review/On controls for AI, outbound email, reports, and publishing

## Local development

Use Node.js 22.13 or newer.

```bash
npm install
npm run dev
```

Before release, run:

```bash
npm run check
npm audit --omit=dev
```

Database schema changes require a generated D1 migration:

```bash
npm run db:generate
```

## Production configuration

Copy `.env.example` for local values. Production values belong in Sites environment settings, never in source control.

- `OWNER_EMAIL` is required and must match the exact ChatGPT sign-in email for the first owner.
- `TRACKER_CSV_URL` is the private, server-only CSV export or proxy used by the legacy Form bridge. Do not hard-code a Sheet ID in source.
- `TRACKER_SYNC_BEARER_TOKEN` is optional for a protected CSV proxy. Restrict or replace the anonymously readable Sheet before broadening access beyond the owner review.
- `OPENAI_API_KEY` is optional; a deterministic operations engine remains available without it.
- Resend and automation values are required before email/report delivery can move from Review to On.

The outbound master gate starts Off. Forecasts remain advisory and exact stockout times stay unavailable until enough quantitative count history exists. Hardware sensing is deferred; the current system uses manual counts, no cameras, and no student identification or tracking.
