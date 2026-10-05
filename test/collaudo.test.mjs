/* StagePlot — COLLAUDO SUI PROGETTI VERI.
 *
 * Perché (27/09/2026): i test dei motori provano una funzione alla volta su casi scritti a mano. Un
 * cambio può passare tutti quei test e rompere lo stesso un progetto salvato da qualcuno mesi fa:
 * un canale che sparisce, un microfono che cambia, un avviso nuovo su un palco che andava bene.
 * Qui si aprono 30 progetti VERI e, scena per scena, si confronta quello che l'app ne ricava con
 * quello che ne ricavava quando il caso è stato registrato.
 *
 * I PROGETTI NON SONO NEL REPO (decisione di Simone, 27/09): anche anonimizzati sono il lavoro degli
 * utenti, e questo repo è pubblico. Stanno nella cartella privata `collaudo/` accanto al repo
 * (COWORK/STAGEPLOT/collaudo/: progetti/, atteso/, LEGGIMI.md), che il test cerca risalendo dalla
 * radice; oppure dove dice STAGEPLOT_COLLAUDO. Senza cartella il test lo DICE ed esce 0: in CI non
 * c'è, e il collaudo si lancia in locale prima di ogni merge (AGENTS.md §4).
 *
 * Idea presa dal playbook di Anthropic sul ciclo di sviluppo con agenti (21/08/2026): 20-50 compiti
 * reali con il risultato atteso, e ogni incidente diventa un caso permanente.
 *
 * Uso:  node build.mjs && node test/collaudo.test.mjs              confronta (exit 1 se cambia qualcosa)
 *       node test/collaudo.test.mjs --aggiorna                     riscrive gli attesi (solo dopo aver
 *                                                                  letto la differenza e deciso che è voluta)
 */
import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { loadApp, root } from "./sandbox.mjs";

/* la cartella privata: dalla variabile, oppure risalendo (il repo sta anche in .claude/worktrees/<nome>) */
function cartella() {
  if (process.env.STAGEPLOT_COLLAUDO) return process.env.STAGEPLOT_COLLAUDO;
  for (let d = root, i = 0; i < 8; i++, d = dirname(d)) {
    const c = join(d, "collaudo");
    if (existsSync(join(c, "progetti"))) return c;
  }
  return null;
}
const BASE = cartella();
if (!BASE) {
  console.log("collaudo SALTATO: cartella privata dei progetti non trovata (collaudo/progetti accanto al repo, o STAGEPLOT_COLLAUDO).");
  process.exit(0);
}
const DIR = join(BASE, "progetti");
const ATTESI = join(BASE, "atteso");
if (!existsSync(DIR)) { console.log("✗ collaudo: " + DIR + " non esiste (STAGEPLOT_COLLAUDO sbagliata?)"); process.exit(1); }
const AGGIORNA = process.argv.includes("--aggiorna");

const A = loadApp();

/* Quello che conta per chi riceve il PDF, una riga per cosa: le differenze si leggono al volo. */
function impronta() {
  const R = A.cabResult(true), E = A.elecResult(true), au = A.auditEngine();
  const si = (b) => (b ? "48V" : "");
  return {
    canali: A.patchList().rows.map((r) => [r.n, r.name, r.mic, si(r.p48), r.stand, r.patch].join(" | ")),
    monitor: A.monitorList().rows.map((r) => [r.n, r.name, r.tipo, r.stereo ? "stereo" : ""].join(" | ")),
    rf: A.rfList().rows.map((r) => [r.name, r.kind, r.band, r.rx].join(" | ")),
    /* la regola, non il testo: una frase riscritta meglio non è una regressione, un avviso in più sì */
    avvisi: au.findings.map((f) => f.lvl + " | " + (f.rule || f.msg)).sort(),
    totali: [
      "ingressi " + (R.totIn || 0), "mandate " + (R.mixes || []).length, "stage box " + (R.boxes || []).length,
      "carichi " + (E.loads || []).length, "watt " + A.powerTotalW(), "backline " + A.backlineList().count,
      "uscite console " + A.busList().count, "tratte digitali " + A.netEngine().runs.length,
      "cavo audio m " + Math.round(au.totCableM || 0),   /* dipende dalle posizioni: uno spostamento si vede qui */
    ].join(" · "),
  };
}

function improntaDocumento() {
  const scene = {};
  for (const v of A.VARIANTS.slice()) { A.switchVariant(v.id); scene[v.name || v.id] = impronta(); }
  return scene;
}

/* differenza leggibile: per sezione, le righe tolte (−) e aggiunte (+), al massimo 8 */
function differenza(att, ora) {
  const out = [];
  for (const scena of new Set([...Object.keys(att), ...Object.keys(ora)])) {
    const a = att[scena], o = ora[scena];
    if (!a || !o) { out.push(`  scena «${scena}» ${a ? "sparita" : "nuova"}`); continue; }
    for (const k of Object.keys(a)) {
      const la = [].concat(a[k]), lo = [].concat(o[k] || []);
      if (JSON.stringify(la) === JSON.stringify(lo)) continue;
      const tolte = la.filter((x) => !lo.includes(x)), messe = lo.filter((x) => !la.includes(x));
      out.push(`  ${scena} · ${k}` + (tolte.length + messe.length ? "" : " (stesso contenuto, ordine diverso)"));
      tolte.slice(0, 8).forEach((x) => out.push("    − " + x));
      messe.slice(0, 8).forEach((x) => out.push("    + " + x));
    }
  }
  return out;
}

let pass = 0, fail = 0;
const casi = readdirSync(DIR).filter((f) => /^\d+\.json$/.test(f)).sort();
if (casi.length < 20) { console.log(`✗ collaudo: ${casi.length} progetti, ne servono almeno 20`); process.exit(1); }
if (AGGIORNA) mkdirSync(ATTESI, { recursive: true });

