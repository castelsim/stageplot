import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { CHIAVE_GLOBALE, type Deps, gestisciPrenota, MAX_ORA_GLOBALE, MAX_ORA_IP } from "./bgl-prenota.ts";
import type { InvioMail } from "./bgl-mail.ts";

// Biglietteria: la Edge Function `bgl-prenota` con database e Resend finti. Dati inventati.
const PROD = "https://abcdefghijklmnopqrst.supabase.co";
const TOKEN = "3f9a" + "0".repeat(28);
const corpo = (o: Record<string, unknown> = {}) => ({ e: "k3m9x2p7qa", posti: ["Platea|A|5", "Platea|A|6"], nome: "Mario",
  cognome: "Rossi", email: "mario.rossi@example.invalid", privacy: true, sito: "", ...o });
const ok = { ok: true, prenotazione_id: "5d0c0000-0000-4000-8000-000000000000", codice: "K7M4QX", token: TOKEN,
  posti: ["Platea|A|5", "Platea|A|6"], evento: { slug: "k3m9x2p7qa", titolo: "Concerto di prova", inizio: "2026-10-09T19:00:00+00:00", luogo: "Teatro di prova" },
  nome: "Mario", cognome: "Rossi", email: "mario.rossi@example.invalid" };

type Chiamata = { fn: string; args: Record<string, unknown> };
function finto(o: { env?: Record<string, string>; prenota?: unknown; errore?: string; contatori?: { globale?: number; ip?: number };
  invia?: (a: InvioMail) => Promise<{ ok: boolean; status: number }> } = {}) {
  const chiamate: Chiamata[] = [], mail: InvioMail[] = [], log: string[] = [];
  const env: Record<string, string> = { SUPABASE_URL: PROD, RESEND_API_KEY: "chiave-finta", FEEDBACK_IP_SALT: "sale-finto", ...o.env };
  const deps: Deps = {
    rpc: (fn, args) => {
      chiamate.push({ fn, args });
      if (fn === "bgl_throttle_hit") {
        const n = args.p_ip_hash === CHIAVE_GLOBALE ? (o.contatori?.globale ?? 1) : (o.contatori?.ip ?? 1);
        return Promise.resolve({ data: n, error: null });
      }
      if (o.errore) return Promise.resolve({ data: null, error: { message: o.errore } });
      return Promise.resolve({ data: o.prenota ?? ok, error: null });
    },
    invia: (a) => { mail.push(a); return o.invia ? o.invia(a) : Promise.resolve({ ok: true, status: 200 }); },
    env: { get: (k: string) => env[k] },
    log: (m) => { log.push(m); },
  };
  return { deps, chiamate, mail, log };
}
const req = (body: unknown, init: RequestInit & { ip?: string } = {}) => new Request("http://x/functions/v1/bgl-prenota", {
  method: "POST", body: typeof body === "string" ? body : JSON.stringify(body),
  headers: { "content-type": "application/json", origin: "https://stageplot.it", "x-real-ip": init.ip ?? "203.0.113.7" }, ...init,
});
const leggi = async (r: Response) => ({ status: r.status, d: await r.json() });

Deno.test("prenotazione riuscita: 200 con codice, posti, token, link; la mail parte con i dati giusti", async () => {
  const f = finto();
  const r = await leggi(await gestisciPrenota(req(corpo()), f.deps));
  assertEquals(r.status, 200);
  assertEquals(r.d, { ok: true, codice: "K7M4QX", posti: ["Platea|A|5", "Platea|A|6"], token: TOKEN,
    link: "https://stageplot.it/biglietteria/?e=k3m9x2p7qa&c=" + TOKEN, mail: true });
  const p = f.chiamate.find((c) => c.fn === "bgl_prenota")!;
  assertEquals(p.args, { p_slug: "k3m9x2p7qa", p_posti: ["Platea|A|5", "Platea|A|6"], p_nome: "Mario", p_cognome: "Rossi", p_email: "mario.rossi@example.invalid" });
  assertEquals(f.mail.length, 1);
  assertEquals(f.mail[0].to, "mario.rossi@example.invalid");
  assertEquals(f.mail[0].apiKey, "chiave-finta");
  assertStringIncludes(f.mail[0].text, "Fila A, posti 5 e 6");
  assertStringIncludes(f.mail[0].text, "?e=k3m9x2p7qa&c=" + TOKEN);
});

