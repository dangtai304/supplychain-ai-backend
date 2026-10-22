// Storage for exception decisions and copilot chat.
//
// Production: Supabase. Every query runs through the Data API *as the signed-in user*
// (their access token + the publishable key), so Postgres row-level security enforces
// chat privacy and role scopes too. The API holds no database password or secret key.
//
// Local dev without Supabase: falls back to ./db.ts (Postgres via DATABASE_URL, or memory).
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Request } from "express";
import type { ChatBlock, ChatMessage, ExceptionId } from "./data/types.js";
import * as local from "./db.js";

type Action = "approved" | "assigned";

const SUPABASE_URL = process.env.SUPABASE_URL?.replace(/\/$/, "");
const PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;
export const storeMode: "supabase" | "postgres" | "memory" = SUPABASE_URL && PUBLISHABLE_KEY ? "supabase" : local.pool ? "postgres" : "memory";

const timeLabel = (iso: string) => new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: process.env.DISPLAY_TZ ?? "UTC" });

function asUser(req: Request): SupabaseClient {
  return createClient(SUPABASE_URL!, PUBLISHABLE_KEY!, {
    global: { headers: { Authorization: `Bearer ${req.user!.token}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

function check<T>(r: { data: T; error: { message: string } | null }): T {
  if (r.error) throw new Error(`[supabase] ${r.error.message}`);
  return r.data;
}

export async function getActions(req: Request): Promise<Record<string, Action>> {
  if (storeMode !== "supabase") return local.getActions();
  const rows = check(await asUser(req).from("exception_actions").select("order_id, action")) as { order_id: string; action: Action }[];
  return Object.fromEntries(rows.map((r) => [r.order_id, r.action]));
}

export async function setAction(req: Request, orderId: string, action: Action, category: ExceptionId) {
  if (storeMode !== "supabase") return local.setAction(orderId, action);
  check(
    await asUser(req)
      .from("exception_actions")
      .upsert({ order_id: orderId, category, action, acted_by: req.user!.id, acted_email: req.user!.email, created_at: new Date().toISOString() }, { onConflict: "order_id" }),
  );
}

export async function clearActions(req: Request) {
  if (storeMode !== "supabase") return local.clearActions();
  check(await asUser(req).from("exception_actions").delete().neq("order_id", ""));
}

/** `key` is only used locally; on Supabase the user's own rows are selected by RLS. */
export async function getChat(req: Request, key: string, limit = 100): Promise<ChatMessage[]> {
  if (storeMode !== "supabase") return local.getChat(key, limit);
  const rows = check(
    await asUser(req).from("chat_messages").select("id, sender, blocks, created_at").order("id", { ascending: false }).limit(limit),
  ) as { id: number; sender: "user" | "agent"; blocks: ChatBlock[]; created_at: string }[];
  return rows.reverse().map((r) => ({ id: `m${r.id}`, from: r.sender, time: timeLabel(r.created_at), blocks: r.blocks }));
}

export async function addChat(req: Request, key: string, from: "user" | "agent", blocks: ChatBlock[], source?: string): Promise<ChatMessage> {
  if (storeMode !== "supabase") return local.addChat(key, from, blocks, source);
  const row = check(
    await asUser(req)
      .from("chat_messages")
      .insert({ user_id: req.user!.id, sender: from, blocks, source: source ?? null })
      .select("id, created_at")
      .single(),
  ) as { id: number; created_at: string };
  return { id: `m${row.id}`, from, time: timeLabel(row.created_at), blocks };
}

export async function clearChat(req: Request, key: string) {
  if (storeMode !== "supabase") return local.clearChat(key);
  check(await asUser(req).from("chat_messages").delete().eq("user_id", req.user!.id));
}

/** Health: can we reach the Data API at all (no user needed). */
export async function storeHealthy(): Promise<string> {
  if (storeMode === "memory") return "memory";
  if (storeMode === "postgres") return (await local.dbHealthy()) ? "connected" : "error";
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/health`, { headers: { apikey: PUBLISHABLE_KEY! } });
    return res.ok ? "supabase" : "error";
  } catch {
    return "error";
  }
}
