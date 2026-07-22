To install dependencies:
```sh
bun install
```

Set required environment variables (see `.env.example`):
```sh
POCKETBASE_URL=https://pb.dvcklab.work
POCKETBASE_ADMIN_EMAIL=admin@example.com
POCKETBASE_ADMIN_PASSWORD=your-admin-password
```

To run:
```sh
bun run dev
```

open http://localhost:3001

The API scrapes Revo Fitness gym occupancy data every 5 minutes and stores it in PocketBase (`Revo_Gyms`, `Revo_Gym_Count`, `gym_trend_cache`).
