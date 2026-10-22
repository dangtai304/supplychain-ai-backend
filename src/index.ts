import express, { type NextFunction, type Request, type Response } from "express";
import cors from "cors";
import { addChat, clearActions, clearChat, dbHealthy, getActions, getChat, migrate, pool, setAction } from "./db.js";
import { copilotReply, llmEnabled } from "./copilot.js";
import {
  agents,
  contextChips,
  exceptionCategories,
  initialChat,
  kpiCatalog,
  navGroups,
  networkNodes,
  omsMetrics,
  quickActions,
  roles,
  shipments,
  statusDistribution,
  volumeTrend,
  workflowStages,
} from "./data/seed.js";

const app = express();
app.set("trust proxy", 1);
app.use(express.json({ limit: "32kb" }));

/* ---------- CORS ---------- */
// CORS_ORIGINS: comma-separated exact origins. Vercel preview URLs for the frontend project are also allowed.
const allowed = (process.env.CORS_ORIGINS ?? "http://localhost:5173").split(",").map((s) => s.trim()).filter(Boolean);
const previewPattern = /^https:\/\/supplychain-ai-frontend[a-z0-9-]*\.vercel\.app$/;
app.use(
  cors({
    origin: (origin, cb) => cb(null, !origin || allowed.includes(origin) || previewPattern.test(origin)),
  }),
);

/* ---------- simple per-IP rate limit for the LLM endpoint ---------- */
const hits = new Map<string, number[]>();
function rateLimit(max: number, windowMs: number) {
  return (req: Request, res: Response, next: NextFunction) => {
    const key = req.ip ?? "unknown";
    const now = Date.now();
    const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
    if (recent.length >= max) {
      res.status(429).json({ error: "Too many questions in a short time. Wait a minute and try again." });
      return;
    }
    recent.push(now);
    hits.set(key, recent);
    next();
  };
}

const wrap = (fn: (req: Request, res: Response) => Promise<unknown>) => (req: Request, res: Response, next: NextFunction) => fn(req, res).catch(next);
const sessionOf = (v: unknown) => (typeof v === "string" && /^[a-zA-Z0-9_-]{8,64}$/.test(v) ? v : null);

/* ---------- routes ---------- */

app.get("/", (_req, res) => res.json({ name: "supplychain-ai-backend", docs: "/api/health" }));

app.get(
  "/api/health",
  wrap(async (_req, res) => {
    res.json({ ok: true, database: pool ? (await dbHealthy()) ? "connected" : "error" : "memory", copilot: llmEnabled() ? "claude" : "canned" });
  }),
);

/** Everything the home dashboard needs in one call. */
app.get(
  "/api/dashboard",
  wrap(async (_req, res) => {
    res.json({
      generatedAt: new Date().toISOString(),
      roles,
      kpis: kpiCatalog,
      workflowStages,
      omsMetrics,
      statusDistribution,
      exceptionCategories,
      network: { nodes: networkNodes, shipments },
      volumeTrend,
      agents,
      navGroups,
      copilot: { quickActions, contextChips },
      resolved: await getActions(),
    });
  }),
);

app.post(
  "/api/exceptions/:orderId/actions",
  wrap(async (req, res) => {
    const orderId = String(req.params.orderId);
    const action = req.body?.action;
    const known = exceptionCategories.some((c) => c.orders.some((o) => o.orderId === orderId));
    if (!known) return res.status(404).json({ error: `Order ${orderId} isn't in the exceptions list.` });
    if (action !== "approved" && action !== "assigned") return res.status(400).json({ error: 'action must be "approved" or "assigned".' });
    await setAction(orderId, action);
    res.json({ orderId, action });
  }),
);

/** Demo reset: clears all approvals. */
app.delete(
  "/api/exceptions/actions",
  wrap(async (_req, res) => {
    await clearActions();
    res.status(204).end();
  }),
);

app.get(
  "/api/chat",
  wrap(async (req, res) => {
    const session = sessionOf(req.query.session);
    if (!session) return res.status(400).json({ error: "A session id (8–64 letters, digits, - or _) is required." });
    const msgs = await getChat(session);
    res.json({ messages: msgs.length ? msgs : initialChat, copilot: llmEnabled() ? "claude" : "canned" });
  }),
);

app.post(
  "/api/chat",
  rateLimit(20, 60_000),
  wrap(async (req, res) => {
    const session = sessionOf(req.body?.session);
    const text = typeof req.body?.text === "string" ? req.body.text.trim().slice(0, 2000) : "";
    const role = typeof req.body?.role === "string" ? req.body.role.slice(0, 60) : "Supply Chain Manager";
    if (!session) return res.status(400).json({ error: "A session id is required." });
    if (!text) return res.status(400).json({ error: "Message text is empty." });

    let previous = await getChat(session);
    if (previous.length === 0) {
      // Persist the seeded welcome thread so history stays consistent.
      for (const m of initialChat) await addChat(session, m.from, m.blocks, "seed");
      previous = await getChat(session);
    }
    const user = await addChat(session, "user", [{ kind: "text", text }]);
    const { blocks, source } = await copilotReply({ prompt: text, previous, role, resolved: await getActions() });
    const reply = await addChat(session, "agent", blocks, source);
    res.json({ user, reply, source });
  }),
);

app.delete(
  "/api/chat",
  wrap(async (req, res) => {
    const session = sessionOf(req.query.session);
    if (!session) return res.status(400).json({ error: "A session id is required." });
    await clearChat(session);
    res.status(204).end();
  }),
);

app.use((_req, res) => res.status(404).json({ error: "Not found" }));
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err);
  res.status(500).json({ error: "Something went wrong on the server. Try again in a moment." });
});

const port = Number(process.env.PORT ?? 8080);
migrate()
  .then(() => {
    app.listen(port, () => console.log(`API listening on :${port} (db: ${pool ? "postgres" : "memory"}, copilot: ${llmEnabled() ? "claude" : "canned"})`));
  })
  .catch((e) => {
    console.error("Migration failed", e);
    process.exit(1);
  });
