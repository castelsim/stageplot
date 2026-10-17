import { assertEquals } from "jsr:@std/assert@1";
import { validateFeedback, HINTS, HINTS_EDITOR, elementoPulito, elementoJsonPulito } from "./feedback-validation.ts";

Deno.test("ok con messaggio valido", () => {
  const r = validateFeedback({ message: "Manca il basso a 5 corde" });
  assertEquals(r.ok, true);
});

Deno.test("errore: messaggio troppo corto", () => {
  const r = validateFeedback({ message: "ciao" }); // 4 char
  assertEquals(r.ok, false);
});

Deno.test("errore: messaggio troppo lungo", () => {
  const r = validateFeedback({ message: "x".repeat(1001) });
  assertEquals(r.ok, false);
});

Deno.test("honeypot pieno => error 'spam'", () => {
  const r = validateFeedback({ message: "messaggio vero", honeypot: "bot" });
  assertEquals(r.ok, false);
  if (!r.ok) assertEquals(r.error, "spam");
});

Deno.test("hint fuori enum viene azzerato", () => {
  const r = validateFeedback({ message: "messaggio vero", hint: "xxx" });
  assertEquals(r.ok, true);
  if (r.ok) assertEquals(r.value.hint, null);
});

Deno.test("hint valido preservato", () => {
  const r = validateFeedback({ message: "messaggio vero", hint: "bug" });
  assertEquals(r.ok, true);
  if (r.ok) assertEquals(r.value.hint, "bug");
});

Deno.test("project_snapshot troppo grande viene scartato (il messaggio passa)", () => {
  const big = { blob: "x".repeat(1_100_000) }; // > 1 MB serializzato
  const r = validateFeedback({ message: "messaggio vero", project_snapshot: big });
  assertEquals(r.ok, true);
  if (r.ok) assertEquals(r.value.project_snapshot, null);
});

Deno.test("project_snapshot piccolo viene preservato", () => {
  const snap = { a: 1 };
  const r = validateFeedback({ message: "messaggio vero", project_snapshot: snap });
  assertEquals(r.ok, true);
  if (r.ok) assertEquals(r.value.project_snapshot, snap);
});

Deno.test("tech_context troppo grande viene azzerato", () => {
  const big: Record<string, string> = {};
  for (let i = 0; i < 5000; i++) big["k" + i] = "vvvvvvvvvv";
  const r = validateFeedback({ message: "messaggio vero", tech_context: big });
  assertEquals(r.ok, true);
  if (r.ok) assertEquals(Object.keys(r.value.tech_context).length, 0);
});

Deno.test("identità dal payload ignorata (audit S5: no spoofing)", () => {
  const r = validateFeedback({
    message: "messaggio vero",
    user_id: "attacker-controlled-id",
    user_email: "vittima@esempio.it",
  });
  assertEquals(r.ok, true);
  if (r.ok) {
    assertEquals(r.value.user_id, null);
    assertEquals(r.value.user_email, null);
  }
});

Deno.test("meta enorme o non stringa: tagliato e scartato (16/09)", () => {
  const r = validateFeedback({ message: "messaggio vero", meta: { user_agent: "x".repeat(20_000_000), page_url: { a: 1 } } });
  assertEquals(r.ok, true);
  if (r.ok) { assertEquals(r.value.meta.user_agent?.length, 500); assertEquals(r.value.meta.page_url, undefined); }
});


/* ===== Crea elemento: invio per revisione (13/10/2026) ===== */
const elOk = { nome: "Proiettore", desc: "Su carrello", w: 120, d: 80, watt: 300, ins: { n: 2, tipo: "linea" }, backline: false, forme: 3, membri: ["cantante", "astamic"],
  punti: 148, archi: 12, fori: 1 };

Deno.test("hint elemento: accettato", () => {
  const r = validateFeedback({ message: "Elemento: Proiettore", hint: "elemento", tech_context: {} });
  assertEquals(r.ok, true);
  if (r.ok) assertEquals(r.value.hint, "elemento");
});

Deno.test("le chip del box restano tre; «elemento» arriva solo dall'editor", () => {
  assertEquals(HINTS, ["bug", "missing", "idea"]);
  assertEquals(HINTS_EDITOR, ["elemento"]);
  const r = validateFeedback({ message: "messaggio vero", hint: "Elemento" });
  if (r.ok) assertEquals(r.value.hint, null, "maiuscole: tipo sconosciuto");
});

Deno.test("elemento: la scheda valida passa uguale, e il JSON pure", () => {
  const json = JSON.stringify({ w: 120, d: 80, shapes: [] });
  const r = validateFeedback({ message: "Elemento: Proiettore — Su carrello", hint: "elemento",
    tech_context: { stage_w: 1200, elemento: elOk, elemento_json: json } });
  assertEquals(r.ok, true);
  if (!r.ok) return;
  assertEquals(r.value.tech_context.elemento, elOk);
  assertEquals(r.value.tech_context.elemento_json, json);
  assertEquals("stage_w" in r.value.tech_context, false, "il contesto del progetto non viaggia con l'elemento (privacy)");
});

