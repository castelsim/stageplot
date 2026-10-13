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
const elOk = { nome: "Proiettore", desc: "Su carrello", w: 120, d: 80, watt: 300, ins: { n: 2, tipo: "linea" }, backline: false, forme: 3, membri: ["cantante", "astamic"] };

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
  assertEquals(r.value.tech_context.stage_w, 1200, "il resto del contesto resta");
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
  assertEquals(r.value.tech_context.stage_w, 1200);
  assertEquals(r.value.tech_context.elemento_json, json);
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
  assertEquals(Object.keys(s).sort(), ["backline", "d", "desc", "forme", "ins", "membri", "nome", "w", "watt"]);
  assertEquals((s as Record<string, unknown>).inquinato, undefined);
  const t = p({ ...elOk, watt: null, ins: { n: 1, tipo: "mic", altro: 1 }, forme: 0, membri: "cantante" })!;
  assertEquals([t.watt, t.ins, t.forme, t.membri], [null, { n: 1, tipo: "mic" }, 0, []]);
  assertEquals(p({ ...elOk, ins: { n: 2.5, tipo: "linea" } })!.ins, null, "ingressi interi");
  assertEquals(p({ ...elOk, ins: { n: 2, tipo: "dante" } })!.ins, null);
  assertEquals(p({ ...elOk, forme: 2.5 })!.forme, null);
  assertEquals(p({ ...elOk, w: 5 })!.w, null, "sotto i 10 cm");
});

Deno.test("elemento_json: solo una stringa di JSON d'oggetto entro i 30000 caratteri", () => {
  const q = elementoJsonPulito;
  assertEquals(q('{"w":120}'), '{"w":120}');
  assertEquals(q(null), null);
  assertEquals(q({ w: 120 }), null, "un oggetto, non una stringa: via");
  assertEquals(q("non json"), null);
  assertEquals(q("[1,2]"), null, "un elenco non è un elemento");
  assertEquals(q("42"), null);
  assertEquals(q(JSON.stringify({ pad: "x".repeat(30_000) })), null, "oltre 30000 caratteri");
  assertEquals(q(JSON.stringify({ pad: "x".repeat(29_980) }))!.length <= 30_000, true);
});

Deno.test("elemento: scheda non valida → il messaggio passa, l'elemento no", () => {
  const r = validateFeedback({ message: "Elemento: Proiettore", hint: "elemento",
    tech_context: { elemento: { nome: "" }, elemento_json: "<svg>" } });
  if (!r.ok) throw new Error("rifiutato");
  assertEquals(r.value.hint, "elemento");
  assertEquals("elemento" in r.value.tech_context, false);
  assertEquals("elemento_json" in r.value.tech_context, false);
});
