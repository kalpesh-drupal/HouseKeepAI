# HouseKeepAI

Modern hotel operations platform covering housekeeping, inspections, maintenance, front desk, inventory, AI, PMS sync, and mobile PWA.

**Phases 1–3 are complete** for local/demo use.

## Phase 1 Features

- **Authentication** — 7 role-based user types (Owner, GM, Front Desk, Executive Housekeeper, Housekeeper, Maintenance, Inspector)
- **Dashboard** — Occupancy, arrivals/departures, room status cards, and charts
- **Interactive Hotel Map** — Visual floor-by-floor room board with color-coded status and filters
- **Room Details** — Guest info, checklists, voice/text notes, VIP/rush/OOO actions, QR, photos
- **Housekeeping** — Assigned rooms with interactive cleaning checklists
- **Inspection** — Approve/reject workflow (reject returns room to housekeeper)
- **Maintenance** — Ticket tracking with status workflow
- **Front Desk** — Clean/dirty rooms, arrivals, departures, VIP/rush/block/move actions
- **Messaging** — Internal team messages with channel + room links
- **Settings** — Staff user CRUD, roles, active/inactive, browser notification opt-in

## Phase 2 Features

- **Inventory** — Categories, stock alerts, auto-decrement on room clean
- **Laundry** — Dirty → Washing → Drying → Ready → Delivered
- **Lost & Found** — Log, search by guest/room, claim/dispose
- **Guest Requests** — Create, assign, complete workflow
- **Reports** — Daily / weekly / monthly ops metrics with CSV / Excel / PDF export
- **Upload HK List** — Manual CSV/Excel housekeeping report import
- **PMS Connectors** — SkyTouch, SynXis, Opera, Cloudbeds, Mews, StayNTouch, AutoClerk, Little Hotelier (live API when credentials set; demo sync otherwise)

## Phase 3 Features

- **AI Assistant** — Natural-language ops Q&A (rule-based; optional OpenAI when `OPENAI_API_KEY` is set)
- **AI Cleaning Priority** — Scores rooms by rush/VIP/arrival/slow turnover
- **Staff Suggestions** — One-click apply AI housekeeper assignments
- **Predictive Maintenance** — Flags recurring / high-risk rooms
- **Inventory Forecasting** — Days-of-stock + reorder quantities
- **Room QR Codes** — Deep link from room details to tasks
- **Photo before/after** — Room details + mobile upload
- **Multilingual UI** — English, Español, हिन्दी
- **Offline sync** — Service worker + IndexedDB action queue + room list cache
- **Mobile App (PWA)** — `/m` role-based UI for Housekeeper, Maintenance, Inspector

## Quick Start

```bash
# Install dependencies
npm install

# Set up environment
cp .env.example .env

# Create database and seed demo data
npm run db:push
npm run db:seed

# Start development server
npm run dev
```

Open [http://localhost:3006](http://localhost:3006)

## Demo Accounts

All accounts use password: `password123`

| Role | Email |
|------|-------|
| Owner | owner@hotel.com |
| General Manager | gm@hotel.com |
| Front Desk | frontdesk@hotel.com |
| Executive Housekeeper | ehk@hotel.com |
| Housekeeper | housekeeper@hotel.com |
| Maintenance | maintenance@hotel.com |
| Inspector | inspector@hotel.com |

## Tech Stack

- **Next.js 15** (App Router)
- **TypeScript**
- **Tailwind CSS 4**
- **Prisma** + SQLite (dev)
- **NextAuth.js** (credentials)
- **Recharts**

## Production hardening

- **Health check:** `GET /api/health`
- **Onboarding:** `/onboarding` creates hotel + owner + rooms
- **PMS conflict policies:** `PMS_RESERVATIONS_ONLY` (default), `PMS_WINS`, `MANUAL_WINS`
- **Scheduled sync:** `GET /api/pms/cron` with `Authorization: Bearer $CRON_SECRET` (Vercel cron every 10m via `vercel.json`)
- **Postgres option:** `docker compose up -d` then set `DATABASE_URL` and switch Prisma provider to `postgresql`

```bash
# Local cron test
source .env
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3006/api/pms/cron
```

## Sample HK upload file

[`public/samples/housekeeping-list.csv`](public/samples/housekeeping-list.csv)

## Room Status Colors

| Status | Color |
|--------|-------|
| 🟥 Dirty | Vacant, needs cleaning |
| 🟨 Cleaning | Currently being cleaned |
| 🟩 Clean | Cleaned, awaiting inspection |
| 🟦 Inspected | Passed inspection |
| 🟪 Maintenance | Maintenance in progress |
| ⚫ Out of Order | Blocked |
