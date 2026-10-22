import pg from "pg";
import type { ChatBlock, ChatMessage } from "./data/types.js";

const url = process.env.DATABASE_URL;

/** Null when DATABASE_URL is unset: the API then keeps state in memory (handy for local dev). */
export const pool = url
  ? new pg.Pool({
      connectionString: url,
      // Render internal URLs don't use SSL; external ones require it.
      ssl: /render\.com/.test(url) ? { rejectUnauthorized: false } : undefined,
      max: 5,
    })
  : null;

export async function migrate() {
  if (!pool) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS exception_actions (
      order_id   TEXT PRIMARY KEY,
      action     TEXT NOT NULL CHECK (action IN ('approved', 'assigned')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS chat_messages (
      id         BIGSERIAL PRIMARY KEY,
      session_id TEXT NOT NULL,
      sender     TEXT NOT NULL CHECK (sender IN ('user', 'agent')),
      blocks     JSONB NOT NULL,
      source     TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS chat_messages_session_idx ON chat_messages (session_id, id);
  `);
}

/* ---------- in-memory fallback ---------- */
const memActions = new Map<string, "approved" | "assigned">();
const memChat = new Map<string, ChatMessage[]>();
let memSeq = 1000;

const timeLabel = (d: Date) => d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: process.env.DISPLAY_TZ ?? "UTC" });

export async function getActions(): Promise<Record<string, "approved" | "assigned">> {
  if (!pool) return Object.fromEntries(memActions);
  const { rows } = await pool.query<{ order_id: string; action: "approved" | "assigned" }>("SELECT order_id, action FROM exception_actions");
  return Object.fromEntries(rows.map((r) => [r.order_id, r.action]));
}

export async function setAction(orderId: string, action: "approved" | "assigned") {
  if (!pool) return void memActions.set(orderId, action);
  await pool.query(
    `INSERT INTO exception_actions (order_id, action) VALUES ($1, $2)
     ON CONFLICT (order_id) DO UPDATE SET action = EXCLUDED.action, created_at = now()`,
    [orderId, action],
  );
}

export async function clearActions() {
  if (!pool) return void memActions.clear();
  await pool.query("DELETE FROM exception_actions");
}

export async function getChat(sessionId: string, limit = 100): Promise<ChatMessage[]> {
  if (!pool) return memChat.get(sessionId) ?? [];
  const { rows } = await pool.query<{ id: string; sender: "user" | "agent"; blocks: ChatBlock[]; created_at: Date }>(
    `SELECT id, sender, blocks, created_at FROM (
       SELECT * FROM chat_messages WHERE session_id = $1 ORDER BY id DESC LIMIT $2
     ) t ORDER BY id ASC`,
    [sessionId, limit],
  );
  return rows.map((r) => ({ id: `m${r.id}`, from: r.sender, time: timeLabel(r.created_at), blocks: r.blocks }));
}

export async function addChat(sessionId: string, from: "user" | "agent", blocks: ChatBlock[], source?: string): Promise<ChatMessage> {
  const now = new Date();
  if (!pool) {
    const msg: ChatMessage = { id: `m${++memSeq}`, from, time: timeLabel(now), blocks };
    memChat.set(sessionId, [...(memChat.get(sessionId) ?? []), msg]);
    return msg;
  }
  const { rows } = await pool.query<{ id: string; created_at: Date }>(
    "INSERT INTO chat_messages (session_id, sender, blocks, source) VALUES ($1, $2, $3, $4) RETURNING id, created_at",
    [sessionId, from, JSON.stringify(blocks), source ?? null],
  );
  return { id: `m${rows[0].id}`, from, time: timeLabel(rows[0].created_at), blocks };
}

export async function clearChat(sessionId: string) {
  if (!pool) return void memChat.delete(sessionId);
  await pool.query("DELETE FROM chat_messages WHERE session_id = $1", [sessionId]);
}

export async function dbHealthy() {
  if (!pool) return false;
  try {
    await pool.query("SELECT 1");
    return true;
  } catch {
    return false;
  }
}