Deno.test("elemento: con un altro tipo i campi dell'elemento non si salvano", () => {
  const r = validateFeedback({ message: "messaggio vero", hint: "bug",
    tech_context: { stage_w: 1200, elemento: elOk, elemento_json: "{}" } });
  assertEquals(r.ok, true);
  if (!r.ok) return;
  assertEquals("elemento" in r.value.tech_context, false);
  assertEquals("elemento_json" in r.value.tech_context, false);
  assertEquals(r.value.tech_context.stage_w, 1200);
});

Deno.test("elemento: il JSON grande non svuota il resto del contesto (ha il suo tetto)", () => {
  const json = JSON.stringify({ pad: "x".repeat(29_000) });
  const r = validateFeedback({ message: "Elemento: Proiettore", hint: "elemento",
    tech_context: { stage_w: 1200, object_types: { cantante: 2 }, elemento: elOk, elemento_json: json } });
  if (!r.ok) throw new Error("rifiutato");
  assertEquals(r.value.tech_context.elemento_json, json, "il JSON ha il suo tetto, fuori dai 32 KB");
});

Deno.test("elemento: campi fuori regola scartati, mai salvati com'erano", () => {
  const p = (x: unknown) => elementoPulito(x);
  assertEquals(p(null), null);
  assertEquals(p("Proiettore"), null);
  assertEquals(p([elOk]), null);
  assertEquals(p({ ...elOk, nome: "" }), null, "senza nome niente elemento");
  assertEquals(p({ ...elOk, nome: "x".repeat(61) }), null, "nome oltre 60");
  assertEquals(p({ ...elOk, nome: 42 }), null);
  const s = p({ ...elOk, nome: "  Pro\u001b[31miettore\n ", desc: "x".repeat(281), w: "120", d: Infinity, watt: 20001,
    ins: { n: 17, tipo: "linea" }, backline: "sì", forme: 201, membri: ["cantante", "<b>", "x".repeat(41), 7, ...Array(150).fill("astamic")],
    extra: "via", __proto__: { inquinato: true } })!;
  assertEquals(s.nome, "Pro [31miettore", "caratteri di controllo tolti (niente sequenze per il terminale)");
  assertEquals(s.desc, "", "descrizione oltre 280: via");
  assertEquals([s.w, s.d, s.watt, s.ins, s.backline, s.forme], [null, null, null, null, false, null]);
  assertEquals(s.membri.length, 100, "al massimo 100");
  assertEquals(s.membri.every((m) => m === "cantante" || m === "astamic"), true, "solo nomi di tipo");
  assertEquals(p({ ...elOk, membri: ["__proto__", "constructor", "prototype", "cantante"] })!.membri, ["cantante"], "niente nomi riservati");
  assertEquals(Object.keys(s).sort(), ["archi", "backline", "d", "desc", "fori", "forme", "ins", "membri", "nome", "punti", "w", "watt"]);
  assertEquals((s as Record<string, unknown>).inquinato, undefined);
  const t = p({ ...elOk, watt: null, ins: { n: 1, tipo: "mic", altro: 1 }, forme: 0, membri: "cantante" })!;
  assertEquals([t.watt, t.ins, t.forme, t.membri], [null, { n: 1, tipo: "mic" }, 0, []]);
  assertEquals(p({ ...elOk, ins: { n: 2.5, tipo: "linea" } })!.ins, null, "ingressi interi");
  assertEquals(p({ ...elOk, ins: { n: 2, tipo: "dante" } })!.ins, null);
  assertEquals(p({ ...elOk, forme: 2.5 })!.forme, null);
  assertEquals(p({ ...elOk, w: 5 })!.w, null, "sotto i 10 cm");
});

Deno.test("elemento_json: solo una stringa di JSON d'oggetto entro i 300 000 caratteri", () => {
  const q = elementoJsonPulito;
  assertEquals(q('{"w":120}'), '{"w":120}');
  assertEquals(q(null), null);
  assertEquals(q({ w: 120 }), null, "un oggetto, non una stringa: via");
  assertEquals(q("non json"), null);
  assertEquals(q("[1,2]"), null, "un elenco non è un elemento");
  assertEquals(q("42"), null);
  /* {"pad":"…"} = 10 caratteri più il riempimento: 300 000 esatti passano, 300 001 no (Contorni, 16/10/2026) */
  const giusto = JSON.stringify({ pad: "x".repeat(299_990) }), oltre = JSON.stringify({ pad: "x".repeat(299_991) });
  assertEquals([giusto.length, oltre.length], [300_000, 300_001]);
  assertEquals(q(giusto), giusto, "300 000 caratteri: passa");
  assertEquals(q(oltre), null, "300 001: scartato");
});

