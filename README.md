# Flyleaf Press

A local-first PWA for writing and **sharing** long book reviews. Existing reading apps truncate,
reformat, or refuse to share a review of real length — this one shares any review whole, as a
printed-looking card, splitting to a second page at a paragraph boundary when it needs to.

The app itself lives in [`app/`](app/). Everything else at this level is design material:
`DESIGN.md` (the visual system), `refs/` (reference screenshots), and prototype files.

## Features

- Book search across three catalogues (Open Library, Apple Books, Google Books), merged on a trust order
- Reviews with real covers, fractional 1–5 ratings (0.25 steps), multi-format, auto-filled series
- Ten card styles — five review grounds, five monthly-collage layouts — switchable any time
- Share as images (to other apps) or download to the photo library; save as PDF
- Monthly collages of everything finished that month
- Fully offline: all data in IndexedDB on the device, JSON backup export/import in Settings
- Installs as a PWA; holds 360px

## Develop

```bash
cd app
npm install
npm run dev
```

## Build & deploy

```bash
cd app
npm run build
```

Deploys as a static site. On Vercel, set the project root to `app/` — `vercel.json` there
carries the SPA rewrite. No environment variables, no server, no database to provision.
