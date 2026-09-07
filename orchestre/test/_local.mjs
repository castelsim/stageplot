/* Supabase LOCALE (Docker): i test RLS girano solo se `supabase start` è attivo.
   Niente chiavi su disco: si leggono da `supabase status -o json` a ogni corsa. Gli utenti di prova hanno email @example.invalid: mai persone vere. */
import { execFileSync } from "node:child_process";

export function localEnv() {
  try {
    const out = execFileSync("supabase", ["status", "-o", "json"], { stdio: ["ignore", "pipe", "ignore"], encoding: "utf8" });
    const start = out.indexOf("{"), end = out.lastIndexOf("}");
    if (start < 0 || end < 0) return null;
    const env = JSON.parse(out.slice(start, end + 1));
    if (!env.API_URL || !env.ANON_KEY || !env.SERVICE_ROLE_KEY) return null;
    return env;
  } catch { return null; }
}

const json = async (r) => { try { return await r.json(); } catch { return null; } };

export async function mkUser(env, email, password = "Prova-1234!", meta = {}) {
  const r = await fetch(env.API_URL + "/auth/v1/admin/users", {
    method: "POST",
    headers: { apikey: env.SERVICE_ROLE_KEY, Authorization: "Bearer " + env.SERVICE_ROLE_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, email_confirm: true, user_metadata: meta }),
  });
  const d = await json(r);
  if (r.ok && d && d.id) return d.id;
  if (!/already|exists|registered/i.test(JSON.stringify(d))) throw new Error("mkUser: " + JSON.stringify(d));
  return findUser(env, email);
}

async function findUser(env, email) {
  const r = await fetch(env.API_URL + "/auth/v1/admin/users?per_page=1000", {
    headers: { apikey: env.SERVICE_ROLE_KEY, Authorization: "Bearer " + env.SERVICE_ROLE_KEY },
  });
  const d = await json(r);
  const u = ((d && d.users) || []).find((x) => x.email === email);
  if (!u) throw new Error("utente non trovato: " + email);
  return u.id;
}

export async function login(env, email, password = "Prova-1234!") {
  const r = await fetch(env.API_URL + "/auth/v1/token?grant_type=password", {
    method: "POST",
    headers: { apikey: env.ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const d = await json(r);
  if (!r.ok) throw new Error("login: " + JSON.stringify(d));
  return d.access_token;
}

/* Chiamata PostgREST con il token dato. Per l'anonimo passare env.ANON_KEY come token. */
export async function rest(env, token, path, { method = "GET", body } = {}) {
  const r = await fetch(env.API_URL + "/rest/v1/" + path, {
    method,
    headers: { apikey: env.ANON_KEY, Authorization: "Bearer " + token, "Content-Type": "application/json", Prefer: "return=representation" },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { ok: r.ok, status: r.status, d: await json(r) };
}

export function rpc(env, token, fn, args) {
  return rest(env, token, "rpc/" + fn, { method: "POST", body: args || {} });
}

export function admin(env) { return env.SERVICE_ROLE_KEY; }
