# SkyTouch PMS agent (hosted)

Vercel runs the HouseKeepAI web app. **SkyTouch Collect and Mark Clean write-back run here** — one always-on worker with Chromium, shared by all hotels.

Hotels only connect portal credentials in the PMS settings UI. They never install an agent.

**SkyTouch:** Collect + Mark Clean → Ready.  
**SynXis (opt-in):** Collect goes Front Office → Housekeeping → Room Status and imports Clean/Dirty rooms with occupancy (Vacant/Occupied) and guest stay (Stayover/Departing/Checked-out). It does not scrape SPH Dashboard flash (occupancy %, pre-arrival, arrivals, ADR). Mark Clean → Clean. Email OTP + Remember me (~3 days) via IMAP; encrypted session reuse; ~45-day password rotate. Override `portalSelectors.frontOfficeLink` / `housekeepingLink` / `boardUrl` if menus differ. Prefer SPH API later if Aven grants access.

## Where a Mark Clean fails

Vercel only queues the room. The agent opens Chrome, signs into SkyTouch, opens Housekeeping Center, sets Ready, and clicks Save. Each of those is a log line:

```text
step=browser-launch start
step=browser-launch FAIL Browser failed to start: this server ran out of threads or memory...
step=open-login ok
step=sign-in ok
step=housekeeping-center ok
step=set-ready ok rooms=112
```

Open `https://<agent-host>/logs` for the latest lines. The same short line is stored on the write job, not the Chrome dump.

The 12:37 PM failure for room 112 stopped at `browser-launch`. Railway’s container could not create Chrome threads (`pthread_create: Resource temporarily unavailable`). SkyTouch was never opened. That host needs about **2 GB RAM**, and only one Chrome may run at a time. A 512 MB Railway service will keep failing at this step on any platform. Fly.io or Render work the same way once the machine has about 2 GB.

## What you need

| Variable | Same as Vercel? | Notes |
|----------|-----------------|--------|
| `DATABASE_URL` | Yes | Production Postgres (Railway) |
| `NEXTAUTH_SECRET` or `PMS_CREDENTIALS_KEY` | Yes | Must match Vercel so portal passwords decrypt |
| `PMS_AGENT_TICK_MS` | Optional | Default `60000` (collect loop; each hotel still uses its sync interval) |
| `PMS_AGENT_WRITE_MS` | Optional | Default `30000` (Mark Clean write-back loop) |
| `PMS_AGENT_PROVIDERS` | Per worker | `SYNXIS` on the current Railway service. `SKYTOUCH` on the SkyTouch worker |
| `PLAYWRIGHT_PROXY_SERVER` | SkyTouch worker | Residential proxy, `http://user:pass@host:port`. SkyTouch drops Railway's own address |

## Deploy on Railway (recommended this week)

1. Open your Railway project (the one with Postgres).
2. **New Service** → **GitHub Repo** → same HouseKeepAI repo.
3. Settings → **Build**:
   - Builder: **Dockerfile**
   - Dockerfile path: `Dockerfile.pms-agent`
4. Settings → **Deploy**:
   - Custom start command can stay empty (image `CMD` is `npm run pms:agent:start`)
   - Restart policy: on failure
   - Healthcheck path: `/` (optional — the agent listens on Railway’s `$PORT` and returns `ok`)
   - You do **not** need a public domain for Collect to work
5. **Variables** (copy from the Vercel / web service):
   - `DATABASE_URL` → use the **private** Railway Postgres URL if the agent is in the same project
   - `NEXTAUTH_SECRET` (or `PMS_CREDENTIALS_KEY` if you set one on Vercel)
6. Deploy. In logs you should see:
   ```text
   boot has_DATABASE_URL=true has_NEXTAUTH_SECRET=true ...
   health server listening on 0.0.0.0:...
   PMS agent started pid=... tick=60s docker=1
   tick ok hotels_with_portal=...
   ```
7. In HouseKeepAI → PMS: enable SkyTouch portal + save credentials. Within ~10 minutes the agent should collect; Mark Clean should write back within about a minute.

**Resources:** give the service at least **2 GB RAM** (Chromium).

### If it crashes

| Log / symptom | Fix |
|---------------|-----|
| `DATABASE_URL is required` | Add `DATABASE_URL` (Postgres variable reference) |
| `Set PMS_CREDENTIALS_KEY or NEXTAUTH_SECRET` | Copy `NEXTAUTH_SECRET` from Vercel |
| `boot has_DATABASE_URL=false` | Variable not attached to **this** service |
| OOM / killed | Raise memory to 2 GB+ |
| Instant restart loop, no boot line | Wrong Dockerfile path or build failed — check Build logs |

## Deploy with Docker (any VPS)

```bash
docker build -f Dockerfile.pms-agent -t housekeep-pms-agent .
docker run -d --name pms-agent --restart unless-stopped \
  -e DATABASE_URL="postgresql://..." \
  -e NEXTAUTH_SECRET="..." \
  housekeep-pms-agent
```

Or with Compose (see `docker-compose.yml` service `pms-agent`).

## Local test against production DB

```bash
# .env.local: production DATABASE_URL + NEXTAUTH_SECRET
npx playwright install chromium
npm run pms:agent:loop
```

## Verify

1. Agent logs: `collect hotel=...` without Chromium errors  
2. Dashboard flash / room board updates after a collect  
3. Mark a room Clean → agent log shows `write-back jobs=...` within ~1 minute  

## Scaling to about 1000 properties

One browser can cover roughly 10 hotels on a 15-minute cycle (about 1–2 minutes per hotel). Add workers with:

```
workers ≈ hotels × collect_seconds / interval_seconds
```

Split by PMS first, then by hotel slot. Leave `PMS_AGENT_PROVIDERS` unset on the current Railway service so it keeps both hotels. When you add a second service, set the variables below and do not run two workers on the same slot.

| Service | `PMS_AGENT_PROVIDERS` | `PMS_AGENT_SLOTS` | `PMS_AGENT_SLOT` |
| --- | --- | --- | --- |
| SkyTouch 0 | `SKYTOUCH` | `4` | `0` |
| SkyTouch 1 | `SKYTOUCH` | `4` | `1` |
| SynXis 0 | `SYNXIS` | `2` | `0` |

`SLOT` is `0 .. SLOTS-1`. The worker owns a hotel when `hash(hotelId) % SLOTS == SLOT`. Writes for other slots stay pending for the worker that owns them.

SkyTouch and SynXis both run on Railway. SkyTouch uses full Chromium in new headless mode so Akamai returns `Login.do`. The separate `chrome-headless-shell` binary does not receive that page.

Vercel already sits in front of the app. Each serverless function opens one Postgres connection (`connection_limit=1`). Put a pooler in front of Postgres before the hotel count gets large. SynXis official Rooms API waits until Aven grants access; those hotels then leave the browser pool.

One worker is enough for the hotels online today. Do not ship agents to hotel PCs.