Deno.test("il database risponde PRIMA della mail; la mail fallita non rompe la prenotazione (mail:false)", async () => {
  const ordine: string[] = [];
  const f = finto({ invia: () => { ordine.push("mail"); return Promise.resolve({ ok: false, status: 500 }); } });
  const rpc = f.deps.rpc;
  f.deps.rpc = (fn, a) => { ordine.push(fn); return rpc(fn, a); };
  const r = await leggi(await gestisciPrenota(req(corpo()), f.deps));
  assertEquals(r.status, 200); assertEquals(r.d.mail, false); assertEquals(r.d.codice, "K7M4QX");
  assertEquals(ordine.at(-1), "mail"); assertEquals(ordine.at(-2), "bgl_prenota");
  const lancia = finto({ invia: () => Promise.reject(new Error("rete giù")) });
  const r2 = await leggi(await gestisciPrenota(req(corpo()), lancia.deps));
  assertEquals(r2.status, 200); assertEquals(r2.d.mail, false);
});

Deno.test("MAI una mail in locale o senza chiave: la prenotazione va, mail:false, e il log lo dice", async () => {
  for (const url of ["http://kong:8000", "http://127.0.0.1:54321", "http://localhost:54321"]) {
    const f = finto({ env: { SUPABASE_URL: url } });
    const r = await leggi(await gestisciPrenota(req(corpo()), f.deps));
    assertEquals(r.status, 200, url); assertEquals(r.d.mail, false);
    assertEquals(f.mail.length, 0, "nessun invio con " + url);
    assert(f.log.some((m) => m.includes("mail non inviata: ambiente locale")), JSON.stringify(f.log));
  }
  const s = finto({ env: { RESEND_API_KEY: "" } });
  assertEquals((await leggi(await gestisciPrenota(req(corpo()), s.deps))).d.mail, false);
  assertEquals(s.mail.length, 0);
});

Deno.test("il link usa BGL_SITE_URL se c'è (prove in locale)", async () => {
  const f = finto({ env: { BGL_SITE_URL: "http://localhost:8123/biglietteria/" } });
  assertEquals((await leggi(await gestisciPrenota(req(corpo()), f.deps))).d.link, "http://localhost:8123/biglietteria/?e=k3m9x2p7qa&c=" + TOKEN);
});

Deno.test("OPTIONS, metodo sbagliato, corpo troppo grande (letto prima), JSON rotto", async () => {
  const f = finto();
  const o = await gestisciPrenota(new Request("http://x", { method: "OPTIONS", headers: { origin: "https://stageplot.it" } }), f.deps);
  assertEquals(o.status, 200); assertEquals(o.headers.get("access-control-allow-origin"), "https://stageplot.it");
  assertEquals(await leggi(await gestisciPrenota(new Request("http://x", { method: "GET" }), f.deps)), { status: 405, d: { ok: false, errore: "metodo_non_ammesso" } });
  /* il corpo grande si legge tutto: il flusso risulta consumato quando arriva la risposta */
  const testoGrande = JSON.stringify(corpo({ nome: "x".repeat(9000) }));
  /* con il content-length dichiarato, come fa un browser: la tentazione è rispondere guardando quello */
  const grande = req(testoGrande, { headers: { "content-type": "application/json", "content-length": String(testoGrande.length) } });
  const r = await leggi(await gestisciPrenota(grande, f.deps));
  assertEquals(r, { status: 413, d: { ok: false, errore: "richiesta_troppo_grande" } });
  assert(grande.bodyUsed, "corpo letto prima di rispondere");
  assertEquals((await leggi(await gestisciPrenota(req("{non json"), f.deps))).d, { ok: false, errore: "dati_non_validi", campo: "corpo" });
  assertEquals(f.chiamate.length, 0, "niente di tutto questo arriva al database");
});

Deno.test("validazione e informativa prima di qualsiasi contatore", async () => {
  const f = finto();
  assertEquals(await leggi(await gestisciPrenota(req(corpo({ email: "no" })), f.deps)), { status: 400, d: { ok: false, errore: "dati_non_validi", campo: "email" } });
  assertEquals(await leggi(await gestisciPrenota(req(corpo({ privacy: false })), f.deps)), { status: 400, d: { ok: false, errore: "privacy_mancante" } });
  assertEquals(await leggi(await gestisciPrenota(req(corpo({ privacy: "true" })), f.deps)), { status: 400, d: { ok: false, errore: "privacy_mancante" } });
  assertEquals((await leggi(await gestisciPrenota(req(corpo({ posti: ["Platea|A|1", "Platea|A|2", "Platea|A|3", "Platea|A|4", "Platea|A|5"] })), f.deps))).status, 400);
  assertEquals(await leggi(await gestisciPrenota(req(corpo({ e: "NO" })), f.deps)), { status: 404, d: { ok: false, errore: "evento_inesistente" } });
  assertEquals((await leggi(await gestisciPrenota(req(corpo({ sito: "robot" })), f.deps))).d.campo, "sito");
  assertEquals(f.chiamate.length, 0);
});

