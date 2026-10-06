import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { CHIAVE_GLOBALE, type Deps, gestisciPrenota, MAX_ORA_GLOBALE, MAX_ORA_IP } from "./bgl-prenota.ts";
import type { InvioMail } from "./bgl-mail.ts";

// Biglietteria: la Edge Function `bgl-prenota` con database e Resend finti. Dati inventati.
const PROD = "https://abcdefghijklmnopqrst.supabase.co";
const TOKEN = "3f9a" + "0".repeat(28);
const corpo = (o: Record<string, unknown> = {}) => ({ e: "k3m9x2p7qa", posti: ["Platea|A|5", "Platea|A|6"], nome: "Mario",
  cognome: "Rossi", email: "mario.rossi@example.invalid", privacy: true, sito: "", ...o });
const ok = { ok: true, ripetuta: false, mail: true, prenotazione_id: "5d0c0000-0000-4000-8000-000000000000", codice: "K7M4QX", token: TOKEN,
  posti: ["Platea|A|5", "Platea|A|6"], evento: { slug: "k3m9x2p7qa", titolo: "Concerto di prova", inizio: "2026-10-09T19:00:00+00:00",
    luogo: "Teatro di prova", note: "Porte aperte alle 20:30" },
  nome: "Mario", cognome: "Rossi", email: "mario.rossi@example.invalid" };

type Chiamata = { fn: string; args: Record<string, unknown> };
/* I contatori sono veri (salgono a ogni chiamata, partendo da `contatori`): così si vede CHI li fa salire. */
function finto(o: { env?: Record<string, string>; prenota?: unknown; errore?: string; contatori?: { globale?: number; ip?: number };
  globale?: Record<string, unknown>; invia?: (a: InvioMail) => Promise<{ ok: boolean; status: number }> } = {}) {
  const chiamate: Chiamata[] = [], mail: InvioMail[] = [], log: string[] = [];
  const env: Record<string, string> = { SUPABASE_URL: PROD, RESEND_API_KEY: "chiave-finta", FEEDBACK_IP_SALT: "sale-finto", ...o.env };
  const conta = { globale: (o.contatori?.globale ?? 1) - 1, ip: (o.contatori?.ip ?? 1) - 1 };
  const deps: Deps = {
    rpc: (fn, args) => {
      chiamate.push({ fn, args });
      if (fn === "bgl_throttle_hit") {
        if (args.p_ip_hash === CHIAVE_GLOBALE) return Promise.resolve({ data: ++conta.globale, error: null });
        return Promise.resolve({ data: ++conta.ip, error: null });
      }
      if (fn === "bgl_globale_hit") {
        if (o.globale) return Promise.resolve({ data: o.globale, error: null });
        return Promise.resolve({ data: { ok: true, n: ++conta.globale }, error: null });
      }
      if (o.errore) return Promise.resolve({ data: null, error: { message: o.errore } });
      return Promise.resolve({ data: o.prenota ?? ok, error: null });
    },
    invia: (a) => { mail.push(a); return o.invia ? o.invia(a) : Promise.resolve({ ok: true, status: 200 }); },
    env: { get: (k: string) => env[k] },
    log: (m) => { log.push(m); },
  };
  return { deps, chiamate, mail, log, conta };
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
    link: "https://stageplot.it/biglietteria/?e=k3m9x2p7qa&c=" + TOKEN, mail: true, ripetuta: false });
  const p = f.chiamate.find((c) => c.fn === "bgl_prenota")!;
  const ip = p.args.p_ip_hash;
  assert(typeof ip === "string" && /^[0-9a-f]{64}$/.test(ip) && ip !== CHIAVE_GLOBALE, "l'impronta della connessione va al database: " + ip);
  assertEquals(p.args, { p_slug: "k3m9x2p7qa", p_posti: ["Platea|A|5", "Platea|A|6"], p_nome: "Mario", p_cognome: "Rossi",
    p_email: "mario.rossi@example.invalid", p_ip_hash: ip, p_token: null });
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

Deno.test("limiti: per IP e globale → 429 senza prenotare; senza sale resta solo il globale e nessuna impronta", async () => {
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
  assertEquals(h.length, 1);
  assert(/^[0-9a-f]{64}$/.test(h[0]) && h[0] !== CHIAVE_GLOBALE && !h[0].includes("203.0.113.7"));

  const senza = finto({ env: { FEEDBACK_IP_SALT: "" }, contatori: { ip: 999 } });
  assertEquals((await gestisciPrenota(req(corpo()), senza.deps)).status, 200, "senza sale il limite per IP è spento");
  assertEquals(senza.chiamate.filter((c) => c.fn === "bgl_throttle_hit").length, 0, "nessun contatore per IP");
  assertEquals(senza.chiamate.filter((c) => c.fn === "bgl_globale_hit").length, 1, "resta solo il globale");
  assertEquals(senza.chiamate.find((c) => c.fn === "bgl_prenota")!.args.p_ip_hash, null, "e nessuna impronta sulla prenotazione");
  assert(senza.log.some((m) => m.includes("FEEDBACK_IP_SALT assente")));
  assertEquals(MAX_ORA_IP, 20); assertEquals(MAX_ORA_GLOBALE, 600);
});

