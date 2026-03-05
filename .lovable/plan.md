

# AI² — Blair Bros Angus Herd Intelligence Platform

A full-stack cattle herd analytics dashboard built with React, TypeScript, and Supabase, featuring a dark navy/gold design theme.

## Setup & Foundation
- Connect to existing Supabase project using `@supabase/supabase-js` with env vars `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`
- Apply custom dark design system: navy background (#0E1528), gold accent (#CA972E), Inter font
- Create persistent left sidebar layout with React Router navigation across 5 pages

## Sidebar
- Fixed 220px sidebar (#0A1020 background) with "AI² — Blair Bros Angus" branding and 🐂 icon
- Nav links for Dashboard, Cow Roster, Cow Detail, Rankings & Culling, Sire Analysis
- Active item highlighted with gold accent and left border
- Live record counts from Supabase at bottom with "● Live" indicator

## Page 1 — Dashboard (Landing)
- 6 KPI cards: active cows, AI conception rate, calf survival rate, avg gestation, 2024 open rate, total calving records
- Score Distribution bar chart (Bottom 25% → Top 25%, red→green)
- Year-over-year trend line chart (open rate & conception rate by breeding year, with 10% concern threshold line)
- Calving Interval stats card (avg, median, best, longest)
- Alert banner if latest year's open rate exceeds 12%

## Page 2 — Cow Roster
- Sortable, filterable table of active cows with columns: Tag, Lifetime ID, Year Born, Sire, Dam Sire, Total Calves, Avg BW, AI Conception %, Survival %, Composite Score, Status
- Real-time search by tag/lifetime_id, filter dropdowns (status, year born, sire)
- Click-to-navigate to Cow Detail, pagination at 50 rows
- Color-coded composite score cells (green/yellow/red by quartile)

## Page 3 — Cow Detail (/cow/:lifetime_id)
- Header card with animal info and status badge
- KPI row: calvings, avg BW, conception rate, survival rate, composite score
- Calving history table and ultrasound history table
- Birth weight trend line chart
- Auto-generated performance notes (plain-English observations)

## Page 4 — Rankings & Culling Tool
- Composite Score Rankings table (top 50 / bottom 50 with toggle for all)
- Cull Recommendation Engine: flags cows meeting criteria (repeat opens, low score + age, low survival, no recent calving) with reasons and CSV export
- Sire Comparison panel: select 2 sires for side-by-side stats

## Page 5 — Sire Analysis
- Table of sires with 20+ calves: conception rate, gestation, BW, survival, bull calf %, performance badge
- 3 horizontal bar charts: conception rate, gestation days, bull calf % (with reference lines)
- Callout cards for top performer and underperforming high-use sire

## Data & UX
- All data fetched from Supabase with skeleton loading states and inline error handling
- Composite scores computed client-side from normalized conception rate, survival, and BW consistency
- Recharts for all visualizations with dark-themed tooltips (#111E35 bg, #CA972E labels)
- Desktop-first responsive design

