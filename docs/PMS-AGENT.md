# SkyTouch PMS agent (hosted)

Vercel runs the HouseKeepAI web app. **SkyTouch Collect and Mark Clean write-back run here** — one always-on worker with Chromium, shared by all hotels.

Hotels only connect portal credentials in the PMS settings UI. They never install an agent.

**SkyTouch:** Collect + Mark Clean → Ready.  
**SynXis (opt-in):** Collect room board (export or scrape → SynXis CSV import) + Mark Clean → Clean when portal is enabled. Tune `portalSelectors` (`boardUrl`, `downloadButton`, `cleanControl`) per hotel. Prefer SPH API later if Aven grants access.

## What you need

| Variable | Same as Vercel? | Notes |
|----------|-----------------|--------|
| `DATABASE_URL` | Yes | Production Postgres (Railway) |
| `NEXTAUTH_SECRET` or `PMS_CREDENTIALS_KEY` | Yes | Must match Vercel so portal passwords decrypt |
| `PMS_AGENT_TICK_MS` | Optional | Default `60000` (collect loop; each hotel still uses its sync interval) |
| `PMS_AGENT_WRITE_MS` | Optional | Default `30000` (Mark Clean write-back loop) |

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

## Scaling later

One worker is enough for early hotels. Next steps: more replicas + per-hotel locks, then a job queue. See product plan: central fleet only — do not ship agents to hotel PCs.
