// Biglietteria: la Edge Function `bgl-avvisa` (mail «posti cambiati») con database, account e Resend finti. Dati inventati.
import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { type DepsAvvisa, gestisciAvvisa } from "./bgl-avvisa.ts";
import { tokenDa, type Utente, utenteDa } from "./bgl-utente.ts";
import { mailSpostamento } from "./bgl-mail.ts";
import type { InvioMail } from "./bgl-mail.ts";

const PROD = "https://abcdefghijklmnopqrst.supabase.co";
const ID = "5d0c0000-0000-4000-8000-000000000000";
const ok = { ok: true, email: "mario.rossi@example.invalid", codice: "K7M4QX", posti: ["Platea|C|3", "Platea|C|4"],
  evento: { titolo: "Concerto di prova", inizio: "2026-10-09T19:00:00+00:00", luogo: "Teatro di prova", percorso: "teatro-prova/concerto-9-ottobre" } };
function finto(o: { db?: unknown; utente?: unknown; env?: Record<string, string> } = {}) {
  const chiamate: unknown[] = [], mail: InvioMail[] = [];
  const env: Record<string, string> = { SUPABASE_URL: PROD, RESEND_API_KEY: "chiave-finta", ...o.env };
  const deps: DepsAvvisa = {
    utente: (t) => Promise.resolve(t === "buono" ? ((o.utente ?? { id: "u1", email: "org@example.invalid", verificata: true }) as Utente) : null),
    rpc: (fn, args) => { chiamate.push([fn, args]); return Promise.resolve({ data: o.db ?? ok, error: null }); },
    invia: (a) => { mail.push(a); return Promise.resolve({ ok: true, status: 200 }); },
    env: { get: (k: string) => env[k] }, log: () => {},
  };
  return { deps, chiamate, mail };
}
const req = (body: unknown, tok: string | null = "buono", method = "POST") => new Request("http://x/functions/v1/bgl-avvisa", {
  method, body: method === "GET" ? undefined : JSON.stringify(body),
  headers: { "content-type": "application/json", origin: "https://stageplot.it", ...(tok ? { authorization: "Bearer " + tok } : {}) } });
const leggi = async (r: Response) => ({ s: r.status, d: await r.json() });

Deno.test("avvisa: con il token dell'organizzatore chiede al database e spedisce la mail dei posti nuovi", async () => {
  const f = finto();
  const r = await leggi(await gestisciAvvisa(req({ prenotazione_id: ID }), f.deps));
  assertEquals(r, { s: 200, d: { ok: true, mail: true } });
  assertEquals(f.chiamate, [["bgl_avviso_spostamento", { p_uid: "u1", p_prenotazione_id: ID }]]);
  assertEquals(f.mail[0].to, "mario.rossi@example.invalid");
  assertStringIncludes(f.mail[0].text, "Fila C, posti 3 e 4");
  assertStringIncludes(f.mail[0].text, "https://stageplot.it/biglietteria/teatro-prova/concerto-9-ottobre");
});

Deno.test("avvisa: senza token o con un token non valido 401, e il database non si tocca", async () => {
  for (const tok of [null, "cattivo"]) {
    const f = finto();
    assertEquals((await leggi(await gestisciAvvisa(req({ prenotazione_id: ID }, tok), f.deps))).s, 401);
    assertEquals(f.chiamate.length, 0);
  }
});

Deno.test("avvisa: i rifiuti del database diventano codici HTTP; corpo storto 400; metodo sbagliato 405; mai la mail", async () => {
  for (const [errore, stato] of [["non_tuo", 404], ["non_abilitato", 403], ["troppi_avvisi", 429], ["non_spostata", 409], ["boh", 500]] as const) {
    const f = finto({ db: { ok: false, errore } });
    const r = await leggi(await gestisciAvvisa(req({ prenotazione_id: ID }), f.deps));
    assertEquals(r.s, stato); assertEquals(f.mail.length, 0);
  }
  assertEquals((await gestisciAvvisa(req({ prenotazione_id: "1; drop" }), finto().deps)).status, 400);
  assertEquals((await gestisciAvvisa(req(null, "buono", "GET"), finto().deps)).status, 405);
});

Deno.test("avvisa: in locale o senza chiave la mail non parte (ok:true, mail:false)", async () => {
  for (const env of [{ SUPABASE_URL: "http://127.0.0.1:54321" }, { RESEND_API_KEY: "" }] as Record<string, string>[]) {
    const f = finto({ env });
    assertEquals((await leggi(await gestisciAvvisa(req({ prenotazione_id: ID }), f.deps))).d, { ok: true, mail: false });
    assertEquals(f.mail.length, 0);
  }
});

Deno.test("mail «posti cambiati»: posti in parole, codice, nessun nome, tutto escapato", () => {
  const m = mailSpostamento({ titolo: "<b>Prova</b>", inizio: "2026-10-25T20:00:00Z", luogo: "Teatro", posti: ["Platea|C|3"], codice: "K7M4QX", link: "https://stageplot.it/biglietteria/?e=k3m9x2p7qa" });
  assertStringIncludes(m.text, "Fila C, posto 3"); assertStringIncludes(m.text, "K7M4QX");
  assertStringIncludes(m.text, "domenica 25 ottobre 2026, ore 21:00");
  assert(!m.html.includes("<b>Prova</b>")); assertStringIncludes(m.html, "&lt;b&gt;Prova&lt;/b&gt;");
  assertStringIncludes(m.subject, "Posti cambiati");
});

Deno.test("tokenDa e utenteDa: solo «Bearer <token>»; un errore di getUser vale «nessun utente»", async () => {
  assertEquals(tokenDa(new Request("http://x", { headers: { authorization: "Bearer abc.def" } })), "abc.def");
  assertEquals(tokenDa(new Request("http://x", { headers: { authorization: "Basic abc" } })), null);
  const u = utenteDa((t) => t === "ok"
    ? Promise.resolve({ data: { user: { id: "u1", email: "a@example.invalid", email_confirmed_at: "2026-01-01" } }, error: null })
    : Promise.reject(new Error("rete")));
  assertEquals(await u("ok"), { id: "u1", email: "a@example.invalid", verificata: true });
  assertEquals(await u("no"), null);
});