Deno.test("elemento: i conteggi dei contorni — interi nei limiti, altrimenti null; senza (client vecchio) null", () => {
  const p = (x: Record<string, unknown>) => elementoPulito({ ...elOk, ...x })!;
  assertEquals([p({}).punti, p({}).archi, p({}).fori], [148, 12, 1]);
  assertEquals([p({ punti: 40_000, archi: 40_000, fori: 10_000 }).punti, p({ archi: 40_000 }).archi, p({ fori: 10_000 }).fori], [40_000, 40_000, 10_000], "il tetto passa");
  const v = p({ punti: -1, archi: 2.5, fori: 10_001 });
  assertEquals([v.punti, v.archi, v.fori], [null, null, null], "negativi, decimali, oltre il tetto");
  const w = p({ punti: 40_001, archi: "12", fori: null });
  assertEquals([w.punti, w.archi, w.fori], [null, null, null], "oltre il tetto, non numerici");
  const vecchio: Record<string, unknown> = { ...elOk }; delete vecchio.punti; delete vecchio.archi; delete vecchio.fori;
  const o = elementoPulito(vecchio)!;
  assertEquals([o.punti, o.archi, o.fori], [null, null, null], "un client vecchio non li manda");
});

Deno.test("elemento: scheda non valida → il messaggio passa, l'elemento no", () => {
  const r = validateFeedback({ message: "Elemento: Proiettore", hint: "elemento",
    tech_context: { elemento: { nome: "" }, elemento_json: "<svg>" } });
  if (!r.ok) throw new Error("rifiutato");
  assertEquals(r.value.hint, "elemento");
  assertEquals("elemento" in r.value.tech_context, false);
  assertEquals("elemento_json" in r.value.tech_context, false);
});

/* ===== revisione di sicurezza (giro 1): privacy dell'elemento, caratteri di controllo e di direzione ===== */
Deno.test("elemento: arrivano solo disegno, misure e descrizione (niente progetto, pagina, browser)", () => {
  const r = validateFeedback({ message: "Elemento: Proiettore", hint: "elemento", project_id: "p-1", project_snapshot: { items: [1] },
    meta: { app_version: "2026.10.13", page_url: "https://stageplot.it/app/ [view]", user_agent: "UA", viewport: "1440x900", language: "it" },
    tech_context: { stage_w: 1200, stage_d: 800, object_types: { cantante: 2 }, total_objects: 3, selected_object_type: "custom", elemento: elOk, elemento_json: "{}" } });
  if (!r.ok) throw new Error("rifiutato");
  assertEquals(Object.keys(r.value.tech_context).sort(), ["elemento", "elemento_json"]);
  assertEquals(r.value.project_id, null);
  assertEquals(r.value.project_snapshot, null);
  assertEquals(r.value.meta, { app_version: "2026.10.13", language: "it" });
  /* gli altri tipi tengono tutto come prima */
  const b = validateFeedback({ message: "messaggio vero", hint: "bug", project_id: "p-1", meta: { page_url: "u" }, tech_context: { stage_w: 1200 } });
  if (!b.ok) throw new Error("rifiutato");
  assertEquals([b.value.project_id, b.value.meta.page_url, b.value.tech_context.stage_w], ["p-1", "u", 1200]);
});

Deno.test("messaggio: via i caratteri di controllo e di direzione (restano a capo e tabulazione)", () => {
  const r = validateFeedback({ message: "ciao\u001b[2J mondo\u009b31m\nriga\tdue‮evil​", hint: "bug" });
  if (!r.ok) throw new Error("rifiutato");
  assertEquals(r.value.message, "ciao [2J mondo 31m\nriga\tdue evil");
  assertEquals(validateFeedback({ message: "\u0007\u0007\u0007\u0007ab" }).ok, false, "senza i controlli è troppo corto");
});

Deno.test("nome e descrizione: via anche i caratteri invisibili e di direzione", () => {
  const s = elementoPulito({ ...elOk, nome: "‮abc‏def⁦x⁩", desc: "a​b‪c" })!;
  assertEquals(s.nome, "abc def x");
  assertEquals(s.desc, "a b c");
  assertEquals(elementoPulito({ ...elOk, nome: "‮​" }), null, "fatto solo di invisibili: niente nome");
});

/* ===== giro 2: ZWJ e ZWNJ fanno parte del testo (emoji composte, persiano, hindi); \r\n diventa \n ===== */
Deno.test("messaggio: emoji composte, persiano, hindi e a capo di Windows restano come sono", () => {
  const m = (s: string) => { const r = validateFeedback({ message: s, hint: "bug" }); if (!r.ok) throw new Error(r.error); return r.value.message; };
  for (const s of ["Famiglia 👨‍👩‍👧 ok", "bandiera 🏳️‍🌈 ok", "می‌خواهم گزارش دهم", "नमस्‍ते दुनिया ok", "שלום עולם בדיקה"]) assertEquals(m(s), s);
  assertEquals(m("riga uno\r\nriga due"), "riga uno\nriga due");
  assertEquals(m("riga uno\rriga due"), "riga uno\nriga due", "\\r da solo");
  assertEquals(m("ciao‮ mondo\u001b[2J"), "ciao  mondo [2J", "direzione ed ESC via come prima");
  const e = elementoPulito({ nome: "Proiettore 👨‍👩‍👧", desc: "می‌خواهم‮" })!;
  assertEquals([e.nome, e.desc], ["Proiettore 👨‍👩‍👧", "می‌خواهم"]);
});