Deno.test("REVISIONE: chi è già fermo per il suo IP non consuma il limite globale (la 21ª richiesta non lo tocca)", async () => {
  const f = finto();
  const stati: number[] = [];
  for (let n = 0; n < 26; n++) stati.push((await gestisciPrenota(req(corpo(), { ip: "10.2.2.2" }), f.deps)).status);
  assertEquals(stati.filter((s) => s === 200).length, MAX_ORA_IP);
  assertEquals(stati.slice(MAX_ORA_IP), [429, 429, 429, 429, 429, 429]);
  assertEquals(f.conta.globale, MAX_ORA_IP, "il contatore di tutti è salito solo per le 20 richieste ammesse");
  /* l'ordine: prima l'IP, poi il globale, poi la prenotazione */
  const ordine = f.chiamate.slice(0, 3).map((c) => c.fn);
  assertEquals(ordine, ["bgl_throttle_hit", "bgl_globale_hit", "bgl_prenota"]);
  assertEquals(f.chiamate.find((c) => c.fn === "bgl_globale_hit")!.args, { p_slug: "k3m9x2p7qa" });
});

Deno.test("REVISIONE: uno slug inventato o un evento chiuso si fermano al limite globale, che non conta (404/409)", async () => {
  const ne = finto({ globale: { ok: false, errore: "evento_inesistente" } });
  assertEquals(await leggi(await gestisciPrenota(req(corpo()), ne.deps)), { status: 404, d: { ok: false, errore: "evento_inesistente" } });
  assert(!ne.chiamate.some((c) => c.fn === "bgl_prenota"));
  const ch = finto({ globale: { ok: false, errore: "prenotazioni_chiuse" } });
  assertEquals(await leggi(await gestisciPrenota(req(corpo()), ch.deps)), { status: 409, d: { ok: false, errore: "prenotazioni_chiuse" } });
  const pieno = finto({ globale: { ok: true, n: MAX_ORA_GLOBALE + 1 } });
  assertEquals((await gestisciPrenota(req(corpo()), pieno.deps)).status, 429);
  /* il contatore che non risponde non ferma le prenotazioni (come prima): lo dice il log */
  const rotto = finto();
  const rpc = rotto.deps.rpc;
  rotto.deps.rpc = (fn, a) => fn === "bgl_globale_hit" ? Promise.resolve({ data: null, error: { message: "giù" } }) : rpc(fn, a);
  assertEquals((await gestisciPrenota(req(corpo()), rotto.deps)).status, 200);
  assert(rotto.log.some((m) => m.includes("limite globale non letto")));
});

Deno.test("REVISIONE: la pagina può mandare il suo codice segreto; la stessa richiesta ripetuta non manda una seconda mail", async () => {
  const T2 = "ab".repeat(16);
  /* anche se il database dicesse mail:true, una richiesta ripetuta non spedisce di nuovo */
  const f = finto({ prenota: { ...ok, token: T2, ripetuta: true, mail: true } });
  const r = await leggi(await gestisciPrenota(req(corpo({ token: T2 })), f.deps));
  assertEquals(r.status, 200);
  assertEquals(r.d.ripetuta, true); assertEquals(r.d.mail, false); assertEquals(r.d.token, T2);
  assertEquals(f.chiamate.find((c) => c.fn === "bgl_prenota")!.args.p_token, T2);
  assertEquals(f.mail.length, 0, "nessuna seconda mail");
  assertEquals((await leggi(await gestisciPrenota(req(corpo({ token: "NON-ESADECIMALE" })), finto().deps))).d,
    { ok: false, errore: "dati_non_validi", campo: "token" });
});

Deno.test("REVISIONE: il database dice niente mail (troppe a quell'indirizzo) → 200, mail:false, nessun invio", async () => {
  const f = finto({ prenota: { ...ok, mail: false } });
  const r = await leggi(await gestisciPrenota(req(corpo()), f.deps));
  assertEquals(r.status, 200); assertEquals(r.d.mail, false); assertEquals(f.mail.length, 0);
  assert(f.log.some((m) => m.includes("limite per destinatario")), JSON.stringify(f.log));
});

Deno.test("REVISIONE: tetto per connessione → 409 con i suoi numeri", async () => {
  const f = finto({ prenota: { ok: false, errore: "limite_connessione", gia: 8, max: 8 } });
  assertEquals(await leggi(await gestisciPrenota(req(corpo()), f.deps)), { status: 409, d: { ok: false, errore: "limite_connessione", gia: 8, max: 8 } });
});

Deno.test("REVISIONE: nella mail non c'è il nome scritto da chi prenota; c'è la nota dell'organizzatore", async () => {
  const f = finto({ prenota: { ...ok, nome: "Hai vinto" } });
  await gestisciPrenota(req(corpo()), f.deps);
  assertEquals(f.mail.length, 1);
  for (const t of [f.mail[0].text, f.mail[0].html]) {
    assert(!t.includes("Hai vinto"), "il nome non entra nella mail");
    assertStringIncludes(t, "Porte aperte alle 20:30");
  }
});

Deno.test("CORS: la pagina locale legge la risposta solo con BGL_CORS_DEV=1", async () => {
  const loc = { origin: "http://localhost:8123" };
  const r1 = await gestisciPrenota(req(corpo(), { headers: { ...loc, "content-type": "application/json" } }), finto().deps);
  assertEquals(r1.headers.get("access-control-allow-origin"), "https://stageplot.it");
  const r2 = await gestisciPrenota(req(corpo(), { headers: { ...loc, "content-type": "application/json" } }), finto({ env: { BGL_CORS_DEV: "1" } }).deps);
  assertEquals(r2.headers.get("access-control-allow-origin"), "http://localhost:8123");
  assertEquals(r2.headers.get("cache-control"), "no-store");
});
