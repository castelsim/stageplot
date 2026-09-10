/* «Richiedi musicisti»: il pezzo puro. Niente rete. */
import test from "node:test";
import assert from "node:assert/strict";
import { missingFields, missingLabel, motivoNonPronta, quantiLabel, stagePositions, snapshotOf, countNeeded, summaryLines, EVENT_KINDS } from "../src/domain/client-request.js";
import { typeMapFrom } from "../src/domain/stageplot-import.js";

const INSTR = [
  { code: "violino", name: "Violino", family: "archi", sort: 1, stageplot_types: ["vlnpost", "vln1x2"] },
  { code: "flauto", name: "Flauto", family: "legni", sort: 10, stageplot_types: ["flauto"] },
];
const MAP = typeMapFrom(INSTR);
const DOC = { _doc: 1, active: "b", variants: [
  { id: "a", name: "Prove", state: { items: [{ id: "z", type: "flauto", label: "Fl" }] } },
  { id: "b", name: "Concerto", state: {
    titolo: "Serata Morricone", luogo: "Teatro di Bassano",
    stage: { w: 1200, d: 800, blocks: [] },
    /* nel documento c'e' anche la rubrica del cliente: non deve uscire di qui */
    contacts: [{ name: "Anna Tecnico", contact: "anna@example.invalid" }],
    techContact: "Anna · 340...",
    items: [
      { id: "i1", type: "vln1x2", label: "Vl I 1-2" },
      { id: "i2", type: "vlnpost", label: "Vl I 3" },
      { id: "i3", type: "flauto", label: "Fl 1" },
      { id: "i4", type: "wedge", label: "Monitor" },
    ] } },
] };

test("i campi obbligatori sono tre, e l'email dev'essere un'email", () => {
  assert.deepEqual(missingFields({}), ["contact_name", "contact_email", "event_title"]);
  assert.deepEqual(missingFields({ contact_name: "Mario", contact_email: "mario@example.invalid", event_title: "Concerto" }), []);
  assert.deepEqual(missingFields({ contact_name: "Mario", contact_email: "mario", event_title: "X" }), ["contact_email"]);
  assert.deepEqual(missingFields({ contact_name: " ", contact_email: "a@b.it", event_title: "X" }), ["contact_name"]);
  assert.equal(missingLabel(["contact_name"]), "Manca il tuo nome.");
  assert.equal(missingLabel(["contact_name", "contact_email", "event_title"]), "Mancano il tuo nome, l'email e che evento è.");
  assert.equal(missingLabel([]), "");
  /* la data NON e' obbligatoria: chi chiede musicisti spesso non ce l'ha ancora */
  assert.deepEqual(missingFields({ contact_name: "M", contact_email: "a@b.it", event_title: "X", event_when: "" }), []);
});

test("le postazioni-persona diventano righe da spuntare; una doppia vale due posti", () => {
  const { righe, ignorate } = stagePositions(DOC, "b", MAP, INSTR);
  assert.deepEqual(righe.map((r) => [r.label, r.instrument_name, r.qty]), [["Vl I 1-2", "Violino", 2], ["Vl I 3", "Violino", 1], ["Fl 1", "Flauto", 1]]);
  assert.deepEqual(ignorate, ["Monitor"], "quello che non è una persona si dice, non si conta");
  assert.equal(righe.every((r) => r.covered === false), true, "si parte da «serve un musicista»");
  assert.deepEqual(stagePositions(DOC, "a", MAP, INSTR).righe.map((r) => r.label), ["Fl"], "ogni scena ha il suo palco");
});

test("la copia che parte non contiene i contatti del cliente", () => {
  const { righe } = stagePositions(DOC, "b", MAP, INSTR);
  const snap = snapshotOf(DOC, "b", righe);
  const testo = JSON.stringify(snap);
  assert.doesNotMatch(testo, /Anna|example\.invalid|techContact|contacts/, "niente rubrica nella copia");
  assert.equal(snap.titolo, "Serata Morricone");
  assert.equal(snap.luogo, "Teatro di Bassano");
  assert.deepEqual(snap.palco, { larghezza_cm: 1200, profondita_cm: 800 });
  assert.equal(snap.elementi, 4);
  assert.deepEqual(snap.postazioni.map((p) => [p.label, p.strumento, p.posti]), [["Vl I 1-2", "Violino", 2], ["Vl I 3", "Violino", 1], ["Fl 1", "Flauto", 1]]);
  assert.equal(snapshotOf(null, "", []).palco, null, "un documento che non c'è non fa saltare niente");
});

