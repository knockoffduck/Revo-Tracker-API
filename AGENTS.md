# Revo Tracker API — Agent Guide

**Project:** Revo Tracker API
**Purpose:** Scrapes live member counts from Revo Fitness gyms, stores historical data, and exposes an API.
**Runtime:** Bun (JavaScript/TypeScript)
**Framework:** Hono (lightweight web API)
**Database:** MySQL (Drizzle ORM)
**Github:** `https://github.com/knockoffduck/Revo-Tracker-API`

---

## 1. Project Structure

```
/src
  index.ts              # API server entry — routes, scheduler, startup
  auto.ts               # Standalone 5-minute cron that hits the production API
  auto.ts              # Standalone cron script for remote deployment
  agents/
    trendAgent.ts       # Pre-computes gym attendance trends (popular times)
    statAudit.ts        # Detects and repairs anomalous zero-occupancy readings
  db/
    schema.ts           # ALL database tables (Drizzle ORM)
    relations.ts        # Table relations
  utils/
    parser.ts           # Core scraping logic — fetches & parses gym member counts
    details.ts          # Scrapes individual gym pages for squat rack counts
    database.ts         # MySQL connection via Drizzle
    proxy.ts            # HTTP proxy with fallback logic (Webshare)
    tools.ts            # simpleIntegerHash() — deterministic gym ID from name+postcode
    handlers.ts         # API response helpers (handleSuccess / handleError)
    types.ts            # GymInfo type definition
    gyms.json           # Static registry of ~50 known gym names and sizes
    geocoder.ts         # (present but not referenced in core flows)
/Scraper
  generate_cookies.ts   # Generates PHP-serialized member cookies for auth
  cookies.json           # Rotating cookie jar (5 members, refreshed daily)
  club-counter.php      # PHP scraper (reference only, not used at runtime)
  test_proxies.ts       # Proxy health checker
  cookie_editor.ts       # Manual cookie editor
  proxies.json           # List of known proxy IPs
/reports
  dropouts*.json        # statAudit repair reports
/scripts
  repair-gym-dropouts.ts # CLI tool for running statAudit (see §6)
/drizzle
  meta/                 # Drizzle migration snapshots
/tests
  *.test.ts             # Bun test suite (60 tests)
/logs
  updated_stats.json     # Last 5 scrape sessions (rolling)
.env                     # DATABASE_URL, PROXY_*, etc.
drizzle.config.ts        # Drizzle Kit config
package.json
```

---

## 2. Database Schema

**Only the `revo*` tables are active.** The rest (`motherboards`, `bios_links`, `account`, etc.) are legacy.

### Revo_Gyms — Gym registry
| Column | Type | Notes |
|--------|------|-------|
| id | varchar(36) PK | Hash of name+postcode via `simpleIntegerHash()` |
| name | text | Display name |
| state | text | Australian state |
| areaSize | int | Gym floor area in m^2 |
| address | text | Street address |
| postcode | int | |
| active | tinyint | 1 = active |
| timezone | varchar(50) | IANA tz e.g. `Australia/Perth`, default Perth |
| longitude/latitude | double | Optional geocoding |
| squatRacks | tinyint | Scraped from gym detail page |

### Revo_Gym_Count — Historical snapshots
| Column | Type | Notes |
|--------|------|-------|
| id | varchar(36) PK | UUID |
| created | datetime | Snapshot timestamp |
| count | int | Live member count at that time |
| ratio | double | areaSize / count |
| percentage | double | (count / estimatedCapacity) * 100, capped at 100 |
| gymName | varchar(191) | Denormalized gym name |
| gymId | varchar(36) FK | Links to Revo_Gyms |

Indexes: `idx_revo_gym_count_created`, `idx_revogym_gym_created`, `idx_revogym_gym_created_desc`

### gym_trend_cache — Pre-computed trends (popular times)
| Column | Type | Notes |
|--------|------|-------|
| gymId | varchar(36) PK | |
| dayOfWeek | int(0-6) PK | Sunday=0 |
| trendData | json | Array of 96 slots: `{ time: "HH:MM", average, sampleCount }` |
| updatedAt | timestamp | Auto-updated on upsert |

---

## 3. Core API Endpoints

All responses follow `{ success: true, data: ... }` or `{ success: false, error: ... }`.

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | GET | Health check — returns `"API Home"` |
| `/gyms/update` | GET | Fetches current counts, enriches with squat rack data, upserts gym metadata |
| `/gyms/stats/update` | GET | Full scrape: fetches counts, upserts metadata, inserts new snapshot row per gym (including 0-count for missing gyms) |
| `/gyms/stats/latest` | GET | Returns most recent snapshot for all gyms, ordered by percentage desc |
| `/gyms/trends/generate` | GET | Runs trend agent in background (202 Accepted). Accepts `?lookback=90`. Only one run at a time (409 if already running) |
| `/gyms/trends/:gymId` | GET | Returns cached trend data for one gym (7 day objects, 96 slots each) |
| `/gyms/trends` | GET | Returns cached trend data for all gyms as a `{ gymId: [...] }` map |

---

## 4. How Data Flows

### Scraping (parseHTML → insertGymStats)

