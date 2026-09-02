import { assertEquals, assert } from "jsr:@std/assert@1";
import { risposteDaMostrare, richiamoDi, RICHIAMO_MAX } from "./feedback-replies.ts";

/** Una riga come esce dal database, con dentro tutto quello che NON deve uscire di qui. */
const riga = (o: Record<string, unknown> = {}) => ({
  id: "aaaaaaaa-0000-0000-0000-000000000001",
  message: "Possibilità di connettere le sorgenti agli ingressi locali del mixer",
  risposta: "Fatto: ora i cavi arrivano anche alla console sul palco.",
  risposta_il: "2026-09-02T10:00:00Z",
  risposta_letta_il: null,
  // roba che sta nella stessa riga e non deve mai tornare al client:
  user_email: "qualcuno@example.com",
  user_agent: "Mozilla/5.0",
  admin_notes: "nota interna del triage",
  note_triage: "chiusa con la PR #86",
  project_snapshot: { items: [{ type: "mixer" }] },
  tech_context: { stage_w: 1200 },
  ...o,
});

Deno.test("torna solo la risposta, non la riga", () => {
  const [r] = risposteDaMostrare([riga()]);
  assertEquals(Object.keys(r).sort(), ["id", "richiamo", "risposta", "risposta_il"]);
  // Esplicito, perché è il punto: la riga contiene mail, note interne e un pezzo di progetto.
  const serializzato = JSON.stringify(r);
  for (const segreto of ["qualcuno@example.com", "Mozilla", "nota interna", "PR #86", "stage_w"]) {
    assert(!serializzato.includes(segreto), `non deve uscire: ${segreto}`);
  }
});

Deno.test("una risposta gia' letta non si ripropone", () => {
  assertEquals(risposteDaMostrare([riga({ risposta_letta_il: "2026-09-03T08:00:00Z" })]).length, 0);
});

Deno.test("una segnalazione senza risposta non si mostra", () => {
  assertEquals(risposteDaMostrare([riga({ risposta: null })]).length, 0);
  assertEquals(risposteDaMostrare([riga({ risposta: "   " })]).length, 0);
});

Deno.test("le piu' recenti per prime, e non piu' di tre", () => {
  const righe = [1, 2, 3, 4, 5].map((n) =>
    riga({ id: "id" + n, risposta_il: `2026-09-0${n}T10:00:00Z` })
  );
  const out = risposteDaMostrare(righe);
  assertEquals(out.length, 3);
  assertEquals(out.map((r) => r.id), ["id5", "id4", "id3"]);
});

Deno.test("il richiamo ricorda di cosa si parlava, tagliato su una parola intera", () => {
  const lungo = "Possibilità di connettere le sorgenti audio agli ingressi locali del mixer senza usare una stagebox";
  const r = richiamoDi(lungo);
  assert(r.length <= RICHIAMO_MAX + 1, "resta corto: " + r.length);
  assert(r.endsWith("…"), "si vede che continua");
  assert(!/\s…$/.test(r), "niente spazio prima dei puntini");
  // Il taglio non spezza una parola a metà.
  const ultima = r.slice(0, -1).trim().split(" ").pop()!;
  assert(lungo.split(" ").includes(ultima), `«${ultima}» non è una parola intera del testo`);
});

Deno.test("un messaggio corto resta intero, senza puntini", () => {
  assertEquals(richiamoDi("Manca il sax"), "Manca il sax");
});

Deno.test("input malformato non fa saltare niente", () => {
  assertEquals(risposteDaMostrare(null), []);
  assertEquals(risposteDaMostrare("boh"), []);
  assertEquals(risposteDaMostrare([null, 42, "x"]), []);
  assertEquals(risposteDaMostrare([riga({ id: null })]).length, 0);
  assertEquals(richiamoDi(null), "");
  assertEquals(richiamoDi(undefined), "");
});