test("il conteggio dice quanti musicisti servono davvero, non quante postazioni", () => {
  const { righe } = stagePositions(DOC, "b", MAP, INSTR);
  assert.equal(countNeeded(righe), 4, "2 + 1 + 1");
  righe[0].covered = true;
  assert.equal(countNeeded(righe), 2, "la doppia coperta toglie due posti");
  righe.forEach((r) => { r.covered = true; });
  assert.equal(countNeeded(righe), 0);
  assert.equal(countNeeded(null), 0);
});

test("il riepilogo prima dell'invio dice le cose in italiano", () => {
  const { righe } = stagePositions(DOC, "b", MAP, INSTR);
  const f = { event_kind: "matrimonio", event_title: "Nozze Bianchi", event_when: "fine ottobre", event_place: "Vicenza", contact_name: "Mario Rossi", contact_company: "Eventi srl" };
  assert.deepEqual(summaryLines(f, righe), ["4 musicisti", "Matrimonio o cerimonia: Nozze Bianchi", "fine ottobre · Vicenza", "Mario Rossi · Eventi srl"]);
  assert.equal(summaryLines({}, [{ qty: 1, covered: false }])[0], "Un musicista");
  assert.match(summaryLines({}, [])[0], /Nessun musicista/);
  assert.equal(EVENT_KINDS.concerto, "Concerto");
});

test("il riepilogo prima di mandare non dice «spunta una postazione» a chi non sa quale formazione serve", () => {
  const f = { contact_name: "Anna", contact_email: "a@example.invalid", event_title: "Matrimonio", event_kind: "matrimonio", formation_unknown: true };
  const righe = summaryLines(f, []);
  assert.match(righe[0], /Formazione da definire/);
  assert.doesNotMatch(righe.join(" "), /spunta almeno una postazione/, "quel rimprovero vale per chi il palco ce l'ha");
  assert.match(summaryLines({ ...f, formation_unknown: false }, [])[0], /spunta almeno una postazione/, "e per lui deve restare");
});

test("si manda anche senza sapere che formazione serve, ma non senza dire chi sei", () => {
  /* Il cliente che organizza un matrimonio non sa se gli serve un quartetto o un trio: prima si fermava
     sulla soglia, adesso lo dichiara e la richiesta parte lo stesso — nella stessa coda delle altre. */
  const pieno = { contact_name: "Anna Bianchi", contact_email: "anna@example.invalid", event_title: "Matrimonio" };
  assert.equal(motivoNonPronta({ ...pieno, formation_unknown: true }, []), "", "con «non so» i posti non servono");
  assert.match(motivoNonPronta(pieno, []), /Dicci chi ti serve/, "senza «non so», invece, qualcuno da chiamare va detto");
  assert.equal(motivoNonPronta(pieno, [{ qty: 2, covered: false }]), "", "due posti bastano");
  assert.match(motivoNonPronta(pieno, [{ qty: 2, covered: true }]), /Dicci chi ti serve/, "i posti che copre lui non contano");
  /* i campi obbligatori restano obbligatori anche dicendo «non so» */
  assert.match(motivoNonPronta({ ...pieno, contact_email: "" }, []), /Manca|Mancano/);
  assert.match(motivoNonPronta({ ...pieno, formation_unknown: true, event_title: "" }, []), /Manca|Mancano/);
});

test("nella coda della società «0 musicisti» non esiste: o sono numeri, o è una domanda", () => {
  /* Una richiesta senza posti perché il cliente non sa che formazione serve non è una richiesta vuota:
     letta come «0 musicisti» sembra un errore e finisce in fondo alla coda. */
  assert.equal(quantiLabel({ n_needed: 0, formation_unknown: true }), "formazione da definire");
  assert.equal(quantiLabel({ n_needed: 4, formation_unknown: true }), "formazione da definire", "vale anche se qualche posto c'è");
  assert.equal(quantiLabel({ n_needed: 1 }), "1 musicista");
  assert.equal(quantiLabel({ n_needed: 7 }), "7 musicisti");
  assert.equal(quantiLabel({}), "0 musicisti", "senza dichiarazione resta il conteggio, per quanto brutto");
});
