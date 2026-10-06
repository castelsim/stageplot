import { assertEquals } from "jsr:@std/assert@1";
import { validaPrenotazione } from "./bgl-validazione.ts";

// Biglietteria: la richiesta di prenotazione dalla pagina pubblica. Dati inventati.
const buona = () => ({ e: "k3m9x2p7qa", posti: ["Platea|A|5", "Platea|A|6"], nome: "Mario", cognome: "Rossi",
  email: "mario.rossi@example.invalid", privacy: true, sito: "" });

Deno.test("una richiesta fatta bene passa, con gli spazi tagliati", () => {
  const r = validaPrenotazione({ ...buona(), nome: "  Mario ", email: " mario.rossi@example.invalid " });
  assertEquals(r, { ok: true, value: { e: "k3m9x2p7qa", posti: ["Platea|A|5", "Platea|A|6"], nome: "Mario", cognome: "Rossi", email: "mario.rossi@example.invalid" } });
});

Deno.test("due tocchi sullo stesso posto contano uno; il quinto posto no", () => {
  const r = validaPrenotazione({ ...buona(), posti: ["Platea|A|5", "Platea|A|5", "Platea|A|6", "Platea|A|5"] });
  assertEquals(r.ok && r.value.posti, ["Platea|A|5", "Platea|A|6"]);
  const quattroDoppi = validaPrenotazione({ ...buona(), posti: ["Platea|A|1", "Platea|A|2", "Platea|A|3", "Platea|A|4", "Platea|A|4"] });
  assertEquals(quattroDoppi.ok, true, "4 diversi + un doppione = 4");
  assertEquals(validaPrenotazione({ ...buona(), posti: ["Platea|A|1", "Platea|A|2", "Platea|A|3", "Platea|A|4", "Platea|A|5"] }),
    { ok: false, errore: "troppi_posti" });
  assertEquals(validaPrenotazione({ ...buona(), posti: [] }), { ok: false, errore: "dati_non_validi", campo: "posti" });
});

Deno.test("chiavi dei posti storte", () => {
  for (const p of ["Platea|a|5", "Platea|A|0", "Platea|A|05", "Platea|A", "|A|5", "Pla|tea|A|5", "Platea|A|5\n", "Platea|ABCDE|5",
    "x".repeat(25) + "|A|5", "Plat\u0007ea|A|5", 5, null]) {
    assertEquals(validaPrenotazione({ ...buona(), posti: [p] }), { ok: false, errore: "dati_non_validi", campo: "posti" }, String(p));
  }
  assertEquals(validaPrenotazione({ ...buona(), posti: "Platea|A|5" }), { ok: false, errore: "dati_non_validi", campo: "posti" });
});

Deno.test("nome, cognome, email: mancanti, lunghi, con caratteri di controllo", () => {
  const campo = (o: Record<string, unknown>) => {
    const r = validaPrenotazione({ ...buona(), ...o });
    return r.ok ? "ok" : `${r.errore}:${r.campo ?? ""}`;
  };
  assertEquals(campo({ nome: "" }), "dati_non_validi:nome");
  assertEquals(campo({ nome: "   " }), "dati_non_validi:nome");
  assertEquals(campo({ nome: undefined }), "dati_non_validi:nome");
  assertEquals(campo({ nome: "x".repeat(61) }), "dati_non_validi:nome");
  assertEquals(campo({ nome: "x".repeat(60) }), "ok");
  assertEquals(campo({ nome: "Ma\u0000rio" }), "dati_non_validi:nome");
  assertEquals(campo({ nome: "Mario\nRossi" }), "dati_non_validi:nome");
  assertEquals(campo({ nome: 42 }), "dati_non_validi:nome");
  assertEquals(campo({ cognome: "" }), "dati_non_validi:cognome");
  assertEquals(campo({ cognome: "D'Annunzio" }), "ok");
  assertEquals(campo({ email: "senza-chiocciola" }), "dati_non_validi:email");
  assertEquals(campo({ email: "a@b" }), "dati_non_validi:email");
  assertEquals(campo({ email: "a b@example.invalid" }), "dati_non_validi:email");
  assertEquals(campo({ email: "x".repeat(250) + "@e.it" }), "dati_non_validi:email");
  assertEquals(campo({ email: "" }), "dati_non_validi:email");
});

Deno.test("il campo nascosto pieno è un robot", () => {
  assertEquals(validaPrenotazione({ ...buona(), sito: "https://spam.example.invalid" }), { ok: false, errore: "dati_non_validi", campo: "sito" });
  assertEquals(validaPrenotazione({ ...buona(), sito: 1 }), { ok: false, errore: "dati_non_validi", campo: "sito" });
  assertEquals(validaPrenotazione({ ...buona(), sito: undefined }).ok, true, "assente va bene");
});

Deno.test("slug storto = l'evento non c'è; corpo che non è un oggetto", () => {
  for (const e of ["", "K3M9X2P7QA", "k3m9x2p7q", "k3m9x2p7qa1", "k3m9x2p7q0", 123, null]) {
    assertEquals(validaPrenotazione({ ...buona(), e }), { ok: false, errore: "evento_inesistente" }, String(e));
  }
  for (const x of [null, "stringa", 5, [buona()]]) {
    assertEquals(validaPrenotazione(x), { ok: false, errore: "dati_non_validi", campo: "corpo" });
  }
});
