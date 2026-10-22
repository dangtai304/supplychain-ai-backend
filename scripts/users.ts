// User administration for SupplyChain AI (invite-only).
// Runs on the admin's machine with the Supabase SECRET key from .env — never deploy that key to the frontend.
//
//   npm run users -- invite   jane@acme.com procurement   # emails an invite link, sets role
//   npm run users -- create   jane@acme.com procurement   # no email: prints a temporary password
//   npm run users -- role     jane@acme.com logistics     # change role (takes effect on next token refresh, max ~1h)
//   npm run users -- disable  jane@acme.com               # blocks sign-in
//   npm run users -- enable   jane@acme.com
//   npm run users -- list
import { createClient, type User } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";

const ROLES = ["admin", "scm", "inventory", "procurement", "logistics", "oms", "finance", "executive"];
const url = process.env.SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
const siteUrl = process.env.SITE_URL ?? "https://supplychain-ai-frontend.vercel.app";

if (!url || !secret) {
  console.error("Set SUPABASE_URL and SUPABASE_SECRET_KEY in .env (Supabase dashboard → Project Settings → API Keys).");
  process.exit(1);
}

const sb = createClient(url, secret, { auth: { autoRefreshToken: false, persistSession: false } });
const [cmd, email, role] = process.argv.slice(2);

function needRole() {
  if (!role || !ROLES.includes(role)) {
    console.error(`Role must be one of: ${ROLES.join(", ")}`);
    process.exit(1);
  }
}

async function findUser(e: string): Promise<User> {
  for (let page = 1; page < 50; page++) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const hit = data.users.find((u) => u.email?.toLowerCase() === e.toLowerCase());
    if (hit) return hit;
    if (data.users.length < 200) break;
  }
  throw new Error(`No user with email ${e}`);
}

async function main() {
  switch (cmd) {
    case "invite": {
      needRole();
      const { data, error } = await sb.auth.admin.inviteUserByEmail(email, { redirectTo: siteUrl });
      if (error) throw error;
      const { error: e2 } = await sb.auth.admin.updateUserById(data.user.id, { app_metadata: { role } });
      if (e2) throw e2;
      console.log(`Invited ${email} as ${role}. They'll get an email link to set a password.`);
      break;
    }
    case "create": {
      needRole();
      const password = randomBytes(9).toString("base64url");
      const { error } = await sb.auth.admin.createUser({ email, password, email_confirm: true, app_metadata: { role } });
      if (error) throw error;
      console.log(`Created ${email} as ${role}.\nTemporary password: ${password}\nShare it privately; they can change it after signing in.`);
      break;
    }
    case "role": {
      needRole();
      const u = await findUser(email);
      const { error } = await sb.auth.admin.updateUserById(u.id, { app_metadata: { ...u.app_metadata, role } });
      if (error) throw error;
      console.log(`${email} is now ${role}. Applies when their session refreshes (within about an hour) or on next sign-in.`);
      break;
    }
    case "disable":
    case "enable": {
      const u = await findUser(email);
      const { error } = await sb.auth.admin.updateUserById(u.id, { ban_duration: cmd === "disable" ? "876000h" : "none" });
      if (error) throw error;
      console.log(`${email} ${cmd === "disable" ? "can no longer sign in. Existing sessions end within about an hour." : "can sign in again."}`);
      break;
    }
    case "list": {
      const { data, error } = await sb.auth.admin.listUsers({ perPage: 200 });
      if (error) throw error;
      for (const u of data.users) {
        const banned = u.banned_until && new Date(u.banned_until) > new Date();
        console.log(`${(u.email ?? "").padEnd(36)} ${String(u.app_metadata?.role ?? "(no role)").padEnd(12)} ${banned ? "disabled" : u.last_sign_in_at ? "active" : "invited"}`);
      }
      break;
    }
    default:
      console.log("Commands: invite <email> <role> | create <email> <role> | role <email> <role> | disable <email> | enable <email> | list");
      console.log(`Roles: ${ROLES.join(", ")}`);
  }
}

main().catch((e) => {
  console.error("Failed:", (e as Error).message);
  process.exit(1);
});
