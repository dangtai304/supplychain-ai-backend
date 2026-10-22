# SupplyChain AI – Backend

Express + TypeScript API for the SupplyChain AI control tower. Serves dashboard data, persists exception approvals and copilot chat in Postgres, and answers copilot questions with the Claude API.

Frontend: [supplychain-ai-frontend](https://github.com/dangtai304/supplychain-ai-frontend). Hosted on Render (web service + Postgres).

## Endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/health` | Status, database mode (`connected` / `memory`), copilot mode (`claude` / `canned`) |
| GET | `/api/dashboard` | All dashboard datasets plus saved exception actions |
| POST | `/api/exceptions/:orderId/actions` | `{ "action": "approved" \| "assigned" }` |
| DELETE | `/api/exceptions/actions` | Reset all approvals (demo) |
| GET | `/api/chat?session=<id>` | Chat history for a browser session (seeded welcome thread if empty) |
| POST | `/api/chat` | `{ session, text, role }` → user message + copilot reply. Rate-limited to 20/min per IP |
| DELETE | `/api/chat?session=<id>` | Clear a session's history |

## Copilot

`src/copilot.ts` sends a JSON snapshot of the control tower as the system prompt and forces a `reply` tool call, so answers come back as structured blocks (text, bullets, risk-order cards, follow-up actions) the UI renders directly. With no `ANTHROPIC_API_KEY`, or if the call fails, it falls back to canned replies.

## Run locally

```bash
cp .env.example .env   # optional
npm install
npm run dev            # http://localhost:8080
```

Without `DATABASE_URL` state lives in memory. Tables are created automatically on boot (`src/db.ts`).

## Environment

| Variable | Notes |
| --- | --- |
| `DATABASE_URL` | Postgres connection string (Render internal URL in production) |
| `ANTHROPIC_API_KEY` | Enables Claude replies |
| `ANTHROPIC_MODEL` | Defaults to `claude-sonnet-5-5` |
| `CORS_ORIGINS` | Comma-separated allowed origins; Vercel preview URLs of the frontend project are always allowed |
| `DISPLAY_TZ` | Time zone for chat timestamps |

Data lives in `src/data/seed.ts` (same shapes as the frontend's `src/lib/types.ts`). Replace those exports with real sources when you connect ERP / WMS / TMS feeds.
