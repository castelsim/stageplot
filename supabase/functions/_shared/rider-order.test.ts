import { assert, assertEquals, assertRejects, assertStringIncludes } from "jsr:@std/assert@1";
import {
  allegatiDaFiles,
  MAX_FILE_BYTES,
  MAX_FILES,
  percorsoAllegato,
  pianoRichiesta,
  pulisciAllegatiRider,
  riderPerEmail,
  TIPI_AMMESSI,
  tipoDaNome,
} from "./rider-order.ts";
import { buildPaidEmail } from "./paid-email.ts";

const P = new Set(["pro-review", "rider-pronto", "production-pack"]);
const PID = "0b7f1c2e-3a4d-4e5f-8a6b-7c8d9e0f1a2b";
const RID = "11111111-2222-4333-8444-555555555555";
const pdf = (n = "rider vecchio.pdf", size = 1000) => ({ name: n, type: "application/pdf", size });
const rider = (o: Record<string, unknown> = {}) => ({ nome: "Mario Prova", email: "mario@example.invalid", ...o });

Deno.test("senza progetto: accettato SOLO per il Rider pronto", () => {
  const r = pianoRichiesta({ product: "rider-pronto", rider: rider({ files: [pdf()] }) }, P);
  assert(r.ok && r.rider && r.project_id === null, JSON.stringify(r));
  for (const product of ["pro-review", "production-pack"]) {
    assertEquals(pianoRichiesta({ product }, P).ok, false, product + " senza progetto");
    assertEquals(pianoRichiesta({ product, rider: rider({ files: [pdf()] }) }, P).ok, false, product + " con allegati");
    assertEquals(pianoRichiesta({ product, project_id: PID, rider: rider({ descrizione: "x" }) }, P).ok, false,
      product + ": il modulo del rider non vale per gli altri livelli");
    const ok = pianoRichiesta({ product, project_id: PID }, P);
    assert(ok.ok && ok.rider === null && ok.project_id === PID, product + " col progetto come prima");
  }
});

Deno.test("Rider pronto: col progetto e senza modulo resta la richiesta di prima; senza niente è rifiutato", () => {
  const r = pianoRichiesta({ product: "rider-pronto", project_id: PID }, P);
  assert(r.ok && r.rider === null && r.project_id === PID);
  assertEquals(pianoRichiesta({ product: "rider-pronto" }, P).ok, false);
  assertEquals(pianoRichiesta({ product: "rider-pronto", rider: rider() }, P).ok, false, "né file né descrizione");
  assertEquals(pianoRichiesta({ product: "rider-pronto", rider: rider({ descrizione: "   " }) }, P).ok, false, "descrizione vuota");
  const d = pianoRichiesta({ product: "rider-pronto", rider: rider({ descrizione: "Quartetto: voce, chitarra, basso, batteria" }) }, P);
  assert(d.ok && d.rider && d.rider.files.length === 0, "basta la descrizione");
  const conProg = pianoRichiesta({ product: "rider-pronto", project_id: PID, rider: rider() }, P);
  assert(conProg.ok && conProg.project_id === PID, "col progetto il materiale è facoltativo");
});

Deno.test("prodotto e progetto validati", () => {
  assertEquals(pianoRichiesta({ product: "altro", rider: rider({ files: [pdf()] }) }, P).ok, false);
  assertEquals(pianoRichiesta({ product: "rider-pronto", project_id: "abc", rider: rider({ files: [pdf()] }) }, P).ok, false);
  assertEquals(pianoRichiesta(null, P).ok, false);
  assertEquals(pianoRichiesta([], P).ok, false);
});

Deno.test("dati per la consegna: nome ed email obbligatori, data vera, testi a misura", () => {
  const base = { files: [pdf()] };
  assertEquals(pianoRichiesta({ product: "rider-pronto", rider: { ...base, email: "a@example.invalid" } }, P).ok, false, "nome");
  for (const email of ["", "non-email", "a@b", "a b@example.invalid", "<x>@example.invalid"]) {
    assertEquals(pianoRichiesta({ product: "rider-pronto", rider: rider({ ...base, email }) }, P).ok, false, email);
  }
  for (const data_evento of ["2026-02-30", "31/12/2026", "1999-12-31", "2026-13-01", 20261212]) {
    assertEquals(pianoRichiesta({ product: "rider-pronto", rider: rider({ ...base, data_evento }) }, P).ok, false, String(data_evento));
  }
  const ok = pianoRichiesta({ product: "rider-pronto", rider: rider({ ...base, data_evento: "2026-12-31", per_chi: "  I Prova  " }) }, P);
  assert(ok.ok && ok.rider && ok.rider.data_evento === "2026-12-31" && ok.rider.per_chi === "I Prova");
  assertEquals(pianoRichiesta({ product: "rider-pronto", rider: rider({ ...base, descrizione: "x".repeat(4001) }) }, P).ok, false);
  assertEquals(pianoRichiesta({ product: "rider-pronto", rider: rider({ ...base, per_chi: "x".repeat(121) }) }, P).ok, false);
  assertEquals(pianoRichiesta({ product: "rider-pronto", rider: rider({ ...base, nome: "x".repeat(121) }) }, P).ok, false);
});