Deno.test("ogni errore del database diventa lo stato HTTP giusto, coi suoi dettagli e nient'altro", async () => {
  const casi: [Record<string, unknown>, number][] = [
    [{ ok: false, errore: "evento_inesistente" }, 404],
    [{ ok: false, errore: "prenotazioni_chiuse" }, 409],
    [{ ok: false, errore: "posto_preso", presi: ["Platea|A|5"] }, 409],
    [{ ok: false, errore: "posto_riservato", posti: ["Platea|A|1"] }, 409],
    [{ ok: false, errore: "limite_email", gia: 2, max: 4 }, 409],
    [{ ok: false, errore: "posto_inesistente", posti: ["Platea|Z|1"] }, 400],
    [{ ok: false, errore: "troppi_posti" }, 400],
    [{ ok: false, errore: "dati_non_validi", campo: "nome" }, 400],
  ];
  for (const [risposta, status] of casi) {
    const f = finto({ prenota: { ...risposta, segreto: "non deve uscire" } });
    const r = await leggi(await gestisciPrenota(req(corpo()), f.deps));
    assertEquals(r, { status, d: risposta }, String(risposta.errore));
    assertEquals(f.mail.length, 0, "nessuna mail se non si è prenotato");
  }
  const strano = await leggi(await gestisciPrenota(req(corpo()), finto({ prenota: { ok: false, errore: "boh" } }).deps));
  assertEquals(strano, { status: 500, d: { ok: false, errore: "errore_interno" } });
  const guasto = await leggi(await gestisciPrenota(req(corpo()), finto({ errore: "connection refused" }).deps));
  assertEquals(guasto, { status: 500, d: { ok: false, errore: "errore_interno" } });
});

Deno.test("limiti: globale e per IP → 429 senza prenotare; senza sale resta solo il globale", async () => {
  const g = finto({ contatori: { globale: MAX_ORA_GLOBALE + 1 } });
  assertEquals(await leggi(await gestisciPrenota(req(corpo()), g.deps)), { status: 429, d: { ok: false, errore: "troppe_richieste" } });
  assert(!g.chiamate.some((c) => c.fn === "bgl_prenota"));
  assertEquals((await gestisciPrenota(req(corpo()), finto({ contatori: { globale: MAX_ORA_GLOBALE } }).deps)).status, 200, "al limite si passa ancora");

  const i = finto({ contatori: { ip: MAX_ORA_IP + 1 } });
  assertEquals((await leggi(await gestisciPrenota(req(corpo()), i.deps))).status, 429);
  assert(!i.chiamate.some((c) => c.fn === "bgl_prenota"));
  assertEquals((await gestisciPrenota(req(corpo()), finto({ contatori: { ip: MAX_ORA_IP } }).deps)).status, 200);
  /* l'impronta: 64 esadecimali, mai l'IP, diversa dalla chiave globale, dipende dal sale */
  const h = i.chiamate.filter((c) => c.fn === "bgl_throttle_hit").map((c) => String(c.args.p_ip_hash));
  assertEquals(h.length, 2); assertEquals(h[0], CHIAVE_GLOBALE);
  assert(/^[0-9a-f]{64}$/.test(h[1]) && h[1] !== CHIAVE_GLOBALE && !h[1].includes("203.0.113.7"));

  const senza = finto({ env: { FEEDBACK_IP_SALT: "" }, contatori: { ip: 999 } });
  assertEquals((await gestisciPrenota(req(corpo()), senza.deps)).status, 200, "senza sale il limite per IP è spento");
  assertEquals(senza.chiamate.filter((c) => c.fn === "bgl_throttle_hit").length, 1, "resta solo il globale");
  assert(senza.log.some((m) => m.includes("FEEDBACK_IP_SALT assente")));
  assertEquals(MAX_ORA_IP, 20); assertEquals(MAX_ORA_GLOBALE, 600);
});

Deno.test("CORS: la pagina locale legge la risposta solo con BGL_CORS_DEV=1", async () => {
  const loc = { origin: "http://localhost:8123" };
  const r1 = await gestisciPrenota(req(corpo(), { headers: { ...loc, "content-type": "application/json" } }), finto().deps);
  assertEquals(r1.headers.get("access-control-allow-origin"), "https://stageplot.it");
  const r2 = await gestisciPrenota(req(corpo(), { headers: { ...loc, "content-type": "application/json" } }), finto({ env: { BGL_CORS_DEV: "1" } }).deps);
  assertEquals(r2.headers.get("access-control-allow-origin"), "http://localhost:8123");
  assertEquals(r2.headers.get("cache-control"), "no-store");
});
