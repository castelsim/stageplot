// Biglietteria: «Elimina il mio account» (Edge Function `bgl-account`) con database, account e Admin API finti. Dati inventati.
import { assertEquals } from "jsr:@std/assert@1";
import { type DepsAccount, gestisciAccount } from "./bgl-account.ts";
import type { Utente } from "./bgl-utente.ts";

const MARIA: Utente = { id: "9a8b0000-0000-4000-8000-000000000009", email: "maria@example.invalid", verificata: true };
function finto(o: { db?: unknown; elimina?: { message: string } | null } = {}) {
  const ordine: string[] = [];
  const deps: DepsAccount = {
    utente: (t) => Promise.resolve(t === "buono" ? MARIA : null),
    rpc: (fn, args) => { ordine.push(fn + ":" + String(args.p_uid)); return Promise.resolve({ data: o.db ?? { ok: true, disdette: 1, anonimizzate: 2 }, error: null }); },
    elimina: (uid) => { ordine.push("elimina:" + uid); return Promise.resolve({ error: o.elimina ?? null }); },
    env: { get: () => undefined }, log: () => {},
  };
  return { deps, ordine };
}
const req = (body: unknown, tok: string | null = "buono", method = "POST") => new Request("http://x/functions/v1/bgl-account", {
  method, body: method === "POST" ? JSON.stringify(body) : undefined,
  headers: { "content-type": "application/json", origin: "https://stageplot.it", ...(tok ? { authorization: "Bearer " + tok } : {}) } });

Deno.test("elimina: PRIMA il database (disdette e anonimizzazione), POI l'account con l'Admin API", async () => {
  const f = finto();
  const r = await gestisciAccount(req({ azione: "elimina" }), f.deps);
  assertEquals([r.status, await r.json()], [200, { ok: true, disdette: 1, anonimizzate: 2 }]);
  assertEquals(f.ordine, ["bgl_account_prepara_eliminazione:" + MARIA.id, "elimina:" + MARIA.id]);
});

Deno.test("elimina: un account che usa StagePlot non si cancella da qui (409) e l'Admin API non si chiama", async () => {
  const f = finto({ db: { ok: false, errore: "account_in_uso" } });
  assertEquals((await gestisciAccount(req({ azione: "elimina" }), f.deps)).status, 409);
  assertEquals(f.ordine.some((x) => x.startsWith("elimina:")), false);
});

Deno.test("elimina: senza token 401; azione sbagliata 400; GET 405; Admin API giù 500", async () => {
  assertEquals((await gestisciAccount(req({ azione: "elimina" }, null), finto().deps)).status, 401);
  assertEquals((await gestisciAccount(req({ azione: "cancella-tutto" }), finto().deps)).status, 400);
  assertEquals((await gestisciAccount(req(null, "buono", "GET"), finto().deps)).status, 405);
  assertEquals((await gestisciAccount(req({ azione: "elimina" }), finto({ elimina: { message: "giù" } }).deps)).status, 500);
});
