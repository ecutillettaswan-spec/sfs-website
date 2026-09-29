# Students Feeding Students

The Students Feeding Students website and private SFS Mission Control for operating the snack-cabinet program at Oak Park and River Forest High School.

**Solidarity. Not charity.**

## What is included

- Public SFS website at `/`
- Password-protected Mission Control at `/missioncontrol`
- Existing password-protected `/tracker` preserved alongside an idempotent Google Sheet history import
- Manual cabinet inventory and field checks
- Route/task handoffs and volunteer assignments
- Evidence-gated depletion forecasts and purchasing recommendations
- Donation-to-purchase impact attribution
- Cabinet QR feedback with an optional name field
- Review-gated public impact dashboard, weekly reports, and monthly PDFs
- Contact inquiries in the protected inbox, with a post-submit thank-you page
- Off/Review/On controls for outbound email, reports, forecasts, and publishing

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

- Mission Control uses the same shared password as the legacy tracker. Anyone with it receives full owner access.
- Set `MISSION_CONTROL_PASSWORD` and a random 32-character-or-longer `MISSION_CONTROL_SESSION_SECRET` as encrypted server-side Cloudflare secrets.
- `TRACKER_CSV_URL` is the private, server-only CSV export or proxy used by the legacy Form bridge. Do not hard-code a Sheet ID in source.
- `TRACKER_SYNC_BEARER_TOKEN` is optional for a protected CSV proxy. Restrict or replace the anonymously readable Sheet before broadening access beyond the owner review.
- Resend and automation values are required before email/report delivery can move from Review to On.
- `SFS_GA4_MEASUREMENT_ID` is optional. Supply the GA4 web stream ID (starting `G-`) in the Cloudflare Pages build environment to enable page analytics. Without it, no Google Analytics script loads.

The outbound master gate starts Off. Forecasts remain advisory and exact stockout times stay unavailable until enough quantitative count history exists. Hardware sensing is deferred; the current system uses manual counts.
