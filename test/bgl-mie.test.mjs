/* Biglietteria — «Le mie prenotazioni» ed «Elimina il mio account» (task 20, specifica area §3.3, §3.4, D9).
   Parti pure di biglietteria/mie/mie.js e la pagina statica. node --test test/bgl-mie.test.mjs */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const MIE = createRequire(import.meta.url)(join(root, "biglietteria/mie/mie.js"));
const leggi = (p) => readFileSync(join(root, p), "utf8");

test("prima le prossime (dalla più vicina), poi le passate (dalla più recente)", () => {
  const p = (id, iso) => ({ id, evento: { inizio: iso } });
  const D = MIE.dividi([p("a", "2026-10-01T19:00:00Z"), p("b", "2026-12-01T19:00:00Z"), p("c", "2026-11-01T19:00:00Z"), p("d", "2026-09-01T19:00:00Z"),
    p("e", "2026-10-15T00:00:00Z")], Date.parse("2026-10-15T00:00:00Z"));
  assert.deepEqual([D.future.map((x) => x.id), D.passate.map((x) => x.id)], [["e", "c", "b"], ["a", "d"]], "quella che comincia adesso è ancora fra le prossime");
  assert.deepEqual(MIE.dividi(null, 0), { future: [], passate: [] });
});

test("«Elimina il mio account» dice cosa succede alle prenotazioni future", () => {
  assert.match(MIE.testoElimina(0), /Si cancellano il tuo account/);
  assert.doesNotMatch(MIE.testoElimina(0), /disdett/);
  assert.match(MIE.testoElimina(2), /le tue 2 prenotazioni future vengono disdette/);
  assert.match(MIE.testoElimina(1), /la tua prenotazione futura viene disdetta/);
  assert.match(MIE.testoElimina(3), /Non si può annullare/);
});

test("D9: «Elimina il mio account» solo per gli account nati per la biglietteria; agli altri si dice di scrivere", () => {
  assert.equal(MIE.azioneAccount({ ok: true, solo_biglietteria: true }, 2), "elimina");
  assert.equal(MIE.azioneAccount({ ok: true, solo_biglietteria: false }, 1), "in_uso", "ha prenotato ma usa anche StagePlot");
  /* entrato con Google senza mai prenotare: non è «solo biglietteria» per il database, ma non si può dirgli che usa StagePlot */
  assert.equal(MIE.azioneAccount({ ok: true, solo_biglietteria: false }, 0), "scrivi");
  assert.equal(MIE.azioneAccount(null, 3), "scrivi", "stato non letto: niente «Elimina» e niente supposizioni");
});

test("la pagina: noindex, niente referrer, CSP, script nell'ordine giusto", () => {
  const h = leggi("biglietteria/mie/index.html");
  assert.match(h, /<meta name="robots" content="noindex,nofollow">/); assert.match(h, /<meta name="referrer" content="no-referrer">/);
  const csp = (h.match(/Content-Security-Policy" content="([^"]+)"/) || [])[1] || "";
  assert.match(csp, /default-src 'self'/); assert.match(csp, /object-src 'none'/); assert.match(csp, /form-action 'none'/);
  assert.match(csp, /connect-src https:\/\/vsodplqkuvnsdiikvmjb\.supabase\.co http:\/\/127\.0\.0\.1:54321 http:\/\/localhost:54321;/);
  assert.match(h, /window\.self!==window\.top/, "anti-incorniciamento");
  const pos = ['src="/accedi/google/avvio.js"', 'src="../indirizzi.js', 'src="../bgl.js', 'src="../accesso.js', 'src="mie.js'].map((x) => h.indexOf(x));
  assert.ok(pos.every((x, i) => x > 0 && (i === 0 || x > pos[i - 1])), JSON.stringify(pos));
  assert.match(h, /href="\.\.\/bgl\.css\?v=8"/);
  for (const f of ["biglietteria/index.html", "biglietteria/gestione/index.html"]) assert.match(leggi(f), /bgl\.css\?v=8"/, f + ": niente bgl.css vecchio in cache");
  assert.equal(leggi("sitemap.xml").indexOf("mie"), -1, "fuori dalla sitemap");
});

test("la pagina chiama solo le funzioni dell'account e la Edge Function bgl-account, con il token della persona", () => {
  const js = leggi("biglietteria/mie/mie.js");
  assert.match(js, /"bgl_mie_prenotazioni"/); assert.match(js, /"bgl_account_stato"/); assert.match(js, /"bgl_disdici_mia"/);
  assert.match(js, /\/functions\/v1\/bgl-account/); assert.match(js, /azione: "elimina"/);
  const host = [...js.matchAll(/https?:\/\/([a-z0-9.\-]+)/gi)].map((m) => m[1]);
  assert.deepEqual(host, [], "nessun indirizzo esterno: tutto da cfg.api");
});