for (const f of casi) {
  const nome = "collaudo " + f.replace(".json", "");
  try {
    const grezzo = JSON.parse(readFileSync(join(DIR, f), "utf8"));
    A.loadDoc(grezzo);
    /* NESSUNA SCENA CON CANALI ORFANI (29/09, dalla lettura del lunedì). Un progetto copiato dal cloud si
       porta nel file le righe di canale di elementi che non ci sono più (01: 57/94 nella scena 1, 94/94 nelle
       altre tre): l'editor deve toglierle all'apertura in TUTTE le scene, non solo in quella attiva, e il file
       salvato deve uscire pulito. Se una scena le tiene, finiscono nella lista manuale e nel PDF consulenza. */
    const orfaniIn = (st) => { const ids = new Set((st.items || []).map((i) => String(i.id)));
      return ["inputs", "outputs"].reduce((n, k) => n + (st[k] || []).filter((r) => r && r.linked_item_id != null && r.linked_item_id !== "" && !ids.has(String(r.linked_item_id))).length, 0); };
    const orfaniDoc = (doc) => (doc.variants || [{ name: "(unica)", state: doc }]).filter((v) => orfaniIn(v.state || {}) > 0).map((v) => v.name + ": " + orfaniIn(v.state));
    const aperti = A.VARIANTS.filter((v) => orfaniIn(v.id === A.activeVar ? A.state : v.state || {}) > 0).map((v) => v.name);
    if (aperti.length) throw new Error("canali orfani rimasti dopo l'apertura nelle scene: " + aperti.join(", "));
    const salvatoOrfani = orfaniDoc(JSON.parse(A.docToJSON()));
    if (salvatoOrfani.length) throw new Error("il file salvato ha ancora canali orfani: " + salvatoOrfani.join(", "));
    /* NESSUN COLLEGAMENTO ORFANO (05/10). Le mappe dei cavi (corrente, audio, personal monitor) sono indicizzate per id di
       elemento: una voce rimasta senza elemento, o col distro/box sparito, la eredita il primo elemento nato con quell'id
       (un wedge «senza distro», una multipresa carico di un fantasma). Si guarda in tutte le scene, aperte e salvate.
       Conta con regole sue, indipendenti da dropOrphanLinks, per non dare ragione a un errore di quella. */
    const legamiOrfani = (st) => { const ids = new Set((st.items || []).map((i) => String(i.id))); const e = (v) => v != null && v !== "" && ids.has(String(v));
      const el = st.elec || {}, md = st.mond || {}, cb = st.cab || {}; let n = 0;
      Object.entries(el.manual || {}).forEach(([k, v]) => { if (!e(k) || (v && v.distro != null && !e(v.distro))) n++; });
      Object.entries(el.uplinks || {}).forEach(([k, v]) => { if (!e(k) || (v && v.to != null && !e(v.to))) n++; });
      Object.entries(md.manual || {}).forEach(([k, v]) => { if (!e(k) || (v && v.to != null && !e(v.to))) n++; });
      Object.entries(cb.manual || {}).forEach(([k, v]) => { const m = /^(?:grp:)?(.+?)(?:#\d+)?$/.exec(k);
        const legata = !/^(?:mix|ret):/.test(k); if ((legata && !e(m[1])) || (v && v.box != null && !e(v.box))) n++; });
      return n; };
    const legamiDoc = (doc) => (doc.variants || [{ name: "(unica)", state: doc }]).filter((v) => legamiOrfani(v.state || {}) > 0).map((v) => v.name + ": " + legamiOrfani(v.state));
    const legamiAperti = A.VARIANTS.filter((v) => legamiOrfani(v.id === A.activeVar ? A.state : v.state || {}) > 0).map((v) => v.name);
    if (legamiAperti.length) throw new Error("collegamenti orfani rimasti dopo l'apertura nelle scene: " + legamiAperti.join(", "));
    const legamiSalvati = legamiDoc(JSON.parse(A.docToJSON()));
    if (legamiSalvati.length) throw new Error("il file salvato ha ancora collegamenti orfani: " + legamiSalvati.join(", "));
    const ora = improntaDocumento();
    /* salvare e riaprire non deve cambiare niente */
    A.loadDoc(JSON.parse(A.docToJSON()));
    const riaperto = improntaDocumento();
    const giro = differenza(ora, riaperto);
    if (giro.length) throw new Error("salvare e riaprire cambia il progetto:\n" + giro.join("\n"));

    const fileAtteso = join(ATTESI, f);
    if (AGGIORNA) { writeFileSync(fileAtteso, JSON.stringify(ora, null, 1) + "\n"); pass++; console.log("  ↻ " + nome + " (atteso riscritto)"); continue; }
    if (!existsSync(fileAtteso)) throw new Error("manca l'atteso: node test/collaudo.test.mjs --aggiorna");
    const diff = differenza(JSON.parse(readFileSync(fileAtteso, "utf8")), ora);
    if (diff.length) throw new Error("è cambiato qualcosa:\n" + diff.join("\n"));
    pass++; console.log("  ✓ " + nome);
  } catch (e) { fail++; console.log("  ✗ " + nome + "\n" + String(e.message).split("\n").map((l) => "      " + l).join("\n")); }
}

console.log(`\ncollaudo: ${pass} ok, ${fail} falliti su ${casi.length} progetti`);
if (fail) {
  console.log("Se il cambiamento è VOLUTO: node test/collaudo.test.mjs --aggiorna, e scrivere il perché nel commit.");
  process.exit(1);
}