1. `fetchPHPData()` — calls `https://revocentral.revofitness.com.au/club-counter.php?id=10` using a rotated cookie from `Scraper/cookies.json` and the configured proxy
2. `extractClubCounts()` — parses `var clubCounterLists = {...}` JSON block from the page; fallback is DOM parsing via `.attr('data-member-in-club')`
3. `parseHTML()` — joins scraped counts with gym metadata from `Revo_Gyms` using **normalized name matching** (NFKD normalization, apostrophe strip, lowercase) to handle `O'Connor` vs `OConnor`
4. `insertGymStats()` — inserts one row per gym to `Revo_Gym_Count`. For gyms that were in the DB but not in the scrape, inserts a 0-count row (this is the "missing gyms" log). Writes a rolling log to `logs/updated_stats.json`.

### Cookie Rotation
- `Scraper/cookies.json` holds 5 PHP-serialized member cookie strings
- Refreshed daily OR if file doesn't exist via `bun run Scraper/generate_cookies.ts`
- **Critical:** Write path in `generate_cookies.ts` uses `join(__dirname, "cookies.json")` — do not hardcode absolute paths

### Gym ID Generation
- `simpleIntegerHash(name + postcode)` — deterministic 24-bit hash
- Used as the primary key when inserting new gyms (before they exist in DB)
- Not globally unique — collisions possible but probabilistically negligible

### Ratio Calculation
```
memberRatio  = areaSize / count
estimatedCapacity = areaSize / 6
percentage   = min((count / estimatedCapacity) * 100, 100)
```

---

## 5. Known Fragilities

### Scraping is fragile
The PHP portal page structure is the single point of failure:
- Looks for `var clubCounterLists = {...}` in `<script>` tags
- Fallback: `<a class="club-shortname" data-member-in-club="N">`
- If Revo Fitness changes class names, attributes, or the JS variable — scraping breaks silently and returns 0 gyms

### Missing gyms
Gyms that exist in `Revo_Gyms` but not in the scrape get a 0-count inserted. Common reasons: gym temporarily unavailable, proxy failure, cookie expiry. These appear in logs as "Missing gyms in current scrape".

### O'Connor / OConnor naming
The scraper source uses `OConnor` (no apostrophe). Normalization in `normalizeGymName()` strips apostrophes to match. Be aware when adding gym filters or comparing names.

### Proxy dependency
All HTTP requests go through Webshare proxy (`p.webshare.io:80`) with TLS verification disabled. If proxies fail, requests fall back to direct connection.

---

## 6. Maintenance Scripts

### StatAudit — Repair zero-count anomalies
```bash
bun run scripts/repair-gym-dropouts.ts [options]
```
Detects suspicious zero-occupancy readings (where trend data says the gym should be busy) and repairs them via interpolation or trend-based estimation.

Options:
- `--apply` — actually write repairs (default dry-run)
- `--gym "Gym Name"` — filter to one gym
- `--from YYYY-MM-DD` / `--to YYYY-MM-DD` — date range (local gym time)
- `--min-score N` — anomaly threshold (default 30)
- `--confidence high|medium|all` — minimum confidence to apply (default high)
- `--report path.json` — write JSON report
- `--verbose` — detailed per-gym progress

Outputs:
- Reports written to `reports/stat-audit-TIMESTAMP.json`
- Console summary: gyms scanned, suspicious zeros found, fixes proposed/applied

---

## 7. Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | MySQL connection string |
| `PROXY_USERNAME` | No | Webshare proxy username |
| `PROXY_PASSWORD` | No | Webshare proxy password |
| `DOMAIN_NAME` | No | Proxy host e.g. `p.webshare.io` |
| `PROXY_PORT` | No | Proxy port, default 80 |
| `PROXY_INSECURE_TLS` | No | Set to `1` to disable TLS cert verification for proxies |

---

## 8. Development Commands

```bash
bun install          # Install dependencies
bun run dev          # Start dev server (port 3001, hot reload)
bun test             # Run all tests (60 tests)
bun run audit:dropouts  # Run statAudit (dry-run by default)
```

### Deployment
- Server runs on `dvcklab2` (Tailscale IP `100.78.72.83`)
- Scheduler (`callEveryFiveMinutes`) self-pings `https://revotrackerapi.dvcklab.com/gyms/stats/update`
- `src/auto.ts` is a standalone version for remote/offsite cron triggers against `https://revotracker.daffydvck.live/api/gyms/stats/update`

---

## 9. Key Constants

| Constant | Value | Location |
|----------|-------|----------|
| Scrape URL | `https://revocentral.revofitness.com.au/club-counter.php?id=10` | parser.ts |
| Scheduler interval | 5 minutes | index.ts |
| Cookie refresh | 24 hours | parser.ts (checkAndRefreshCookies) |
| Cookie count | 5 | generate_cookies.ts |
| Proxy | `p.webshare.io:80` | proxy.ts |
| Trend lookback | 90 days | trendAgent.ts |
| Trend slot | 15 minutes → 96 slots/day | trendAgent.ts |
| Audit slot | 30 minutes | statAudit.ts |
| Stat audit min score | 30 | statAudit.ts DEFAULT_MIN_SCORE |
| Stat audit min trend avg | 20 | statAudit.ts DEFAULT_MIN_TREND_AVERAGE |
| Stat audit min trend samples | 4 | statAudit.ts DEFAULT_MIN_TREND_SAMPLE_COUNT |
| Estimated capacity divisor | 6 | parser.ts, statAudit.ts |
| API server port | 3001 | index.ts |