Deno.test("allegati: tipo, coerenza col nome, dimensione e numero", () => {
  const prova = (files: unknown[]) => pianoRichiesta({ product: "rider-pronto", rider: rider({ files }) }, P);
  for (const [name, type] of [["rider.pdf", "application/pdf"], ["rider.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
    ["rider.doc", "application/msword"], ["palco.HEIC", "image/heic"], ["foto.jpeg", "image/jpeg"], ["lista.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"]]) {
    assert(prova([{ name, type, size: 10 }]).ok, name);
  }
  assertEquals(prova([{ name: "virus.exe", type: "application/x-msdownload", size: 10 }]).ok, false, "exe");
  assertEquals(prova([{ name: "pagina.html", type: "text/html", size: 10 }]).ok, false, "html");
  assertEquals(prova([{ name: "disegno.svg", type: "image/svg+xml", size: 10 }]).ok, false, "svg");
  assertEquals(prova([{ name: "senza-estensione", type: "application/pdf", size: 10 }]).ok, false, "senza estensione");
  assertEquals(prova([{ name: "finto.pdf", type: "text/html", size: 10 }]).ok, false, "tipo diverso dall'estensione");
  assertEquals(prova([{ name: "macro.xlsm", type: "application/vnd.ms-excel.sheet.macroEnabled.12", size: 10 }]).ok, false, "xlsm");
  assertEquals(prova([pdf("a.pdf", 0)]).ok, false, "vuoto");
  assertEquals(prova([pdf("a.pdf", 1.5)]).ok, false, "dimensione non intera");
  assert(prova([pdf("a.pdf", MAX_FILE_BYTES)]).ok, "10 MB esatti");
  assertEquals(prova([pdf("a.pdf", MAX_FILE_BYTES + 1)]).ok, false, "oltre 10 MB");
  assertEquals(MAX_FILES, 8, "8 file, come le consulenze di prima");
  assert(prova(Array.from({ length: 8 }, (_, i) => pdf(`r${i}.pdf`))).ok, "8 file");
  assertEquals(prova(Array.from({ length: 9 }, (_, i) => pdf(`r${i}.pdf`))).ok, false, "9 file");
  assertEquals(prova([{ name: "x".repeat(200) + ".pdf", type: "application/pdf", size: 10 }]).ok, false, "nome lunghissimo");
  assertEquals(pianoRichiesta({ product: "rider-pronto", rider: rider({ files: "a.pdf" }) }, P).ok, false, "non una lista");
});

Deno.test("tipoDaNome: ogni tipo ammesso ha estensioni, nessuna estensione in due tipi", () => {
  const viste = new Set<string>();
  for (const [tipo, est] of Object.entries(TIPI_AMMESSI)) {
    assert(est.length > 0, tipo);
    for (const e of est) { assert(!viste.has(e), e); viste.add(e); assertEquals(tipoDaNome("x." + e.toUpperCase()), tipo); }
  }
  assertEquals(tipoDaNome("x.exe"), "");
});

Deno.test("percorso deciso dal server: niente cartelle, niente nomi del cliente nel percorso grezzo", () => {
  const p = percorsoAllegato(RID, 0, "../../Rider Città 2026 (vecchio).PDF");
  assertEquals(p, `rider/${RID}/1-rider-citta-2026-vecchio.pdf`);
  assertEquals(percorsoAllegato(RID, 2, "....pdf"), `rider/${RID}/3-file.pdf`);
  const a = allegatiDaFiles(RID, [pdf("a.pdf"), pdf("a.pdf")]);
  assert(a[0].path !== a[1].path, "due file con lo stesso nome non si sovrascrivono");
  assert(a.every((x) => !x.path.includes("..") && x.path.startsWith(`rider/${RID}/`)));
  let lanciato = false;
  try { percorsoAllegato("../x", 0, "a.pdf"); } catch { lanciato = true; }
  assert(lanciato, "id non valido");
});

Deno.test("mail a Simone: senza progetto niente link vivo, descrizione e link firmati, file mancante segnalato, testo scappato", async () => {
  const row = {
    id: RID, senza_progetto: true, rider_per: "I <Prova>", event_date: "2026-11-13", notes: "Voce & chitarra",
    attachments: [
      { path: `rider/${RID}/1-rider.pdf`, name: "rider<b>.pdf", type: "application/pdf", size: 2_000_000 },
      { path: `rider/${RID}/2-palco.jpg`, name: "palco\"><script>.jpg", type: "image/jpeg", size: 1000 },
      { path: `rider/altro/1-x.pdf`, name: "di un altro.pdf", type: "application/pdf", size: 1 },
    ],
  };
  const firmati: string[] = [];
  const r = await riderPerEmail(row, (path) => { firmati.push(path); return Promise.resolve(path.endsWith("1-rider.pdf") ? "https://firmato.example.invalid/a?token=1&x=2" : null); });
  assert(r);
  assertEquals(firmati, [`rider/${RID}/1-rider.pdf`, `rider/${RID}/2-palco.jpg`], "solo i percorsi della richiesta");
  const { html } = buildPaidEmail({ name: "Mario", email: "m@example.invalid", product: "rider-pronto", amount: 5900, viewUrl: null, rider: r });
  assert(!html.includes("?view=") && !html.includes("Link vivo"), "nessun link vivo senza progetto");
  assertStringIncludes(html, ">rider&lt;b&gt;.pdf</a>");
  assertStringIncludes(html, "Senza progetto StagePlot");
  assertStringIncludes(html, "https://firmato.example.invalid/a?token=1&amp;x=2");
  assertStringIncludes(html, "I &lt;Prova&gt;");
  assertStringIncludes(html, "13/11/2026");
  assertStringIncludes(html, "Voce &amp; chitarra");
  assertStringIncludes(html, "file non caricato");
  assert(!html.includes("<script>") && !html.includes("\"><"), "nome del file scappato");
  assert(!html.includes("di un altro"), "un allegato fuori dalla cartella della richiesta non si mostra");
});

Deno.test("mail: una consulenza normale non ha il blocco del materiale e tiene il link vivo", async () => {
  const r = await riderPerEmail({ id: RID, senza_progetto: false, attachments: [], notes: null }, () => Promise.resolve("x"));
  assertEquals(r, null);
  const { html } = buildPaidEmail({ name: "A", email: "a@example.invalid", product: "pro-review", amount: 2900, viewUrl: "https://stageplot.it/?view=t", rider: r });
  assertStringIncludes(html, "https://stageplot.it/?view=t");
  assert(!html.includes("Materiale del cliente"));
});

Deno.test("retention: prima i file dalla Storage API, poi i riferimenti; un errore ferma i riferimenti", async () => {
  const chiamate: string[] = [];
  const scaduti = [
    { request_id: RID, paths: [`rider/${RID}/1-a.pdf`, `rider/${RID}/../x`, "rider/altro/1.pdf"] },
    { request_id: "non-uuid", paths: ["rider/non-uuid/1.pdf"] },
  ];
  const deps = {
    rpc: (fn: string, args: Record<string, unknown>) => {
      chiamate.push(fn + " " + JSON.stringify(args.p_ids ?? ""));
      return Promise.resolve({ data: fn === "stageplot_rider_allegati_scaduti" ? scaduti : 1, error: null });
    },
    rimuovi: (bucket: string, nomi: string[]) => { chiamate.push("rimuovi " + bucket + " " + nomi.join(",")); return Promise.resolve({ error: null, tolti: nomi.length }); },
  };
  const out = await pulisciAllegatiRider(deps, new Date("2026-10-10T00:00:00Z"));
  assertEquals(out, { allegati_rider_richieste: 1, allegati_rider_tolti: 1 });
  assertEquals(chiamate, [
    "stageplot_rider_allegati_scaduti \"\"",
    `rimuovi consultation-uploads rider/${RID}/1-a.pdf`,
    `stageplot_rider_allegati_dimentica ["${RID}"]`,
  ]);
  const solo: string[] = [];
  await assertRejects(() => pulisciAllegatiRider({
    rpc: (fn) => { solo.push(fn); return Promise.resolve({ data: fn === "stageplot_rider_allegati_scaduti" ? scaduti : 1, error: null }); },
    rimuovi: () => Promise.resolve({ error: { message: "giù" }, tolti: 0 }),
  }, new Date()));
  assert(!solo.includes("stageplot_rider_allegati_dimentica"), "file non tolti → riferimenti intatti");
});
