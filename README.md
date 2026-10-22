# SupplyChain AI – Backend

Express + TypeScript API for the SupplyChain AI control tower. Serves dashboard data, persists exception approvals and copilot chat in Postgres, and answers copilot questions with the Claude API.

**Live API:** https://supplychain-ai-backend-3884.onrender.com/api/health  
Frontend: [supplychain-ai-frontend](https://github.com/dangtai304/supplychain-ai-frontend) at https://supplychain-ai-frontend.vercel.app. Hosted on Render (Singapore), auto-deploys on push to `main`.

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

## Users and permissions

Sign-in is Supabase Auth, invite-only. Every `/api/*` route except `/api/health` needs a valid Supabase access token (`Authorization: Bearer …`). Tokens are verified locally against the project's JWKS; legacy HS256 projects fall back to Supabase's `/auth/v1/user`. The role comes from `app_metadata.role`, which only the secret key can set (`user_metadata` is user-editable and ignored).

| Role | Opens on | Can switch views | Can approve / assign |
| --- | --- | --- | --- |
| `admin` | Supply Chain Manager | yes | everything, plus demo reset |
| `scm` | Supply Chain Manager | yes | everything |
| `inventory` | Inventory Planner | no | partial fulfillments, backorders |
| `procurement` | Procurement Manager | no | backorders |
| `logistics` | Logistics Manager | no | delayed shipments, SLA risk |
| `oms` | OMS Manager | no | partial fulfillments, SLA risk, address/payment |
| `finance` | Finance | no | address/payment |
| `executive` | Executive | yes | nothing (view only) |

Everyone with a role can read the dashboard and use the copilot; chat history is private to each user. Change the matrix in `src/auth.ts`.

### Managing users

Run on your own machine with the **secret** key in `.env` (never on Render or Vercel):

```bash
npm run users -- invite jane@acme.com procurement   # emails an invite link
npm run users -- create jane@acme.com procurement   # no email; prints a temporary password
npm run users -- role   jane@acme.com logistics
npm run users -- disable jane@acme.com
npm run users -- list
```

Role changes apply when the user's session refreshes (within about an hour) or at next sign-in. Supabase's built-in email sender is heavily rate-limited; use `create` or set up custom SMTP if invites don't arrive.

With `SUPABASE_URL` unset the API runs open (local demo).

## Copilot

`src/copilot.ts` sends a JSON snapshot of the control tower as the system prompt and forces a `reply` tool call, so answers come back as structured blocks (text, bullets, risk-order cards, follow-up actions) the UI renders directly. With no `ANTHROPIC_API_KEY`, or if the call fails, it falls back to canned replies.

## Run locally

```bash
cp .env.example .env   # optional
npm install
npm run dev            # http://localhost:8080
```

Without `DATABASE_URL` state lives in memory. Tables are created automatically on boot in a private `scai` schema (`src/db.ts`), so they're not exposed by Supabase's Data API if you point `DATABASE_URL` at a Supabase database.

## Environment

| Variable | Notes |
| --- | --- |
| `DATABASE_URL` | Postgres connection string (Render internal URL in production) |
| `ANTHROPIC_API_KEY` | Enables Claude replies |
| `ANTHROPIC_MODEL` | Defaults to `claude-sonnet-5-5` |
| `CORS_ORIGINS` | Comma-separated allowed origins; Vercel preview URLs of the frontend project are always allowed |
| `DISPLAY_TZ` | Time zone for chat timestamps |
| `SUPABASE_URL` | Enables auth, e.g. `https://<ref>.supabase.co` |
| `SUPABASE_PUBLISHABLE_KEY` | Publishable key, used only for the legacy-token fallback |

Data lives in `src/data/seed.ts` (same shapes as the frontend's `src/lib/types.ts`). Replace those exports with real sources when you connect ERP / WMS / TMS feeds.
