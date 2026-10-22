// Supabase Auth verification + role-based permissions.
//
// Tokens are verified locally against the project's JWKS (asymmetric signing keys).
// If the project still uses the legacy HS256 secret (JWKS is empty), we fall back to
// asking Supabase Auth to validate the token (GET /auth/v1/user), as Supabase recommends.
//
// Authorization uses app_metadata.role only. app_metadata can be set only with the
// secret key (see scripts/users.ts); user_metadata is user-editable and is never trusted.
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import type { NextFunction, Request, Response } from "express";
import type { ExceptionId } from "./data/types.js";

export const ROLES = ["admin", "scm", "inventory", "procurement", "logistics", "oms", "finance", "executive"] as const;
export type AppRole = (typeof ROLES)[number];

/** What each role may change. Everyone with a role can read the dashboard and use the copilot. */
const ACTION_SCOPE: Record<AppRole, ExceptionId[] | "all"> = {
  admin: "all",
  scm: "all",
  inventory: ["partial", "backordered"],
  procurement: ["backordered"],
  logistics: ["delayed", "slaRisk"],
  oms: ["partial", "slaRisk", "addressPayment"],
  finance: ["addressPayment"],
  executive: [],
};
/** Roles that may switch the dashboard to other personas' views. */
const CAN_SWITCH_VIEW: AppRole[] = ["admin", "scm", "executive"];

export interface Permissions {
  role: AppRole;
  /** Persona the dashboard opens on ("admin" maps to the Supply Chain Manager view) */
  defaultView: Exclude<AppRole, "admin">;
  canSwitchView: boolean;
  actionScope: ExceptionId[] | "all";
  canResetDemo: boolean;
}

export function permissionsFor(role: AppRole): Permissions {
  return {
    role,
    defaultView: role === "admin" ? "scm" : role,
    canSwitchView: CAN_SWITCH_VIEW.includes(role),
    actionScope: ACTION_SCOPE[role],
    canResetDemo: role === "admin",
  };
}

export const canActOn = (p: Permissions, category: ExceptionId) => p.actionScope === "all" || p.actionScope.includes(category);

export interface AuthUser {
  id: string;
  email: string;
  perms: Permissions;
  /** The caller's access token, forwarded to Supabase so RLS applies to their queries. */
  token: string;
}

declare module "express-serve-static-core" {
  interface Request {
    user?: AuthUser;
  }
}

const SUPABASE_URL = process.env.SUPABASE_URL?.replace(/\/$/, "");
const PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;
export const authEnabled = Boolean(SUPABASE_URL);

const issuer = SUPABASE_URL ? `${SUPABASE_URL}/auth/v1` : "";
const jwks = SUPABASE_URL ? createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`), { cacheMaxAge: 10 * 60_000 }) : null;

type Claims = JWTPayload & { email?: string; app_metadata?: { role?: string } };

async function verifyViaAuthServer(token: string): Promise<Claims> {
  const res = await fetch(`${issuer}/user`, {
    headers: { Authorization: `Bearer ${token}`, ...(PUBLISHABLE_KEY ? { apikey: PUBLISHABLE_KEY } : {}) },
  });
  if (!res.ok) throw new Error(`auth server rejected token (${res.status})`);
  const u = (await res.json()) as { id: string; email?: string; app_metadata?: { role?: string } };
  return { sub: u.id, email: u.email, app_metadata: u.app_metadata };
}

async function verify(token: string): Promise<Claims> {
  try {
    const { payload } = await jwtVerify(token, jwks!, { issuer, audience: "authenticated" });
    return payload as Claims;
  } catch (err) {
    // Legacy HS256 projects publish no asymmetric keys: the token header won't match any JWK.
    const code = (err as { code?: string }).code;
    if (code === "ERR_JWKS_NO_MATCHING_KEY" || code === "ERR_JOSE_NOT_SUPPORTED" || code === "ERR_JOSE_ALG_NOT_ALLOWED") {
      return verifyViaAuthServer(token);
    }
    throw err;
  }
}

const isRole = (r: unknown): r is AppRole => typeof r === "string" && (ROLES as readonly string[]).includes(r);

/** Requires a valid Supabase session with an assigned role. No-op when auth isn't configured (local demo). */
export async function requireUser(req: Request, res: Response, next: NextFunction) {
  if (!authEnabled) {
    req.user = { id: "demo", email: "demo@local", perms: permissionsFor("admin"), token: "" };
    return next();
  }
  const header = req.headers.authorization ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return res.status(401).json({ error: "Sign in to continue." });
  try {
    const claims = await verify(token);
    const role = claims.app_metadata?.role;
    if (!claims.sub) throw new Error("token has no subject");
    if (!isRole(role)) {
      return res.status(403).json({ error: "Your account doesn't have a role yet. Ask your administrator to assign one.", code: "no_role" });
    }
    req.user = { id: claims.sub, email: claims.email ?? "", perms: permissionsFor(role), token };
    next();
  } catch (err) {
    console.warn("[auth] rejected token:", (err as Error).message);
    res.status(401).json({ error: "Your session has expired. Sign in again." });
  }
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (req.user?.perms.role !== "admin") return res.status(403).json({ error: "Only administrators can do this." });
  next();
}
