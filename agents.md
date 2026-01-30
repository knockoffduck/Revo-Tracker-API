# Project Guide: Revo Tracker API

**For:** Future AI Agents & Developers  
**Purpose:** Comprehensive understanding of the `revo-tracker-api` codebase.

## 1. Project Overview
This project is an API and background service designed to track live member statistics from **Revo Fitness** gyms.
- **Core Function:** Scrapes live member counts from the Revo Fitness website.
- **Data Storage:** Stores historical data (counts, ratios, busy percentages) in a MySQL database.
- **API:** Provides endpoints to trigger updates and retrieve the latest statistics.

**Note:** The database schema also contains tables related to PC parts (motherboards, items, etc.), suggesting this codebase might have been evolved from or shares a database with a PC parts tracker. However, the active logic in `src/` focuses on Gym Tracking.

## 2. Tech Stack
- **Runtime:** [Bun](https://bun.sh) (JavaScript/TypeScript runtime & package manager)
- **Framework:** [Hono](https://hono.dev) (Web framework for the API)
- **Database:** MySQL
- **ORM:** [Drizzle ORM](https://orm.drizzle.team)
- **Scraping:** `axios` (fetching) + `cheerio` (parsing)
- **Utilities:** `uuid` for ID generation, `dotenv` for config.

## 3. Key Files & Structure
```
/
├── src/
│   ├── index.ts           # Application entry point & API definitions
│   ├── auto.ts            # Standalone script to trigger updates periodically
│   ├── db/
│   │   └── schema.ts      # Drizzle ORM database schema definition
│   ├── utils/
│   │   ├── parser.ts      # Core scraping logic (fetches/parses gym data)
│   │   ├── database.ts    # Database connection setup
│   │   ├── handlers.ts    # API response helpers (success/error)
│   │   └── types.ts       # TypeScript interfaces (GymInfo, etc.)
├── drizzle.config.ts      # Drizzle Kit configuration
├── package.json           # Dependencies and scripts
└── .env                   # Environment variables (DATABASE_URL)
```

## 4. Workflows

### A. Scraping & Updating Data
**File:** `src/utils/parser.ts`
1. **Fetch:** `fetchHTML` gets the page `https://revofitness.com.au/livemembercount/`.
2. **Parse:** `parseHTML` uses Cheerio to find elements with `data-counter-card`.
   - Extracts: Name, Address, Size (`sq/m`), Live Count.
   - Computes: `member_ratio` (Size / Count), `percentage` (1 - (ratio/60) * 100).
   - Infers: `postcode` and `state` from the address string.
3. **Store:**
   - **Records:** `insertGymStats` saves a snapshot to table `Revo_Gym_Count`.
   - **Gym Info:** `updateGymInfo` upserts gym metadata (address, size) to table `Revo_Gyms`.

### B. Scheduling
**File:** `src/index.ts` & `src/auto.ts`
- The application has an internal `setInterval` in `index.ts` (`callEveryFiveMinutes`) that pings its own (or production) endpoint `/gyms/stats/update`.
- `src/auto.ts` is a standalone script that does the same thing.

### C. API Endpoints (`src/index.ts`)
- `GET /`: Health check.
- `GET /gyms/update`: Scrapes and updates gym metadata (names, locations).
- `GET /gyms/stats/update`: Scrapes and inserts a new stats record for all gyms.
- `GET /gyms/stats/latest`: Retrieves the most recent stats entry from the database.

## 5. Database Schema
**File:** `src/db/schema.ts`
- **`Revo_Gyms`**: Registry of gyms.
  - `id` (PK), `name`, `state`, `areaSize`, `address`, `postcode`.
- **`Revo_Gym_Count`**: Historical data points.
  - `id` (PK, UUID), `created` (datetime), `count`, `ratio`, `percentage`.
  - Links to `Revo_Gyms` via `gymId`.
- **Legacy/Other Tables**: `bios_links`, `motherboards`, `items`, `item_sets`, `categories`. These appear unrelated to the current gym tracking logic but exist in the schema.

## 6. Setup & Development
1. **Install Dependencies:**
   ```bash
   bun install
   ```
2. **Environment:**
   - Ensure `.env` contains `DATABASE_URL` (MySQL connection string).
3. **Run Dev Server:**
   ```bash
   bun run dev
   ```
   - Starts the Hono server on port 3001 (default in export).
4. **Database Management:**
   - Use Drizzle Kit for migrations: `bunx drizzle-kit generate` / `migrate`.

## 7. Testing
- **Command:** `bun test`
- **Scope:**
  - **Unit Tests:** `tests/parser.test.ts` (Mocks Axios, checks scraping logic).
  - **Integration Tests:** `tests/api.test.ts` (Mocks request handlers and DB).
- **Mocks:** Located in `tests/mocks/`. `gym_site.html` provides a stable DOM for parser testing.
- **Note:** `src/index.ts` has been modified to only run the scheduler when executed directly, allowing it to be imported safely in tests.

## 8. Notes for Future Agents
- **Scraping Fragility:** The scraper relies on specific DOM attributes (`data-counter-card`, `data-live-count`). If the target website changes class names or structure, `src/utils/parser.ts` will break. Always check `parseHTML` first if data is empty.
- **Gym ID Generation:** IDs are generated using a "simple integer hash" of the gym name + postcode. This ensures consistency but be aware of collisions or changes if a gym name changes details.
- **Mixed Schema:** Do not be confused by the PC parts tables in `schema.ts`. Unless instructed, focus on `revo*` tables.
