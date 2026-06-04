# EDW Data Quality & Actuarial Reporting Dashboard

A portfolio project demonstrating enterprise data management skills for the Actuarial Data Management Analyst role.

## What this project demonstrates

- **Data ingestion pipeline** — platform onboarding simulator with field mapping (mirrors AWS Glue/S3 workflow)
- **Data quality engine** — automated null checks, range validation, referential integrity, business rules across 720 data points
- **Actuarial KPI dashboard** — live charts for premium trends, lapse rates, product mix, policy status
- **Data dictionary** — searchable metadata repository with business rules, PII flags, data lineage, and ownership

## Tech stack

- React 18 + Vite
- Recharts (data visualization)
- IBM Plex Sans / Mono (typography)
- Tabler Icons

## Deploy in 3 minutes (Vercel — free)

1. Push this folder to a GitHub repo
2. Go to vercel.com → "New Project" → import your repo
3. Vercel auto-detects Vite — just click Deploy
4. You get a live URL like: `nassau-edw.vercel.app`

## Run locally

```bash
npm install
npm run dev
```

Then open http://localhost:5173

## Build for production

```bash
npm run build
```
