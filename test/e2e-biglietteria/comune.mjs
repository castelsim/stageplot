/* Attrezzi comuni delle prove nel browser della biglietteria (FUORI dal repo). Mai produzione: stack locale, rete
   esterna bloccata (ctx.route), utenti @example.invalid, accesso Google finto, porte 8800–8899 (mai 8931). */
import { createRequire } from "node:module";
import { spawn, execFileSync } from "node:child_process";
import { createServer } from "node:net";
import { tmpdir, homedir } from "node:os";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
const require = createRequire((process.env.REVIEW_DIR || homedir() + "/COWORK/STAGEPLOT/review") + "/package.json");
export const { chromium, webkit } = require("playwright");
/* QUI = questa cartella (script); P = cartella di lavoro FUORI dal repo (copia di prova del sito, screenshot) */
export const QUI = dirname(fileURLToPath(import.meta.url));
export const P = process.env.BGL_E2E_DIR || tmpdir() + "/bgl-e2e";
export const WT = process.env.WT || QUI + "/../..";
const st = JSON.parse(execFileSync("supabase", ["status", "-o", "json"], { cwd: WT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }));
export const API = st.API_URL, ANON = st.ANON_KEY, SERV = st.SERVICE_ROLE_KEY;
if (API !== "http://127.0.0.1:54321") throw new Error("non è lo stack locale: " + API);
export const CHIAVE_SESSIONE = "sb-127-auth-token";
export const TELEFONO = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
export const COMPUTER = { viewport: { width: 1280, height: 800 } };

export async function http(path, body, { key = SERV, token = null, method = "POST", extra = {} } = {}) {
  const r = await fetch(API + path, { method, headers: { apikey: key, Authorization: "Bearer " + (token || key),
    "Content-Type": "application/json", Prefer: "return=representation", ...extra }, body: body == null ? undefined : JSON.stringify(body) });
  const t = await r.text(); let d; try { d = JSON.parse(t); } catch { d = t; }
  return { status: r.status, d };
}
export const rpcServizio = (fn, a) => http("/rest/v1/rpc/" + fn, a).then((r) => r.d);

/* un account dello stack locale e la sua sessione, nel formato in cui supabase-js la salva in localStorage */
export async function utente(email, meta = {}) {
  const pass = "prova-locale-" + "0987654321";
  await http("/auth/v1/admin/users", { email, password: pass, email_confirm: true, user_metadata: meta });
  const l = await http("/auth/v1/token?grant_type=password", { email, password: pass }, { key: ANON });
  if (!l.d.access_token) throw new Error("accesso fallito: " + JSON.stringify(l.d));
  l.d.expires_at = l.d.expires_at || Math.floor(Date.now() / 1000) + l.d.expires_in;
  return l.d;
}
function libera(p) { return new Promise((ok) => { const s = createServer().once("error", () => ok(false)).once("listening", () => s.close(() => ok(true))).listen(p, "127.0.0.1"); }); }
export async function avviaSito(dir = P + "/sito") {
  let porta;
  do { porta = 8800 + Math.floor(Math.random() * 100); } while (porta === 8931 || !(await libera(porta)));
  const srv = spawn(process.execPath, [QUI + "/server.mjs", dir, String(porta)], { stdio: "ignore" });
  for (let i = 0; i < 50 && (await libera(porta)); i++) await new Promise((r) => setTimeout(r, 100));
  return { url: "http://127.0.0.1:" + porta, chiudi: () => srv.kill() };
}
export async function contesto(browser, tipo, { sessione = null, googleCome = null } = {}) {
  const ctx = await browser.newContext({ serviceWorkers: "block", acceptDownloads: true, locale: "it-IT", timezoneId: "Europe/Rome", ...tipo });
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1|localhost)/, (r) => r.abort());   /* MAI fuori da questo Mac */
  await ctx.route(/^wss?:\/\/(?!127\.0\.0\.1|localhost)/, (r) => r.abort());
  if (sessione) await ctx.addInitScript(([k, s]) => {
    try { if (!sessionStorage.getItem("__prova_sessione")) { localStorage.setItem(k, s); sessionStorage.setItem("__prova_sessione", "1"); } } catch (e) { /* niente */ }
  }, [CHIAVE_SESSIONE, JSON.stringify(sessione)]);
  if (googleCome) await googleFinto(ctx, googleCome);
  return ctx;
}
/* Google finto. La pagina chiama spGoogle.accedi(back): salva {state, back…} in sessionStorage e va su accounts.google.com.
   Qui: Google risponde 302 verso /accedi/google/ (la pagina di ritorno locale) e ritorno.js è sostituito da uno che
   mette in localStorage la sessione dello stack locale e torna a `back`, come farebbe signInWithIdToken. */
export async function googleFinto(ctx, sessione) {
  await ctx.route("https://accounts.google.com/**", (r) => {
    const u = new URL(r.request().url());
    r.fulfill({ status: 302, headers: { location: u.searchParams.get("redirect_uri") + "#id_token=finto&state=" + u.searchParams.get("state") } });
  });
  await ctx.route("**/accedi/google/ritorno.js", (r) => r.fulfill({ contentType: "text/javascript", body:
    "(function(){var s=JSON.parse(sessionStorage.getItem('sp_google_accesso')||'null');sessionStorage.removeItem('sp_google_accesso');" +
    "localStorage.setItem(" + JSON.stringify(CHIAVE_SESSIONE) + "," + JSON.stringify(JSON.stringify(sessione)) + ");" +
    "location.replace(s&&s.back?s.back:'/');})();" }));
}
export function sorveglia(page, chi, errori) {
  page.on("pageerror", (e) => errori.push(chi + ": " + e));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|net::ERR|websocket/i.test(m.text())) errori.push(chi + ": " + m.text()); });
}
export function esito() {
  const v = [];
  return {
    ok(c, m) { v.push(!!c); console.log((c ? "  ✓ " : "  ✗ ") + m); },
    fine() { const f = v.filter((x) => !x).length; console.log(`\n${v.length - f}/${v.length}`); process.exit(f ? 1 : 0); },
  };
}
