/* StagePlot — test dei MOTORI (cablaggio audio, elettrico, monitoraggio digitale, microfonazione, zona).
 *
 * Perché: i motori sono la logica critica del tool; in sviluppo diverse regressioni si prendevano solo
 * col test manuale nel browser. Questa suite carica il codice REALE dell'app (app.js + app/index.html) in un sandbox node
 * (stub DOM universale) e asserisce sui risultati dei motori puri. Zero dipendenze (solo node:vm).
 *
 * Uso:  node build.mjs && node test/engines.test.mjs
 *       (exit 1 se un test fallisce → usabile in pre-merge/CI)
 */
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import vm from "node:vm";
import { execFileSync } from "node:child_process";   /* per far controllare app.js al parser vero */

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const appjs = readFileSync(join(root, "app.js"), "utf8");   /* l'app e' nel bundle defer app.js (build.mjs) */
const stylesCss = readFileSync(join(root, "src/styles.css"), "utf8");   /* il CSS e' sorgente: alcuni comportamenti (lock delle pedane) vivono li' */

/* Un percorso e' PUBBLICATO se nessun pezzo del suo cammino e' una cartella di lavoro. Il criterio e'
   "segmento che inizia con un punto", non una lista di nomi: le cartelle di servizio nascono in
   continuazione (.claude/worktrees l'11/08, .superpowers lo stesso giorno) e ogni volta che se ne
   aggiunge una a mano i test camminano su HTML che nessuno vedra' mai — rossi che non parlano del
   prodotto. Il percorso va passato RELATIVO alla radice: la suite gira spesso dentro
   .claude/worktrees/<nome>/, e su un percorso assoluto questa regola escluderebbe se stessa. */
const pubblicata = (rel) => !/(^|[\\/])\.[^\\/]+[\\/]|[\\/]node_modules[\\/]/.test(rel);

/* ---- sandbox: carica gli <script> inline reali con uno stub DOM che ingoia tutto ---- */
function loadApp() {
  const mkU = () => { const f = function () { return U; }; const U = new Proxy(f, {
    get: (t, k) => { if (k === Symbol.toPrimitive) return () => 0; if (k === "length") return 0; return U; },
    apply: () => U, construct: () => U, set: () => true, has: () => true }); return U; };
  const U = mkU();
  const ctx = {
    console,
    navigator: { serviceWorker: { register: () => ({ then: () => ({ catch: () => {} }) }) }, userAgent: "node" },
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    matchMedia: () => ({ matches: false, addEventListener: () => {}, addListener: () => {} }),
    setTimeout: () => 0, clearTimeout: () => {}, setInterval: () => 0, clearInterval: () => {}, requestAnimationFrame: () => 0,
    addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => true,
    Event: function () {}, CustomEvent: function () {},
    fetch: () => Promise.reject(new Error("no net")),
    location: { search: "", href: "http://localhost/", pathname: "/" },
    performance: { now: () => 0 }, atob: (s) => s, btoa: (s) => s,
    URL, URLSearchParams, XMLSerializer: function () { this.serializeToString = () => ""; },
  };
  ctx.document = new Proxy({}, { get: () => U });
  ctx.window = new Proxy(ctx, { get: (t, k) => (k in t ? t[k] : U), set: (t, k, v) => { t[k] = v; return true; } });
  ctx.self = ctx.window; ctx.globalThis = ctx;
  vm.createContext(ctx);
  try { vm.runInContext(appjs, ctx, { timeout: 20000 }); } catch (e) { /* il boot tocca il DOM (stub): ok, i motori sono gia' definiti (function-hoisting) */ }
  if (typeof ctx.TYPES !== "object" || typeof ctx.audioCablingEngine !== "function") {
    /* Prima di dare la colpa alla struttura, chiedilo al parser: il 14/08 una funzione rimasta senza
       la sua testa ha prodotto un app.js che non compilava, e l'unico segnale era questo messaggio —
       che mandava a cercare nel posto sbagliato. `build.mjs --check` intanto diceva verde: controlla
       che i generati corrispondano ai sorgenti, non che siano codice valido. */
    try { execFileSync(process.execPath, ["--check", join(root, "app.js")], { stdio: "pipe" }); }
    catch (e) {
      const dove = String(e.stderr || "").split("\n").slice(0, 5).join("\n");
      throw new Error("app.js NON COMPILA — è un errore di sintassi, non di struttura:\n" + dove);
    }
    throw new Error("Sandbox non caricato: TYPES/motori mancanti (app/index.html cambiato struttura?)");
  }
  return ctx;
}

const A = loadApp();

/* ---- mini test runner ---- */
let pass = 0, fail = 0;
function t(name, fn) { try { fn(); pass++; console.log("  ✓ " + name); } catch (e) { fail++; console.log("  ✗ " + name + "\n      " + e.message); } }
function eq(got, exp, msg) { const g = JSON.stringify(got), e = JSON.stringify(exp); if (g !== e) throw new Error((msg || "") + " atteso " + e + ", ottenuto " + g); }
function ok(cond, msg) { if (!cond) throw new Error(msg || "condizione falsa"); }
function throws(fn, code) {
  try { fn(); } catch (e) {
    if (code && e.code !== code) throw new Error("errore atteso " + code + ", ottenuto " + (e.code || e.message));
    return e;
  }
  throw new Error("eccezione attesa" + (code ? " (" + code + ")" : ""));
}
function reset() {
  A.state.items = []; A.state.inputs = []; A.state.outputs = []; A.state.contacts = []; A.state.rider = {};
  A.state.status = "bozza"; A.state.approval = { by: "", at: "" };
  A.state.lookDefault = "illustrato";   /* «Postazione» = default del progetto (senza questo, un test che lo lascia su «Strumento solo» inquina i successivi) */
  A.state.titolo = ""; A.state.luogo = ""; A.state.techContact = ""; A.state.venue = null; A.state.printFrame = null; A.state.zones = [];
  A.state.lights = { rows: [], blackout: null, mood: "" };   /* luci = reparto (blocco A): senza azzeramento le righe di un test finiscono nel rider del successivo */
  A.state.stage = { w: 1200, d: 800, blocks: [{ x: 0, y: 0, w: 1200, d: 800 }] };   /* palco default: base per isFreshBlankProject */
  /* cab.home va azzerato come le luci e lookDefault: dal 02/09 un test puo' CREARE il punto
     d'arrivo dei cavi, e se resta scritto il test dopo trova un capolinea che non ha messo lui —
     e vede il ramo sbagliato di cabHomePoint(). */
  A.state.cab.on = false; A.state.cab.mode = "manual"; A.state.cab.manual = {}; A.state.cab.home = null;
  A.state.elec.on = false; A.state.elec.manual = {}; A.state.elec.uplinks = {};
  A.state.mond.on = false; A.state.mond.manual = {};
  A.__cabRes = null; A.__elecRes = null; A.__mondRes = null;
  /* La VISTA va riportata sul palco: `addItem` senza coordinate posa al centro di `vb`
     (14144), quindi un test che sposta o allarga la vista fa nascere gli elementi altrove in
     quelli dopo. Succede dal 02/09, da quando «Metti il punto d'arrivo» chiama fit() per mostrare
     il punto che ha appena creato — giusto per l'utente, contaminante per la suite. */
  try { A.fit(); } catch (e) { /* vb esiste solo col DOM finto: se manca, i test non lo usano */ }
  /* confine documento: i test che caricano documenti multi-variante (loadDoc) lasciavano VARIANTS e
     DOC_EXTRA popolati, contaminando chi legge il DOCUMENTO e non la sola variante attiva
     (hasMeaningfulDocument → isFreshBlankProject). */
  A.VARIANTS = []; A.activeVar = null; A.DOC_EXTRA = {}; A.ensureVariants();
}
function add(type, x, y, opts) { return A.addItem(type, Object.assign({ x, y }, opts || {})) || A.state.items[A.state.items.length - 1]; }   /* addItem puo' creare anche la DI: vale il valore restituito */
function chans(it) { return A.cabItemInputs(it); }

console.log("StagePlot — test motori\n");

console.log("Microfonazione / cabItemInputs:");
t("batteria = 8 canali (generica)", () => { reset(); const b = add("batteria", 400, 400); eq(chans(b).length, 8); });
t("archi vln1x2 default (archetto) = 2 canali DPA", () => { reset(); const v = add("vln1x2", 300, 300); eq(chans(v).length, 2); eq(chans(v)[0].mic, "DPA 4099"); });
t("archi vln1x2 miking pan1 = 1 canale, pan2 = 2", () => { reset(); const v = add("vln1x2", 300, 300); v.miking = "pan1"; A.__cabRes = null; eq(chans(v).length, 1); v.miking = "pan2"; eq(chans(v).length, 2); });
t("corista: nasce col SUO microfono (SM58); panoramico = 0", () => { reset(); const c = add("corista", 200, 300); eq(chans(c).length, 1, "un corista aggiunto a mano ha il suo mic"); eq(chans(c)[0].mic, "SM58"); c.micMode = "pano"; eq(chans(c).length, 0, "panoramico: lo copre il mic di sezione"); });
t("il coro generato in massa nasce panoramico (overhead, non un mic a testa)", () => {
  reset();
  const gen = A.choirItems ? A.choirItems({ s: 3, a: 3, t: 2, b: 2 }) : null;
  if (gen && gen.length) {
    const coristi = gen.filter(x => x.type === "corista");
    ok(coristi.length > 0, "il generatore crea coristi");
    ok(coristi.every(x => x.micMode === "pano"), "tutti panoramici: la ripresa e' d'insieme");
  } else {
    ok(appjs.indexOf('donna:s.donna, micMode:"pano"') > -1, "il generatore coro deve marcare i coristi come panoramici");
  }
});
t("cantante: mic personale (1 SM58) tranne panoramico (0)", () => { reset(); const c = add("cantante", 200, 300); eq(chans(c).length, 1); eq(chans(c)[0].mic, "SM58"); ["tonda","giraffa","mano"].forEach(function(m){ c.micMode=m; eq(chans(c).length,1,m+" = 1 canale"); }); c.micMode="pano"; eq(chans(c).length,0); });
t("fiato (tromba) default = 1 (e906), panoramico = 0", () => { reset(); const tr = add("tromba", 200, 300); eq(chans(tr).length, 1); eq(chans(tr)[0].mic, "e906"); tr.miking = "pan"; eq(chans(tr).length, 0); });
t("archi singolo (violoncello) archetto = 1, panoramico = 0", () => { reset(); const vc = add("violoncello", 200, 300); eq(chans(vc).length, 1); vc.miking = "pan"; eq(chans(vc).length, 0); });
t("Overhead sezione (micover) = 2 canali KM184 stereo", () => { reset(); const o = add("micover", 300, 300); eq(chans(o).length, 2); eq(chans(o).map((c) => c.mic), ["KM184", "KM184"]); });
t("Mic coro (micchoir) = 1 canale KM184 (sorgente)", () => { reset(); const mc = add("micchoir", 300, 300); eq(chans(mc).length, 1); eq(chans(mc)[0].mic, "KM184"); });

console.log("\nZona microfono panoramico:");
t("elemento dentro una zona -> 0 canali; la zona -> 1 canale inferito", () => {
  reset(); const v = add("vlnpost", 300, 300); const z = add("miczone", 300, 300); z.w = 220; z.d = 150;
  eq(chans(v).length, 0, "violino coperto"); eq(chans(z).length, 1, "zona"); eq(chans(z)[0].mic, "KM184", "mic zona");
});
t("micZoneLabel = sezione prevalente plurale (14/07): 'Violini'; zona vuota = KM184 / 'Zona panoramica'", () => {
  reset(); add("vlnpost", 300, 300); add("vlnpost", 340, 300); const z = add("miczone", 320, 300); z.w = 220; z.d = 150;
  eq(A.micZoneLabel(z), "Violini"); const z2 = add("miczone", 1500, 1500); z2.w = 100; z2.d = 100;
  eq(A.micZoneMic(z2), "KM184"); eq(A.micZoneLabel(z2), "Zona panoramica");
});
t("micZoneLabel con label numerati: 'Violino I 1/2' -> 'Violini I'", () => {
  reset(); const a = add("vlnpost", 300, 300); a.label = "Violino I 1"; const b = add("vlnpost", 340, 300); b.label = "Violino I 2";
  const z = add("miczone", 320, 300); z.w = 220; z.d = 150;
  eq(A.micZoneLabel(z), "Violini I");
});
t("ownMic: in zona 0 canali di default; con ownMic il mic singolo torna (zona resta 1 canale)", () => {
  reset(); const v = add("vlnpost", 300, 300); const z = add("miczone", 300, 300); z.w = 220; z.d = 150;
  eq(chans(v).length, 0, "default: coperto");
  v.ownMic = true; A.__cabRes = null;
  ok(chans(v).length >= 1, "ownMic: il mic singolo conta di nuovo");
  eq(chans(z).length, 1, "la zona resta 1 canale");
});
t("close-mic obbligato: kick/rullante/tom/hi-hat tengono il close mic in zona; crash/ride assorbiti", () => {
  reset();
  const z = add("miczone", 300, 300); z.w = 260; z.d = 200;
  const sn = add("snareR", 300, 300);
  const cr = add("crashR", 320, 300);
  A.__cabRes = null;
  ok(A.effOwnMic(sn), "rullante: close-obligato di default");
  ok(chans(sn).length >= 1, "rullante in zona tiene il suo mic");
  eq(chans(sn)[0].mic, "SM57", "rullante = SM57");
  ok(!A.effOwnMic(cr), "crash: non close-obligato");
  eq(chans(cr).length, 0, "crash in zona assorbito dall'overhead");
});
t("close-mic obbligato: override ownMic=false riporta il pezzo ad assorbito; micZoneSources ignora i kept", () => {
  reset();
  const z = add("miczone", 300, 300); z.w = 300; z.d = 220;
  const sn = add("snareR", 300, 300);
  const cr = add("crashR", 330, 300);
  A.__cabRes = null;
  const srcs = A.micZoneSources(z).map((s) => s.type);
  ok(srcs.includes("crashR") && !srcs.includes("snareR"), "la zona infera dai piatti, non dal rullante kept");
  sn.ownMic = false; A.__cabRes = null;
  eq(chans(sn).length, 0, "override esplicito: rullante assorbito");
});
t("close-mic esteso: chitarre/ampli/DI/voci tengono il mic in zona; sezioni archi/fiati assorbite", () => {
  reset();
  const z = add("miczone", 300, 300); z.w = 420; z.d = 320;
  const gt = add("gtstand", 280, 300);   // chitarra (MIKING senza pan)
  const amp = add("comboamp", 300, 280); // ampli (IN_SRC)
  const di = add("dimono", 320, 300);    // DI
  const vox = add("wireless", 300, 320); // voce (radiomic)
  const tr = add("tromba", 340, 300);    // fiato a sezione (MIKING con pan) → assorbibile
  A.__cabRes = null;
  ok(!A.zoneAbsorbable(gt) && chans(gt).length >= 1, "chitarra tiene il mic");
  ok(!A.zoneAbsorbable(amp) && chans(amp).length >= 1, "ampli tiene il mic");
  ok(!A.zoneAbsorbable(di) && chans(di).length >= 1, "DI tiene il canale");
  ok(!A.zoneAbsorbable(vox) && chans(vox).length >= 1, "voce tiene il mic");
  ok(A.zoneAbsorbable(tr), "fiato a sezione: assorbibile (ha opzione pan)");
  eq(chans(tr).length, 0, "fiato a sezione: assorbito dalla zona (invariato)");
});
t("coerenza ottoni: musTromboneBasso si comporta come gli altri tromboni (assorbibile in zona)", () => {
  reset();
  ok(A.zoneAbsorbable({ type: "musTromboneBasso" }), "trombone basso: assorbibile (ha close/pan come gli ottoni)");
  eq(A.zoneAbsorbable({ type: "musTromboneBasso" }), A.zoneAbsorbable({ type: "trombone" }), "coerente col trombone");
  const z = add("miczone", 300, 300); z.w = 260; z.d = 200;
  const tb = add("musTromboneBasso", 300, 300);
  A.__cabRes = null;
  eq(chans(tb).length, 0, "trombone basso in zona: assorbito");
  reset();
  const tb2 = add("musTromboneBasso", 300, 300);
  eq(chans(tb2)[0].mic, "MD421", "fuori zona: mic MD421 (default close, invariato)");
});
t("mono/stereo: tastiere stereo di default (invariate); it.stereo=false → mono; celesta mono→stereo", () => {
  reset();
  const gp = add("grancoda", 300, 300);
  eq(chans(gp).length, 2, "grancoda: stereo di default (2 canali, IN_MULTI invariato)");
  gp.stereo = false; A.__cabRes = null;
  eq(chans(gp).length, 1, "grancoda mono: 1 canale");
  eq(chans(gp)[0].mic, "KM184", "grancoda mono: mic KM184");
  reset();
  const ce = add("celesta", 300, 300);
  eq(chans(ce).length, 1, "celesta: mono di default");
  ce.stereo = true; A.__cabRes = null;
  const cc = chans(ce);
  eq(cc.length, 2, "celesta stereo: 2 canali");
  ok(/ L$/.test(cc[0].name) && / R$/.test(cc[1].name), "celesta stereo: nomi L/R");
});
t("mono/stereo: laptop/djset/pedaliera diventano sorgenti audio", () => {
  reset();
  const lp = add("laptop", 300, 300), dj = add("djset", 340, 300), pd = add("pedaliera", 380, 300);
  ok(A.isAudioSource(lp) && A.isAudioSource(dj) && A.isAudioSource(pd), "sono sorgenti audio");
  eq(chans(lp).length, 2, "laptop: stereo di default");
  eq(chans(dj).length, 2, "djset: stereo di default");
  eq(chans(pd).length, 1, "pedaliera: mono di default");
  pd.stereo = true; A.__cabRes = null;
  eq(chans(pd).length, 2, "pedaliera stereo: 2 canali");
});
t("L=dispari: alignStereoOdd porta L della coppia stereo su canale dispari (spare)", () => {
  const rows = [
    { n: 1, name: "Basso", itemId: "a" },
    { n: 2, name: "Piano L", itemId: "b" }, { n: 3, name: "Piano R", itemId: "b" },
  ];
  const out = A.alignStereoOdd(rows);
  eq(out.length, 4, "3 righe + 1 spare");
  ok(out.some((r) => r.spare), "inserito un canale spare");
  const pl = out.find((r) => r.name === "Piano L"), pr = out.find((r) => r.name === "Piano R");
  eq(pl.n % 2, 1, "Piano L su canale dispari");
  eq(pr.n, pl.n + 1, "Piano R subito dopo (pari)");
});
t("L=dispari: coppia già allineata (L dispari) non aggiunge spare", () => {
  const rows = [{ n: 1, name: "Piano L", itemId: "b" }, { n: 2, name: "Piano R", itemId: "b" }];
  const out = A.alignStereoOdd(rows);
  eq(out.length, 2, "nessuno spare");
  eq(out[0].n, 1, "L resta su 1 (dispari)");
  ok(A.isStereoPairStart(rows[0], rows[1]), "riconosce la coppia stereo L/R");
});
t("colonna Asta: micInfo espone lo stand; patchList lo porta nella riga", () => {
  eq(A.micInfo("KM184").stand, "asta giraffa", "KM184 → asta giraffa");
  eq(A.micInfo("SM57").stand, "asta bassa", "SM57 → asta bassa");
  eq(A.micInfo("DPA 4099").stand, "clip strumento", "DPA 4099 → clip strumento");
  eq(A.micInfo("DI").stand, "", "DI → nessuna asta");
  reset();
  add("grancoda", 300, 300);   // piano stereo microfonato KM184
  const rows = A.patchList().rows;
  ok(rows.length >= 1 && rows[0].stand === "asta giraffa", "la riga patchList porta lo stand del mic (KM184 → asta giraffa)");
});
t("il +48V del «Microfono reale» non si spalma sui canali che usano un altro microfono", () => {
  // Una coppia stereo fa DUE canali. Se all'elemento si assegna un modello reale a condensatore e
  // sulla R si scrive a mano un NASTRO PASSIVO, il phantom del modello finiva anche lì: il rider
  // chiedeva +48V su un nastro, cioè l'errore che l'audit tratta come grave.
  reset();
  add("coppiast", 300, 300);
  const it = A.state.items[A.state.items.length - 1];
  it.modelId = "akg-c451b";
  it.modelData = { brand: "AKG", model: "C451 B", category: "microfono",
                   phantom: { value: "required", reliability: "official" } };
  A.state.cab = A.state.cab || {}; A.state.cab.manual = A.state.cab.manual || {};
  A.state.cab.manual[it.id + "#1"] = { mic: "M130" };      // beyerdynamic M 130: nastro passivo
  const rows = A.patchList().rows.filter((r) => r.itemId === it.id);
  eq(rows.length, 2, "la coppia stereo fa due canali");
  eq(rows[0].mic, "C451 B", "sulla L vale il modello reale");
  eq(rows[0].p48, true, "il C451 B il phantom lo vuole davvero");
  eq(rows[1].mic, "M130", "sulla R vale il microfono scritto a mano");
  eq(rows[1].p48, false, "un nastro passivo NON deve ricevere il +48V del modello dell'elemento");
});
t("Galleria Modelli: le 3 formazioni IT esistono e producono elementi", () => {
  ["matrimonio", "dj", "tributo"].forEach((k) => {
    const fd = A.formationData(k);
    ok(fd && fd.out && fd.out.length >= 8, k + ": formazione con elementi (" + (fd && fd.out ? fd.out.length : 0) + ")");
    ok(fd.out.some((it) => A.TYPES[it.type]), k + ": tipi validi");
  });
  eq(A.FORM_TITLES.matrimonio, "Matrimonio", "titolo matrimonio");
  eq(A.FORM_TITLES.dj, "DJ set", "titolo DJ");
});
t("Passacavi: 4 varianti con dimensioni reali + disegno giallo/nero", () => {
  ["micro", "midi", "xxl", "end"].forEach((k) => {
    ok(A.RAMP_TYPES[k], k + " esiste");
    const svg = A.drawCableRamp({ type: "cableramp", rampType: k, w: A.RAMP_TYPES[k].w, d: A.RAMP_TYPES[k].d });
    ok(svg && svg.indexOf("#efc31f") > -1 && svg.indexOf("#1c1c1c") > -1, k + ": disegno giallo+nero");
  });
  eq(A.RAMP_TYPES.micro.ch, 2, "Micro = 2 canali");
  eq(A.RAMP_TYPES.midi.ch, 5, "Midi = 5 canali");
  eq([A.RAMP_TYPES.midi.w, A.RAMP_TYPES.midi.d].join("x"), "88x54", "Midi 88x54 (≈ Defender MIDI 5)");
});
t("Passacavi tratta modulare: conteggio moduli dalla lunghezza + badge lunghezza in metri", () => {
  eq(A.rampModules({ type: "cableramp", rampType: "midi", w: 88 * 5 }), 5, "midi 440cm = 5 moduli");
  eq(A.rampModules({ type: "cableramp", rampType: "micro", w: 100 * 3 }), 3, "micro 300cm = 3 moduli");
  eq(A.rampModules({ type: "cableramp", rampType: "midi", w: 88 }), 1, "1 modulo");
  eq(A.rampModules({ type: "cableramp", rampType: "end", w: 54 }), 1, "rampa terminale conta 1");
  const svg = A.drawCableRamp({ type: "cableramp", rampType: "midi", w: 300, d: 54 });
  ok(svg.indexOf("3,0 m") > -1, "il disegno mostra la lunghezza reale (3,0 m), non il n° moduli");
  ok(svg.indexOf("×") === -1, "niente più conteggio ×N sul badge");
});
t("Coperture (gazebo/tende): telaio NON occludente + etichetta UNICA nome+dimensione", () => {
  const svg = A.drawGazebo({ type: "gazebo33", w: 300, d: 600 });
  ok(svg.indexOf('fill="none"') > -1, "perimetro senza riempimento → gli elementi sotto si vedono");
  ok(svg.indexOf("<text") === -1, "nessun testo nel disegno: l'etichetta è unica, gestita a livello app");
  eq(A.gazStructLabel({ type: "gazebo33", w: 300, d: 600 }), "Gazebo 3×6 m", "etichetta = nome + dimensione automatica");
  eq(A.gazStructLabel({ type: "gazebo33", w: 300, d: 600, label: "Bar" }), "Bar 3×6 m", "nome personalizzato, dimensione sempre automatica");
  ok(A.GAZ_TYPES.gazebo33 && A.GAZ_TYPES.tenda63 && A.GAZ_TYPES.pma, "gazebo, tenda 6×3 e PMA = coperture a telaio");
  ok(A.drawGazebo({ type: "pma", w: 500, d: 400 }, { cross: true }).indexOf("#dc2626") > -1, "PMA: croce rossa");
  ok(A.GAZEBO_SIZES.length >= 4, "taglie preset presenti");
  eq(A.gazLabel(450, 400), "4,5×4", "gazLabel converte cm→m");
});
t("Layer Coperture: isCover riconosce coperture (gazebo/tende/PMA/copertura palco), non gli altri", () => {
  ok(A.isCover({ type: "gazebo33" }) && A.isCover({ type: "tenda63" }) && A.isCover({ type: "pma" }), "gazebo, tenda, PMA = coperture");
  ok(A.isCover({ type: "roof86" }) && A.isCover({ type: "roof1210" }), "copertura palco = copertura");
  ok(!A.isCover({ type: "wedge" }) && !A.isCover({ type: "djset" }), "monitor/strumenti NON sono coperture");
});
t("Coperture — info: h di default, punto-nella-copertura, gear a rischio + copertura", () => {
  eq(A.coverH({ type: "gazebo33" }), 250, "gazebo: h default 2,5 m");
  eq(A.coverH({ type: "roof86" }), 500, "copertura palco: h default 5 m");
  eq(A.coverH({ type: "gazebo33", h: 300 }), 300, "h override rispettato");
  const g = { type: "gazebo33", x: 500, y: 500, w: 300, d: 600 };
  ok(A.ptInCover(500, 500, g) && A.ptInCover(640, 500, g), "centro e bordo (x=+140<150) dentro");
  ok(!A.ptInCover(700, 500, g), "x=+200>150 fuori");
  ok(A.coverAtRisk({ type: "djset" }) && !A.coverAtRisk({ type: "gazebo33" }), "gear teme la pioggia, la copertura no");
  reset();
  const gz = add("gazebo33", 500, 500); gz.w = 300; gz.d = 600;
  add("djset", 500, 500); add("djset", 1100, 1100);
  eq(A.coveredBy(gz).length, 1, "solo il DJ sotto il gazebo risulta coperto");
});
t("Direttore: microfono talkback → sorgente audio collegabile alla stage box", () => {
  reset();
  const d = add("direttore", 400, 300);
  ok(!A.isAudioSource(d), "senza mic: NON è sorgente");
  eq(A.cabItemInputs(d).length, 0, "senza mic: 0 canali");
  d.mic = true;
  ok(A.isAudioSource(d), "col mic: è sorgente audio");
  const ch = A.cabItemInputs(d);
  eq(ch.length, 1, "col mic: 1 canale talkback");
  ok(/palmare/i.test(ch[0].mic), "default = palmare (gelato) on/off");
  d.micType = "collodoca";
  ok(/collo/i.test(A.cabItemInputs(d)[0].mic), "collo d'oca se scelto");
});
t("Layer Musicisti: persone + strumenti suonati dentro, backline/arredo fuori", () => {
  ok(A.musLayerItem("gtstand") && A.musLayerItem("bassstand") && A.musLayerItem("batteristaR"), "chitarra/basso/batterista dentro");
  ok(A.musLayerItem("marimba") && A.musLayerItem("timpani") && A.musLayerItem("arpa") && A.musLayerItem("grancoda"), "mallet/timpani/arpa/piano dentro");
  ok(!A.musLayerItem("comboamp") && !A.musLayerItem("bassamp") && !A.musLayerItem("panchetta"), "ampli/panchetta (backline/arredo) FUORI");
  ok(A.musLayerItem("pedaliera"), "la pedaliera È strumento del musicista → DENTRO");
  ok(A.musLayerItem("vlnpost") && A.musLayerItem("direttore"), "compatibile con quelli già dentro");
  ok(!A.contactEligible("marimba") && A.contactEligible("vlnpost"), "il Contatto (stretto) resta 'persone', niente strumenti nudi");
});
t("Leggio generico: arpa e strumenti-musicista senza leggio nativo", () => {
  ok(A.leggioExtra({ type: "arpa" }) && A.leggioExtra({ type: "marimba" }) && A.leggioExtra({ type: "grancoda" }), "arpa/marimba/piano hanno il leggio opzionale");
  ok(!A.leggioExtra({ type: "vlnpost" }) && !A.leggioExtra({ type: "direttore" }) && !A.leggioExtra({ type: "batteria" }), "leggio nativo o batteria/direttore → niente generico");
  ok(!A.leggioExtra({ type: "comboamp" }) && !A.leggioExtra({ type: "wedge" }), "non-musicisti → niente leggio");
  ok(A.canHaveLucetta({ type: "arpa" }), "l'arpa col leggio può avere la lucetta");
});
t("Lucetta leggio: dove è ammessa + glyph lampada", () => {
  ok(A.canHaveLucetta({ type: "leggio" }) && A.canHaveLucetta({ type: "sedialeggio" }) && A.canHaveLucetta({ type: "vlnpost" }) && A.canHaveLucetta({ type: "direttore" }), "leggii standalone + postazioni + direttore");
  ok(!A.canHaveLucetta({ type: "wedge" }) && !A.canHaveLucetta({ type: "gazebo33" }), "chi non ha leggio → niente lucetta");
  ok(A.leggioLamp(0).indexOf("#f4c430") > -1, "la lampada ha la testa illuminata (ambra)");
});
t("Parapetto pedana: spessore 8 cm di default, si estende in lunghezza", () => {
  eq(A.TYPES.parapetto.d, 8, "spessore di default 8 cm");
  ok(A.TYPES.parapetto.resizable, "resizable (in lunghezza)");
  const svg = A.TYPES.parapetto.draw({ w: 400, d: 8 });
  ok(svg.indexOf('height="8"') > -1, "alla profondità di default il disegno è spesso 8 cm");
  // lo spessore resta fisso in resize (hook itemresize: nd=TYPES.parapetto.d) → verificato nel browser
});
t("zona da selezione: hull poligonale aderente (gruppo in diagonale → area << bbox)", () => {
  reset();
  const a = add("vlnpost", 300, 300); a.rot = 40;
  const b = add("vlnpost", 420, 380); b.rot = 40;
  const c = add("vlnpost", 540, 460); c.rot = 40;
  const shape = A.miczoneShapeFromItems([a, b, c], 25);
  ok(shape && shape.pts && shape.pts.length >= 4, "hull con vertici poligonali");
  function area(pts){ let s2 = 0; for (let i = 0; i < pts.length; i++){ const p = pts[i], q = pts[(i + 1) % pts.length]; s2 += p[0] * q[1] - q[0] * p[1]; } return Math.abs(s2) / 2; }
  const bb = A.polyBBox(shape.pts);
  ok(area(shape.pts) < bb.w * bb.d * 0.75, "hull sensibilmente più aderente del rettangolo assiale (area " + Math.round(area(shape.pts)) + " vs bbox " + Math.round(bb.w * bb.d) + ")");
  // i centri degli elementi restano DENTRO la zona creata
  const z = add("miczone", shape.x, shape.y); z.pts = shape.pts; A.miczoneRecenter(z); A.__cabRes = null;
  eq(A.micZoneSources(z).length, 3, "tutte le sorgenti coperte dall'hull");
});
t("zona: il cavo audio parte dal pallino mic (micPos), e lo segue quando si sposta", () => {
  reset();
  const v = add("vlnpost", 300, 300); const z = add("miczone", 300, 300); z.w = 220; z.d = 150;
  const sb = add("stagebox", 800, 600);
  A.state.cab.on = true; A.__cabRes = null;
  const a1 = A.portAnchor(z, "audio");
  eq(a1, [300, 300 + Math.round(150 / 2 - 18)], "default: dentro il bordo davanti");
  z.micPos = [-60, 40]; A.__cabRes = null;
  const a2 = A.portAnchor(z, "audio");
  eq(a2, [240, 340], "l'ancora segue micPos");
  z.rot = 90; A.__cabRes = null;
  const a3 = A.portAnchor(z, "audio");
  eq(a3, [300 - 40, 300 - 60], "l'ancora segue anche la rotazione della zona");
  z.rot = 0;
  ok(!A.portKinds(z).includes("audio"), "niente porta audio duplicata sulla zona (il mic È la porta)");
  ok(A.cabResult(true).sources.some((s) => (s.it || s).type === "miczone"), "la zona resta sorgente del motore");
});
t("zone: colori tutti diversi alla creazione (zcol dalla palette)", () => {
  reset(); const z1 = add("miczone", 200, 200); const z2 = add("miczone", 600, 200); const z3 = add("miczone", 1000, 200);
  if (!z1.zcol || !z2.zcol || !z3.zcol) throw new Error("zcol mancante");
  if (z1.zcol === z2.zcol || z2.zcol === z3.zcol || z1.zcol === z3.zcol) throw new Error("colori duplicati: " + [z1.zcol, z2.zcol, z3.zcol].join(","));
});

console.log("\nContratto side-effect (audit M-15): i motori di calcolo NON salvano né renderizzano");
t("i motori puri (audio/elec/mond/audit) non chiamano save() né render()", () => {
  reset();
  const mic = add("astamic", 200, 400); const box = add("stagebox", 600, 250);
  A.state.cab.on = true; A.state.cab.mode = "manual"; A.cabSetItemBox(mic, box.id); A.__cabRes = null;
  A.state.elec = A.state.elec || {}; A.state.elec.on = true; A.__elecRes = null;
  const origSave = A.save, origRender = A.render;
  let saves = 0, renders = 0;
  A.save = function () { saves++; }; A.render = function () { renders++; };
  try {
    A.audioCablingEngine();
    if (typeof A.electricEngine === "function") A.electricEngine();
    if (typeof A.monDigEngine === "function") A.monDigEngine();
    if (typeof A.auditEngine === "function") A.auditEngine();
    if (typeof A.netEngine === "function") A.netEngine();
  } finally { A.save = origSave; A.render = origRender; }
  eq(saves, 0, "un motore di calcolo non deve salvare (classe dell'incidente cloud: engine che chiama save)");
  eq(renders, 0, "un motore di calcolo non deve renderizzare");
});

console.log("\nCavo unico (audioCablingEngine):");
t("batteria + box: 8 canali ma 1 sola KEY (un cavo)", () => {
  reset(); const b = add("batteria", 400, 500); const box = add("stagebox", 600, 250);
  A.state.cab.on = true; A.state.cab.mode = "manual"; A.cabSetItemBox(b, box.id); A.__cabRes = null;
  const R = A.audioCablingEngine(); const bl = R.links.filter((l) => l.s.it.id === b.id);
  eq(bl.length, 8, "canali"); eq(new Set(bl.map((l) => l.key)).size, 1, "chiavi distinte"); ok(bl[0].bundleN === 8, "bundleN");
});
t("microfono singolo: cavo per-canale (key id#0, non grp)", () => {
  reset(); const mic = add("astamic", 200, 400); const box = add("stagebox", 600, 250);
  A.state.cab.on = true; A.state.cab.mode = "manual"; A.cabSetItemBox(mic, box.id); A.__cabRes = null;
  const l = A.audioCablingEngine().links.filter((x) => x.s.it.id === mic.id)[0];
  ok(l && /#0$/.test(l.key) && l.key.indexOf("grp:") !== 0, "key per-canale");
});
t("postazione doppia: 2 cavi separati (1 per musicista), NON un bundle grp", () => {
  reset(); const d = add("vlnpost", 400, 250); d.doppia = true; d.sep = 90; const box = add("stagebox", 700, 500);
  A.state.cab.on = true; A.state.cab.mode = "manual"; A.cabSetItemBox(d, box.id); A.__cabRes = null;
  const bl = A.audioCablingEngine().links.filter((l) => l.s.it.id === d.id);
  eq(bl.length, 2, "2 canali");
  eq(new Set(bl.map((l) => l.key)).size, 2, "2 chiavi distinte (non bundle)");
  ok(bl.every((l) => l.key.indexOf("grp:") !== 0), "nessuna key grp");
  const s0 = bl[0].pts[0], s1 = bl[1].pts[0];
  ok(Math.abs(s0[0] - s1[0]) > 40, "i 2 cavi partono da sedute diverse");
});
t("layer Input: il pallino del musicista è maniglia del cavo, non lo sposta", () => {
  reset();
  const v = add("cantante", 400, 300); v.micMode = "tonda";
  A.state.cab.on = true; A.state.cab.lockIn = false;
  const wasStatic = A.__cabStatic; A.__cabStatic = false;   // nel browser è falsy → editing attivo
  A.layerSoloUI = { cabin: true };
  const mk = A.sectionDotMarkup(v);
  ok(mk.indexOf('class="port-hit"') >= 0 && mk.indexOf('data-port="audio"') >= 0, "il pallino è una maniglia del cavo (port-hit audio)");
  ok(mk.indexOf('class="hit"') < 0, "niente hit di spostamento nel layer Input");
  A.layerSoloUI = {}; A.__cabStatic = wasStatic;
});
t("ascolto per performer: crea/sostituisce/rimuove il monitor collegato", () => {
  reset();
  const v = add("cantante", 400, 300);
  const dir = add("direttore", 200, 300);
  const box = add("stagebox", 700, 500);
  ok(A.ascoltoEligible(v) && A.ascoltoEligible(dir), "cantante e direttore idonei");
  ok(!A.ascoltoEligible(box), "stage box NON idonea");
  // wedge → crea un wedge collegato
  A.setAscolto(v, "wedge");
  let mon = A.state.items.find(x => x.id === v.ascoltoId);
  ok(v.ascolto === "wedge" && mon && mon.type === "wedge", "wedge creato e collegato");
  const firstId = mon.id;
  // cambio → personal mixer: sostituisce (via il wedge, entra hearback)
  A.setAscolto(v, "pm");
  ok(!A.state.items.some(x => x.id === firstId), "il wedge precedente è stato rimosso");
  mon = A.state.items.find(x => x.id === v.ascoltoId);
  ok(v.ascolto === "pm" && mon && mon.type === "hearback", "personal mixer creato al posto del wedge");
  // none → rimuove
  A.setAscolto(v, "none");
  ok(!v.ascolto && !v.ascoltoId, "ascolto azzerato");
  ok(!A.state.items.some(x => x.type === "hearback"), "il personal mixer è stato rimosso");
  // normalize: link orfano si azzera
  A.setAscolto(dir, "iem");
  A.state.items = A.state.items.filter(x => x.id !== dir.ascoltoId);   // cancello il monitor a mano
  const ns = A.normalizeState(A.state); if (ns) A.state = ns;
  const dir2 = A.state.items.find(x => x.type === "direttore");
  ok(!dir2.ascolto && !dir2.ascoltoId, "link orfano azzerato da normalizeState");
});
t("stage box del mixer (foh): esclusa dall'auto, resta target manuale", () => {
  reset();
  const mic = add("astamic", 300, 200);
  const palco = add("stagebox", 500, 250);
  const foh = add("stagebox", 500, 900); foh.foh = true;   // lato regia
  A.state.cab.on = true; A.state.cab.mode = "auto"; A.state.cab.manual = {}; A.__cabRes = null;   // auto puro (senza override dell'auto-connect di addItem)
  let R = A.audioCablingEngine();
  let l = R.links.find(x => x.s.it.id === mic.id);
  ok(l && l.box && l.box.id === palco.id, "auto instrada sul palco, NON sulla box del mixer");
  // senza box palco, l'auto NON usa la foh → sorgente non assegnata (da collegare a mano)
  reset();
  const mic2 = add("astamic", 300, 200);
  const foh2 = add("stagebox", 500, 900); foh2.foh = true;
  A.state.cab.on = true; A.state.cab.mode = "auto"; A.state.cab.manual = {}; A.__cabRes = null;
  R = A.audioCablingEngine();
  ok(!R.links.some(x => x.s.it.id === mic2.id && x.box), "niente auto-connessione sulla box del mixer");
  ok(R.issues.some(i => /mixer/i.test(i.msg)), "avviso che punta alla stage box del mixer");
  // ma il collegamento MANUALE alla foh funziona
  A.state.cab.mode = "manual"; A.cabSetItemBox(mic2, foh2.id); A.__cabRes = null;
  R = A.audioCablingEngine();
  ok(R.links.some(x => x.s.it.id === mic2.id && x.box && x.box.id === foh2.id), "collegamento manuale alla box del mixer OK");
});
t("vln1x2 (×2 dedicata): 2 cavi separati per i 2 musicisti", () => {
  reset(); const v = add("vln1x2", 400, 250); const box = add("stagebox", 700, 500);
  A.state.cab.on = true; A.state.cab.mode = "manual"; A.cabSetItemBox(v, box.id); A.__cabRes = null;
  const bl = A.audioCablingEngine().links.filter((l) => l.s.it.id === v.id);
  eq(bl.length, 2, "2 canali"); eq(new Set(bl.map((l) => l.key)).size, 2, "2 cavi separati");
});

console.log("\nMonitoraggio digitale (monDigEngine):");
t("catena m2->m1->hub: 2 tratte, 0 pending, nessun errore", () => {
  reset(); const m1 = add("hearback", 200, 400); const m2 = add("hearback", 300, 400); const h = add("mixhub", 500, 200);
  A.mondManual(m1.id).to = h.id; A.mondManual(m2.id).to = m1.id; A.__mondRes = null;
  const R = A.monDigEngine(); eq(R.links.length, 2, "tratte"); eq(R.pending.length, 0, "pending");
  ok(!R.issues.some((i) => i.lvl === "err"), "nessun err");
});
t("mixerino senza .to = pending", () => {
  reset(); add("hearback", 200, 400); add("mixhub", 500, 200);
  A.state.mond.manual = {}; A.__mondRes = null;   /* l'aggancio automatico di addItem lo aveva già collegato */
  eq(A.monDigEngine().pending.length, 1);
});
t("loop A<->B = issue di livello err", () => {
  reset(); const a = add("hearback", 200, 400); const b = add("hearback", 300, 400);
  A.mondManual(a.id).to = b.id; A.mondManual(b.id).to = a.id; A.__mondRes = null;
  ok(A.monDigEngine().issues.some((i) => i.lvl === "err"), "err loop");
});

console.log("\nIntegrazione elettrico:");
t("hub = carico elettrico (WATT), mixerino no", () => {
  reset(); const h = add("mixhub", 100, 100); add("hearback", 300, 100); A.state.elec.on = true;
  const loads = A.electricEngine().loads.map((l) => l.it.type);
  ok(loads.indexOf("mixhub") > -1, "hub carico"); ok(loads.indexOf("hearback") === -1, "mixerino non carico");
});
t("itemChannels coerente: batteria 8, corista 1, zona 1", () => {
  reset(); const b = add("batteria", 400, 400); eq(A.itemChannels(b), 8);
  reset(); const c = add("corista", 200, 300); c.micMode = "tonda"; eq(A.itemChannels(c), 1);
  reset(); const z = add("miczone", 300, 300); eq(A.itemChannels(z), 1);
});

console.log("\nLayer Manager (nomi/gruppi):");
t("Layer v3: Ingressi/Output/P.M. separati con occhio/lucchetto/cestino propri", () => {
  reset(); A.state.cab.on = true;
  const by = {}; A.layerRegistry().forEach((L) => { by[L.id] = L; });
  ok(by.cabin && by.cabin.name === "Input", "layer Input");
  ok(by.cabout && by.cabout.name === "Output", "layer Output");
  ok(!by.cabaudio, "il layer unico non esiste piu'");
  by.cabin.setVisible(false);
  ok(A.state.cab.showInputs === false && A.state.rfShow === false && A.state.cab.showNet === false, "occhio Ingressi: cavi input + rete + RF");
  ok(A.state.cab.showReturns !== false, "i ritorni NON sono toccati dall'occhio Ingressi");
  by.cabout.setVisible(false);
  ok(A.state.cab.showReturns === false, "occhio Output: ritorni");
  by.cabin.setLocked(true);
  ok(A.state.cab.lockIn === true && A.state.cab.lockOut !== true, "lucchetto Ingressi non blocca gli Output");
  A.state.cab.manual = { "grp:x": { box: "b1" }, "mix:L:M1": { box: "b1" }, "ret:m1:s1": { pts: [[0, 0]] } };
  by.cabin.remove();
  ok(!A.state.cab.manual["grp:x"] && A.state.cab.manual["mix:L:M1"] && A.state.cab.manual["ret:m1:s1"], "cestino Ingressi azzera solo gli input");
  A.layerRegistry().find((x) => x.id === "cabout").remove();
  eq(Object.keys(A.state.cab.manual).length, 0, "cestino Output azzera mix e ritorni");
});
t("migrate v1→v2: cab.locked unico → lockIn + lockOut", () => {
  const s = A.migrate({ _v: 1, cab: { locked: true, on: true } });
  ok(s.cab.lockIn === true && s.cab.lockOut === true, "locked propagato ai due rami");
  ok(!("locked" in s.cab), "vecchio cab.locked rimosso");
});
t("layer: ordine Ingressi → Output → P.M. → Power → Planimetria", () => {
  reset(); A.state.cab.on = true;
  const ids = A.layerRegistry().map((L) => L.id);
  ok(ids.indexOf("cabin") > -1 && ids.indexOf("cabout") > ids.indexOf("cabin"), "Ingressi poi Output");
  ok(ids.indexOf("mond") > ids.indexOf("cabout"), "poi P.M.");
  ok(ids.indexOf("mond") < ids.indexOf("elec"), "P.M. < Power");
  ok(ids.indexOf("elec") < ids.indexOf("venue"), "Power < Planimetria");
});

console.log("\nCatalogo — strumenti sempre visibili (niente 'Mostra tutti'):");
t("ogni strumento (categoria Strumenti) è essenziale", () => {
  ["oboe", "fagotto", "tuba", "saxbaritono", "timpani", "grancassa", "arpa", "celesta", "vibrafono", "marimba", "pianoverticale"]
    .forEach((k) => { ok(A.catOf(k) === "Strumenti", k + " deve essere in Strumenti"); ok(A.isEss(k), k + " deve essere essenziale"); });
});
t("il filtro 'Mostra tutti' resta per gli accessori (non-Strumenti)", () => {
  ok(!A.isEss("truss40"), "truss40 (Allestimento) NON essenziale"); ok(!A.isEss("gazebo33"), "gazebo (Allestimento) NON essenziale");
});

console.log("\nVersioning documento (schema_version + migrate, R-ORA-1):");
t("migrate: blob senza _v = v1 (identità), non perde dati", () => {
  const s = A.migrate({ items: [{ id: "a" }], titolo: "x", cab: { on: true } });
  eq(s.titolo, "x"); eq(s.items.length, 1); eq(s.cab.on, true);
  ok(!("_v" in s), "_v non deve restare nello state runtime");
});
t("migrate: _v alla versione corrente è identità e viene consumato", () => {
  const s = A.migrate({ _v: A.SCHEMA_VERSION, items: [], elec: { on: true } });
  ok(!("_v" in s), "_v rimosso al load"); eq(s.elec.on, true);
});
t("stateToJSON marca il documento con _v = SCHEMA_VERSION", () => {
  reset();
  const blob = JSON.parse(A.stateToJSON());
  ok(typeof blob._v === "number" && blob._v >= 1, "il blob salvato deve portare la versione"); eq(blob._v, A.SCHEMA_VERSION);
});
t("round-trip salva→carica: _v consumato, items conservati", () => {
  reset(); A.state.items = [{ id: "z", type: "cantante", x: 10, y: 10 }];
  const back = A.normalizeState(JSON.parse(A.stateToJSON()));
  ok(!("_v" in back), "_v consumato al load"); eq(back.items[0].id, "z");
});
t("loadDoc→save→load conserva campi tecnici, relazioni e campi additivi", () => {
  const richItems = [
    { id: "rack-a", type: "rack", x: 100, y: 120, w: 60, d: 50, rackU: 18, rackFn: "rf" },
    { id: "sb-a", type: "stagebox", x: 100, y: 120, w: 58, d: 46, hw: "rio3224d2",
      sbId: 7, sbRes: [2, 4], sbTo: "main", foh: true, rackId: "rack-a", rackPos: 0, rackUh: 3 },
    { id: "mon-a", type: "wedge", x: 220, y: 180, w: 60, d: 52 },
    { id: "rx-a", type: "rxrf", x: 260, y: 180, w: 48, d: 36, hw: "ewdxem2", rxN: 2, band: "R1-9" },
    { id: "voice-a", type: "wireless", x: 300, y: 220, w: 18, d: 32, ascolto: "wedge",
      ascoltoId: "mon-a", rxId: "rx-a", rxCh: 2, rf: "550.125", band: "R1-9", ownMic: false },
    { id: "hub-a", type: "mixhub", x: 360, y: 220, w: 60, d: 34, pm: "p16d",
      pmFeed: "dante", pmFeedCh: 32 },
    { id: "net-a", type: "netswitch", x: 430, y: 220, w: 46, d: 30, swPorts: 24 },
    { id: "power-a", type: "ciabatta", x: 500, y: 220, w: 44, d: 17, prese: 12 },
    { id: "zone-a", type: "miczone", x: 560, y: 260, w: 220, d: 150, zcol: "#2563eb",
      micPos: [12, -7], safeDesc: "Carico sospeso", safeCap: "250 kg", safeNote: "Verifica tecnica" },
    { id: "laptop-a", type: "laptop", x: 650, y: 260, w: 44, d: 34, uso: "playback_audio",
      by: "Band", modelId: "fixture-model",
      modelData: { brand: { value: "Fixture" }, model: { value: "Offline" } },
      modelOverride: { powerConsumption_W: { value: 65, unit_orig: "W" } },
      futureExtension: { revision: 3, flags: ["keep"] } },
  ];
  const doc = { _doc: 1, active: "vA", variants: [
    { id: "vA", name: "Piena", state: { titolo: "Rich", items: richItems, inputs: [], outputs: [],
      buses: [{ id: "bus-a", name: "Monitor", kind: "aux", boxId: "sb-a", port: 2 }] } },
    { id: "vB", name: "Ridotta", state: { titolo: "Ridotta", items: [
      { id: "sb-b", type: "stagebox", x: 90, y: 90, w: 58, d: 46, hw: "dx168", sbId: 3, foh: true },
    ], inputs: [], outputs: [] } },
  ] };
  const assertActiveRich = () => {
    const by = Object.fromEntries(A.state.items.map((it) => [it.id, it]));
    eq({ hw: by["sb-a"].hw, sbId: by["sb-a"].sbId, sbRes: by["sb-a"].sbRes, sbTo: by["sb-a"].sbTo,
      foh: by["sb-a"].foh, rackId: by["sb-a"].rackId, rackPos: by["sb-a"].rackPos, rackUh: by["sb-a"].rackUh },
      { hw: "rio3224d2", sbId: 7, sbRes: [2, 4], sbTo: "main", foh: true, rackId: "rack-a", rackPos: 0, rackUh: 3 },
      "stagebox/rack");
    eq({ rackU: by["rack-a"].rackU, rackFn: by["rack-a"].rackFn }, { rackU: 18, rackFn: "rf" }, "rack");
    eq({ ascolto: by["voice-a"].ascolto, ascoltoId: by["voice-a"].ascoltoId, rxId: by["voice-a"].rxId,
      rxCh: by["voice-a"].rxCh, rf: by["voice-a"].rf, band: by["voice-a"].band, ownMic: by["voice-a"].ownMic },
      { ascolto: "wedge", ascoltoId: "mon-a", rxId: "rx-a", rxCh: 2, rf: "550.125", band: "R1-9", ownMic: false },
      "ascolto/RF");
    eq({ pm: by["hub-a"].pm, pmFeed: by["hub-a"].pmFeed, pmFeedCh: by["hub-a"].pmFeedCh },
      { pm: "p16d", pmFeed: "dante", pmFeedCh: 32 }, "personal monitor");
    eq(by["net-a"].swPorts, 24, "porte switch"); eq(by["power-a"].prese, 12, "prese");
    eq({ zcol: by["zone-a"].zcol, micPos: by["zone-a"].micPos, safeDesc: by["zone-a"].safeDesc,
      safeCap: by["zone-a"].safeCap, safeNote: by["zone-a"].safeNote },
      { zcol: "#2563eb", micPos: [12, -7], safeDesc: "Carico sospeso", safeCap: "250 kg", safeNote: "Verifica tecnica" },
      "zona/safety");
    eq({ uso: by["laptop-a"].uso, by: by["laptop-a"].by, modelId: by["laptop-a"].modelId,
      modelData: by["laptop-a"].modelData, modelOverride: by["laptop-a"].modelOverride,
      futureExtension: by["laptop-a"].futureExtension },
      { uso: "playback_audio", by: "Band", modelId: "fixture-model",
        modelData: { brand: { value: "Fixture" }, model: { value: "Offline" } },
        modelOverride: { powerConsumption_W: { value: 65, unit_orig: "W" } },
        futureExtension: { revision: 3, flags: ["keep"] } },
      "modello/campi additivi");
    eq(A.state.buses[0].boxId, "sb-a", "relazione bus→stagebox");
  };
  A.loadDoc(JSON.parse(JSON.stringify(doc))); assertActiveRich();
  A.loadDoc(JSON.parse(A.docToJSON())); assertActiveRich();
  A.switchVariant("vB");
  const sbB = A.state.items.find((it) => it.id === "sb-b");
  eq({ hw: sbB.hw, sbId: sbB.sbId, foh: sbB.foh }, { hw: "dx168", sbId: 3, foh: true },
    "campi tecnici variante inattiva");
});
t("Input/Output List restano intatte in tutte le varianti anche fuori dalla consulenza", () => {
  const oldConsult = A.__consultMode;
  const before = A.docToJSON();
  A.__consultMode = false;
  try {
    A.loadDoc({ _doc: 1, active: "one", variants: [
      { id: "one", name: "Uno", state: { _v: A.SCHEMA_VERSION, items: [
        { id: "voice", type: "cantante" }, { id: "mon", type: "wedge" },
      ], inputs: [{ src: "Voce", linked_item_id: "voice", notes: "keep-in" }],
      outputs: [{ src: "Mix 1", linked_item_id: "mon", notes: "keep-out" }] } },
      { id: "two", name: "Due", state: { _v: A.SCHEMA_VERSION, items: [{ id: "di", type: "dimono" }],
        inputs: [{ src: "DI", linked_item_id: "di" }], outputs: [{ src: "Spare" }] } },
    ] });
    const saved = JSON.parse(A.docToJSON());
    const one = saved.variants.find((v) => v.id === "one").state;
    const two = saved.variants.find((v) => v.id === "two").state;
    eq([one.inputs.length, one.outputs.length, two.inputs.length, two.outputs.length], [1, 1, 1, 1]);
    eq([one.inputs[0].linked_item_id, one.outputs[0].linked_item_id, two.inputs[0].linked_item_id],
      ["voice", "mon", "di"], "relazioni delle liste preservate");
  } finally {
    A.__consultMode = oldConsult;
    A.loadDoc(JSON.parse(before));
  }
});
t("campi additivi al root del documento sopravvivono a load/save/load", () => {
  const before = A.docToJSON();
  try {
    A.loadDoc({ _doc: 1, active: "r1", futureRootMeta: { revision: 7, flags: ["keep"] }, variants: [
      { id: "r1", name: "Root", state: { _v: A.SCHEMA_VERSION, titolo: "Root", items: [], inputs: [], outputs: [] } },
    ] });
    let saved = JSON.parse(A.docToJSON());
    eq(saved.futureRootMeta, { revision: 7, flags: ["keep"] }, "extra root serializzato");
    A.loadDoc(saved); saved = JSON.parse(A.docToJSON());
    eq(saved.futureRootMeta, { revision: 7, flags: ["keep"] }, "extra root preservato al secondo load");
  } finally { A.loadDoc(JSON.parse(before)); }
});
t("sanitizeItems scarta tipi ereditati dal prototype senza eccezioni", () => {
  ["constructor", "__proto__", "toString"].forEach((type) => {
    eq(A.sanitizeItems([{ id: "bad-" + type, type, x: 0, y: 0 }]), [], type);
  });
});
t("normalizeState conserva il backfill dimensionale di elementi componibili e doppi legacy", () => {
  const legacy = A.normalizeState({ items: [
    { id: "kit", type: "batteria", x: 10, y: 20,
      parts: { toms: 3, floor: true, hihat: true, crash: 2, ride: true, kick2: true, mus: true, stool: true } },
    { id: "duo", type: "vln1x2", x: 30, y: 40, sep: 120 },
  ], inputs: [], outputs: [] });
  const kit = legacy.items.find((it) => it.id === "kit");
  const duo = legacy.items.find((it) => it.id === "duo");
  eq([kit.w, kit.d], A.sizeBatteria(kit), "dimensioni kit derivate dai pezzi");
  eq([duo.w, duo.d], [A.sepToW(A.DOUBLE_TYPES.vln1x2, 120), A.DOUBLE_TYPES.vln1x2.dbl[1]],
    "dimensioni doppia derivate dalla separazione");
});
t("ID numerici legacy mantengono tutte le relazioni dopo la canonicalizzazione", () => {
  const oldConsult = A.__consultMode;
  A.__consultMode = true;
  try {
    const s = A.normalizeState({ _v: A.SCHEMA_VERSION, items: [
      { id: 1, type: "rack", rackU: 12 },
      { id: 2, type: "stagebox", rackId: 1, rackPos: 0 },
      { id: 3, type: "wedge" },
      { id: 4, type: "rxrf" },
      { id: 5, type: "wireless", ascolto: "wedge", ascoltoId: 3, rxId: 4, rxCh: 1 },
      { id: 6, type: "pedana" },
      { id: 7, type: "sedia", distOf: 6 },
      { id: 8, type: "ciabatta" },
      { id: 9, type: "quadro" },
      { id: 10, type: "hearback" },
      { id: 11, type: "mixhub" },
      { id: 12, type: "stagebox", sbTo: 2 },
    ], buses: [{ id: "bus", name: "Main", kind: "st", boxId: 2, port: 1 }],
      inputs: [{ src: "Voce", linked_item_id: 5 }], outputs: [{ src: "Mix", linked_item_id: 3 }],
      cab: { on: true, manual: { "5#0": { box: 2 } } },
      elec: { on: true, manual: { 7: { distro: 8 } }, uplinks: { 8: { to: 9 } } },
      mond: { on: true, manual: { 10: { to: 11 } } } });
    const by = Object.fromEntries(s.items.map((it) => [it.id, it]));
    eq(s.items.map((it) => it.id), ["1","2","3","4","5","6","7","8","9","10","11","12"], "ID canonici");
    eq({ rackId: by["2"].rackId, ascoltoId: by["5"].ascoltoId, rxId: by["5"].rxId,
      distOf: by["7"].distOf, sbTo: by["12"].sbTo },
      { rackId: "1", ascoltoId: "3", rxId: "4", distOf: "6", sbTo: "2" }, "relazioni item");
    eq({ bus: s.buses[0].boxId, cab: s.cab.manual["5#0"].box,
      distro: s.elec.manual["7"].distro, up: s.elec.uplinks["8"].to, mond: s.mond.manual["10"].to,
      input: s.inputs[0].linked_item_id, output: s.outputs[0].linked_item_id },
      { bus: "2", cab: "2", distro: "8", up: "9", mond: "11", input: "5", output: "3" },
      "grafi tecnici");
  } finally {
    A.__consultMode = oldConsult;
  }
});
t("ID di 80 caratteri e chiavi di routing composte non vengono troncati", () => {
  const src = "s".repeat(80), box = "b".repeat(80), load = "l".repeat(80);
  const s = A.normalizeState({ _v: A.SCHEMA_VERSION, items: [
    { id: src, type: "cantante" }, { id: box, type: "stagebox" },
    { id: load, type: "sedia" }, { id: "d".repeat(80), type: "ciabatta" },
    { id: "q".repeat(80), type: "quadro" },
  ], inputs: [], outputs: [],
  cab: { on: true, manual: { [src + "#0"]: { box } } },
  elec: { on: true, manual: { [load]: { distro: "d".repeat(80) }, [src]: "d".repeat(80) },
    uplinks: { ["d".repeat(80)]: { to: "q".repeat(80) } } } });
  ok(Object.prototype.hasOwnProperty.call(s.cab.manual, src + "#0"), "chiave cavo composta completa");
  eq(s.cab.manual[src + "#0"].box, box, "target stagebox completo");
  ok(Object.prototype.hasOwnProperty.call(s.elec.manual, load), "chiave carico completa");
  eq(s.elec.manual[load].distro, "d".repeat(80), "target distro completo");
  eq(s.elec.manual[src].distro, "d".repeat(80), "target distro legacy stringa completo");
  eq(s.elec.uplinks["d".repeat(80)].to, "q".repeat(80), "uplink completo");
});
t("documenti futuri, tipi ignoti e liste non valide sono rifiutati senza commit parziale", () => {
  reset();
  A.loadDoc({ _v: A.SCHEMA_VERSION, items: [{ id: "stable", type: "cantante" }], inputs: [], outputs: [] });
  const beforeState = A.state;
  const beforeDoc = A.docToJSON();
  throws(() => A.loadDoc({ _v: A.SCHEMA_VERSION + 1, items: [{ id: "future", type: "cantante" }] }), "FUTURE_SCHEMA");
  ok(A.state === beforeState, "schema futuro non sostituisce lo state");
  eq(A.docToJSON(), beforeDoc, "schema futuro non altera il documento");
  throws(() => A.loadDoc({ _doc: 2, active: "v", variants: [
    { id: "v", state: { _v: A.SCHEMA_VERSION, items: [] } },
  ] }), "FUTURE_DOCUMENT");
  throws(() => A.loadDoc({ _doc: 1, _v: A.SCHEMA_VERSION + 1, active: "v", variants: [
    { id: "v", state: { _v: A.SCHEMA_VERSION, items: [] } },
  ] }), "FUTURE_SCHEMA");
  throws(() => A.loadDoc({ _v: A.SCHEMA_VERSION, items: [{ id: "future", type: "tipo_futuro" }] }), "UNKNOWN_ITEM_TYPE");
  throws(() => A.loadDoc({ _v: A.SCHEMA_VERSION, items: {} }), "INVALID_ITEMS");
  throws(() => A.loadDoc({ _doc: 1, active: "ok", variants: [
    { id: "ok", name: "OK", state: { _v: A.SCHEMA_VERSION, items: [{ id: "kept", type: "cantante" }] } },
    { id: "bad", name: "Future", state: { _v: A.SCHEMA_VERSION + 1, items: [] } },
  ] }), "FUTURE_SCHEMA");
  ok(A.state === beforeState, "variante inattiva invalida non produce commit parziale");
  eq(A.docToJSON(), beforeDoc, "documento invariato dopo tutti i rifiuti");
});
t("ID duplicati / non-safe vengono riassegnati (niente lockout) e restano sicuri e unici", () => {
  reset();
  // id da injection, duplicati, chiavi pericolose e vuoti: il documento DEVE aprirsi, non bloccarsi
  A.loadDoc({ _v: A.SCHEMA_VERSION, items: [
    { id: 'x" data-extra="1', type: "cantante", label: "A" },
    { id: "dup", type: "cantante", label: "B" },
    { id: "dup", type: "wedge", label: "C" },
    { id: "toString", type: "cantante", label: "D" },
    { id: "__proto__", type: "cantante", label: "E" },
    { id: "", type: "cantante", label: "F" },
  ] });
  const items = A.state.items;
  eq(items.length, 6, "tutti gli elementi conservati: nessun lockout, nessuna perdita");
  const ids = items.map((it) => it.id);
  ok(ids.every((id) => A.safeItemId(id)), "tutti gli id sono sicuri dopo la riparazione");
  eq(new Set(ids).size, 6, "tutti gli id sono unici");
  ok(!ids.some((id) => /["'<>]/.test(id)), "nessun id sopravvive con caratteri da injection");
  eq(items.map((it) => it.label).join(""), "ABCDEF", "i dati degli elementi restano intatti e nell'ordine originale");
});
t("boot con documento futuro sospende ogni persistenza e non riaggancia il progetto cloud", () => {
  const oldStorage = A.localStorage;
  const oldCloud = A.__cloud;
  const oldDocument = A.document;
  const oldConsult = A.__consultMode;
  const oldBlocked = A.__docLoadBlocked;
  const oldBootCloudId = A.__bootCloudId;
  const oldBootCloudRev = A.__bootCloudRev;
  const oldBootCloudMeta = A.__bootCloudMeta;
  const oldUnavailable = A.__localStorageUnavailable;
  const beforeState = A.state;
  const beforeDoc = A.docToJSON();
  const reads = [], writes = [], removals = [];
  let cloudSaves = 0;
  A.localStorage = {
    getItem: (key) => {
      reads.push(key);
      if (key === A.LS_KEY) return JSON.stringify({
        _v: A.SCHEMA_VERSION + 1,
        items: [{ id: "future", type: "cantante" }],
        inputs: [],
        outputs: [],
      });
      if (key === A.LS_KEY + "_cloudid") return "cloud-project-existing";
      return null;
    },
    setItem: (key, value) => writes.push([key, value]),
    removeItem: (key) => removals.push(key),
  };
  A.__consultMode = false;
  A.document = { body: { classList: { contains: () => false } }, getElementById: () => null };
  A.__cloud = { user: () => ({ id: "u" }), save: () => { cloudSaves++; }, currentId: () => "cloud-project-existing" };
  try {
    A.load();
    eq(A.__docLoadBlocked.code, "FUTURE_SCHEMA", "motivo del blocco");
    eq(A.__bootCloudId, null, "il cloud ID non viene adottato");
    ok(!reads.includes(A.LS_KEY + "_cloudid"), "nessuna lettura dell'associazione cloud durante il blocco");
    ok(A.state === beforeState && A.docToJSON() === beforeDoc, "il documento runtime resta intatto");
    A.persistLocalState();
    A.persistVenueImg();
    A.cloudAutosaveNow();
    eq({ writes: writes.length, removals: removals.length, cloudSaves },
      { writes: 0, removals: 0, cloudSaves: 0 },
      "nessuna sovrascrittura locale, rimozione o scrittura cloud");
  } finally {
    A.localStorage = oldStorage;
    A.__cloud = oldCloud;
    A.document = oldDocument;
    A.__consultMode = oldConsult;
    A.__docLoadBlocked = oldBlocked;
    A.__bootCloudId = oldBootCloudId;
    A.__bootCloudRev = oldBootCloudRev;
    A.__bootCloudMeta = oldBootCloudMeta;
    A.__localStorageUnavailable = oldUnavailable;
  }
});
t("persistenza locale: documento e binding cloud sono un unico commit; nessun ID se il blob fallisce", () => {
  const oldStorage = A.localStorage, oldCloud = A.__cloud, oldDocument = A.document, oldConsult = A.__consultMode;
  const oldUnavailable = A.__localStorageUnavailable;
  const writes = [];
  A.__consultMode = false;
  A.document = { body: { classList: { contains: () => false } }, getElementById: () => null };
  A.__cloud = { currentId: () => "project-B", currentRev: () => "rev-B", user: () => ({ id: "u" }) };
  try {
    A.localStorage = {
      getItem: () => null,
      setItem: (key, value) => { writes.push([key, value]); if (key === A.LS_KEY) throw new Error("quota"); },
      removeItem: (key) => writes.push([key, null]),
    };
    eq(A.persistLocalState(), false, "il commit documento fallisce esplicitamente");
    ok(!writes.some(([key]) => key === A.LS_KEY + "_cloudid"), "binding separato mai scritto dopo il fallimento");

    writes.length = 0;
    A.localStorage = {
      getItem: () => null,
      setItem: (key, value) => writes.push([key, value]),
      removeItem: (key) => writes.push([key, null]),
    };
    eq(A.persistLocalState(), true, "commit riuscito");
    const rootWrite = writes.find(([key]) => key === A.LS_KEY);
    ok(rootWrite, "documento scritto");
    const meta = JSON.parse(rootWrite[1])._local;
    eq({ cloudId: meta.cloudId, cloudRev: meta.cloudRev, venueSig: meta.venueSig,
      venueKey: meta.venueKey, venueUnavailable: meta.venueUnavailable },
      { cloudId: "project-B", cloudRev: "rev-B", venueSig: "", venueKey: null, venueUnavailable: false },
      "binding cloud e riferimento planimetria incorporati atomicamente");
    ok(typeof meta.contentSig === "string" && meta.contentSig.length > 0, "firma contenuto persistita");
    ok(typeof meta.localRevision === "string" && meta.localRevision.length > 0, "revisione locale persistita");
    eq(meta.cloudPending, true, "documento cloud nuovo resta marcato come da sincronizzare");
  } finally {
    A.localStorage = oldStorage; A.__cloud = oldCloud; A.document = oldDocument; A.__consultMode = oldConsult;
    A.__localStorageUnavailable = oldUnavailable;
  }
});
t("quota planimetria non committa un root che renda irraggiungibile l'ultima copia completa", () => {
  const before = A.docToJSON(), oldStorage = A.localStorage, oldCloud = A.__cloud, oldDocument = A.document;
  const oldConflict = A.__localConflict, oldUnavailable = A.__localStorageUnavailable;
  const oldBootVenueUnavailable = A.__bootVenueUnavailable;
  const oldPersistedSig = A.venuePersistedSig, oldPersistedKey = A.venuePersistedKey;
  const oldStageFailedSig = A.venueStageFailedSig, oldExpectedRevision = A.localExpectedRevision;
  const oldStorageIdentity = A.localStorageIdentity;
  const store = new Map();
  let rejectNewVenueAsset = false;
  try {
    A.localStorage = {
      getItem: (key) => store.has(key) ? store.get(key) : null,
      setItem: (key, value) => {
        if (rejectNewVenueAsset && key.startsWith(A.LS_KEY_VENUE + ".")) {
          const error = new Error("quota");
          error.name = "QuotaExceededError";
          throw error;
        }
        store.set(key, value);
      },
      removeItem: (key) => store.delete(key),
    };
    A.__cloud = { currentId: () => null, currentRev: () => null, user: () => null };
    A.document = { body: { classList: { contains: () => false } }, getElementById: () => null };
    A.__localConflict = false; A.__localStorageUnavailable = false; A.__bootVenueUnavailable = false;
    A.venuePersistedSig = null; A.venuePersistedKey = null; A.venueStageFailedSig = null;
    A.localExpectedRevision = null; A.localStorageIdentity = oldStorageIdentity;
    A.loadDoc({ _v: A.SCHEMA_VERSION, venue: {
      name: "A.png", _dataUrl: "data:image/png;base64,QUFB", _imgW: 100, _imgH: 80,
      x: 0, y: 0, w: 100, h: 80,
    }, items: [], inputs: [], outputs: [] });
    eq(A.persistLocalState(), true, "prima coppia root+asset salvata");
    const durableRoot = store.get(A.LS_KEY);
    const durableKeys = [...store.keys()].filter((key) => key.startsWith(A.LS_KEY_VENUE + "."));
    eq(durableKeys.length, 1, "asset A presente");

    A.state.venue = {
      name: "B.png", _dataUrl: "data:image/png;base64,QkJC", _imgW: 120, _imgH: 90,
      x: 0, y: 0, w: 120, h: 90,
    };
    rejectNewVenueAsset = true;
    eq(A.persistLocalState(), false, "quota della nuova bitmap fallisce chiusa");
    eq(store.get(A.LS_KEY), durableRoot, "il root autorevole resta quello associato alla bitmap A");
    eq([...store.keys()].filter((key) => key.startsWith(A.LS_KEY_VENUE + ".")), durableKeys,
      "l'asset durevole precedente non viene eliminato");
  } finally {
    A.localStorage = oldStorage; A.__cloud = oldCloud; A.document = oldDocument;
    A.__localConflict = oldConflict; A.__localStorageUnavailable = oldUnavailable;
    A.__bootVenueUnavailable = oldBootVenueUnavailable;
    A.venuePersistedSig = oldPersistedSig; A.venuePersistedKey = oldPersistedKey;
    A.venueStageFailedSig = oldStageFailedSig; A.localExpectedRevision = oldExpectedRevision;
    A.localStorageIdentity = oldStorageIdentity;
    A.loadDoc(JSON.parse(before));
  }
});
/* PUNTO DI RECUPERO E PLANIMETRIE PESANTI (bug in produzione 03/08/2026).
   Simone non riusciva più ad aprire NESSUN progetto: «Impossibile creare il punto di recupero.»
   Il documento aperto aveva una planimetria PNG da 8,3 MB già in localStorage; il recovery la
   RIDUPLICAVA dentro la riga della versione (docToJSONFull) e la quota, ormai piena, rifiutava la
   scrittura. Il salvataggio manuale della stessa versione costava 15 KB, perché punta al blob. */
function withVenueStore(A, cap, body) {
  const before = A.docToJSON();
  const old = {
    storage: A.localStorage, cloud: A.__cloud, document: A.document, consult: A.__consultMode,
    conflict: A.__localConflict, unavailable: A.__localStorageUnavailable,
    bootVenue: A.__bootVenueUnavailable, persistedSig: A.venuePersistedSig,
    persistedKey: A.venuePersistedKey, stageFailed: A.venueStageFailedSig,
    expectedRevision: A.localExpectedRevision, blocked: A.__docLoadBlocked,
  };
  const store = new Map();
  const size = () => [...store.entries()].reduce((n, [k, v]) => n + k.length + String(v).length, 0);
  const writes = [];
  try {
    A.localStorage = {
      get length() { return store.size; },
      key: (i) => [...store.keys()][i] ?? null,
      getItem: (key) => (store.has(key) ? store.get(key) : null),
      setItem: (key, value) => {
        writes.push([key, String(value).length]);
        const grown = size() - (store.has(key) ? key.length + String(store.get(key)).length : 0)
          + key.length + String(value).length;
        if (grown > cap) { const e = new Error("quota"); e.name = "QuotaExceededError"; throw e; }
        store.set(key, String(value));
      },
      removeItem: (key) => store.delete(key),
    };
    A.__cloud = { currentId: () => "prj-noale", currentRev: () => "rev-1", user: () => null };
    A.document = { body: { classList: { contains: () => false } }, getElementById: () => null };
    A.__consultMode = false; A.__localConflict = false; A.__localStorageUnavailable = false;
    A.__bootVenueUnavailable = false; A.__docLoadBlocked = null;
    A.venuePersistedSig = null; A.venuePersistedKey = null; A.venueStageFailedSig = null;
    A.localExpectedRevision = null;
    return body({ store, writes, size });
  } finally {
    A.localStorage = old.storage; A.__cloud = old.cloud; A.document = old.document;
    A.__consultMode = old.consult; A.__localConflict = old.conflict;
    A.__localStorageUnavailable = old.unavailable; A.__bootVenueUnavailable = old.bootVenue;
    A.venuePersistedSig = old.persistedSig; A.venuePersistedKey = old.persistedKey;
    A.venueStageFailedSig = old.stageFailed; A.localExpectedRevision = old.expectedRevision;
    A.__docLoadBlocked = old.blocked;
    A.loadDoc(JSON.parse(before));
  }
}
/* planimetria "pesante": base64 finto ma della stessa scala del caso reale, in proporzione al cap */
function heavyVenue(kb) {
  return { name: "planimetria.png", _dataUrl: "data:image/png;base64," + "Q".repeat(kb * 1024),
    _imgW: 1476, _imgH: 1190, x: 0, y: 0, w: 10072, h: 8121 };
}
t("punto di recupero: la planimetria già in archivio si referenzia, non si riduplica", () => {
  withVenueStore(A, 200 * 1024, ({ store }) => {
    A.loadDoc({ _v: A.SCHEMA_VERSION, titolo: "noale morricone", venue: heavyVenue(150),
      items: [{ id: "a", type: "cantante" }], inputs: [], outputs: [] });
    eq(A.persistLocalState(), true, "documento e planimetria persistiti");
    const venueKeys = [...store.keys()].filter((k) => k.startsWith(A.LS_KEY_VENUE + "."));
    eq(venueKeys.length, 1, "un solo blob planimetria in archivio");

    /* lo spazio residuo non basta a una SECONDA copia dell'immagine: è il caso di Simone */
    eq(A.saveVersion("Prima di aprire un progetto", true), true,
      "il punto di recupero riesce comunque");
    const rows = JSON.parse(store.get(A.VER_KEY) || "[]");
    eq(rows.length, 1, "la versione è stata scritta");
    eq(rows[0].venueKey, venueKeys[0], "punta al blob esistente");
    ok(String(rows[0].data).indexOf("_dataUrl") < 0, "nessuna copia della bitmap dentro la riga");
    ok(String(rows[0].data).length < 40 * 1024, "la riga resta piccola (era ~la dimensione dell'immagine)");
  });
});
t("punto di recupero: se l'archivio è pieno, pota le versioni vecchie e ritenta", () => {
  withVenueStore(A, 210 * 1024, ({ store }) => {
    A.loadDoc({ _v: A.SCHEMA_VERSION, titolo: "pieno", items: [{ id: "a", type: "cantante" }],
      inputs: [], outputs: [] });
    /* 30 versioni vecchie ingombranti già in archivio, come nel caso reale: da sole superano il cap */
    const zavorra = [];
    for (let i = 0; i < 30; i++) zavorra.push({ name: "Versione " + i, date: 1000 + i, data: JSON.stringify({ _doc: 1, pad: "z".repeat(8 * 1024) }) });
    store.set(A.VER_KEY, JSON.stringify(zavorra));
    eq(A.saveVersion("Prima di aprire un progetto", true), true,
      "il recupero riesce facendo spazio");
    const rows = JSON.parse(store.get(A.VER_KEY) || "[]");
    eq(rows[0].name, "Prima di aprire un progetto", "il recupero è la riga più recente");
    ok(rows.length < 31, "qualche versione vecchia è stata sacrificata");
    ok(rows.length > 1, "non è stato buttato tutto lo storico");
  });
});
t("punto di recupero: senza blob referenziabile resta autosufficiente", () => {
  withVenueStore(A, 4 * 1024 * 1024, ({ store }) => {
    const oldConsult = A.__consultMode;
    A.loadDoc({ _v: A.SCHEMA_VERSION, titolo: "consulenza", venue: heavyVenue(20),
      items: [{ id: "a", type: "cantante" }], inputs: [], outputs: [] });
    try {
      A.__consultMode = true;   /* foreignDoc(): stageVenueImg() non scrive nulla in locale */
      eq(A.saveVersion("Recupero consulenza", true), true, "il recupero riesce");
      const rows = JSON.parse(store.get(A.VER_KEY) || "[]");
      ok(!rows[0].venueKey, "nessun riferimento a un blob che non esiste");
      ok(String(rows[0].data).indexOf("_dataUrl") >= 0, "la bitmap viaggia dentro la riga");
    } finally { A.__consultMode = oldConsult; }
  });
});
/* PLANIMETRIE PESANTI E BLOB ORFANI — le due cause a monte del blocco del 03/08/2026.
   (a) la ricompressione scattava solo sopra i 2000 px di lato: una scansione 1476×1190 da 8,3 MB
       passava intatta, perché il PESO non veniva mai guardato;
   (b) i blob della planimetria non venivano MAI rimossi: cambiando immagine se ne accumulava una
       nuova da megabyte e la vecchia restava in archivio per sempre. */
t("planimetria: si ricomprime per PESO, non solo per numero di pixel", () => {
  const b64 = (kb) => "data:image/png;base64," + "Q".repeat(Math.round(kb * 1024 * 4 / 3));
  ok(A.venueDataUrlBytes(b64(100)) > 95 * 1024 && A.venueDataUrlBytes(b64(100)) < 105 * 1024,
    "il peso di un data URL è stimato dai byte reali, non dai caratteri");
  eq(A.venueNeedsCompression(b64(8300), 1476, 1190), true,
    "la scansione di Simone: piccola di lato, enorme di peso");
  eq(A.venueNeedsCompression(b64(40), 1476, 1190), false, "una planimetria leggera si lascia stare");
  eq(A.venueNeedsCompression(b64(40), 4000, 2500), true, "restano fuori scala anche i lati enormi");
});
t("planimetria: fra i candidati vince il più piccolo, e mai uno peggiore dell'originale", () => {
  const orig = { durl: "data:image/png;base64," + "Q".repeat(4000), w: 1476, h: 1190 };
  const origBytes = A.venueDataUrlBytes(orig.durl);
  const piccolo = { durl: "data:image/webp;base64," + "Q".repeat(400), w: 1476, h: 1190 };
  const medio = { durl: "data:image/jpeg;base64," + "Q".repeat(1200), w: 1476, h: 1190 };
  eq(A.venuePickSmallest([medio, piccolo], origBytes).durl, piccolo.durl, "vince il più leggero");
  eq(A.venuePickSmallest([], origBytes), null, "nessun candidato: si tiene l'originale");
  const grasso = { durl: "data:image/webp;base64," + "Q".repeat(9000), w: 1476, h: 1190 };
  eq(A.venuePickSmallest([grasso], origBytes), null, "un candidato più pesante non sostituisce nulla");
  const appena = { durl: "data:image/webp;base64," + "Q".repeat(3700), w: 1476, h: 1190 };
  eq(A.venuePickSmallest([appena], origBytes), null,
    "guadagno irrisorio: non vale la perdita di qualità");
});
t("planimetrie orfane: si rimuove solo ciò che nessuno referenzia più", () => {
  const K = A.LS_KEY_VENUE;
  const tutte = [K + ".aaa_1", K + ".bbb_2", K + ".ccc_3", K, "stageplot_v1", "stageplot_versions"];
  eq(A.orphanVenueKeys(tutte, [K + ".bbb_2"]), [K + ".aaa_1", K + ".ccc_3"],
    "orfani solo i blob indirizzati per contenuto e non referenziati");
  eq(A.orphanVenueKeys(tutte, []).indexOf(K), -1, "la chiave legacy senza suffisso non si tocca mai");
  eq(A.orphanVenueKeys(tutte, []).indexOf("stageplot_v1"), -1, "il documento non si tocca mai");
});
t("pulizia planimetrie: tiene quella in uso e quelle delle versioni salvate", () => {
  withVenueStore(A, 4 * 1024 * 1024, ({ store }) => {
    A.loadDoc({ _v: A.SCHEMA_VERSION, titolo: "con planimetria", venue: heavyVenue(20),
      items: [{ id: "a", type: "cantante" }], inputs: [], outputs: [] });
    eq(A.persistLocalState(), true, "documento e planimetria in archivio");
    const inUso = [...store.keys()].filter((k) => k.startsWith(A.LS_KEY_VENUE + "."))[0];
    ok(inUso, "il blob in uso esiste");
    eq(A.saveVersion("Una versione"), true, "una versione salvata punta a quel blob");

    /* due blob di planimetrie sostituite in passato, che nessuno referenzia più */
    store.set(A.LS_KEY_VENUE + ".vecchia1_9", "{\"_venueDoc\":2,\"assets\":{}}");
    store.set(A.LS_KEY_VENUE + ".vecchia2_9", "{\"_venueDoc\":2,\"assets\":{}}");
    eq(A.sweepVenueBlobs(), 2, "due orfani rimossi");
    const rimasti = [...store.keys()].filter((k) => k.startsWith(A.LS_KEY_VENUE + "."));
    eq(rimasti, [inUso], "resta solo il blob vivo");
    eq(A.sweepVenueBlobs(), 0, "una seconda passata non trova più nulla");
  });
});
t("pulizia planimetrie: non tocca nulla su documento altrui o non caricato", () => {
  withVenueStore(A, 4 * 1024 * 1024, ({ store }) => {
    A.loadDoc({ _v: A.SCHEMA_VERSION, titolo: "x", venue: heavyVenue(20), items: [], inputs: [], outputs: [] });
    A.persistLocalState();
    store.set(A.LS_KEY_VENUE + ".orfano_9", "{}");
    const oldConsult = A.__consultMode, oldBlocked = A.__docLoadBlocked;
    try {
      A.__consultMode = true;
      eq(A.sweepVenueBlobs(), 0, "in consulenza/viewer non si tocca l'archivio dell'utente");
      A.__consultMode = false; A.__docLoadBlocked = { code: "FUTURE_SCHEMA" };
      eq(A.sweepVenueBlobs(), 0, "con documento non caricato non si sa cosa sia vivo");
    } finally { A.__consultMode = oldConsult; A.__docLoadBlocked = oldBlocked; }
    ok(store.has(A.LS_KEY_VENUE + ".orfano_9"), "l'orfano è ancora lì: nessuna rimozione azzardata");
  });
});
/* ANTEPRIMA/VIEWER CONTRO PDF — due catene che divergevano (caccia ai bug 03/08/2026).
   (1) la colonna «#» dell'input list mostrava sempre il progressivo, mentre PDF e CSV mostrano il
       canale FOH: la stessa sorgente era «17» sul PDF e «10» nel link condiviso;
   (2) l'ordine delle pagine tecniche era scritto DUE volte e le due copie erano già divergenti. */
t("input list: il numero è quello del banco, in anteprima come nel PDF", () => {
  const col = A.pdfListConfig().inputlist.cols[0];
  const righe = [{ n: 1, foh: 17, name: "Kick" }, { n: 2, foh: 18, name: "Snare" }];
  eq(righe.map((r) => col.f(r, { hasFoh: true })), [17, 18], "col FOH disponibile vince il canale FOH");
  eq(righe.map((r) => col.f(r, { hasFoh: false })), [1, 2], "senza FOH resta il progressivo");
  eq(col.f({ n: 3, foh: null }, { hasFoh: true }), 3, "riga senza FOH proprio: progressivo");
  eq(col.f({ n: 4, foh: 20 }), 4, "nessun dataset passato: nessun numero inventato");
});
t("input list: le righe riservate dicono RISERVATO anche in anteprima e nel link", () => {
  const cols = A.pdfListConfig().inputlist.cols;
  const ris = { n: 5, foh: 21, name: "", reserved: true, mic: "SM58", p48: true, patch: "B·5" };
  eq(cols[1].f(ris), "RISERVATO", "la sorgente non è una casella vuota");
  eq(cols[2].f(ris), "", "e non si inventa un microfono per un canale riservato");
  eq(cols[1].f({ name: "Voce", reserved: false }), "Voce", "le righe normali restano com'erano");
});
t("pagine tecniche: una sola sequenza per anteprima, pillole e PDF", () => {
  const ord = A.PDF_TECH_ORDER;
  ok(Array.isArray(ord) && ord.length > 10, "la sequenza esiste ed è unica");
  eq(new Set(ord).size, ord.length, "nessuna chiave ripetuta");
  ok(A.pdfTechRank("lightslist") > A.pdfTechRank("monitorlist"), "la Lista luci segue la Lista monitor");
  ok(A.pdfTechRank("lightslist") < A.pdfTechRank("racklist"), "e precede la Lista rack: un ordine solo");
  eq(A.pdfTechRank("view-luci"), -1, "le pagine-vista non sono liste tecniche");
});
t("pagine tecniche: l'elenco spuntato viene riordinato come sarà stampato", () => {
  const pagine = [
    { key: "view-cabin", label: "Vista: Ingressi" },
    { key: "view-luci", label: "Vista: Luci" },
    { key: "racklist", label: "Lista rack" },
    { key: "lightslist", label: "Lista luci" },
    { key: "inputlist", label: "Lista ingressi" },
  ];
  eq(A.pdfSortTechPages(pagine).map((p) => p.key),
    ["view-cabin", "view-luci", "inputlist", "lightslist", "racklist"],
    "viste in testa nell'ordine originale, liste nell'ordine di stampa");
  eq(A.pdfSortTechPages([]).length, 0, "elenco vuoto: nessun errore");
});
/* CIABATTE IN CATENA — il quadro contava metà del carico (caccia ai bug 03/08/2026).
   Il ciclo degli uplink iterava i distro nell'ordine di state.items: con A→B→Q, se B era stato
   messo sul palco PRIMA di A, B risaliva al quadro con un totale che non conteneva ancora i watt
   di A, e quei watt non arrivavano mai. Il numero dipendeva dall'ordine di inserimento, e su quel
   numero girano la verifica di sovraccarico e la sezione del cavo di risalita. */
function scenaCatena(A, ordine) {
  const before = A.docToJSON();
  const mk = (id, type, x, y) => ({ id, type, x, y });
  const items = [];
  const map = {
    A: mk("cia-A", "ciabatta", 200, 400),
    B: mk("cia-B", "ciabatta", 600, 400),
    Q: mk("quadro-Q", "distro63", 1000, 400),
    /* un carico da 1000 W su A e uno da 800 W su B */
    LA: { id: "load-A", type: "amprack", x: 210, y: 300, watt: 1000 },
    LB: { id: "load-B", type: "amprack", x: 610, y: 300, watt: 800 },
  };
  ordine.forEach((k) => items.push(map[k]));
  A.loadDoc({
    _v: A.SCHEMA_VERSION, items, inputs: [], outputs: [],
    stage: { w: 1200, d: 800, blocks: [{ x: 0, y: 0, w: 1200, d: 800 }] },
    elec: {
      on: true, mode: "manual",
      manual: { "load-A": { distro: "cia-A" }, "load-B": { distro: "cia-B" } },
      uplinks: { "cia-A": { to: "cia-B" }, "cia-B": { to: "quadro-Q" } },   /* A → B → Q */
    },
  });
  const R = A.elecResult(true);
  const q = R.distros.filter((d) => d.it && d.it.id === "quadro-Q")[0];
  const b = R.distros.filter((d) => d.it && d.it.id === "cia-B")[0];
  const out = {
    quadroW: q ? q.loadW : null,
    ciabattaBW: b ? b.loadW : null,
    lineaVersoQuadro: (R.uplinks || []).filter((u) => u.to && u.to.it && u.to.it.id === "quadro-Q")
      .map((u) => Math.round(u.a * 10) / 10)[0],
    totW: R.totW,
  };
  A.loadDoc(JSON.parse(before));
  return out;
}
t("ciabatte in catena: il quadro conta tutto il carico, non metà", () => {
  const attesoW = 1800;
  const dritto = scenaCatena(A, ["A", "B", "Q", "LA", "LB"]);
  const invertito = scenaCatena(A, ["B", "A", "Q", "LB", "LA"]);   /* B messa sul palco per prima */
  eq(dritto.quadroW, attesoW, "ordine naturale: il quadro vede 1800 W");
  eq(invertito.quadroW, attesoW, "ordine invertito: vede gli STESSI 1800 W");
  eq(dritto.totW, invertito.totW, "il totale della Lista carichi non dipende dall'ordine");
  eq(invertito.totW, attesoW, "e coincide con quello che dice il quadro");
});
t("ciabatte in catena: la linea di risalita porta gli ampere di tutta la catena", () => {
  const invertito = scenaCatena(A, ["B", "A", "Q", "LB", "LA"]);
  eq(invertito.ciabattaBW, 1800, "la ciabatta di mezzo somma il proprio carico e quello a valle");
  ok(invertito.lineaVersoQuadro > 7 && invertito.lineaVersoQuadro < 8.5,
    "la linea verso il quadro porta ~7,8 A (1800 W), non ~3,5 — è su questo che si sceglie la sezione");
});
t("uplink ad anello: la linea non si conta e l'errore si vede", () => {
  const before = A.docToJSON();
  A.loadDoc({
    _v: A.SCHEMA_VERSION, inputs: [], outputs: [],
    stage: { w: 1200, d: 800, blocks: [{ x: 0, y: 0, w: 1200, d: 800 }] },
    items: [
      { id: "cia-A", type: "ciabatta", x: 200, y: 400 },
      { id: "cia-B", type: "ciabatta", x: 600, y: 400 },
      { id: "load-A", type: "amprack", x: 210, y: 300, watt: 500 },
    ],
    elec: { on: true, mode: "manual", manual: { "load-A": { distro: "cia-A" } },
      uplinks: { "cia-A": { to: "cia-B" }, "cia-B": { to: "cia-A" } } },   /* anello */
  });
  const R = A.elecResult(true);
  ok(R.totW === 500, "il totale resta quello dei carichi veri");
  ok((R.issues || []).some((i) => /anello/i.test(i.msg || "")), "l'anello viene segnalato");
  ok(R.distros.every((d) => d.loadW < 1200), "nessun carico gonfiato dal giro su se stesso");
  A.loadDoc(JSON.parse(before));
});
/* PERMESSI DEL LINK — «Mostra i contatti nel link» era per-SCENA, ma di link ce n'è UNO
   (caccia ai bug 03/08/2026). Lo stesso link pubblicava o nasconceva nome, telefono ed email dei
   collaboratori a seconda di quale scena fosse attiva in quel momento: l'utente vedeva
   l'interruttore spento e bastava tornare all'altra scena perché ricominciasse a pubblicarli.
   Sono dati personali di terzi, quindi ogni default e ogni caso incerto stanno dalla parte del NO. */
function docConScene(A, scene, extra) {
  const doc = { _doc: 1, active: scene[0].id,
    variants: scene.map((s) => ({ id: s.id, name: s.id, state: {
      _v: A.SCHEMA_VERSION, titolo: s.id, items: [], inputs: [], outputs: [],
      contacts: [{ role: "Riferimento tecnico", name: "Mario", contact: "m@example.test", note: "" }],
      shareOpts: s.shareOpts,
    } })) };
  if (extra) Object.keys(extra).forEach((k) => { doc[k] = extra[k]; });
  return doc;
}
t("permessi del link: sono del documento, non della scena attiva", () => {
  const before = A.docToJSON();
  try {
    /* documento vecchio: una scena diceva sì, l'altra no — il valore dipendeva da quale fosse aperta */
    A.loadDoc(docConScene(A, [
      { id: "s1", shareOpts: { copy: true, contacts: false } },
      { id: "s2", shareOpts: { copy: true, contacts: true } },
    ]));
    eq(A.shareOptsDoc().contacts, false,
      "scene discordi: vince il NO — nessuno ha mai acconsentito per l'intero link");
    const suS1 = JSON.parse(A.publicShareStateJSON());
    A.switchVariant("s2");
    const suS2 = JSON.parse(A.publicShareStateJSON());
    eq(suS1.contacts, undefined, "niente contatti sulla prima scena");
    eq(suS2.contacts, undefined, "e niente contatti nemmeno cambiando scena: è lo stesso link");
  } finally { A.loadDoc(JSON.parse(before)); }
});
t("permessi del link: se tutte le scene erano d'accordo, il consenso si conserva", () => {
  const before = A.docToJSON();
  try {
    A.loadDoc(docConScene(A, [
      { id: "s1", shareOpts: { copy: true, contacts: true } },
      { id: "s2", shareOpts: { copy: true, contacts: true } },
    ]));
    eq(A.shareOptsDoc().contacts, true, "consenso unanime: resta acceso");
    ok(JSON.parse(A.publicShareStateJSON()).contacts, "e i contatti vengono pubblicati");
    A.switchVariant("s2");
    ok(JSON.parse(A.publicShareStateJSON()).contacts, "su qualunque scena");
  } finally { A.loadDoc(JSON.parse(before)); }
});
t("permessi del link: cambiarlo vale per tutto il documento, subito", () => {
  const before = A.docToJSON();
  try {
    A.loadDoc(docConScene(A, [
      { id: "s1", shareOpts: { copy: true, contacts: true } },
      { id: "s2", shareOpts: { copy: true, contacts: true } },
    ]));
    A.setShareOpt("contacts", false);
    eq(A.shareOptsDoc().contacts, false, "spento");
    eq(JSON.parse(A.publicShareStateJSON()).contacts, undefined, "niente contatti sulla scena attiva");
    A.switchVariant("s2");
    eq(JSON.parse(A.publicShareStateJSON()).contacts, undefined, "né sulle altre");
    /* la stessa decisione va scritta in OGNI scena: il server pubblica la scena attiva e non deve
       poter trovare un consenso che l'utente ha revocato */
    ok(A.VARIANTS.every((v) => v.state.shareOpts.contacts === false),
      "nessuna scena conserva un sì revocato");
  } finally { A.loadDoc(JSON.parse(before)); }
});
t("permessi del link: la scena nuova non si porta dietro un permesso diverso", () => {
  const before = A.docToJSON();
  try {
    A.loadDoc(docConScene(A, [{ id: "s1", shareOpts: { copy: true, contacts: true } }]));
    A.setShareOpt("contacts", false);
    A.createVariant();
    ok(A.VARIANTS.length > 1, "la scena è stata creata");
    ok(A.VARIANTS.every((v) => v.state.shareOpts.contacts === false),
      "e nasce con il permesso del documento, non con un valore suo");
    eq(A.shareOptsDoc().contacts, false, "il permesso del link non cambia creando scene");
  } finally { A.loadDoc(JSON.parse(before)); }
});
t("permessi del link: «crea una copia» segue la regola più restrittiva fra le scene", () => {
  const before = A.docToJSON();
  try {
    A.loadDoc(docConScene(A, [
      { id: "s1", shareOpts: { copy: false, contacts: false } },
      { id: "s2", shareOpts: { copy: true, contacts: false } },
    ]));
    eq(A.shareOptsDoc().copy, false, "se una scena vietava la copia, il link non la consente");
  } finally { A.loadDoc(JSON.parse(before)); }
});
/* PLANIMETRIA DUPLICATA PER SCENA — nel file esportato e nel punto di recupero ogni variante
   portava una copia INTERA del base64 (caccia ai bug 03/08/2026): 488 KB diventavano 1954 KB con
   quattro scene. docToJSONFull ha nel proprio commento scritto che «le altre varianti condividono
   l'immagine per nome», e poi faceva il contrario — è una regressione, non una scelta.
   Le scene con una planimetria DIVERSA devono continuare a portarsela: qui non si perde nulla. */
function docConScenePlanimetria(A, piante) {
  const id = (i) => "v" + (i + 1);
  return {
    _doc: 1, active: id(0),
    variants: piante.map((p, i) => ({
      id: id(i), name: "Scena " + (i + 1),
      state: {
        _v: A.SCHEMA_VERSION, titolo: "S" + i, items: [], inputs: [], outputs: [],
        venue: p == null ? null : { x: 0, y: 0, w: 100, h: 80, rot: 0, opacity: 40, enabled: true,
          name: p.nome, _dataUrl: "data:image/png;base64," + p.dati, _imgW: 100, _imgH: 80 },
      },
    })),
  };
}
t("export: la stessa planimetria su più scene viene scritta una volta sola", () => {
  const before = A.docToJSON();
  try {
    const grande = "Q".repeat(20000);
    A.loadDoc(docConScenePlanimetria(A, [{ nome: "pianta.png", dati: grande }]));
    const conUna = A.docToJSONFull().length;
    A.loadDoc(docConScenePlanimetria(A, [
      { nome: "pianta.png", dati: grande }, { nome: "pianta.png", dati: grande },
      { nome: "pianta.png", dati: grande }, { nome: "pianta.png", dati: grande },
    ]));
    const conQuattro = A.docToJSONFull().length;
    ok(conQuattro < conUna * 1.5,
      "quattro scene con la stessa pianta non pesano quattro volte (era ~4×): " +
      Math.round(conUna / 1024) + " KB → " + Math.round(conQuattro / 1024) + " KB");
  } finally { A.loadDoc(JSON.parse(before)); }
});
t("export: la scena attiva porta sempre la sua planimetria per intero", () => {
  const before = A.docToJSON();
  try {
    A.loadDoc(docConScenePlanimetria(A, [
      { nome: "a.png", dati: "AAAA" }, { nome: "a.png", dati: "AAAA" },
    ]));
    const doc = JSON.parse(A.docToJSONFull());
    const attiva = doc.variants.find((v) => v.id === doc.active);
    ok(attiva.state.venue && attiva.state.venue._dataUrl, "l'attiva è autosufficiente");
    const altra = doc.variants.find((v) => v.id !== doc.active);
    ok(!altra.state.venue._dataUrl, "la gemella non ripete il base64");
    eq(altra.state.venue.name, "a.png", "ma conserva il nome per riagganciarla");
  } finally { A.loadDoc(JSON.parse(before)); }
});
t("export: planimetrie DIVERSE non si perdono, ognuna viaggia con la sua scena", () => {
  const before = A.docToJSON();
  try {
    A.loadDoc(docConScenePlanimetria(A, [
      { nome: "a.png", dati: "AAAA" }, { nome: "b.png", dati: "BBBB" }, { nome: "a.png", dati: "AAAA" },
    ]));
    const doc = JSON.parse(A.docToJSONFull());
    const perId = {};
    doc.variants.forEach((v) => { perId[v.id] = v.state.venue; });
    ok(perId.v1._dataUrl, "scena 1 (attiva): la sua pianta");
    ok(perId.v2._dataUrl && perId.v2._dataUrl.indexOf("BBBB") > 0,
      "scena 2 ha una pianta DIVERSA e se la porta: nessuna perdita");
    ok(!perId.v3._dataUrl, "scena 3 ripete quella dell'attiva: non la duplica");
    /* riaperto, il documento deve tornare completo */
    A.loadDoc(doc);
    eq(A.VARIANTS.length, 3, "tre scene");
    ok(String(A.docToJSONFull()).indexOf("BBBB") > 0, "la pianta diversa sopravvive al giro completo");
  } finally { A.loadDoc(JSON.parse(before)); }
});
t("export: riaprendo il file, la scena gemella RIVEDE la sua planimetria", () => {
  const before = A.docToJSON();
  try {
    const dati = "ZZZZQQQQ";
    A.loadDoc(docConScenePlanimetria(A, [
      { nome: "comune.png", dati }, { nome: "comune.png", dati }, { nome: "altra.png", dati: "XXXX" },
    ]));
    const file = A.docToJSONFull();
    ok(String(file).indexOf("_sameAs") > 0, "il file dichiara la gemella invece di ripetere i dati");

    /* il giro completo: salvo, riapro, e vado sulla scena che NON portava la bitmap */
    A.loadDoc(JSON.parse(file));
    A.switchVariant("v2");
    ok(A.state.venue, "la scena gemella ha ancora una planimetria");
    ok(A.state.venue._dataUrl && A.state.venue._dataUrl.indexOf(dati) > 0,
      "ed è la bitmap giusta, riagganciata dalla scena sorella");
    eq(A.state.venue.name, "comune.png", "col suo nome");

    /* e la scena con la pianta diversa non è stata contaminata */
    A.switchVariant("v3");
    ok(A.state.venue._dataUrl.indexOf("XXXX") > 0, "la terza scena conserva la SUA pianta");

    /* riesportando, il documento resta completo e ancora deduplicato */
    const file2 = A.docToJSONFull();
    ok(String(file2).indexOf("XXXX") > 0, "nessuna pianta persa al secondo giro");
    ok(String(file2).length < String(file).length * 1.6, "e non si rigonfia");
  } finally { A.loadDoc(JSON.parse(before)); }
});
/* DANTE APPICCICATO AL COMPUTER — ultimo reperto della prima caccia (03/08/2026).
   Si collega il computer a una console con Dante, si sceglie Dante, poi si ritrascina lo stesso cavo
   su una stage box. La scelta restava: la Lista canali diceva «Mic/DI = Dante» con «Patch = B·1»
   (un canale Dante su una porta mic/line), nessuna DI veniva proposta benché il collegamento fosse
   tornato analogico, e il pannello — che mostra il selettore della via solo se il computer è su un
   mixer — non lasciava più correggere. Tre viste della stessa connessione, tre risposte diverse. */
function scenaComputerVia(A, opzioni) {
  const before = A.docToJSON();
  A.loadDoc({
    _v: A.SCHEMA_VERSION, inputs: [], outputs: [],
    stage: { w: 1400, d: 900, blocks: [{ x: 0, y: 0, w: 1400, d: 900 }] },
    items: [
      { id: "pc", type: "laptop", x: 400, y: 400 },
      { id: "mix", type: "mixer", x: 1000, y: 800, hw: "dm3" },   /* DM3-D: ha il Dante */
      { id: "sb", type: "stagebox", x: 200, y: 800 },
    ],
    cab: { on: true, mode: "manual", manual: {} },
  });
  const pc = A.state.items.filter((i) => i.id === "pc")[0];
  A.cabSetItemBox(pc, "mix");
  A.cabSetVia(pc, "dante");
  const dopoScelta = { via: A.compViaOf(pc), dvs: A.dvsOn(pc),
    mic: (A.cabItemInputs(pc)[0] || {}).mic };
  if (opzioni && opzioni.spostaSuBox) A.cabSetItemBox(pc, "sb");
  const fine = { via: A.compViaOf(pc), dvs: A.dvsOn(pc), mic: (A.cabItemInputs(pc)[0] || {}).mic };
  A.loadDoc(JSON.parse(before));
  return { dopoScelta, fine };
}
t("computer: la scelta Dante vale finché il cavo è sulla console che ce l'ha", () => {
  const r = scenaComputerVia(A, { spostaSuBox: false });
  eq(r.dopoScelta.via, "dante", "scelta registrata");
  eq(r.dopoScelta.mic, "Dante", "e la Lista canali la riporta");
  eq(r.dopoScelta.dvs, true, "la scheda virtuale Dante è in scena");
  eq(r.fine.via, "dante", "restando sulla console, niente cambia");
});
t("computer: spostando il cavo su una stage box il Dante decade, e le tre viste concordano", () => {
  const r = scenaComputerVia(A, { spostaSuBox: true });
  eq(r.dopoScelta.via, "dante", "si parte da Dante scelto davvero");
  eq(r.fine.via, "an", "sulla stage box la via torna analogica: quella porta è mic/line");
  eq(r.fine.mic, "DI", "la Lista canali dice DI, non più Dante");
  eq(r.fine.dvs, false, "e la scheda virtuale Dante sparisce dalla lista Rete");
});
t("computer: spostandosi su una console SENZA Dante la scelta decade lo stesso", () => {
  const before = A.docToJSON();
  try {
    A.loadDoc({
      _v: A.SCHEMA_VERSION, inputs: [], outputs: [],
      stage: { w: 1400, d: 900, blocks: [{ x: 0, y: 0, w: 1400, d: 900 }] },
      items: [
        { id: "pc", type: "laptop", x: 400, y: 400 },
        { id: "conD", type: "mixer", x: 1000, y: 800, hw: "dm3" },       /* DM3-D: col Dante */
        { id: "conStd", type: "mixer", x: 700, y: 800, hw: "dm3std" },   /* DM3 STANDARD: senza */
      ],
      cab: { on: true, mode: "manual", manual: {} },
    });
    const pc = A.state.items.filter((i) => i.id === "pc")[0];
    A.cabSetItemBox(pc, "conD"); A.cabSetVia(pc, "dante");
    eq(A.compViaOf(pc), "dante", "sulla console col Dante la scelta vale");
    A.cabSetItemBox(pc, "conStd");
    eq(A.compViaOf(pc), "an", "su quella senza, decade: offrirlo sarebbe una bugia");

    /* la via USB, che entrambe hanno, invece sopravvive allo spostamento */
    A.cabSetVia(pc, "usb");
    A.cabSetItemBox(pc, "conD");
    eq(A.compViaOf(pc), "usb", "una via che il nuovo modello HA non viene buttata");
  } finally { A.loadDoc(JSON.parse(before)); }
});
/* DOCUMENTO NUOVO E ANCORA VUOTO — seconda ondata (04/08/2026), il reperto più grave.
   Loggato, File → Nuovo, si conferma il popup dimensioni palco con i valori di default: l'autosave
   parte, saveProject riconosce il guscio vuoto e risponde `null` — che significa «non c'era niente
   da salvare», non «salvataggio fallito». Il chiamante lo leggeva come errore: pastiglia rossa
   «Salvataggio interrotto», retry all'infinito, e ogni «Apri» rispondeva «Apertura sospesa: le
   modifiche correnti non sono ancora al sicuro nel cloud». Utente chiuso fuori dai propri progetti
   finché non posava un elemento. Nessun dato a rischio: il documento è vuoto per definizione. */
function conCloudFinto(A, save, body) {
  const old = { cloud: A.__cloud, doc: A.document, dirty: A._cloudDirty, saving: A._cloudSaving,
    blocked: A.__docLoadBlocked, conflict: A.__localConflict, cloudConflict: A.__cloudConflict,
    locked: A.__projLocked, venue: A.__bootVenueUnavailable, unavailable: A.__localStorageUnavailable };
  const stati = [];
  A.document = { body: { classList: { contains: () => false, add() {}, remove() {}, toggle() {} } },
    getElementById: () => null };
  A.__docLoadBlocked = null; A.__localConflict = false; A.__cloudConflict = false;
  A.__projLocked = false; A.__bootVenueUnavailable = false; A.__localStorageUnavailable = false;
  A.__cloud = { user: () => ({ id: "u" }), currentId: () => null, save, isWriting: () => false };
  const setDoc = A.setDocState;
  A.setDocState = (m) => { stati.push(m); };
  try { return body(stati); }
  finally {
    A.setDocState = setDoc;
    A.__cloud = old.cloud; A.document = old.doc; A._cloudDirty = old.dirty; A._cloudSaving = old.saving;
    A.__docLoadBlocked = old.blocked; A.__localConflict = old.conflict; A.__cloudConflict = old.cloudConflict;
    A.__projLocked = old.locked; A.__bootVenueUnavailable = old.venue;
    A.__localStorageUnavailable = old.unavailable;
  }
}
t("documento vuoto: «niente da salvare» non è un errore, e non chiude fuori dai progetti", () => {
  const before = A.docToJSON();
  try {
    /* palco ai valori di default e nessun elemento: esattamente ciò che resta dopo File → Nuovo */
    A.loadDoc({ _v: A.SCHEMA_VERSION, titolo: "", luogo: "", items: [], inputs: [], outputs: [],
      stage: { w: 1200, d: 800, blocks: [{ x: 0, y: 0, w: 1200, d: 800 }] } });
    eq(A.hasMeaningfulDocument(), false, "il documento è davvero un guscio vuoto");

    /* il finto cloud prende la STESSA decisione di saveProject: guscio vuoto → «niente da
       salvare» (secondo argomento "empty"), altrimenti esito di fallimento nudo */
    let tentativi = 0;
    const comeSaveProject = (cb) => {
      tentativi++;
      if (!A.hasMeaningfulDocument()) cb(null, "empty"); else cb(null);
    };
    const r = conCloudFinto(A, comeSaveProject, (stati) => {
      A._cloudDirty = true; A._cloudSaving = false;
      let esito = null;
      A.flushCloudAutosave((ok) => { esito = ok; });
      return { esito, stati: stati.slice(), needsFlush: A.__cloudNeedsFlush(), tentativi };
    });

    ok(r.stati.indexOf("error") < 0, "nessuna pastiglia rossa: non è successo niente di sbagliato");
    eq(r.esito, true, "chi aspetta di poter cambiare progetto riceve via libera");
    eq(r.needsFlush, false, "non resta nulla «da mettere al sicuro»: il documento è vuoto");
  } finally { A.loadDoc(JSON.parse(before)); }
});
t("il permesso del link non è «lavoro»: un documento vuoto resta vuoto", () => {
  const before = A.docToJSON();
  try {
    /* Regressione del 04/08 scoperta scrivendo il test qui sopra: da quando il permesso del link
       è del documento, prepareDoc scrive SEMPRE shareOpts in DOC_EXTRA. Contandolo come contenuto,
       nessun documento risultava più vuoto — e tornavano i gusci «Senza titolo» nell'elenco cloud
       che il ramo del documento vuoto esiste apposta per evitare. */
    A.loadDoc({ _v: A.SCHEMA_VERSION, titolo: "", items: [], inputs: [], outputs: [],
      stage: { w: 1200, d: 800, blocks: [{ x: 0, y: 0, w: 1200, d: 800 }] } });
    ok(A.DOC_EXTRA && A.DOC_EXTRA.shareOpts, "shareOpts c'è, come deve");
    eq(A.hasMeaningfulDocument(), false, "ma non rende «pieno» un documento vuoto");

    /* qualunque ALTRA cosa a livello documento è invece lavoro dell'utente */
    A.DOC_EXTRA.qualcosaDiSuo = { x: 1 };
    eq(A.hasMeaningfulDocument(), true, "un contenuto vero a livello documento conta ancora");
  } finally { A.loadDoc(JSON.parse(before)); }
});
t("documento con lavoro dentro: un salvataggio fallito resta un errore", () => {
  const before = A.docToJSON();
  try {
    A.loadDoc({ _v: A.SCHEMA_VERSION, titolo: "Concerto", items: [{ id: "a", type: "cantante" }],
      inputs: [], outputs: [], stage: { w: 1200, d: 800, blocks: [{ x: 0, y: 0, w: 1200, d: 800 }] } });
    ok(A.hasMeaningfulDocument(), "qui c'è lavoro vero");
    const r = conCloudFinto(A, (cb) => {
      if (!A.hasMeaningfulDocument()) cb(null, "empty"); else cb(null);   /* qui NON è vuoto */
    }, (stati) => {
      A._cloudDirty = true; A._cloudSaving = false;
      let esito = null;
      A.flushCloudAutosave((ok) => { esito = ok; });
      return { esito, stati: stati.slice(), needsFlush: A.__cloudNeedsFlush() };
    });
    ok(r.stati.indexOf("error") >= 0, "questo sì che è un errore, e si vede");
    eq(r.esito, false, "e chi aspetta NON riceve via libera: il lavoro non è al sicuro");
    eq(r.needsFlush, true, "resta da sincronizzare");
  } finally { A.loadDoc(JSON.parse(before)); }
});
t("errore di accesso a localStorage non viene scambiato per documento incompatibile", () => {
  const oldStorage = A.localStorage, oldDocument = A.document, oldConsult = A.__consultMode;
  const oldBlocked = A.__docLoadBlocked, oldUnavailable = A.__localStorageUnavailable;
  const oldBootCloudId = A.__bootCloudId, oldBootCloudRev = A.__bootCloudRev, oldBootCloudMeta = A.__bootCloudMeta;
  A.__consultMode = false;
  A.document = { body: { classList: { contains: () => false } }, getElementById: () => null };
  A.localStorage = { getItem: () => { throw new Error("SecurityError"); }, setItem: () => {}, removeItem: () => {} };
  try {
    A.load();
    eq(A.__docLoadBlocked, null, "nessun blocco di compatibilità");
    eq(A.__localStorageUnavailable, true, "errore storage distinto e visibile");
  } finally {
    A.localStorage = oldStorage; A.document = oldDocument; A.__consultMode = oldConsult;
    A.__docLoadBlocked = oldBlocked; A.__localStorageUnavailable = oldUnavailable;
    A.__bootCloudId = oldBootCloudId; A.__bootCloudRev = oldBootCloudRev; A.__bootCloudMeta = oldBootCloudMeta;
  }
});
t("getter localStorage negato non interrompe il boot dell'app", () => {
  const storageDescriptor = Object.getOwnPropertyDescriptor(A, "localStorage");
  const oldDocument = A.document, oldConsult = A.__consultMode;
  const oldBlocked = A.__docLoadBlocked, oldUnavailable = A.__localStorageUnavailable;
  A.__consultMode = false;
  A.document = { body: { classList: { contains: () => false } }, getElementById: () => null };
  Object.defineProperty(A, "localStorage", {
    configurable: true,
    get: () => { throw new Error("SecurityError"); },
  });
  try {
    A.load();
    eq(A.__docLoadBlocked, null, "nessun falso blocco documento");
    eq(A.__localStorageUnavailable, true, "storage negato segnalato senza eccezione");
  } finally {
    if (storageDescriptor) Object.defineProperty(A, "localStorage", storageDescriptor);
    else delete A.localStorage;
    A.document = oldDocument; A.__consultMode = oldConsult;
    A.__docLoadBlocked = oldBlocked; A.__localStorageUnavailable = oldUnavailable;
  }
});
t("import invalido non stacca il cloud; import valido azzera la cronologia cross-documento", () => {
  const oldCloud = A.__cloud, oldBlocked = A.__docLoadBlocked;
  const before = A.docToJSON(), beforeUndo = A.undoStack.slice(), beforeRedo = A.redoStack.slice();
  const detached = [];
  A.__cloud = { setCurrentId: (id) => detached.push(id), currentId: () => "project-A", currentRev: () => "rev-A", user: () => null };
  try {
    A.undoStack.push("sentinel"); A.redoStack.push("sentinel");
    throws(() => A.importProject(JSON.stringify({ _v: A.SCHEMA_VERSION + 1, items: [] })), "FUTURE_SCHEMA");
    eq(detached.length, 0, "nessun lifecycle alterato dal documento invalido");
    A.importProject(JSON.stringify({ _v: A.SCHEMA_VERSION, items: [{ id: "new", type: "cantante" }], inputs: [], outputs: [] }),
      { autosave: false });
    eq(detached, [null], "stacco soltanto dopo la validazione");
    eq([A.undoStack.length, A.redoStack.length], [0, 0], "nessun undo può attraversare il confine progetto");
  } finally {
    A.__cloud = oldCloud; A.__docLoadBlocked = oldBlocked;
    A.loadDoc(JSON.parse(before));
    A.undoStack.length = 0; beforeUndo.forEach((x) => A.undoStack.push(x));
    A.redoStack.length = 0; beforeRedo.forEach((x) => A.redoStack.push(x));
  }
});
t("cache planimetria viene isolata al cambio documento anche con nomi uguali", () => {
  const before = A.docToJSON();
  try {
    A.loadDoc({ _v: A.SCHEMA_VERSION, venue: { name: "plan.png", _dataUrl: "data:image/png;base64,AA==" },
      items: [], inputs: [], outputs: [] });
    A.cacheVenueImg(A.state.venue);
    A.loadDoc({ _doc: 1, active: "b1", variants: [
      { id: "b1", name: "B1", state: { _v: A.SCHEMA_VERSION, venue: { name: "plan.png" }, items: [], inputs: [], outputs: [] } },
      { id: "b2", name: "B2", state: { _v: A.SCHEMA_VERSION, venue: { name: "plan.png" }, items: [], inputs: [], outputs: [] } },
    ] });
    ok(!A.state.venue._dataUrl, "il progetto B non eredita l'immagine di A");
    A.switchVariant("b2");
    ok(!A.state.venue._dataUrl, "neppure una variante inattiva riaggancia la cache di A");
  } finally {
    A.loadDoc(JSON.parse(before));
  }
});
t("firma planimetria locale impedisce il mix documento B / bitmap A dopo una write parziale", () => {
  const before = A.docToJSON(), oldStorage = A.localStorage;
  try {
    A.loadDoc({ _doc: 1, active: "b", variants: [
      { id: "b", name: "B", state: { titolo: "B", venue: { name: "stage.png", x: 0, y: 0, w: 100, h: 80 }, items: [], inputs: [], outputs: [] } },
    ] });
    const stale = { _venueDoc: 1, active: "b", images: {
      b: { name: "stage.png", _dataUrl: "data:image/png;base64,QUFB", _imgW: 100, _imgH: 80 },
    } };
    A.localStorage = { getItem: (key) => key === A.LS_KEY_VENUE ? JSON.stringify(stale) : null,
      setItem: () => {}, removeItem: () => {} };
    eq(A.loadVenueImg("firma-di-B-diversa"), false, "bundle stale rifiutato");
    ok(!A.state.venue._dataUrl, "la bitmap A non viene mostrata come documento B");
  } finally { A.localStorage = oldStorage; A.loadDoc(JSON.parse(before)); }
});
t("bundle planimetrie locale v2 deduplica il base64 e torna alla forma canonica", () => {
  const dataUrl = "data:image/png;base64,QUFB";
  const canonical = { _venueDoc: 1, active: "a", images: {
    a: { name: "Piena", _dataUrl: dataUrl, _imgW: 100, _imgH: 80 },
    b: { name: "Ridotta", _dataUrl: dataUrl, _imgW: 100, _imgH: 80 },
  } };
  const compact = A.compactVenueImageBundle(canonical);
  eq(compact._venueDoc, 2, "formato locale compatto");
  eq(Object.keys(compact.assets).length, 1, "un solo asset per due varianti clonate");
  eq((JSON.stringify(compact).match(/data:image\/png;base64,QUFB/g) || []).length, 1,
    "il payload base64 compare una sola volta");
  const roundTrip = A.normalizeVenueImageBundle(compact, "a");
  eq({ active: roundTrip.active, keys: Object.keys(roundTrip.images).sort(),
    names: [roundTrip.images.a.name, roundTrip.images.b.name],
    urls: [roundTrip.images.a._dataUrl, roundTrip.images.b._dataUrl] },
    { active: "a", keys: ["a", "b"], names: ["Piena", "Ridotta"], urls: [dataUrl, dataUrl] },
    "round-trip v2 → v1 senza perdita");
});
t("puntatore planimetria mancante blocca la propagazione di una cancellazione involontaria", () => {
  const oldStorage = A.localStorage, oldUnavailable = A.__bootVenueUnavailable;
  try {
    A.__bootVenueUnavailable = false;
    A.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
    eq(A.loadVenueImg("firma-attesa", A.LS_KEY_VENUE + ".asset-atteso"), false, "asset assente");
    eq(A.__bootVenueUnavailable, true, "assenza distinta dalla cancellazione intenzionale");
  } finally {
    A.localStorage = oldStorage;
    A.__bootVenueUnavailable = oldUnavailable;
  }
});
t("undo/redo ripristina la bitmap corretta e recupera una planimetria eliminata", () => {
  const before = A.docToJSON(), oldStorage = A.localStorage, oldCloud = A.__cloud;
  const oldConflict = A.__localConflict, oldBlocked = A.__docLoadBlocked, oldConsult = A.__consultMode;
  const store = new Map();
  const imageA = "data:image/png;base64,QUFB", imageB = "data:image/png;base64,QkJC";
  try {
    A.localStorage = {
      getItem: (key) => store.has(key) ? store.get(key) : null,
      setItem: (key, value) => store.set(key, value),
      removeItem: (key) => store.delete(key),
    };
    A.__cloud = { currentId: () => null, currentRev: () => null, user: () => null };
    A.__localConflict = false; A.__docLoadBlocked = null; A.__consultMode = false;
    A.loadDoc({ _v: A.SCHEMA_VERSION, venue: {
      name: "A.png", _dataUrl: imageA, _imgW: 100, _imgH: 80, x: 0, y: 0, w: 100, h: 80,
    }, items: [], inputs: [], outputs: [] });
    A.resetHistory();
    A.state.venue = {
      name: "B.png", _dataUrl: imageB, _imgW: 120, _imgH: 90, x: 0, y: 0, w: 120, h: 90,
    };
    A.recordHistory();
    A.undo();
    eq(A.state.venue._dataUrl, imageA, "undo ripristina l'immagine A");
    A.redo();
    eq(A.state.venue._dataUrl, imageB, "redo ripristina l'immagine B");

    A.resetHistory();
    A.state.venue = null;
    A.recordHistory();
    A.undo();
    eq(A.state.venue._dataUrl, imageB, "undo dell'eliminazione recupera la bitmap B");
  } finally {
    A.localStorage = oldStorage; A.__cloud = oldCloud;
    A.__localConflict = oldConflict; A.__docLoadBlocked = oldBlocked; A.__consultMode = oldConsult;
    A.loadDoc(JSON.parse(before)); A.resetHistory();
  }
});
t("concorrenza tra schede sospende la scrittura locale invece di sovrascrivere", () => {
  const before = A.docToJSON(), oldStorage = A.localStorage, oldCloud = A.__cloud, oldDocument = A.document;
  const oldConflict = A.__localConflict, oldDirty = A._cloudDirty, oldSaving = A._cloudSaving;
  const store = new Map();
  try {
    A.localStorage = {
      getItem: (key) => store.has(key) ? store.get(key) : null,
      setItem: (key, value) => store.set(key, value),
      removeItem: (key) => store.delete(key),
    };
    A.__cloud = { currentId: () => null, currentRev: () => null, user: () => null };
    A.document = { body: { classList: { contains: () => false } }, getElementById: () => null };
    A.__localConflict = false; A._cloudDirty = false; A._cloudSaving = false;
    eq(A.persistLocalState(), true, "prima revisione scritta");
    const external = JSON.parse(store.get(A.LS_KEY));
    external._local.localRevision = "altra-scheda:1";
    store.set(A.LS_KEY, JSON.stringify(external));
    const beforeRejectedWrite = store.get(A.LS_KEY);
    A.state.titolo = "Modifica concorrente locale";
    eq(A.persistLocalState(), false, "seconda scrittura rifiutata");
    eq(A.__localConflict, true, "conflitto reso esplicito");
    eq(store.get(A.LS_KEY), beforeRejectedWrite, "root dell'altra scheda non sovrascritto");
  } finally {
    A.localStorage = oldStorage; A.__cloud = oldCloud; A.document = oldDocument;
    A.__localConflict = oldConflict; A._cloudDirty = oldDirty; A._cloudSaving = oldSaving;
    A.loadDoc(JSON.parse(before));
  }
});
t("sessione autenticata senza binding o dirty non resuscita un progetto cloud eliminato", () => {
  const oldStorage = A.localStorage, oldCloud = A.__cloud, oldDocument = A.document;
  const oldDirty = A._cloudDirty, oldSaving = A._cloudSaving, oldPending = A.__bootCloudPending;
  const oldCloudId = A.__bootCloudId, oldCloudSig = A.__bootCloudSig, oldConflict = A.__localConflict;
  const store = new Map();
  try {
    A.localStorage = {
      getItem: (key) => store.has(key) ? store.get(key) : null,
      setItem: (key, value) => store.set(key, value),
      removeItem: (key) => store.delete(key),
    };
    A.__cloud = { currentId: () => null, currentRev: () => null, user: () => ({ id: "logged-in" }) };
    A.document = { body: { classList: { contains: () => false } }, getElementById: () => null };
    A._cloudDirty = false; A._cloudSaving = false; A.__bootCloudPending = false;
    A.__bootCloudId = null; A.__bootCloudSig = null; A.__localConflict = false;
    eq(A.persistLocalState(), true, "copia locale conservata");
    const meta = JSON.parse(store.get(A.LS_KEY))._local;
    eq({ cloudId: meta.cloudId, cloudPending: meta.cloudPending }, { cloudId: null, cloudPending: false },
      "il solo login non arma una nuova INSERT cloud");
  } finally {
    A.localStorage = oldStorage; A.__cloud = oldCloud; A.document = oldDocument;
    A._cloudDirty = oldDirty; A._cloudSaving = oldSaving; A.__bootCloudPending = oldPending;
    A.__bootCloudId = oldCloudId; A.__bootCloudSig = oldCloudSig; A.__localConflict = oldConflict;
  }
});
t("Nuovo usa un confine documento unico: scarta varianti, contatti, extra e invalida callback", () => {
  const before = A.docToJSON(), oldCloud = A.__cloud, oldEpoch = A.__docEpoch || 0;
  const detached = [];
  try {
    A.loadDoc({ _doc: 1, active: "old-a", privateRoot: { keep: false }, variants: [
      { id: "old-a", name: "A", state: { titolo: "A", items: [], inputs: [{ src: "Segreto" }], outputs: [],
        contacts: [{ role: "Tecnico", name: "Ada", contact: "private@example.invalid" }] } },
      { id: "old-b", name: "B", state: { titolo: "B", items: [{ id: "old", type: "cantante" }], inputs: [], outputs: [] } },
    ] });
    const loadedEpoch = A.__docEpoch || 0;
    A.__cloud = { setCurrentId: (id) => detached.push(id), currentId: () => "old-project", currentRev: () => "old-rev" };
    A.beginNewDocument({ titolo: "", luogo: "", stage: { w: 1200, d: 800, blocks: [{ x: 0, y: 0, w: 1200, d: 800 }] },
      items: [], inputs: [], outputs: [] });
    const fresh = JSON.parse(A.docToJSON());
    eq(fresh.variants.length, 1, "una sola variante pulita");
    ok(!("privateRoot" in fresh), "metadata root del vecchio progetto scartati");
    eq([A.state.items.length, A.state.inputs.length, A.state.outputs.length, A.state.contacts.length], [0,0,0,0],
      "nessun dato tecnico/personale attraversa il confine");
    ok((A.__docEpoch || 0) > loadedEpoch && (A.__docEpoch || 0) > oldEpoch, "epoch incrementato");
    eq(detached, [null], "associazione cloud azzerata una volta");
  } finally { A.__cloud = oldCloud; A.loadDoc(JSON.parse(before)); }
});
t("parts componibili manipolate vengono normalizzate senza crash o prototype pollution", () => {
  const parts = JSON.parse('{"count":{},"layout":"constructor","orient":null,"mus":"false","__proto__":{"polluted":true}}');
  const s = A.normalizeState({ _v: A.SCHEMA_VERSION, items: [{ id: "tim", type: "timpani", parts }], inputs: [], outputs: [] });
  const p = s.items[0].parts;
  eq({ count: p.count, layout: p.layout, orient: p.orient, mus: p.mus },
    { count: 2, layout: "arco", orient: "americano", mus: true });
  ok(!Object.prototype.hasOwnProperty.call(p, "__proto__") && !p.polluted, "chiavi magiche eliminate");
  ok(Number.isFinite(s.items[0].w) && Number.isFinite(s.items[0].d), "dimensioni calcolabili");
});

console.log("\nBatteria — disposizione destrorsa + toggle mancino:");
t("destrorsa di default: hi-hat a sinistra del batterista (x>0), floor a destra (x<0)", () => {
  const S = A.drumSlots({ toms: 2, floor: true, hihat: true, crash: 1, ride: true, stool: true });
  const by = {}; S.forEach((s) => { if (!by[s.k]) by[s.k] = s; });
  ok(by.hihat.x > 0, "hi-hat a destra schermo = sinistra batterista (destrorso)");
  ok(by.floor.x < 0, "floor-tom a sinistra schermo = destra batterista");
  ok(by.snare.x > 0 && by.snare.x < by.hihat.x, "rullante tra cassa e hi-hat, lato sinistro del batterista");
});
t("floor accanto al batterista (profondità del rullante), ride davanti al floor", () => {
  const S = A.drumSlots({ toms: 2, floor: true, hihat: true, crash: 1, ride: true, stool: true });
  const by = {}; S.forEach((s) => { if (!by[s.k]) by[s.k] = s; });
  ok(Math.abs(by.floor.y - by.snare.y) <= 10, "floor alla profondità del rullante, non davanti alla cassa");
  ok(by.ride.y > by.floor.y, "ride davanti al floor, mai dietro");
});
t("batteria base (Simone): posizioni di default combaciano col kit di riferimento", () => {
  const S = A.drumSlots({ toms: 2, floor: true, hihat: true, crash: 1, ride: true, stool: true, mus: true });
  const by = {}; S.forEach((s) => { if (s.seat) by.seat = s; else if (!by[s.k]) by[s.k] = s; });
  const near = (got, exp, tol = 4) => ok(Math.abs(got - exp) <= tol, `atteso ~${exp}, ottenuto ${got}`);
  /* coord relative alla cassa (kick a 0,0) */
  near(by.snare.x, 21); near(by.snare.y, -35);
  near(by.hihat.x, 57); near(by.hihat.y, -53);
  near(by.crash.x, 47); near(by.crash.y, -18);
  near(by.ride.x, -45); near(by.ride.y, -14);
  near(by.floor.x, -36); near(by.floor.y, -37);
  near(by.seat.x, 9); near(by.seat.y, -91);
});
t("batteria: nessun pezzo perfettamente coincidente (default + config grandi)", () => {
  const cfgs = [
    { toms: 2, floor: true, hihat: true, crash: 1, ride: true, stool: true },
    { toms: 3, floor: true, hihat: true, crash: 2, ride: true, stool: true },
    { toms: 2, floor: true, hihat: true, crash: 2, ride: true, stool: true, kick2: true },
    { toms: 3, floor: true, hihat: true, crash: 2, ride: true, stool: true, kick2: true },
  ];
  cfgs.forEach((cfg, ci) => {
    const S = A.drumSlots(cfg).filter((s) => !s.seat);
    for (let i = 0; i < S.length; i++) for (let j = i + 1; j < S.length; j++) {
      const d = Math.hypot(S[i].x - S[j].x, S[i].y - S[j].y);
      ok(d > 8, `cfg#${ci} ${S[i].k}↔${S[j].k}: centri troppo vicini (${Math.round(d)} cm)`);
    }
  });
});
t("toggle mancino: specchia il kit sull'asse x", () => {
  const base = { toms: 2, floor: true, hihat: true, ride: true, stool: true };
  const R = A.drumSlots(Object.assign({}, base));
  const Lf = A.drumSlots(Object.assign({ lefty: true }, base));
  const rh = {}; R.forEach((s) => { if (!rh[s.k]) rh[s.k] = s; });
  const lh = {}; Lf.forEach((s) => { if (!lh[s.k]) lh[s.k] = s; });
  ok(rh.hihat.x > 0 && lh.hihat.x < 0, "hi-hat si specchia");
  ok(rh.floor.x < 0 && lh.floor.x > 0, "floor si specchia");
  eq(lh.hihat.x, -rh.hihat.x, "specchio esatto");
});
t("la batteria espone il controllo 'lefty' (default destrorso)", () => {
  ok(A.COMP.batteria.controls.map((c) => c.key).indexOf("lefty") >= 0, "control lefty presente");
  eq(A.COMP.batteria.defParts.lefty, false, "default = destrorso");
});

console.log("\nAnalytics — classificazione ambiente (env):");
t("analyticsEnv distingue prod / localhost / other", () => {
  eq(A.analyticsEnv("stageplot.it"), "prod");
  eq(A.analyticsEnv("www.stageplot.it"), "prod");
  eq(A.analyticsEnv("localhost"), "localhost");
  eq(A.analyticsEnv("127.0.0.1"), "localhost");
  eq(A.analyticsEnv("castelsim.github.io"), "other");
});

console.log("\nPrimo PDF completo (C) — channel list instrument-driven:");
t("autoInputs genera la input list dagli strumenti, senza attivare il cablaggio", () => {
  reset();
  add("batteria", 400, 400);       // kit → più canali (IN_MULTI)
  A.state.inputs = [];             // lista vuota, come dopo un template
  A.state.cab.on = false;
  A.autoInputs();
  ok(A.state.inputs.length >= 8, "batteria → ≥8 canali auto (ottenuti: " + A.state.inputs.length + ")");
  eq(A.state.cab.on, false, "il cablaggio NON viene attivato (C: nessun cavo disegnato)");
});
t("M-04: autoInputs(silent) genera in memoria SENZA salvare (apertura Esporta = anteprima non-mutante)", () => {
  reset();
  add("batteria", 400, 400);
  A.state.inputs = [];
  let saves = 0;
  const origSave = A.save;
  A.save = function () { saves++; };
  try {
    A.autoInputs(true);                       // silent, come l'apertura dell'hub Esporta
    ok(A.state.inputs.length >= 8, "le liste sono generate in memoria per l'anteprima");
    eq(saves, 0, "silent: nessun salvataggio all'apertura dell'anteprima");
    A.state.inputs = [];
    A.autoInputs();                           // normale (bottone Auto) → salva
    ok(saves >= 1, "non-silent: il salvataggio avviene (comportamento invariato)");
  } finally { A.save = origSave; }
});
console.log("\nAudit connessioni elementi (14/07):");
t("strumenti elettronici assorbono corrente: Hammond 250W, pedaliera 30W, SPD-SX 15W+2 DI", () => {
  reset();
  eq(A.wattOf(add("organohammond", 300, 300)), 250);
  reset(); eq(A.wattOf(add("pedaliera", 300, 300)), 30); reset(); eq(chans(add("pedaliera", 300, 300)).length, 1, "pedaliera = sorgente audio mono di default (modeler diretto; toggle stereo disponibile)");
  reset(); const sp = add("spdsx", 300, 300); eq(A.wattOf(sp), 15); eq(chans(sp).length, 2, "SPD-SX stereo via DI");
});
t("postazione DOPPIA (flag) = 2 microfoni; singola = 1; ×2 dedicata resta 2", () => {
  reset(); const v = add("vlnpost", 300, 300); eq(chans(v).length, 1, "singola");
  v.doppia = true; v.label = "Violino I 1"; v.label2 = "Violino I 2"; A.__cabRes = null;
  eq(chans(v).map((c) => c.name), ["Violino I 1", "Violino I 2"], "doppia = 2 nomi");
  reset(); eq(chans(add("vln1x2", 300, 300)).length, 2, "×2 dedicata già 2");
});
t("ampli/pedaliera su chitarra/basso = carico elettrico", () => {
  reset(); const g = add("gtstand", 300, 300); eq(A.wattOf(g), 0, "chitarra sola non consuma");
  g.ampli = true; eq(A.wattOf(g), 150, "+ampli combo"); g.pedaliera = true; eq(A.wattOf(g), 180, "+pedaliera");
  reset(); const b = add("bassstand", 300, 300); b.ampli = true; eq(A.wattOf(b), 400, "ampli basso");
});
t("batteria divisa nei pezzi conserva 8 microfoni", () => {
  reset();
  const parts = { kickR: "D6", snareR: "SM57", tomR: "e904", tomR2: "e904", floorR: "e904", hihatKR: "SM81", crashR: "KM184", rideR: "KM184" };
  let tot = 0;
  ["kickR", "snareR", "tomR", "tomR", "floorR", "hihatKR", "crashR", "rideR", "stoolR"].forEach((t2) => { reset(); tot += chans(add(t2, 200, 200)).length; });
  eq(tot, 8, "somma dei mic dei pezzi = 8 (stoolR = sgabello, 0)");
});

console.log("\nPersonal monitor model-driven (B1):");
t("P16-M diretto a hub = alimentato dal cavo; in serie = warn + PSU contato", () => {
  reset();
  const h = add("mixhub", 900, 300); h.pm = "p16d";
  const m1 = add("hearback", 300, 300); m1.pm = "p16m";
  const m2 = add("hearback", 400, 300); m2.pm = "p16m";
  A.state.mond.manual = {}; A.state.mond.manual[m1.id] = { to: h.id }; A.state.mond.manual[m2.id] = { to: m1.id };
  const R = A.monDigEngine();
  eq(R.power[m1.id], "data", "diretto a hub"); eq(R.power[m2.id], "psu", "in serie");
  eq(R.psuCount, 1, "PSU locali");
  ok(R.issues.some((i) => i.lvl === "warn" && /alimentatore locale/.test(i.msg)), "manca il warn PSU");
});
t("A320 in serie = err bloccante (hub-only, no PSU)", () => {
  reset();
  const m1 = add("hearback", 300, 300); m1.pm = "a320";
  const m2 = add("hearback", 400, 300); m2.pm = "a320";
  A.state.mond.manual = {}; A.state.mond.manual[m2.id] = { to: m1.id };
  const R = A.monDigEngine();
  ok(R.issues.some((i) => i.lvl === "err" && /serie/.test(i.msg)), "manca err serie A320");
  eq(R.power[m2.id], "invalid");
});
t("protocolli diversi (A-Net su hub ULTRANET) = err compatibilità", () => {
  reset();
  const h = add("mixhub", 900, 300); h.pm = "p16d";
  const m = add("hearback", 300, 300); m.pm = "a16ii";
  A.state.mond.manual = {}; A.state.mond.manual[m.id] = { to: h.id };
  const R = A.monDigEngine();
  ok(R.issues.some((i) => i.lvl === "err" && /NON sono compatibili/.test(i.msg)), "manca err protocolli");
});
t("9 OCTO su un OCTO Hub (8 porte) = err capacità", () => {
  reset();
  const h = add("mixhub", 900, 300); h.pm = "octohub";
  A.state.mond.manual = {};
  for (let i = 0; i < 9; i++) { const mx = add("hearback", 100 + i * 60, 300); mx.pm = "hbocto"; A.state.mond.manual[mx.id] = { to: h.id }; }
  const R = A.monDigEngine();
  ok(R.issues.some((i) => i.lvl === "err" && /porte/.test(i.msg)), "manca err capacità");
  eq(R.hubLoad[h.id], 9);
});
t("B2: il DESTINATARIO senza Thru (A320) non può ricevere un mixerino in serie", () => {
  reset();
  const m1 = add("hearback", 300, 300); m1.pm = "a320";     // A320 = niente Thru
  const m2 = add("hearback", 400, 300); m2.pm = "a16ii";    // A-16II può fare daisy, ma non VERSO un A320
  A.state.mond.manual = {}; A.state.mond.manual[m2.id] = { to: m1.id };
  const R = A.monDigEngine();
  ok(R.issues.some((i) => i.lvl === "err" && /Thru/.test(i.msg)), "manca err Thru sul destinatario");
});
t("B2 pmLinkCheck: blocca protocolli misti, serie vietata, hub pieno; ok sui validi", () => {
  reset(); A.state.mond.on = true;
  const h = add("mixhub", 900, 300); h.pm = "p16d";
  const mB = add("hearback", 300, 300); mB.pm = "p16m";
  const mA = add("hearback", 400, 300); mA.pm = "a16ii";
  ok(A.pmLinkCheck(mB, h) === null, "P16-M → P16-D deve essere valido");
  ok(A.pmLinkCheck(mA, h) !== null, "A-16II → P16-D va bloccato (protocolli)");
  const m320 = add("hearback", 500, 300); m320.pm = "a320";
  ok(A.pmLinkCheck(m320, mB) !== null, "A320 → mixer va bloccato (hub-only)");
  ok(A.pmLinkCheck(mB, m320) !== null, "mixer → A320 va bloccato (niente Thru)");
  // hub pieno: 8 collegati, il nono si blocca
  A.state.mond.manual = {};
  for (let i = 0; i < 8; i++) { const mx = add("hearback", 100 + i * 50, 500); mx.pm = "p16m"; A.state.mond.manual[mx.id] = { to: h.id }; }
  A.__mondRes = null;
  const m9 = add("hearback", 700, 500); m9.pm = "p16m";
  delete A.state.mond.manual[m9.id]; A.__mondRes = null;   /* l'auto-aggancio l'aveva messo in catena: qui testiamo il drop sull'hub pieno */
  ok(A.pmLinkCheck(m9, h) !== null, "nono mixer su hub da 8 va bloccato");
  // ma la RICONNESSIONE di uno già collegato allo stesso hub resta valida
  const first = A.state.items.filter((x) => A.state.mond.manual[x.id] && A.state.mond.manual[x.id].to === h.id)[0];
  ok(A.pmLinkCheck(first, h) === null, "riconnessione sullo stesso hub non conta come porta nuova");
});
t("B3 pmSysCompatible: A360 (Pro16e) su D400 (Pro16) = famiglia A-Net OK; ULTRANET resta bloccato", () => {
  reset(); A.state.mond.on = true;
  const d4 = add("mixhub", 900, 300); d4.pm = "d400";
  const a3 = add("hearback", 300, 300); a3.pm = "a360";
  ok(A.pmLinkCheck(a3, d4) === null, "A360 → D400 deve essere valido (retrocompatibile)");
  A.state.mond.manual = {}; A.state.mond.manual[a3.id] = { to: d4.id };
  const R = A.monDigEngine();
  ok(!R.issues.some((i) => /NON sono compatibili/.test(i.msg)), "niente err protocolli in famiglia A-Net");
  const p16 = add("hearback", 400, 300); p16.pm = "p16m";
  ok(A.pmLinkCheck(p16, d4) !== null, "ULTRANET → D400 resta bloccato");
});
t("B3 Thru singolo: due mixerini sullo stesso Thru = drop bloccato + err motore", () => {
  reset(); A.state.mond.on = true;
  const h = add("mixhub", 900, 300); h.pm = "p16d";
  const m1 = add("hearback", 300, 300); m1.pm = "p16m";
  const m2 = add("hearback", 400, 300); m2.pm = "p16m";
  const m3 = add("hearback", 500, 300); m3.pm = "p16m";
  A.state.mond.manual = {}; A.state.mond.manual[m1.id] = { to: h.id }; A.state.mond.manual[m2.id] = { to: m1.id };
  ok(A.pmLinkCheck(m3, m1) !== null, "secondo mixer sullo stesso Thru va bloccato");
  A.state.mond.manual[m3.id] = { to: m1.id };   // forzato (es. progetto vecchio)
  const R = A.monDigEngine();
  ok(R.issues.some((i) => i.lvl === "err" && /Thru/.test(i.msg) && /2 mixerini/.test(i.msg)), "manca err Thru multiplo");
});
t("B3 pmAutoConnect: stella fin dove c'è posto, poi catena per chi la supporta", () => {
  reset(); A.state.mond.on = true; A.state.mond.manual = {};
  const h = add("mixhub", 900, 300); h.pm = "p16d";
  const ms = [];
  for (let i = 0; i < 9; i++) { const m = add("hearback", 100 + i * 60, 300); m.pm = "p16m"; ms.push(m); }
  A.state.mond.manual = {}; A.__mondRes = null;   /* l'hook di addItem ha già agganciato coi modelli default: riparti pulito per testare la chiamata esplicita */
  const r = A.pmAutoConnect("ultranet");
  eq(r.done, 9, "tutti collegati"); eq(r.left, 0); eq(r.needPsu, 1, "il nono in catena → 1 PSU");
  const R = A.monDigEngine();
  eq((R.hubLoad || {})[h.id], 8, "8 a stella sul hub");
  ok(!R.issues.some((i) => i.lvl === "err"), "nessun errore dopo autoconnect");
});
t("B3 pmAutoConnect hub-only (OCTO): stella fino a 8, gli altri restano liberi (niente catena)", () => {
  reset(); A.state.mond.on = true; A.state.mond.manual = {};
  const h = add("mixhub", 900, 300); h.pm = "octohub";
  for (let i = 0; i < 10; i++) { const m = add("hearback", 100 + i * 50, 300); m.pm = "hbocto"; }
  A.state.mond.manual = {}; A.__mondRes = null;   /* idem: l'hook di addItem aggancia già in automatico */
  const r = A.pmAutoConnect("hearbus");
  eq(r.done, 8, "solo 8 collegati"); eq(r.left, 2, "2 senza posto"); eq(r.needPsu, 0, "nessuna catena OCTO");
});
t("B3 pmAddHub: crea l'hub giusto per il sistema al baricentro dei liberi", () => {
  reset(); A.state.mond.on = true; A.state.mond.manual = {};
  for (let i = 0; i < 3; i++) { const m = add("hearback", 200 + i * 100, 400); m.pm = "hbocto"; }
  const h = A.pmAddHub("hearbus");
  ok(h && h.pm === "octohub", "hub OCTO creato");
  const r = A.pmAutoConnect("hearbus");
  eq(r.done, 3, "tutti collegati al nuovo hub");
});
t("B3+ cascata OCTO↔OCTO (bus dedicato): 8 mixer + cascata = nessun errore, link presente", () => {
  reset(); A.state.mond.on = true; A.state.mond.manual = {};
  const h1 = add("mixhub", 900, 300); h1.pm = "octohub";
  const h2 = add("mixhub", 1200, 300); h2.pm = "octohub";
  for (let i = 0; i < 8; i++) { const m = add("hearback", 100 + i * 50, 300); m.pm = "hbocto"; A.state.mond.manual[m.id] = { to: h1.id }; }
  A.state.mond.manual[h2.id] = { to: h1.id };   // cascata h2 ← h1
  const R = A.monDigEngine();
  ok(!R.issues.some((i) => i.lvl === "err"), "la cascata dedicata non deve consumare porte");
  ok(R.links.some((l) => l.isCasc && l.from.id === h2.id && l.to.id === h1.id), "manca il link di cascata");
  eq((R.hubLoad || {})[h1.id], 8, "8 porte usate dai mixer, cascata esclusa");
});
t("B3+ cascata P16-D (usa una porta): 8 mixer + cascata = err capacità 9/8", () => {
  reset(); A.state.mond.on = true; A.state.mond.manual = {};
  const h1 = add("mixhub", 900, 300); h1.pm = "p16d";
  const h2 = add("mixhub", 1200, 300); h2.pm = "p16d";
  for (let i = 0; i < 8; i++) { const m = add("hearback", 100 + i * 50, 300); m.pm = "p16m"; A.state.mond.manual[m.id] = { to: h1.id }; }
  A.state.mond.manual[h2.id] = { to: h1.id };
  const R = A.monDigEngine();
  eq((R.hubLoad || {})[h1.id], 9, "la cascata ULTRANET consuma una porta");
  ok(R.issues.some((i) => i.lvl === "err" && /porte/.test(i.msg)), "manca err capacità con cascata");
});
t("B3+ cascata cross-sistema e loop = err; pmLinkCheck hub→hub/hub→mixer", () => {
  reset(); A.state.mond.on = true; A.state.mond.manual = {};
  const ho = add("mixhub", 900, 300); ho.pm = "octohub";
  const hp = add("mixhub", 1200, 300); hp.pm = "p16d";
  ok(A.pmLinkCheck(ho, hp) !== null, "cascata OCTO→P16-D va bloccata (sistemi diversi)");
  const m = add("hearback", 300, 300); m.pm = "hbocto";
  ok(A.pmLinkCheck(ho, m) !== null, "hub→mixer via drop cascata va spiegato/bloccato");
  const ho2 = add("mixhub", 600, 300); ho2.pm = "octohub";
  ok(A.pmLinkCheck(ho, ho2) === null, "cascata OCTO→OCTO valida");
  A.state.mond.manual[ho.id] = { to: ho2.id }; A.state.mond.manual[ho2.id] = { to: ho.id };   // anello
  const R = A.monDigEngine();
  ok(R.issues.some((i) => i.lvl === "err" && /Loop nella cascata/.test(i.msg)), "manca err loop cascata");
});
t("generico (senza it.pm): zero vincoli nuovi, zero PSU contati", () => {
  reset();
  const h = add("mixhub", 900, 300);
  const m1 = add("hearback", 300, 300); const m2 = add("hearback", 400, 300);
  A.state.mond.manual = {}; A.state.mond.manual[m1.id] = { to: h.id }; A.state.mond.manual[m2.id] = { to: m1.id };
  const R = A.monDigEngine();
  ok(!R.issues.some((i) => i.lvl === "err"), "err inatteso sul generico");
  eq(R.psuCount, 0, "PSU sul generico");
});

console.log("\nPM — estensione modelli/sistemi (15/07):");
t("PM_DB: 10 nuovi modelli presenti (ver partial)", () => {
  ["a640", "me1", "me500", "meu", "dp48", "hub4", "klangk", "lmcsduo", "mix16", "mix32"].forEach((k) => ok(A.PM_DB[k], "manca " + k));
  eq(A.PM_DB.dp48.ver, "partial"); eq(A.PM_DB.meu.role, "hub"); eq(A.PM_DB.meu.ports, 10);
  eq(A.PM_DB.dp48.sys, "aes50pm"); eq(A.PM_DB.me1.daisy, true);
});
t("PM_SYS: 4 nuovi sistemi", () => { ["me", "aes50pm", "klang", "livemix"].forEach((s) => ok(A.PM_SYS[s], "manca sys " + s)); });
t("pmSysCompatible: sistemi diversi NON compatibili (RJ45 ≠ compatibile), A-Net famiglia sì", () => {
  ok(!A.pmSysCompatible("me", "aes50pm")); ok(!A.pmSysCompatible("livemix", "klang"));
  ok(A.pmSysCompatible("anet16", "anetpro16e")); ok(A.pmSysCompatible("me", "me"));
});
t("pmLinkCheck: ME-1 su Hub4 (sistemi diversi) = bloccato", () => {
  reset(); const mx = add("hearback", 300, 300); mx.pm = "me1"; const hub = add("mixhub", 400, 300); hub.pm = "hub4";
  const r = A.pmLinkCheck(mx, hub); ok(r && /NON sono compatibili/.test(r.msg), "atteso blocco cross-sistema; got " + JSON.stringify(r));
});
t("pmLinkCheck: DP48 su Hub4 (stesso AES50) = ok", () => {
  reset(); const mx = add("hearback", 300, 300); mx.pm = "dp48"; const hub = add("mixhub", 400, 300); hub.pm = "hub4";
  eq(A.pmLinkCheck(mx, hub), null);
});
t("PM_DEFAULT_HUB: nuovi sistemi mappati", () => { eq(A.PM_DEFAULT_HUB.me, "meu"); eq(A.PM_DEFAULT_HUB.aes50pm, "hub4"); eq(A.PM_DEFAULT_HUB.livemix, "mix32"); });

console.log("\nAudit T1 — controlli residui (auditEngine):");
function auditMsgs() { return A.auditEngine().findings.map((f) => f.msg); }
function hasMsg(re) { return auditMsgs().some((m) => re.test(m)); }
function auditFind(re) { return A.auditEngine().findings.filter((f) => re.test(f.msg)); }

t("una superficie di controllo senza rack: manca meta' del sistema", () => {
  /* Rivage e dLive S-Class non sono console intere ma SUPERFICI: il DSP sta in un rack a parte, che
     pesa 20 kg e assorbe 190 W. Chi porta una CS-R10 senza il suo motore arriva con un banco che non
     fa suono, e il rider e' incompleto. Il nostro dato di targa e' giusto ma dice meta' della storia,
     quindi l'altra meta' la dice l'audit. */
  reset(); add("csr10", 400, 400);
  ok(hasMsg(/superficie di controllo/), "atteso il promemoria; findings: " + auditMsgs().join(" | "));
  ok(hasMsg(/RIVAGE PM: motore DSP/), "e dice QUALE motore, non «un rack» generico");
  /* Basta un rack sul palco e tace: e' un promemoria, non un rimprovero che non si puo' chiudere. */
  add("rack4u", 500, 400);
  ok(!hasMsg(/superficie di controllo/), "col rack posato non insiste");
  /* Una console INTERA non lo fa scattare: la DM7 il suo DSP ce l'ha dentro. */
  reset(); add("dm7", 400, 400);
  ok(!hasMsg(/superficie di controllo/), "la DM7 e' una console intera, non una superficie");
  /* E la dLive nomina il suo, che si chiama in un altro modo. */
  reset(); add("dlives7", 400, 400);
  ok(hasMsg(/MixRack/), "per la dLive il motore si chiama MixRack; findings: " + auditMsgs().join(" | "));
  /* E deve avere un livello che ARRIVA SULLO SCHERMO. Il pannello filtra err/warn/todef: un
     rilievo "info" si calcola e non lo vede nessuno — l'avevo scritto proprio cosi', e questa
     suite restava verde perche' guarda i findings del motore, non la lista che si vede. */
  reset(); add("csr10", 400, 400);
  const f = A.auditEngine().findings.find(x => /superficie di controllo/.test(x.msg));
  ok(f && ["err", "warn", "todef"].includes(f.lvl),
     "livello «" + (f && f.lvl) + "»: il pannello mostra solo err/warn/todef");
});

t("i rilievi usano categorie che esistono davvero", () => {
  /* La categoria finisce stampata tale e quale nel pannello (nessuna lista la filtra), quindi una
     inventata non da' errore: crea una sezione nuova da sola, con dentro un rilievo solo. Ci sono
     cascato scrivendo «Regia», che non era mai stata usata da nessuno. */
  const note = ["Progetto", "Audio", "Elettrico", "Monitor", "Luci", "Palco", "Produzione",
                "Rider", "Contatti", "Stato", "Generale", "Sicurezza e site"];
  reset();
  ["csr10", "dm7", "wedge", "comboamp", "astamic", "batteria", "testamobile", "quadro"].forEach((t, i) => add(t, 200 + i * 60, 300));
  const fuori = [...new Set(A.auditEngine().findings.map(f => f.cat))].filter(c => !note.includes(c));
  eq(fuori.length, 0, "categorie mai viste prima: " + fuori.join(", "));
});

t("48V forzato su mic dinamico (SM58) → avviso", () => {
  reset(); add("astamic", 400, 400);
  A.state.inputs = [{ src: "Voce", mic: "SM58", p48: true }];
  ok(hasMsg(/48V/), "atteso avviso 48V; findings: " + auditMsgs().join(" | "));
});
t("48V su condensatore (KM184) → nessun avviso 48V", () => {
  reset(); add("astamic", 400, 400);
  A.state.inputs = [{ src: "Overhead", mic: "KM184", p48: true }];
  ok(!hasMsg(/48V/), "48V atteso corretto (condensatore); findings: " + auditMsgs().join(" | "));
});
t("ingresso manuale con sorgente ma senza mic/DI → avviso", () => {
  reset(); add("astamic", 400, 400);
  A.state.inputs = [{ src: "Chitarra", mic: "" }];
  ok(hasMsg(/senza mic/), "findings: " + auditMsgs().join(" | "));
});
t("radiomic (wireless) senza frequenza RF → avviso", () => {
  reset(); add("wireless", 400, 400);
  ok(hasMsg(/RF/), "findings: " + auditMsgs().join(" | "));
});
t("radiomic con frequenza RF → nessun avviso RF", () => {
  reset(); const w = add("wireless", 400, 400); w.rf = "606.500"; A.__cabRes = null;
  ok(!hasMsg(/senza frequenza RF/), "findings: " + auditMsgs().join(" | "));
});
t("due radio sulla STESSA frequenza scritta in due modi → errore lo stesso", () => {
  /* «606.25» e «606.250» sono la stessa portante: chi compila la lista copia dai display di due
     ricevitori diversi, che la scrivono con decimali diversi. Confrontando le stringhe, l'errore più
     banale del mestiere — due bodypack sullo stesso canale — passava senza una parola (25/08). */
  reset();
  const a = add("wireless", 300, 300); a.rf = "606.25"; a.label = "Voce 1";
  const b = add("wireless", 500, 300); b.rf = "606.250"; b.label = "Voce 2";
  add("rxrf", 700, 700);
  const msg = A.rfIssues().map((i) => i.msg).join(" | ");
  ok(/duplicata/.test(msg), "atteso errore di frequenza duplicata; avvisi: " + msg);
  /* la virgola all'italiana è la stessa frequenza */
  b.rf = "606,25";
  ok(/duplicata/.test(A.rfIssues().map((i) => i.msg).join(" | ")), "606,25 = 606.25");
  /* e due frequenze davvero diverse non devono diventare un falso allarme */
  b.rf = "612.100";
  ok(!/duplicata/.test(A.rfIssues().map((i) => i.msg).join(" | ")), "612.1 e 606.25 sono diverse");
});
t("il connettore segue la CORRENTE, non il tipo: niente PowerCON su 30 A", () => {
  /* Il powerCON è un connettore da 20 A (TRUE1: 16). Il PDF «Alimentazioni» stampava «PowerCON» per
     una linea da 30 A mentre l'avviso, due righe sotto, chiedeva una CEE: chi prepara i cavi segue il
     connettore stampato (25/08). */
  eq(A.elecConnOf({ type: "amprack" }, 8).label, "PowerCON", "sotto i 16 A il rack resta PowerCON");
  eq(A.elecConnOf({ type: "amprack" }, 30).k, "cee", "a 30 A diventa CEE");
  eq(A.elecConnOf({ type: "amprack" }, 30).label, "CEE32", "e con la portata giusta");
  eq(A.elecConnOf({ type: "rack" }, 45).label, "CEE63", "45 A → CEE63");
  eq(A.elecConnOf({ type: "amprack" }, 30, "powercon").k, "cee", "nemmeno scelto a mano: a 30 A il PowerCON non esiste");
  eq(A.elecConnOf({ type: "amprack" }, 12, "powercon").k, "pc", "ma sotto soglia la scelta a mano vale");
});
t("quadro sovraccarico: oltre la portata è un ERRORE, non un silenzio", () => {
  /* Una mutazione che invertiva questa soglia lasciava la suite tutta verde: il caso limite più
     pericoloso del motore elettrico non era provato da nessuno (25/08). Il sovraccarico non nasce dai
     carichi diretti — quelli il motore li rifiuta se non entrano — ma dalla RISALITA. Qui il caso da
     palco: due ciabatte piene infilate in una terza, che è da 16 A e ne riceve 31. */
  reset(); A.state.elec.on = true; A.state.elec.mode = "manual";
  const madre = add("ciabatta", 600, 600);
  A.state.elec.uplinks = {};
  A.state.elec.manual = {};
  [0, 1].forEach((i) => {
    const c = add("ciabatta", 300 + i * 300, 300);
    const r = add("amprack", 300 + i * 300, 200); r.watt = 3600;   /* ~15,6 A: entra in una ciabatta da 16 */
    A.state.elec.manual[r.id] = { distro: c.id };
    A.state.elec.uplinks[c.id] = { to: madre.id };
  });
  A.__elecRes = null;
  const msgs = (A.electricEngine().issues || []).map((i) => i.lvl + ":" + i.msg);
  ok(msgs.some((m) => /^err:/.test(m) && /sovraccarico/.test(m) && /su una fase \(max/.test(m)),
    "atteso «sovraccarico … su una fase (max N A)»; avvisi: " + msgs.join(" | "));
  /* e una ciabatta sola sotto la sua portata NON deve gridare al sovraccarico */
  reset(); A.state.elec.on = true; A.state.elec.mode = "manual";
  const m2 = add("ciabatta", 600, 600);
  const c2 = add("ciabatta", 300, 300);
  const r2 = add("amprack", 300, 200); r2.watt = 1500;
  A.state.elec.manual = { [r2.id]: { distro: c2.id } };
  A.state.elec.uplinks = { [c2.id]: { to: m2.id } };
  A.__elecRes = null;
  ok(!(A.electricEngine().issues || []).some((i) => /sovraccarico/.test(i.msg)),
    "1,5 kW su una ciabatta da 16 A non è un sovraccarico");
});
t("il testo secondario si legge davvero: contrasto calcolato, non a occhio", () => {
  /* --text-3 è il colore dei conteggi del catalogo, delle note sotto i campi e del segnaposto del
     titolo: 100+ usi a 10-12px. Era 2,73:1 sul bianco (minimo WCAG AA per testo normale: 4,5:1) e
     2,48:1 sul fondo pagina — su un portatile in penombra dietro il banco spariva (25/08).
     Questo test CALCOLA il rapporto: se qualcuno ritocca la tinta sotto soglia, diventa rosso. */
  const lum = (hex) => {
    const c = hex.replace("#", "").match(/../g).map((x) => parseInt(x, 16) / 255)
      .map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  };
  const ratio = (a, b) => { const l1 = lum(a), l2 = lum(b); return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05); };
  /* i valori si leggono dal CSS sorgente, non si riscrivono qui: il test deve seguire il file */
  const leggi = (da) => (stylesCss.slice(da, da + 32).match(/^--text-3:\s*(#[0-9a-f]{6})/i) || [])[1];
  const t3 = leggi(stylesCss.indexOf("--text-3:"));   /* la PRIMA dichiarazione = tema chiaro */
  ok(t3, "--text-3 dev'essere un colore esplicito nel tema chiaro (un var() qui non è verificabile): " + t3);
  const rBianco = ratio(t3, "#ffffff"), rFondo = ratio(t3, "#f5f4f0");   /* --surface e --bg (--n-50) */
  ok(rBianco >= 4.5, "sul bianco delle superfici serve 4,5:1, è " + rBianco.toFixed(2));
  ok(rFondo >= 4.0, "e sul fondo pagina almeno 4:1, è " + rFondo.toFixed(2));
  /* tema scuro: stessa misura sul suo fondo */
  /* il tema scuro qui è `body.dark`, non un @media prefers-color-scheme: la sua dichiarazione di
     --text-3 è l'ultima del file */
  const t3d = leggi(stylesCss.lastIndexOf("--text-3:"));
  ok(t3d, "--text-3 dichiarato anche nel tema scuro: " + t3d);
  const rScuro = ratio(t3d, "#1b2327");   /* --surface del tema scuro */
  ok(rScuro >= 4.0, "sul fondo scuro almeno 4:1, è " + rScuro.toFixed(2));
  /* e deve restare DISTINGUIBILE dal testo primario, o la gerarchia sparisce */
  ok(ratio(t3, "#292620") > 1.5, "resta più chiaro del testo principale");
});

t("un progetto BLOCCATO non si elimina: prima si sblocca", () => {
  /* Il lucchetto rendeva il progetto read-only ma lasciava passare l'eliminazione, con una conferma
     dal testo più severo e lo stesso identico gesto: cestino, Elimina, sparito. Il progetto bloccato
     è per definizione quello che non deve sparire — la versione approvata, già mandata al service.
     Ora il cestino porta allo SBLOCCO, e l'eliminazione resta una scelta successiva (25/08). */
  eq(A.projectDeleteGuard({ id: "p1", is_locked: true }), "sblocca", "bloccato → si offre lo sblocco");
  eq(A.projectDeleteGuard({ id: "p2", is_locked: false }), "elimina", "sbloccato → si elimina come sempre");
  eq(A.projectDeleteGuard({ id: "p3" }), "elimina", "senza il campo: sbloccato");
  eq(A.projectDeleteGuard(undefined), "elimina", "progetto sconosciuto: il cestino nasce dalla riga, e la riga esiste");
  /* e la finestra deve OFFRIRE lo sblocco, non limitarsi a rifiutare */
  const dp = appjs.slice(appjs.indexOf("function delProject"), appjs.indexOf("function delProject") + 3200);
  ok(/projectDeleteGuard\(pj\)\s*===\s*"sblocca"/.test(dp), "delProject passa dalla guardia");
  ok(/confirmOr\([^)]*Prima sblocca/.test(dp) || /Prima sblocca/.test(dp), "la finestra propone di sbloccare");
  ok(/doLockUpdate\(id,\s*false\)/.test(dp), "e il pulsante sblocca davvero");
  ok(!/confirmText:"Elimina"[\s\S]{0,400}is_locked/.test(dp), "nessuna scorciatoia che elimini un bloccato");
});

t("nessuna Edge Function legge la service role da sé: passano tutte da serviceRoleKey()", () => {
  /* Dal 26/08 le function usano _shared/service-role-key.ts, che sceglie la chiave legacy quando c'è:
     serve contro «JWT issued at future», l'errore che teneva rosso il worker delle notifiche. Il
     rimedio vale solo se lo usano TUTTE — una function nuova che scrive
     Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") dentro createClient si riprende l'errore, e per
     stripe-webhook vorrebbe dire un pagamento non registrato. Il controllo sta qui e non nella suite
     Deno perché lì leggere i file chiederebbe --allow-read, cioè cambiare il comando che si lancia
     ogni volta. */
  const dir = join(root, "supabase/functions");
  const colpevoli = readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name !== "_shared")
    .filter((d) => {
      let src = "";
      try { src = readFileSync(join(dir, d.name, "index.ts"), "utf8"); } catch { return false; }
      return /Deno\.env\.get\(\s*["']SUPABASE_SERVICE_ROLE_KEY["']\s*\)/.test(src);
    })
    .map((d) => d.name);
  eq(colpevoli.length, 0, "leggono la chiave da sé: " + colpevoli.join(", "));
  /* e almeno una la usa davvero, o il test sopra sarebbe verde anche a rimedio sparito */
  const usano = readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name !== "_shared")
    .filter((d) => {
      try { return /serviceRoleKey\(Deno\.env\)/.test(readFileSync(join(dir, d.name, "index.ts"), "utf8")); }
      catch { return false; }
    });
  ok(usano.length >= 7, "tutte le function che parlano col database ci passano: " + usano.length);
});

t("una funzione SQL a cui si toglie l'execute lo ridà alla service_role", () => {
  /* 02/09, trovato PRIMA di applicare la 0040 e non dopo. `revoke execute ... from public` toglie
     il permesso a OGNI ruolo tranne l'owner — service_role compresa, che non è superuser. Senza il
     grant che segue, la Edge Function chiama la sua RPC e si prende un errore di permessi: un
     guasto che non si vede scrivendo il codice, solo in produzione a cose fatte.
     Il pattern giusto è quello della 0025 (feedback_throttle_hit): revoke, poi grant. */
  const dir = join(root, "supabase/migrations");
  const mancanti = [];
  for (const f of readdirSync(dir).filter((x) => /\.sql$/.test(x))) {
    const sql = readFileSync(join(dir, f), "utf8");
    /* i nomi delle funzioni a cui questa migrazione toglie l'execute */
    for (const m of sql.matchAll(/revoke\s+(?:all|execute)\s+on\s+function\s+([\w.]+)\s*\([^)]*\)[\s\S]{0,120}?from[^;]*;/gi)) {
      const fn = m[1];
      /* Le funzioni TRIGGER non c'entrano: le esegue il trigger per conto dell'owner, e nessuno le
         chiama via RPC. Toglier loro l'execute a tutti è anzi giusto — è il caso della 0023. */
      const decl = new RegExp("create (?:or replace )?function\\s+" + fn.replace(".", "\\.") + "\\s*\\([^)]*\\)\\s*returns\\s+trigger", "i");
      if (decl.test(sql)) continue;
      const ridato = new RegExp("grant\\s+execute\\s+on\\s+function\\s+" + fn.replace(".", "\\.") + "\\s*\\([^)]*\\)[\\s\\S]{0,120}?to[^;]*service_role", "i");
      if (!ridato.test(sql)) mancanti.push(f + " → " + fn);
    }
  }
  eq(mancanti.length, 0,
     "a queste funzioni è tolto l'execute e non è ridato a service_role: " + mancanti.join(" | "));
});

t("il divieto vive anche nel database, non solo nella finestra", () => {
  /* Una regola che sta solo nel client protegge dallo sbaglio e non dal guasto: basta una richiesta
     malformata o una scheda vecchia rimasta aperta e il progetto se ne va lo stesso. */
  const dir = join(root, "supabase/migrations");
  const nome = readdirSync(dir).filter((f) => /locked_no_delete\.sql$/.test(f))[0];
  ok(nome, "esiste la migrazione che chiude l'eliminazione dei bloccati");
  const sql = readFileSync(join(dir, nome), "utf8").replace(/\s+/g, " ");
  const clausola = (sql.match(/for delete using[^;]*/) || [""])[0].trim();
  ok(/is_locked/.test(clausola), "la policy di delete guarda is_locked: " + clausola);
  ok(/=\s*false/.test(clausola), "e ammette solo i NON bloccati: " + clausola);
  ok(/auth\.uid\(\) = user_id/.test(sql), "e continua a limitare ai propri progetti");
  /* la migrazione dev'essere l'ULTIMA a toccare quella policy, o una successiva la riaprirebbe */
  const dopo = readdirSync(dir).filter((f) => f > nome && /\.sql$/.test(f))
    .filter((f) => /Elimina propri progetti/.test(readFileSync(join(dir, f), "utf8")));
  eq(dopo.length, 0, "nessuna migrazione successiva ridefinisce la policy: " + dopo.join(", "));
});

t("un id ripetuto nel file non fa sparire un montaggio in silenzio", () => {
  /* Due elementi con lo stesso id: il secondo viene rinominato, e chi ci puntava resta agganciato
     all'omonimo — di tipo diverso — quindi il riferimento viene buttato. Un apparecchio smetteva di
     essere montato nel rack e nessuno lo diceva (25/08). Riagganciarlo non si può (a quale dei due?),
     dichiararlo sì. */
  const s = {
    titolo: "", luogo: "", stage: { w: 1200, d: 800, blocks: [{ x: 0, y: 0, w: 1200, d: 800 }] },
    items: [
      { id: "rack1", type: "dimono", x: 100, y: 100 },
      { id: "rack1", type: "rack", x: 300, y: 300, rackU: 12 },
      { id: "amp1", type: "dimono", x: 500, y: 500, rackId: "rack1" },
    ], inputs: [], outputs: [],
  };
  A.normalizeState(s);
  eq(A.normalizeLoadedItems.lastDupIds, 1, "un id ripetuto contato");
  /* e un documento sano non deve accusare nessuno */
  A.normalizeState({
    titolo: "", luogo: "", stage: { w: 1200, d: 800, blocks: [{ x: 0, y: 0, w: 1200, d: 800 }] },
    items: [{ id: "a1", type: "rack", x: 10, y: 10 }, { id: "a2", type: "dimono", x: 20, y: 20 }],
    inputs: [], outputs: [],
  });
  eq(A.normalizeLoadedItems.lastDupIds, 0, "nessun falso allarme su un file sano");
});

t("le finestre «I tuoi progetti» e «La mia rubrica» stanno dentro il contratto di dialogo", () => {
  /* Trappola del fuoco, sfondo inert e ritorno al comando valgono per le finestre elencate in
     MODAL_SEL. #cloudModal — da cui si comincia a lavorare — ne era fuori, e la rubrica nasce a
     runtime DOPO la scansione, quindi non basta il selettore: va registrata a mano (25/08). */
  const blocco = appjs.slice(appjs.indexOf("var MODAL_SEL="), appjs.indexOf("var MODAL_SEL=") + 200);
  ok(/#cloudModal/.test(blocco), "«I tuoi progetti» nel selettore: " + blocco.split("\n")[0]);
  ok(/window.__a11yModal\s*=/.test(appjs), "esiste l'aggancio per le finestre create a runtime");
  const rub = appjs.slice(appjs.indexOf("window.__openRubricaModal=function"), appjs.indexOf("window.__openRubricaModal=function") + 1800);
  ok(/__a11yModal\(ov\)/.test(rub), "e la rubrica lo chiama alla creazione");
});

t("il +48V sopravvive al salvataggio della riga di canale", () => {
  /* normalizeChannelRow passa su ogni riga caricata da disco: azzerando il p48 la suite restava
     verde, e un rider consegnato prometteva phantom dove non c'era (25/08). */
  const on = A.normalizeChannelRow({ src: "voce", mic: "KM184", p48: true });
  const off = A.normalizeChannelRow({ src: "basso", mic: "DI", p48: false });
  eq(on.p48, true, "il phantom acceso resta acceso");
  eq(off.p48, false, "e quello spento resta spento");
  eq(A.normalizeChannelRow({ src: "x", p48: 1 }).p48, true, "un 1 da JSON diventa true");
  eq(A.normalizeChannelRow({ src: "x" }).p48, false, "assente = spento");
});
t("capienza stage box superata → err con fix a un click", () => {
  reset(); A.state.cab.on = true;
  const b = add("stagebox", 600, 600); b.ch = 2; b.outCh = 2; A.__cabRes = null;
  add("batteria", 300, 300); cabla();
  const f = auditFind(/superiori ai canali|satura/);
  ok(f.length > 0, "atteso errore capienza; findings: " + auditMsgs().join(" | "));
  ok(f.some((x) => x.act), "atteso fix a un click sull'errore capienza");
});
/* Audit 27/07: un duo acustico non è un progetto sbagliato. Le regole «manca la stage box», «manca il
   quadro», «mancano i monitor» erano tarate su una produzione media e scattavano su due canali e un
   ampli da 150 W, con l'aggravante che «nessun quadro» usciva DUE volte (warn qui, err dal motore
   elettrico, testi diversi → la dedup per stringa non scattava) e l'err bloccava l'export del PDF. */
t("progetto piccolo: niente stage box/distro/monitor richiesti, e nessun errore critico", () => {
  reset(); A.state.cab.on = true; A.state.elec.on = true;
  add("astamic", 300, 300);                 /* 1 canale voce */
  const amp = add("comboamp", 500, 300);    /* 150 W: un ampli in una Schuko */
  A.__cabRes = null; A.__elecRes = null;
  const R = A.auditEngine();
  eq(R.errs, 0, "un duo non deve avere errori critici; findings: " + auditMsgs().join(" | "));
  ok(!hasMsg(/nessuna stage box/), "sotto i 4 canali la stage box non serve");
  ok(!hasMsg(/nessun quadro\/distro/), "sotto 1 kW il quadro non serve");
  ok(!hasMsg(/i musicisti non si sentono/), "sotto i 4 canali i monitor sono del locale");
  ok(amp && A.WATT.comboamp === 150, "il carico di prova deve restare piccolo");
});
t("progetto grande: le stesse regole tornano, e «nessun quadro» esce UNA volta sola", () => {
  reset(); A.state.cab.on = true; A.state.elec.on = true;
  add("batteria", 300, 300); add("astamic", 400, 400); add("astamic", 500, 400);
  for (let i = 0; i < 6; i++) add("stack", 200 + i * 60, 600);   /* 6 × 250 W = 1,5 kW */
  A.__cabRes = null; A.__elecRes = null;
  /* Il rilievo c'è ancora, ma dal 31/08 dice un'altra cosa: non «manca» — la porta il service —
     ma «se vuoi disegnare tu dove entrano i canali, aggiungi una box». A una band che manda il
     rider al locale il vecchio testo diceva che aveva sbagliato mentre aveva fatto tutto giusto. */
  ok(hasMsg(/nessuna stage box/), "sopra soglia il rilievo torna");
  ok(hasMsg(/la porta il service/), "e dice di chi è il pezzo, invece di dare la colpa a chi legge");
  const q = auditFind(/nessun quadro\/distro/);
  eq(q.length, 1, "la regola del quadro deve comparire una volta sola; findings: " + auditMsgs().join(" | "));
  /* Su un progetto in cui l'elettrico non è ancora stato aperto la mancanza è un «non hai ancora
     fatto»: sei modelli su otto nascevano con un errore critico, e un errore che compare sempre
     smette di essere letto (decisione 16/08). */
  eq(q[0].lvl, "warn", "finché l'elettrico non è stato aperto, il quadro mancante è un avviso");
  /* appena l'utente dichiara l'alimentazione, torna quello che è: un errore critico */
  A.state.elec.supply = { kind: "rete", x: 0, y: 0 };
  A.__cabRes = null; A.__elecRes = null;
  const q2 = auditFind(/nessun quadro\/distro/);
  eq(q2.length, 1, "e resta una voce sola");
  eq(q2[0].lvl, "err", "aperto l'elettrico è un errore critico: la dedup non deve declassarlo");
  ok(q2[0].act, "e deve conservare il fix a un click (è la voce di auditEngine a sopravvivere)");
  ok(A.auditEngine().errs > 0, "il conteggio errori deve vederlo");
});
t("monitor scoperto (wedge lontano, no IEM) → avviso", () => {
  reset(); A.state.cab.on = true;
  add("astamic", 200, 200); add("wedge", 1100, 700); A.__cabRes = null;
  ok(hasMsg(/lontan[ae] da ogni monitor/), "findings: " + auditMsgs().join(" | "));
});
t("monitor vicino → nessun avviso scoperto", () => {
  reset(); A.state.cab.on = true;
  add("astamic", 400, 400); add("wedge", 430, 430); A.__cabRes = null;
  ok(!hasMsg(/lontan[ae] da ogni monitor/), "findings: " + auditMsgs().join(" | "));
});
t("palco su IEM/personal monitor → check prossimità saltato", () => {
  reset(); A.state.cab.on = true;
  add("astamic", 200, 200); add("wedge", 1100, 700); add("iem", 1150, 700); A.__cabRes = null;
  ok(!hasMsg(/lontan[ae] da ogni monitor/), "con IEM il check va saltato; findings: " + auditMsgs().join(" | "));
});

console.log("\nT3 — viste liste nel link condiviso (availableViewerLists):");
t("stage vuoto → nessuna lista disponibile", () => {
  reset(); eq(A.availableViewerLists().length, 0);
});
t("sorgente audio → Input list disponibile", () => {
  reset(); A.state.cab.on = true; add("astamic", 400, 400); A.__cabRes = null;
  ok(A.availableViewerLists().some((l) => l.key === "inputlist"), "atteso inputlist; got " + JSON.stringify(A.availableViewerLists()));
});
t("radiomic → Lista RF disponibile", () => {
  reset(); A.state.cab.on = true; add("wireless", 400, 400); A.__cabRes = null;
  ok(A.availableViewerLists().some((l) => l.key === "rf"), "atteso rf; got " + JSON.stringify(A.availableViewerLists()));
});
t("sorgente + wedge → Monitor list disponibile", () => {
  reset(); A.state.cab.on = true; add("astamic", 300, 300); add("wedge", 350, 350); A.__cabRes = null;
  ok(A.availableViewerLists().some((l) => l.key === "monitorlist"), "atteso monitorlist; got " + JSON.stringify(A.availableViewerLists()));
});
t("listPreviewHtml('inputlist') → tabella HTML con dati reali", () => {
  reset(); A.state.cab.on = true; add("astamic", 400, 400); A.__cabRes = null;
  const h = A.listPreviewHtml("inputlist");
  ok(h && /pdf-list-tbl/.test(h) && /Input list/.test(h), "html: " + String(h).slice(0, 90));
});

console.log("\nMusicisti illustrati (icone top-down) — cablaggio tecnico:");
t("musViolino1 = 1 canale DPA 4099 (come vlnpost)", () => { reset(); const v = add("musViolino1", 300, 300); eq(chans(v).length, 1); eq(chans(v)[0].mic, "DPA 4099"); });
t("musTromba = 1 canale e906 · musCorno = MD421", () => { reset(); eq(chans(add("musTromba", 200, 200))[0].mic, "e906"); eq(chans(add("musCorno", 260, 200))[0].mic, "MD421"); });
t("musBatteria = 8 canali (riusa IN_MULTI.batteria)", () => { reset(); eq(chans(add("musBatteria", 400, 400)).length, 8); });
t("musPianoGranCoda = 2 canali KM184 · musBasso = 1 DI", () => { reset(); eq(chans(add("musPianoGranCoda", 400, 400)).length, 2); eq(chans(add("musBasso", 200, 400))[0].mic, "DI"); });
t("musDirettore = 0 canali (non è una sorgente audio)", () => { reset(); eq(chans(add("musDirettore", 300, 300)).length, 0); });
t("dimensioni calibrate dall'utente: musViolino1 80×81, musPianoGranCoda 135×238", () => {
  eq([A.TYPES.musViolino1.w, A.TYPES.musViolino1.d], [80, 81]);
  eq([A.TYPES.musPianoGranCoda.w, A.TYPES.musPianoGranCoda.d], [135, 238]);
});

console.log("\nSedie (peso per il rider):");
t("sediaorch 44×48 · 6 kg · sediapubblico 50×53 · 3,5 kg", () => {
  eq([A.TYPES.sediaorch.w, A.TYPES.sediaorch.d], [44, 48]);
  eq([A.TYPES.sediapubblico.w, A.TYPES.sediapubblico.d], [50, 53]);
  eq(A.weightOf({ type: "sediaorch" }), 6);
  eq(A.weightOf({ type: "sediapubblico" }), 3.5);
});
t("riderData.pesoKg somma il peso delle sedie", () => {
  reset(); add("sediaorch", 300, 300); add("sediaorch", 340, 300); add("sediapubblico", 500, 300);
  eq(A.riderData().pesoKg, 6 + 6 + 3.5);
});

console.log("\nT2 — rider tecnico generato dai dati:");
t("riderData: canali derivati + testo default", () => {
  reset(); A.state.cab.on = true; add("astamic", 300, 300); A.__cabRes = null;
  const r = A.riderData();
  ok(r.inCh >= 1, "inCh derivato; got " + r.inCh);
  ok(/line array/i.test(r.sistema), "default sistema audio presente");
});
t("riderData: monitor e pedane derivati", () => {
  reset(); A.state.cab.on = true; add("wedge", 300, 300); add("pedana", 500, 500); A.__cabRes = null;
  const r = A.riderData();
  eq(r.monitor.wedge, 1, "wedge contato");
  eq(r.pedane.length, 1, "pedana rilevata");
  ok(r.pedane[0].w > 0 && r.pedane[0].h > 0, "pedana con dimensioni: " + JSON.stringify(r.pedane[0]));
});
t("riderData: testo editabile (state.rider) vince sul default", () => {
  reset(); A.state.rider = { sistema: "Mio impianto XYZ" };
  const r = A.riderData();
  ok(r.sistema === "Mio impianto XYZ", "override sistema");
  eq(r.sedie, "", "sedie vuote di default");
});
t("riderData: sedie editabili", () => {
  reset(); A.state.rider = { sedie: 40 };
  eq(String(A.riderData().sedie), "40", "sedie dall'editabile");
});
t("riderHtml: documento con sezioni e numeri derivati", () => {
  reset(); A.state.cab.on = true; add("astamic", 300, 300); add("wedge", 320, 320); A.__cabRes = null;
  const h = A.riderHtml();
  ok(/Rider tecnico/.test(h) && /Microfoni/.test(h) && /Monitor/.test(h), "html: " + String(h).slice(0, 120));
});

console.log("\nT4 — rubrica contatti/ruoli:");
t("normContact: clamp lunghezze", () => {
  const c = A.normContact({ role: "x".repeat(50), name: "y".repeat(70), contact: "z".repeat(90), note: "w".repeat(200) });
  ok(c.role.length <= 40 && c.name.length <= 60 && c.contact.length <= 80 && c.note.length <= 120, "clamp: " + JSON.stringify([c.role.length, c.name.length, c.contact.length, c.note.length]));
});
t("primaryContactStr: preferisce ruolo tecnico/sala/FOH", () => {
  const s = A.primaryContactStr([{ role: "Service locale", name: "Mas", contact: "333" }, { role: "Fonico di sala", name: "Marco", contact: "339" }]);
  ok(/Marco/.test(s), "primario tecnico atteso; got " + s);
});
t("primaryContactStr: vuoto con arg → stringa vuota", () => { eq(A.primaryContactStr([]), ""); });
t("normalizeState: migra techContact → rubrica", () => {
  const s = { techContact: "Marco 339" }; A.normalizeState(s);
  ok(Array.isArray(s.contacts) && s.contacts.length === 1 && /339/.test(s.contacts[0].contact), "migrato: " + JSON.stringify(s.contacts));
});
t("riderData: espone contatti + contatto primario derivato", () => {
  reset(); A.state.contacts = [{ role: "Service locale", name: "Service Alfa", contact: "333111" }];
  const d = A.riderData();
  eq(d.contatti.length, 1, "1 contatto");
  ok(/Service Alfa/.test(d.contatto) || /333111/.test(d.contatto), "contatto derivato: " + d.contatto);
});
t("riderHtml: sezione Contatti e ruoli quando presenti", () => {
  reset(); A.state.contacts = [{ role: "Service locale", name: "Mas", contact: "333" }];
  const h = A.riderHtml();
  ok(/Contatti e ruoli/.test(h) && /Mas/.test(h), "sezione contatti nel rider");
});
t("audit T4: cablaggio senza contatto Service → nudge info", () => {
  reset(); A.state.cab.on = true; add("astamic", 300, 300); A.state.contacts = []; A.__cabRes = null;
  ok(A.auditEngine().findings.some((f) => /Service/i.test(f.msg) && f.lvl === "info"), "atteso nudge service");
});
t("audit T4: con contatto Service → nessun nudge", () => {
  reset(); A.state.cab.on = true; add("astamic", 300, 300);
  A.state.contacts = [{ role: "Service locale", name: "Mas", contact: "333" }]; A.__cabRes = null;
  ok(!A.auditEngine().findings.some((f) => /Nessun contatto per il Service/.test(f.msg)), "nessun nudge col service presente");
});

console.log("\nT5 — stati di approvazione:");
t("statusInfo: stato corretto, fallback bozza", () => { eq(A.statusInfo("approvato").label, "Approvato"); eq(A.statusInfo("xxx").k, "bozza"); });
t("normalizeState: default bozza + approval normalizzato", () => {
  const s = {}; A.normalizeState(s); eq(s.status, "bozza"); ok(s.approval && s.approval.by === "" && s.approval.at === "", "approval vuoto");
  const s2 = { status: "zzz" }; A.normalizeState(s2); eq(s2.status, "bozza", "stato invalido → bozza");
});
t("setProjectStatus: approvato firma la data", () => {
  reset(); A.state.approval = { by: "", at: "" }; A.setProjectStatus("approvato");
  eq(A.state.status, "approvato"); ok(/^\d{4}-\d{2}-\d{2}$/.test(A.state.approval.at), "data firmata: " + A.state.approval.at);
});
t("setProjectStatus: stato non valido ignorato", () => { reset(); A.state.status = "bozza"; A.setProjectStatus("zzz"); eq(A.state.status, "bozza"); });
t("riderData: espone stato + firma", () => {
  reset(); A.state.status = "approvato"; A.state.approval = { by: "Anna", at: "2026-07-14" };
  const d = A.riderData(); eq(d.status, "approvato"); eq(d.approvedBy, "Anna"); eq(d.approvedAt, "2026-07-14");
});
t("riderHtml: badge stato + firma quando approvato", () => {
  reset(); A.state.status = "approvato"; A.state.approval = { by: "Anna", at: "2026-07-14" };
  const h = A.riderHtml(); ok(/APPROVATO/.test(h) && /Anna/.test(h), "badge+firma nel rider");
});
t("audit T5: bozza con contenuto → nudge info", () => {
  reset(); add("astamic", 300, 300); A.state.status = "bozza"; A.__cabRes = null;
  ok(A.auditEngine().findings.some((f) => /Bozza/i.test(f.msg) && f.lvl === "info"), "atteso nudge bozza");
});
t("audit T5: approvato → nessun nudge bozza", () => {
  reset(); add("astamic", 300, 300); A.state.status = "approvato"; A.__cabRes = null;
  ok(!A.auditEngine().findings.some((f) => /ancora una «Bozza»/.test(f.msg)), "nessun nudge da approvato");
});

console.log("\nT6 — varianti/scene (snapshot indipendenti):");
t("loadDoc: blob legacy piatto → 1 variante", () => {
  A.loadDoc({ titolo: "Legacy", luogo: "", items: [], inputs: [], outputs: [] });
  eq(A.VARIANTS.length, 1); eq(A.state.titolo, "Legacy"); eq(A.activeVar, A.VARIANTS[0].id);
});
t("loadDoc: blob doc con 2 varianti carica l'attiva", () => {
  A.loadDoc({ _doc: 1, active: "vB", variants: [
    { id: "vA", name: "Piena", state: { titolo: "Piena", items: [], inputs: [], outputs: [] } },
    { id: "vB", name: "Ridotta", state: { titolo: "Ridotta", items: [], inputs: [], outputs: [] } } ] });
  eq(A.VARIANTS.length, 2); eq(A.activeVar, "vB"); eq(A.state.titolo, "Ridotta");
});
t("docToJSON: serializza tutte le varianti + active; state resta piatto", () => {
  A.loadDoc({ _doc: 1, active: "vA", variants: [
    { id: "vA", name: "Piena", state: { titolo: "Piena", items: [], inputs: [], outputs: [] } },
    { id: "vB", name: "Ridotta", state: { titolo: "Ridotta", items: [], inputs: [], outputs: [] } } ] });
  const doc = JSON.parse(A.docToJSON());
  eq(doc.variants.length, 2); eq(doc.active, "vA"); eq(doc.variants.map((v) => v.name), ["Piena", "Ridotta"]);
});
t("switchVariant: congela l'attiva e ripristina la target (modifiche indipendenti)", () => {
  A.loadDoc({ _doc: 1, active: "vA", variants: [
    { id: "vA", name: "Piena", state: { titolo: "Piena", items: [], inputs: [], outputs: [] } },
    { id: "vB", name: "Ridotta", state: { titolo: "Ridotta", items: [], inputs: [], outputs: [] } } ] });
  A.state.titolo = "Piena EDIT"; add("batteria", 400, 400);
  A.switchVariant("vB");
  eq(A.activeVar, "vB"); eq(A.state.titolo, "Ridotta"); eq(A.state.items.length, 0, "vB non eredita gli item di vA");
  A.switchVariant("vA");
  eq(A.state.titolo, "Piena EDIT", "modifica di vA congelata"); eq(A.state.items.length, 1, "item di vA preservato");
});
t("createVariant: duplica l'attiva (copia identica) e ci passa sopra", () => {
  A.loadDoc({ titolo: "Base", items: [], inputs: [], outputs: [] });
  add("astamic", 300, 300);
  const before = A.VARIANTS.length;
  const id = A.createVariant("Ridotta");
  eq(A.VARIANTS.length, before + 1); eq(A.activeVar, id);
  eq(A.state.titolo, "Base", "la copia parte identica"); eq(A.state.items.length, 1, "la copia eredita gli item");
  ok(JSON.parse(A.docToJSON()).variants.some((v) => v.name === "Ridotta"), "nuova variante nel doc");
});
t("deleteVariant: guardia — non elimina l'ultima variante", () => {
  A.loadDoc({ titolo: "Solo", items: [], inputs: [], outputs: [] });
  const only = A.activeVar; A.deleteVariant(only);
  eq(A.VARIANTS.length, 1, "resta 1 variante"); eq(A.activeVar, only);
});
t("deleteVariant: elimina l'attiva → passa a un'altra", () => {
  A.loadDoc({ _doc: 1, active: "vB", variants: [
    { id: "vA", name: "Piena", state: { titolo: "Piena", items: [], inputs: [], outputs: [] } },
    { id: "vB", name: "Ridotta", state: { titolo: "Ridotta", items: [], inputs: [], outputs: [] } } ] });
  A.deleteVariant("vB");
  eq(A.VARIANTS.length, 1); eq(A.VARIANTS[0].id, "vA"); eq(A.activeVar, "vA"); eq(A.state.titolo, "Piena");
});
t("renameVariant: aggiorna il nome nel doc", () => {
  A.loadDoc({ _doc: 1, active: "vA", variants: [
    { id: "vA", name: "Piena", state: { titolo: "Piena", items: [], inputs: [], outputs: [] } },
    { id: "vB", name: "Ridotta", state: { titolo: "Ridotta", items: [], inputs: [], outputs: [] } } ] });
  A.renameVariant("vB", "Venue Y");
  eq(JSON.parse(A.docToJSON()).variants.find((v) => v.id === "vB").name, "Venue Y");
});
t("stateToJSON resta piatto (view/#p=/realtime): niente chiavi variants/active", () => {
  A.loadDoc({ _doc: 1, active: "vA", variants: [
    { id: "vA", name: "Piena", state: { titolo: "Piena", items: [], inputs: [], outputs: [] } } ] });
  const flat = JSON.parse(A.stateToJSON());
  ok(!("variants" in flat) && !("active" in flat), "stato piatto"); eq(flat.titolo, "Piena");
});
t("docToJSONFull conserva le planimetrie di tutte le varianti; docToJSON le strippa", () => {
  A.loadDoc({ _doc: 1, active: "va", variants: [
    { id: "va", name: "A", state: { titolo: "A", venue: { name: "same.png", _dataUrl: "data:image/png;base64,QUFB", _imgW: 100, _imgH: 80 }, items: [], inputs: [], outputs: [] } },
    { id: "vb", name: "B", state: { titolo: "B", venue: { name: "same.png", _dataUrl: "data:image/png;base64,QkJC", _imgW: 120, _imgH: 90 }, items: [], inputs: [], outputs: [] } },
  ] });
  const light = JSON.parse(A.docToJSON()), full = JSON.parse(A.docToJSONFull());
  const lv = light.variants.find((v) => v.id === light.active);
  const fv = full.variants.find((v) => v.id === full.active);
  ok(!lv.state.venue || !lv.state.venue._dataUrl, "docToJSON: immagine strippata");
  ok(fv.state.venue && fv.state.venue._dataUrl, "docToJSONFull: immagine presente sull'attiva");
  eq(full.variants.map((v) => v.state.venue._dataUrl),
    ["data:image/png;base64,QUFB", "data:image/png;base64,QkJC"], "bitmap distinte, anche con filename uguale");
  A.switchVariant("vb"); eq(A.state.venue._dataUrl, "data:image/png;base64,QkJC", "switch riaggancia la bitmap della variante corretta");
  A.switchVariant("va"); eq(A.state.venue._dataUrl, "data:image/png;base64,QUFB", "ritorno alla bitmap A");
});
t("safeVenueDataUrl: whitelist raster; scarta svg/js/breakout (difesa in profondità di applyVenueImage)", () => {
  eq(A.safeVenueDataUrl("data:image/png;base64,AAAB"), "data:image/png;base64,AAAB");
  eq(A.safeVenueDataUrl("data:image/jpeg;base64,/9j/4AAQ"), "data:image/jpeg;base64,/9j/4AAQ");
  eq(A.safeVenueDataUrl("data:image/webp;base64,UklGRg=="), "data:image/webp;base64,UklGRg==");
  eq(A.safeVenueDataUrl("data:image/svg+xml;base64,PHN2Zz4="), "");        // svg = vettore XSS → scartato
  eq(A.safeVenueDataUrl('data:image/png;base64,AAA" onerror="alert(1)'), ""); // attribute breakout → scartato
  eq(A.safeVenueDataUrl("javascript:alert(1)"), "");
  eq(A.safeVenueDataUrl(""), "");
  eq(A.safeVenueDataUrl(null), "");
});
t("planimetria manipolata: geometria numerica e markup SVG senza attribute injection", () => {
  const v = A.normalizeVenue({ name: 7, _dataUrl: "data:image/png;base64,QUFB",
    x: '1" onload="alert(1)', y: "20", w: '50" onerror="alert(2)', h: -4,
    rot: '0) scale(9)" onload="alert(3)', opacity: "999", locked: false,
    calibration: { p1: { x: '0" onload="x', y: 2 }, realCm: "100" } });
  eq({ x: v.x, y: v.y, w: v.w, h: v.h, rot: v.rot, opacity: v.opacity },
    { x: 0, y: 20, w: 5000, h: 1, rot: 0, opacity: 100 }, "campi geometrici normalizzati/clampati");
  const oldVenue = A.state.venue;
  try {
    A.state.venue = v;
    const markup = A.venueMarkup();
    ok(markup.includes("<image ") && !/onload|onerror|alert|scale\(9\)/.test(markup), "nessun attributo/evento iniettato");
  } finally { A.state.venue = oldVenue; }
});
t("item ID opaco: markup SVG/HTML codificato e lookup senza selector interpolato", () => {
  reset();
  const id = 'audit" data-audit-marker="present';
  const it = { id, type: "astamic", x: 100, y: 100, rot: 0, w: 38, d: 80, label: "Asta" };
  A.selSet = {};
  const markup = A.itemMarkup(it);
  ok(markup.includes("data-id=\"audit&quot; data-audit-marker=&quot;present\""), "ID codificato nell'attributo");
  ok(!markup.includes('" data-audit-marker="'), "nessun secondo attributo iniettato");
  const dot = A.sectionDotMarkup({ id, type: "cantante", x: 20, y: 30, rot: 0, w: 90, d: 90, label: "Voce" });
  ok(dot.includes("data-id=\"audit&quot; data-audit-marker=&quot;present\""), "section dot codificato");
  const oldSvg = A.svg;
  const oldIndex = A.itemNodeIndex;
  const expected = { getAttribute: (name) => name === "data-id" ? id : null };
  let scans = 0;
  try {
    A.svg = { querySelectorAll: (selector) => {
      eq(selector, ".item[data-id]", "selector statico");
      scans++;
      return [{ getAttribute: () => "other" }, expected];
    } };
    A.itemNodeIndex = new Map();
    ok(A.itemNode(id) === expected, "lookup per confronto del valore opaco");
    expected.parentNode = {};
    ok(A.itemNode(id) === expected && scans === 1, "indice riusato senza scansioni per frame");
  } finally {
    A.svg = oldSvg;
    A.itemNodeIndex = oldIndex;
  }
});
t("sink dinamici: chiavi cavo codificate e nessun handler/selector costruito da ID", () => {
  ok(!/data-cab="'\+(?:l\.key|selCab)\+/.test(appjs), "nessuna chiave cavo interpolata senza esc");
  ok(!appjs.includes('onclick="window.__fixStagebox'), "nessun inline handler con ID stagebox");
  ok(!/querySelector\([^\n]*data-mus[^\n]*x\.id/.test(appjs), "nessun selector dinamico per ID musicista");
  ok(/function saveProject\(onSaved, silent, lockHeld\)\{\s*\/\*[^]*?if\(window\.__docLoadBlocked\)/.test(appjs),
    "il salvataggio cloud manuale rispetta il blocco documento");
  const copyFlow = appjs.slice(appjs.indexOf("function completeCopyFromToken"), appjs.indexOf("function loadProjects"));
  ok(!/cloudCurrentId=null[^]*importProject/.test(copyFlow),
    "salva una copia non stacca il cloud prima della validazione");
  ok(!copyFlow.includes("activatePreparedProject(prepared"),
    "il ritorno OAuth non sostituisce automaticamente l'unica copia locale");
  const openFlow = appjs.slice(appjs.indexOf("function openProject"), appjs.indexOf("function dupProject"));
  const preparePos = openFlow.indexOf("prepared=prepareDoc");
  const activatePos = openFlow.indexOf("activatePreparedProject(prepared");
  const bindPos = openFlow.indexOf("cloudCurrentId=id");
  ok(preparePos >= 0 && activatePos > preparePos && bindPos > activatePos,
    "apertura cloud valida e attiva il documento prima di cambiare associazione");
});
t("share pubblico: dati personali e firma nominativa sono fail-closed", () => {
  const oldLocked = A.__projLocked;
  try {
    A.__projLocked = false;
    const hidden = A.stateForPublicShare({
      contacts: [{ name: "Ada", contact: "ada@example.test" }],
      techContact: "Ada",
      pdfHeader: "Ada · +39 000",
      approval: { by: "Ada", at: "2026-07-23" },
      shareOpts: { contacts: false },
    });
    eq(hidden.contacts, undefined);
    eq(hidden.techContact, undefined);
    eq(hidden.pdfHeader, undefined);
    eq(hidden.approval, { at: "2026-07-23" });
    A.__projLocked = true;
    const locked = A.stateForPublicShare({
      contacts: [{ name: "Ada" }],
      approval: { by: "Ada", at: "2026-07-23" },
      shareOpts: { contacts: true },
    });
    eq(locked.contacts, undefined);
    eq(locked.approval, { at: "2026-07-23" });
  } finally { A.__projLocked = oldLocked; }
});
t("boot consulenza: il confine read-only precede rete e scenari QA", () => {
  const bootStart = appjs.indexOf('var vt = new URLSearchParams(location.search).get("view")');
  const fetchStart = appjs.indexOf("fetch(SB_URL+\"/functions/v1/get-shared-project", bootStart);
  const sessionStart = appjs.indexOf("function startSession", bootStart);
  const bootFlow = appjs.slice(bootStart, sessionStart);
  ok(bootStart >= 0 && fetchStart > bootStart && sessionStart > fetchStart, "flusso view individuato");
  ok(bootFlow.indexOf("window.__consultMode=true") < bootFlow.indexOf("fetch(SB_URL"),
    "modalità consulenza impostata sincronicamente prima della rete");
  ok(bootFlow.includes('classList.add("viewmode","consult-pending")'),
    "interazioni bloccate durante il caricamento del bearer link");
  const scenarioFlow = appjs.slice(appjs.indexOf("var allowStartupScenario="), appjs.indexOf("/* ===== Supabase", appjs.indexOf("var allowStartupScenario=")));
  ok(scenarioFlow.includes("!/[?&]view=/.test(location.search)") &&
    scenarioFlow.includes("allowStartupScenario && location.search.indexOf(\"demo=1\")"),
  "gli scenari QA non possono mutare un documento aperto con ?view=");
  ok(appjs.includes('var sharedLoaded=!/[?&]view=/.test(location.search) && loadFromHash()'),
    "?view= resta autorevole anche se l'URL contiene un hash documento");
  const sessionFlow = appjs.slice(sessionStart, appjs.indexOf("function setupTrustedViewerRefresh", sessionStart));
  ok(sessionFlow.includes("d.is_locked") && sessionFlow.includes("window.applyProjLock(true)") &&
    sessionFlow.includes("if(isEditor && d.is_locked)") && sessionFlow.includes("else if(isEditor) setupAutosave"),
  "un progetto consulenza bloccato nasce read-only e non installa l'autosave");
  const lockUiFlow = appjs.slice(appjs.indexOf("function applyProjLock"), appjs.indexOf("window.applyProjLock"));
  ok(lockUiFlow.includes("consultationLock=!!window.__consultMode") &&
    lockUiFlow.includes("lockDup.hidden=consultationLock") &&
    lockUiFlow.includes("lockUnlock.hidden=consultationLock"),
  "la consulenza bloccata non offre comandi proprietario che produrrebbero una falsa copia");
});
t("lifecycle cloud: snapshot immutabile, revision guard e cambio progetto fail-closed", () => {
  const saveFlow = appjs.slice(appjs.indexOf("function saveProject"), appjs.indexOf("function completeCopyFromToken"));
  ok(saveFlow.includes("snapshotData=JSON.parse(docToJSON())"), "payload catturato prima dell'asincronia");
  ok(saveFlow.includes('.eq("updated_at",targetRev)'), "ogni update porta la revisione catturata");
  ok(saveFlow.includes("if(cloudCurrentId && !cloudRev)"), "revisione ignota gestita prima dell'update");
  const unknownRev = saveFlow.slice(saveFlow.indexOf("if(cloudCurrentId && !cloudRev)"), saveFlow.indexOf("/* Snapshot immutabile"));
  ok(unknownRev.includes("enterConflict()") && !unknownRev.includes("setRev(r.data.updated_at)"),
    "una revisione ignota fallisce chiusa: conflitto, mai adozione cieca");
  ok(/stillCurrent=authStill\(targetUserId,targetAuth\)\s*&&\s*\(window\.__docEpoch\|\|0\)===saveEpoch\s*&&\s*cloudCurrentId===targetId/.test(saveFlow),
    "una risposta stale o appartenente a un altro account non può riagganciare il documento corrente");
  ok(appjs.includes("cloudWriteBusy=false, cloudWriteQueue=[]") && saveFlow.includes("cloudWriteQueue.push"),
    "INSERT e UPDATE concorrenti sono serializzati");
  const autosaveFlow = appjs.slice(appjs.indexOf("function cloudAutosaveNow"), appjs.indexOf("function renderAccountBtn"));
  ok(autosaveFlow.includes("window.__bootVenueUnavailable") &&
    autosaveFlow.includes('setDocState("conflict")') &&
    autosaveFlow.includes("resolveCloudFlush(false)"),
  "una planimetria locale mancante non può propagare venue_image=null al cloud");
  ok(/beforeunload",function\(e\)\{[\s\S]{0,900}?if\(!window\.__localConflict && !window\.__localStorageUnavailable && !window\.__docLoadBlocked\) return;/.test(appjs),
    "gli edit sospesi attivano l'avviso di uscita: conflitto multi-tab, archivio pieno E documento incompatibile (tutti e tre lasciano il lavoro in sola memoria)");
  const openFlow = appjs.slice(appjs.indexOf("function openProject"), appjs.indexOf("function dupProject"));
  ok(openFlow.includes("window.flushCloudAutosave(function(ok)"), "il cambio progetto attende il flush");
  ok(openFlow.includes("window.__cloudNeedsFlush()"), "gli edit durante la lettura remota bloccano il commit");
  const conflictFlow = appjs.slice(appjs.indexOf('querySelector("#cbLoad")'), appjs.indexOf('querySelector("#cbCopy")'));
  ok(conflictFlow.includes("conflictSnapshot=docToJSON()") && conflictFlow.includes("venueImageBundleSig()!==conflictVenueSig"),
    "il load del conflitto non sostituisce edit o bitmap cambiati durante la GET");
  ok(conflictFlow.includes('select("data,title,updated_at,venue_image,is_locked")') &&
    conflictFlow.includes("applyProjLock(!!r.data.is_locked)") &&
    conflictFlow.includes("persistLocalState(true)"),
  "la risoluzione del conflitto applica e persiste anche il lock autorevole");
  ok(/function beginNewDocument\(initialState(?:,options)?\)/.test(appjs) && appjs.includes("function detachCloudDoc(epochAlreadyChanged)"),
    "Nuovo/modelli/copie usano un confine che invalida le callback");
  const copyFlow = appjs.slice(appjs.indexOf("function completeCopyFromToken"), appjs.indexOf("function loadProjects"));
  ok(copyFlow.includes('.insert({user_id:') && !copyFlow.includes("activatePreparedProject(prepared"),
    "la copia nasce nel cloud e lo slot locale non viene sostituito");
  ok(copyFlow.includes('d.kind!=="project"') &&
    copyFlow.includes("d.data.shareOpts.copy===false") &&
    copyFlow.indexOf("d.data.shareOpts.copy===false") < copyFlow.indexOf('.insert({user_id:'),
  "il permesso di copia viene ricontrollato dalla GET autorevole dopo login/OAuth");
  const copyInsertPos = copyFlow.indexOf('.insert({user_id:');
  ok(copyInsertPos >= 0 &&
    copyFlow.slice(copyInsertPos).includes('removeItem("copyFromToken")'),
  "un errore di insert lascia il token ritentabile; il successo lo consuma");
  ok(!appjs.includes("if(!window.__consultMode){ s.inputs=[]; s.outputs=[]; }"),
    "entitlement UI separato dalla persistenza delle liste");
  const fileSaveStart = appjs.indexOf("function fileSaveCloud");
  const fileSaveFlow = appjs.slice(fileSaveStart, appjs.indexOf("window.fileSaveVersion", fileSaveStart));
  ok(fileSaveFlow.includes("flushCloudAutosave(function(ok)") && fileSaveFlow.includes("if(ok)"),
    "Salva conferma il cloud soltanto dal callback reale");
  const shareRowFlow = appjs.slice(appjs.indexOf("function shareRow"), appjs.indexOf("function rubricaList"));
  ok(shareRowFlow.includes("flushCloudAutosave(function(ok)") && shareRowFlow.includes("if(ok) go()"),
    "Condividi non pubblica una versione stale se il save fallisce");
  const shareOptionFlow = appjs.slice(appjs.indexOf("function commitShareOption"), appjs.indexOf("function shareFillExtras"));
  ok(shareOptionFlow.includes("Esito non verificato") && shareOptionFlow.includes('urlEl.value=""') &&
    shareOptionFlow.includes("revoke.disabled=false") && !shareOptionFlow.includes("state.shareOpts[key]=old"),
  "una risposta persa sui permessi non mostra né afferma un link con stato privacy incerto");
  const revokeFlow = appjs.slice(appjs.indexOf("function clearShareTokenFor"), appjs.indexOf("function shareRow"));
  ok(revokeFlow.includes("update({share_token:null})") && revokeFlow.includes('select("share_token")') &&
    revokeFlow.includes("enterConflict()"),
  "la revoca privacy ha un fallback idempotente verificato senza adottare una revisione documentale ambigua");
  const accountFlow = appjs.slice(appjs.indexOf("function setCloudUser"), appjs.indexOf("function authStill"));
  ok(accountFlow.includes("authGeneration++") && accountFlow.includes("cloudOpenSeq++") &&
    accountFlow.includes("cloudProjectsLoadSeq++") && accountFlow.includes("cloudWriteQueue.splice(0)") &&
    accountFlow.includes("rubCache=null"),
  "il cambio account invalida callback, coda e cache del tenant precedente");
  const listFlow = appjs.slice(appjs.indexOf("function loadProjects"), appjs.indexOf("function openProject"));
  ok(listFlow.includes("request=++cloudProjectsLoadSeq") &&
    listFlow.includes("request!==cloudProjectsLoadSeq") &&
    listFlow.includes("if(cur && window.applyProjLock)"),
  "una lista cloud stale o priva del progetto corrente non può sbloccare l'editor");
  const lockFlow = appjs.slice(appjs.indexOf("function doLockUpdate"), appjs.indexOf("function unlockCurrent"));
  ok(lockFlow.includes("keepFrozenOnFailure") && lockFlow.includes("window.applyProjLock(true)") &&
    lockFlow.indexOf("window.applyProjLock(true)") < lockFlow.indexOf("doLockUpdate(id,true,true)"),
  "il comando Blocca congela subito l'editor e resta fail-closed se il CAS è ambiguo");
  const rubricaImportFlow = appjs.slice(appjs.indexOf("function rubricaImportCandidates"), appjs.indexOf("function itemContactsList"));
  ok(rubricaImportFlow.includes("requestUser=cloudUser.id") &&
    rubricaImportFlow.includes("authStill(requestUser,requestAuth)"),
  "l'import rubrica scarta risposte asincrone appartenenti a un account precedente");
  const analyticsStart = appjs.indexOf("window.__sendEvent=function");
  const analyticsFlow = appjs.slice(
    analyticsStart,
    appjs.indexOf("window.__flushEvents=function", analyticsStart),
  );
  ok(analyticsFlow.includes("if(!sb || !cloudUser) return") &&
    !analyticsFlow.includes("/rest/v1/analytics_events"),
  "analytics non espone più un endpoint INSERT anonimo dal client");
});
t("B4 Aspetto globale: normalizeState default illustrato + preserva schematico", () => {
  eq(A.normalizeState({ items: [], inputs: [], outputs: [] }).lookDefault, "illustrato");
  eq(A.normalizeState({ items: [], inputs: [], outputs: [], lookDefault: "schematico" }).lookDefault, "schematico");
});
t("B4 Aspetto globale: nuovi elementi ereditano lookDefault, override esplicito regge", () => {
  reset();
  A.state.lookDefault = "illustrato";
  var g1 = add("gtacustica", 300, 300);
  ok(g1.look !== "schematico", "col default illustrato il nuovo elemento non è schematico");
  ok(A.look2Art(g1) !== null, "illustrato → illustrazione presente");
  A.state.lookDefault = "schematico";
  var g2 = add("gtacustica", 500, 500);
  eq(g2.look, "schematico", "col default schematico il nuovo elemento eredita schematico");
  ok(A.look2Art(g2) === null, "schematico → nessuna illustrazione");
});

console.log("\nUnifica icone (Fase 1) — musicista↔postazione:");
t("postArt: default illustrato → art; schematico → null; non mappato → null", () => {
  eq(A.postArt({ type: "vlnpost" }), "musViolino1");
  eq(A.postArt({ type: "vlnpost", look: "schematico" }), null);
  eq(A.postArt({ type: "flauto" }), "musFlauto");
  eq(A.postArt({ type: "tuba" }), "musTuba");
  eq(A.postArt({ type: "astamic" }), null);
});
t("toggle look NON cambia i canali (illustrato == schematico)", () => {
  reset(); const a = add("vlnpost", 300, 300); const nA = chans(a).length;
  reset(); const b = add("vlnpost", 300, 300); b.look = "schematico"; A.__cabRes = null; const nB = chans(b).length;
  eq(nA, nB); ok(nA >= 1, "vlnpost ha almeno 1 canale");
});
t("migrazione v2→v3: musViolino1 → vlnpost, aspetto illustrato (default), dims postazione", () => {
  const s = { _v: 2, items: [{ type: "musViolino1", x: 100, y: 100, w: 80, d: 81, label: "Vln I" }], inputs: [], outputs: [] };
  A.normalizeState(s);
  eq(s.items[0].type, "vlnpost");
  ok(s.items[0].look == null, "look non impostato = illustrato default");
  eq([s.items[0].w, s.items[0].d], [A.TYPES.vlnpost.w, A.TYPES.vlnpost.d]);
  eq(s.items[0].label, "Vln I", "etichetta preservata");
});
t("migrazione: musViolino1→vlnpost vsec 1, musViolino2→vlnpost vsec 2 (Violino I/II postazione)", () => {
  const s = { _v: 2, items: [{ type: "musViolino1", w: 80, d: 81 }, { type: "musViolino2", w: 81, d: 82 }, { type: "musChitClassica" }], inputs: [], outputs: [] };
  A.normalizeState(s);
  eq(s.items.map((i) => i.type), ["vlnpost", "vlnpost", "musChitClassica"]);
  eq(s.items[0].vsec, 1); eq(s.items[1].vsec, 2);
  eq([s.items[1].w, s.items[1].d], [A.TYPES.vlnpost.w, A.TYPES.vlnpost.d]);
});
t("Violino II = vlnpost + vsec 2 con illustrazione dedicata (postArt=musViolino2), stessa postazione di Vln I", () => {
  eq(A.postArt({ type: "vlnpost" }), "musViolino1");
  eq(A.postArt({ type: "vlnpost", vsec: 2 }), "musViolino2");
  eq(A.postArt({ type: "vlnpost", vsec: 2, look: "schematico" }), null);
  ok(A.POSTAZ.vlnpost, "vlnpost è una postazione → Violino I e II hanno microfonazione/sedia/doppia");
});
t("catalogo: le 16 mus* con twin sono nascoste (catalog:false); Fase 2 (Batteria) resta visibile", () => {
  ["musViolino1", "musViolino2", "musViola", "musVioloncello", "musContrabbasso", "musCorno", "musTromba", "musTrombone", "musTuba", "musFlauto", "musOboe", "musClarinetto", "musFagotto", "musSaxAlto", "musSaxTenore", "musSaxBaritono"].forEach((k) => ok(A.TYPES[k].catalog === false, k + " deve essere catalog:false"));
  ok(A.TYPES.musChitClassica.catalog !== false, "musChitClassica (senza twin) resta in catalogo");
});

t("sigle italiane (convenzioni orchestra): Tr non Tpt, Sax A/T/B non ASax, Tbn B non Bass", () => {
  const sig = (tp) => A.abbrOf({ type: tp, label: A.defaultLabel(tp) });
  eq(sig("tromba"), "Tr");
  eq(sig("saxalto"), "Sax A"); eq(sig("saxtenore"), "Sax T"); eq(sig("saxbaritono"), "Sax B");
  eq(sig("musTromboneBasso"), "Tbn B", "trombone basso non deve matchare 'basso'→Bass");
  eq(sig("corno"), "Cor"); eq(sig("vlnpost"), "Vln"); eq(sig("violoncello"), "Vc"); eq(sig("trombone"), "Tbn");
});

console.log("\nAudit — voci senza mic (L8) + nomi canale duplicati (B4):");
/* Il criterio è UNO: la voce produce canali? Dal 27/07 il cantante nasce col suo microfono (micMode
   "tonda"), quindi il cantante appena posato È in channel list e l'avviso «la voce non entra nella
   channel list» era falso — falsificato dalla lista che l'audit stesso legge. Il caso vero è la voce
   in panoramica senza zona né asta: zero canali, e sparisce davvero (06/08). */
t("audit L8: voce senza canali (panoramica, nessuna zona) → avviso azionabile", () => {
  reset(); add("cantante", 400, 400, { micMode: "pano" }); A.__cabRes = null;
  const f = A.auditEngine().findings.filter((x) => /senza microfono/.test(x.msg));
  ok(f.length === 1 && f[0].act && /radiomic/i.test(f[0].act.label), "atteso avviso con fix; findings: " + auditMsgs().join(" | "));
});
t("audit L8: il cantante col suo microfono NON è un allarme (è già in channel list)", () => {
  reset(); const c = add("cantante", 400, 400); A.__cabRes = null;
  ok(A.cabItemInputs(c).length === 1, "presupposto: il cantante di default produce il suo canale");
  ok(!hasMsg(/senza microfono/), "findings: " + auditMsgs().join(" | "));
});
t("audit L8: cantante con radiomic entro 1,5 m → nessun avviso", () => {
  reset(); add("cantante", 400, 400); add("wireless", 440, 400); A.__cabRes = null;
  ok(!hasMsg(/senza microfono/), "findings: " + auditMsgs().join(" | "));
});
t("audit L8: corista NON triggera l'avviso (vive nel mic di sezione)", () => {
  reset(); add("corista", 400, 400); A.__cabRes = null;
  ok(!hasMsg(/senza microfono/), "findings: " + auditMsgs().join(" | "));
});
t("audit L8: il fix piazza un radiomic col nome del cantante e spegne l'avviso", () => {
  reset(); const c = add("cantante", 400, 400, { micMode: "pano" }); c.label = "Vocalist 2"; A.__cabRes = null;
  const f = A.auditEngine().findings.find((x) => /senza microfono/.test(x.msg));
  try { f.act.run(); } catch (e) { /* render/save toccano il DOM stub */ }
  A.__cabRes = null;
  const w = A.state.items.find((i) => i.type === "wireless");
  ok(w && w.label === "Vocalist 2", "radiomic col nome del cantante; items: " + A.state.items.map((i) => i.type).join(","));
  ok(!hasMsg(/senza microfono/), "dopo il fix: " + auditMsgs().join(" | "));
});
t("audit B4: due canali con lo stesso nome → avviso doppione", () => {
  reset(); const w1 = add("wireless", 300, 300); w1.label = "VOX LEAD 1"; const w2 = add("wireless", 700, 300); w2.label = "VOX LEAD 1"; A.__cabRes = null;
  ok(hasMsg(/si chiamano|compaiono più volte/), "findings: " + auditMsgs().join(" | "));
});
t("audit B4: spare dichiarato nel nome → nessun avviso doppione", () => {
  reset(); const w1 = add("wireless", 300, 300); w1.label = "VOX LEAD"; const w2 = add("wireless", 700, 300); w2.label = "VOX LEAD spare"; A.__cabRes = null;
  ok(!hasMsg(/si chiamano|compaiono più volte/), "findings: " + auditMsgs().join(" | "));
});
t("audit B4: doppione nella lista manuale (state.inputs) → avviso", () => {
  reset(); add("astamic", 300, 300);
  A.state.inputs = [{ src: "VOX LEAD 1", mic: "935" }, { src: "VOX LEAD 1", mic: "SM58" }];
  ok(hasMsg(/si chiamano|compaiono più volte/), "findings: " + auditMsgs().join(" | "));
});

console.log("\nOstacolo di sito:");
t("ostacolo: in catalogo (Sicurezza e site), ridimensionabile, zero canali e zero carico", () => {
  const t0 = A.TYPES.ostacolo;
  ok(t0 && t0.cat === "Sicurezza e site" && t0.resizable === true, "tipo presente e resizable");
  reset(); const o = add("ostacolo", 400, 400); o.label = "PALO"; A.__cabRes = null;
  eq(A.cabItemInputs(o).length, 0, "nessun canale audio");
  ok(A.auditEngine().findings.every((f) => !/PALO/.test(f.msg)), "nessuna criticità generata dall'ostacolo");
});

console.log("\nUnifica icone Fase 2 — tipi funzionali (batteria/arpa/chitarre/piani/direttore) → illustrazione:");
t("look2Art: chitarra/arpa default → illustrazione; schematico e non-mappati → null", () => {
  eq(A.look2Art({ type: "gtstand" }), "musChitElettrica");
  eq(A.look2Art({ type: "arpa" }), "musArpa");
  eq(A.look2Art({ type: "gtstand", look: "schematico" }), null);
  eq(A.look2Art({ type: "astamic" }), null);
});
t("corista: niente bottone 'Dividi in elementi' (isDecomposable false)", () => {
  ok(A.isDecomposable({ type: "corista" }) === false, "corista non scomponibile");
  ok(A.isDecomposable({ type: "cantante" }) === true, "cantante resta scomponibile");
  ok(A.isDecomposable({ type: "vlnpost" }) === true, "le postazioni restano scomponibili");
});
t("personal mixer digitale: piazzarlo attiva in automatico il layer P.M. (mond)", () => {
  reset(); ok(A.state.mond.on === false, "layer P.M. spento all'inizio");
  add("hearback", 400, 400);
  ok(A.state.mond.on === true, "hearback (personal mixer) attiva il layer P.M.");
  reset(); add("mixhub", 400, 400);
  ok(A.state.mond.on === true, "anche l'hub monitoraggio attiva il layer");
  reset(); add("wedge", 400, 400);
  ok(A.state.mond.on === false, "un monitor NON digitale (wedge) non attiva il layer");
});
t("zona mic da postazione a 2: un solo item doppia genera una zona che lo copre", () => {
  reset();
  const v = add("vlnpost", 450, 340); v.vsec = 1; v.doppia = true; v.sep = 120; A.recalcItemDims(v);
  const shape = A.miczoneShapeFromItems([v], 25);   /* stessa funzione del bottone "Crea zona microfonazione" */
  ok(shape && shape.pts && shape.pts.length >= 3, "genera un poligono anche da 1 solo item (la doppia)");
  const b = A.polyBBox(shape.pts);
  ok(b.w >= v.w, "la zona copre almeno la larghezza della doppia (entrambi i musicisti)");
});
t("chitarra illustrata: ampli/pedaliera nel footprint (bug visualizzazione)", () => {
  const base = A.recalcItemDims.bind(null);
  const it = { type: "gtstand", look: "illustrato" }; A.recalcItemDims(it); const d0 = it.d;
  const itA = { type: "gtstand", look: "illustrato", ampli: true }; A.recalcItemDims(itA);
  const itP = { type: "gtstand", look: "illustrato", pedaliera: true }; A.recalcItemDims(itP);
  ok(itP.d > d0, "pedaliera allunga la profondità in illustrato (era ignorata)");
  ok(itP.d >= 130, "footprint include la pedaliera");
  ok(itA.w >= 80, "footprint tiene conto dell'ampli in larghezza");
});
/* «Postazione» / «Strumento solo» (Simone 27/07): il toggle sceglie COSA si disegna, non lo stile.
   Le due scelte hanno stati canonici diversi e passare dall'una all'altra li riazzera. */
t("Strumento solo: sedia e leggio si spengono; Postazione: tornano", () => {
  reset();
  const v = add("vlnpost", 400, 400);
  eq(A.optSedia(v), true, "la postazione nasce con la sedia");
  eq(v.leggio, true, "e col leggio");
  A.lookReset(v, "schematico");
  eq(v.sedia, false, "«Strumento solo» = il solo violino, niente sedia");
  eq(v.leggio, false, "né leggio: si riaggiungono a mano dalla colonna di destra");
  A.lookReset(v, "illustrato");
  eq(A.optSedia(v), true, "tornando a «Postazione» la sedia è di nuovo implicita");
  eq(v.leggio, undefined, "e il leggio torna al default del tipo");
});
t("il riazzeramento non tocca chitarre, piani e postazioni doppie", () => {
  reset();
  const g = add("gtacustica", 400, 400);          /* gtr: la sedia è già spenta di suo */
  const before = JSON.stringify({ s: g.sedia, l: g.leggio });
  A.lookReset(g, "schematico");
  eq(JSON.stringify({ s: g.sedia, l: g.leggio }), before, "le chitarre hanno i loro default, non si toccano");
  const d = add("vlnpost", 600, 400); d.doppia = true; d.sedia = true; d.leggio = true;
  A.lookReset(d, "schematico");
  eq(d.sedia, true, "la postazione a 2 ha un leggio solo e la sedia bloccata: resta com'è");
  eq(d.leggio, true);
});
/* B3 (Simone 27/07): il pannello elemento è in gruppi col termine del mestiere, e le due misure
   che stavano su slider a tutta larghezza sono campi numerici — mezza riga invece di una intera. */
t("pannello elemento: gruppi col termine del mestiere, non riquadri", () => {
  const g = ["Etichetta", "Microfono", "Ascolto", "Accessori", "Dettagli tecnici", "Disegno"];
  g.forEach((n) => ok(appjs.indexOf('group("' + n + '"') > -1, "manca il gruppo «" + n + "»"));
  ok(appjs.indexOf("function syncPanelGroups") > -1, "un gruppo senza controlli visibili deve sparire, intestazione compresa");
  ok(appjs.indexOf('muteLabel("pLblModeWrap")') > -1, "la label che ripete il titolo del gruppo va zittita");
});
/* Dimensione resta uno SLIDER (Simone: «mi piace che vada da piccolo a sinistra a grande a destra»),
   ma sulla stessa riga di etichetta e valore. Rotazione e Distanza sono misure esatte: campo numerico. */
t("numero di canale: si cambia a mano e le altre righe scalano", () => {
  reset(); A.state.cab.on = true; A.__cabRes = null;
  const box = add("stagebox", 900, 130); box.ch = 16; box.outCh = 8;
  const a1 = add("astamic", 200, 400), a2 = add("astamic", 400, 400), a3 = add("astamic", 600, 400);
  cabla();
  const nomi = () => A.patchList().rows.map(r => r.n + ":" + r.itemId);
  const prima = nomi();
  eq(prima.length, 3, "tre canali");
  const terza = A.patchList().rows[2];
  ok(A.cabSetChannelNo(terza.key, 1), "la terza diventa la prima");
  const dopo = A.patchList().rows;
  eq(dopo[0].itemId, terza.itemId, "ora è in cima");
  eq(dopo.map(r => r.n).join(","), "1,2,3", "numerazione sempre 1..N, senza buchi");
  eq(dopo[1].itemId, a1.id, "le altre scalano di uno");
  eq(dopo[2].itemId, a2.id);
  /* fuori scala: si aggancia agli estremi invece di sparire */
  A.cabSetChannelNo(dopo[0].key, 99);
  eq(A.patchList().rows[2].itemId, terza.itemId, "99 su 3 canali = ultimo posto");
  A.cabSetChannelNo(A.patchList().rows[2].key, 0);
  eq(A.patchList().rows[0].itemId, terza.itemId, "0 = primo posto");
  eq(A.cabSetChannelNo("chiave-inesistente", 1), false, "chiave ignota: non fa nulla");
});

t("asta e phantom: derivati dal microfono finché non li tocchi", () => {
  reset(); A.state.cab.on = true; A.__cabRes = null;
  const box = add("stagebox", 900, 130); box.ch = 16; box.outCh = 8;
  add("astamic", 300, 400);
  cabla();
  let r = A.patchList().rows[0];
  const standAuto = r.stand;
  eq(r.standAuto, true, "l'asta arriva dal microfono");
  eq(r.p48Auto, true, "e così il phantom");
  A.cabSetStand(r.key, "asta giraffa"); A.__cabRes = null;
  r = A.patchList().rows[0];
  eq(r.stand, "asta giraffa", "asta scelta a mano");
  eq(r.standAuto, false, "e si sa che è una scelta, non un suggerimento");
  A.cabSetP48(r.key, true); A.__cabRes = null;
  r = A.patchList().rows[0];
  eq(r.p48, true, "phantom acceso a mano");
  eq(r.p48Auto, false);
  /* tornare all'automatico */
  A.cabSetStand(r.key, null); A.cabSetP48(r.key, null); A.__cabRes = null;
  r = A.patchList().rows[0];
  eq(r.stand, standAuto, "asta di nuovo dal microfono");
  eq(r.standAuto, true); eq(r.p48Auto, true);
  eq(A.state.cab.manual[r.key].stand, undefined, "e l'override sparisce, non resta a sporcare");
});

t("le scelte fatte sul canale sopravvivono a reload e undo", () => {
  /* 28/07 — normalizeState aveva una whitelist CHIUSA (pts/label/deleted/auto/box) e buttava via tutto
     il resto: il nome breve console, il microfono scelto a mano, la porta pinnata e il «togli
     microfono» sparivano a ogni ricaricamento E a ogni undo (applyHistory ripassa di qui). */
  reset();
  A.state.cab.manual = { k1: { seg:1, short:"VOX", mic:"SM58", stand:"asta giraffa", p48:false,
                               port:5, micOff:1, label:"x", pts:[[1,2],[3,4]], deleted:true, auto:1 } };
  const ns = A.normalizeState(A.state); if (ns) A.state = ns;
  const m = A.state.cab.manual.k1;
  eq(m.short, "VOX", "nome breve console");
  eq(m.mic, "SM58", "microfono scelto a mano");
  eq(m.stand, "asta giraffa", "asta scelta a mano");
  eq(m.p48, false, "phantom tolto a mano (false NON è «assente»)");
  eq(m.port, 5, "porta pinnata");
  eq(m.micOff, 1, "microfono tolto");
  eq(m.seg, 1, "cavo segmentato");
  eq(m.label, "x", "e ciò che già sopravviveva sopravvive ancora");
  eq(m.deleted, true); eq(m.auto, 1); eq(m.pts.length, 2);
  /* i valori fuori scala restano fuori */
  A.state.cab.manual = { k2: { port: 999, short: "x".repeat(40) } };
  const ns2 = A.normalizeState(A.state); if (ns2) A.state = ns2;
  eq(A.state.cab.manual.k2.port, undefined, "porta fuori range scartata");
  eq(A.state.cab.manual.k2.short.length, 12, "nome breve troncato");
});
t("etichetta: il campo sta staccato dai bottoni in TUTTE le modalità", () => {
  /* 28/07 — il riordino B3 ha messo i bottoni Intero/Sigla/Nascosto SOPRA il campo, ma il margine di
     stacco stava sul blocco dei bottoni: con «Intero» il riquadro finiva incollato, con «Sigla» il
     margin-top di pAbbrWrap lo salvava. Lo stacco ora sta sul campo. */
  const html = readFileSync(join(root, "app/index.html"), "utf8");
  const mode = (html.match(/<div id="pLblModeWrap"[^>]*>/) || [""])[0];
  eq(mode.indexOf("margin-top"), -1, "niente margine inline sul blocco dei bottoni: " + mode);
  ok(stylesCss.indexOf("#props #pLabelWrap{margin-top:6px}") > -1, "lo stacco sta sul campo nome");
  ok(html.indexOf('id="pAbbrWrap" style="display:none;margin-top:6px"') > -1, "stesso valore per la sigla");
});
t("dimensione, rotazione e distanza fra i due: slider su una riga", () => {
  /* 28/07 — dietrofront esplicito di Simone sulla rotazione: era tornata campo numerico col pannello
     B3, ora è di nuovo uno slider, come la Dimensione. Si ruota guardando il palco, non digitando.
     28/07 sera — stessa richiesta per la distanza della postazione a 2 («deve avere sempre lo
     slider»): era l'unica misura continua del pannello rimasta a campo numerico, e allontanare i
     due leggii si capisce guardandoli muoversi. */
  const html = readFileSync(join(root, "app/index.html"), "utf8");
  const size = (html.match(/<div id="pLblSizeWrap"[^>]*>/) || [""])[0];
  ok(size.indexOf('class="sldrow"') > -1, "Dimensione: etichetta, slider e valore sulla stessa riga");
  ok(html.indexOf('<input type="range" id="pLblSize"') > -1, "e resta uno slider");
  const rotRow = (html.match(/<div class="sldrow" id="pRotRow"[^>]*>/) || [""])[0];
  ok(rotRow, "Rotazione: stessa riga singola della Dimensione");
  const rot = (html.match(/<input[^>]*id="pRot"[^>]*>/) || [""])[0];
  ok(rot.indexOf('type="range"') > -1, "pRot è uno slider: " + rot);
  ok(rot.indexOf('min="-180"') > -1 && rot.indexOf('max="180"') > -1, "giro completo");
  ok(rot.indexOf('step="1"') > -1, "step 1: tutti i gradi interi restano raggiungibili");
  ok(html.indexOf('<output id="pRotVal"') > -1, "il valore in gradi resta leggibile accanto allo slider");
  ok(appjs.indexOf("pRotVal") > -1, "e l'app lo aggiorna");
  const sepRow = (html.match(/<div class="sldrow"><label for="pSep">[\s\S]{0,220}?<\/div>/) || [""])[0];
  ok(sepRow, "Distanza tra i 2: stessa riga singola di Dimensione e Rotazione");
  const sep = (html.match(/<input[^>]*id="pSep"[^>]*>/) || [""])[0];
  ok(sep.indexOf('type="range"') > -1, "la distanza è uno slider: " + sep);
  ok(sep.indexOf('step="5"') > -1, "passo di 5 cm: le misure restano tonde");
  ok(html.indexOf('<output id="pSepVal"') > -1, "i centimetri restano leggibili accanto allo slider");
  ok(appjs.indexOf("pSepVal") > -1, "e l'app li aggiorna mentre si trascina");
});
/* Pannello layer (27/07): la riga chiusa dice quanto contiene, e il cestino esce dalla riga. */
/* ===== Regressioni della review 27-28/07 (harness Playwright in COWORK/STAGEPLOT/review/) ===== */
t("CANVAS-01: una pedana NON si aggancia fuori dal palco; un wedge sì (è voluto)", () => {
  reset();
  const ped = add("pedana", 100, 100);   // 200×100: minX=0, maxX=200
  // trascinata quasi tutta oltre il lato sinistro: maxX arriva a 5 → il vecchio candidato
  // incrociato [maxX,0] distava 5 (< soglia 15) e la incollava INTERAMENTE fuori (sdx=-5)
  let r = A.magneticSnap([{ id: ped.id, x0: ped.x, y0: ped.y }], -195, 300);
  eq(r.sdx, 0, "per i riser i candidati incrociati non esistono: nessun teletrasporto fuori");
  const w = add("wedge", 100, 300);      // per un monitor l'appoggio ESTERNO a filo resta legittimo
  const half = w.w / 2;
  r = A.magneticSnap([{ id: w.id, x0: w.x, y0: w.y }], -(w.x + half) + 5, 0);
  eq(r.sdx, -5, "il wedge si appoggia ancora fuori, a filo del bordo (comportamento voluto)");
});
t("LISTE-01: «MIX N» non riparte da 1 — due proposte in momenti diversi non si sovrappongono", () => {
  reset(); A.state.cab.on = true;
  add("corista", 200, 200); A.__cabRes = null;
  const n1 = A.monProposeWedges();
  ok(n1 >= 1, "prima proposta: almeno un monitor");
  add("corista", 1000, 700); A.__cabRes = null;
  const n2 = A.monProposeWedges();
  ok(n2 >= 1, "seconda proposta (musicista nuovo, scoperto)");
  const mix = A.state.items.map((i) => i.label).filter((L) => /^MIX \d+$/.test(L || ""));
  eq(new Set(mix).size, mix.length,
     "etichette MIX tutte diverse (prima: due «MIX 1» → stessa uscita cablata); trovate: " + mix.join(", "));
});
t("CABLAGGI-09: applyHistory invalida le cache dei motori", () => {
  ok(appjs.indexOf("__cabRes=null; __elecRes=null; __mondRes=null;") > -1 &&
     appjs.indexOf("Lo stato è appena stato sostituito") > -1,
     "dopo un undo il canvas disegnava i cavi verso la box PRE-undo");
});
t("LAYER-01: cavi al 100% in vista base, e il 70 salvato (default orfano) migra", () => {
  eq(A.state.cab.opacity, 100, "default del documento nuovo");
  const s = A.normalizeState({ items: [], inputs: [], outputs: [], cab: { opacity: 70 }, elec: { opacity: 70 }, mond: { opacity: 70 } });
  eq(s.cab.opacity, 100, "il 70 salvato era il default orfano (nessuna UI poteva cambiarlo): migra");
  eq(s.elec.opacity, 100); eq(s.mond.opacity, 100);
  eq(A.normalizeState({ items: [], inputs: [], outputs: [], cab: { opacity: 40 } }).cab.opacity, 40,
     "un valore davvero personalizzato (JSON a mano) si rispetta");
});
t("ICONE-01: niente height negative nella libreria icone", () => {
  const icons = readFileSync(join(root, "icons.js"), "utf8");
  eq(icons.match(/height=\\"-/g), null, "un rect con altezza negativa non renderizza e sporca la console a ogni scena");
});
t("CAT-01: «cassa» al singolare trova le casse PA", () => {
  ok(/(^|\s)cassa(\s|$)/.test(A.TYPES.arraylarge.alias || ""), "alias singolare su arraylarge");
  ok(/(^|\s)cassa(\s|$)/.test(A.TYPES.sub218.alias || ""), "e sul sub");
});
t("A11Y-SEL: i select orfani di label visibile hanno il nome accessibile", () => {
  const html = readFileSync(join(root, "app/index.html"), "utf8");
  ok(html.indexOf('<select id="pMike" aria-label="Microfonazione">') > -1);
  ok(/<select id="pAscolto" aria-label="Ascolto[^"]*">/.test(html));
});
/* Input List (Simone 28/07): «aprire un layer non deve creare o modificare dati tecnici senza
   un'azione esplicita». Il cablaggio si chiede: barra in cima alla lista, non clic sul layer. */
t("aprire il layer Input non apre il wizard e non collega niente", () => {
  reset();
  add("astamic", 200, 200); add("astamic", 400, 200); add("astamic", 600, 200);
  add("astamic", 800, 200); add("astamic", 1000, 200);   /* 5 canali: sopra AUDIT_MIN_CH */
  A.__cabRes = null;
  const primaManual = JSON.stringify(A.state.cab.manual || {});
  A.cabActivateFlow();
  eq(JSON.stringify(A.state.cab.manual || {}), primaManual, "nessun collegamento creato aprendo il layer");
  eq(A.state.items.filter(A.cabIsBox).length, 0, "e nessuna stage box aggiunta dal wizard");
  ok(A.state.cab.on, "il motore si accende: la lista stessa ne deriva");
  ok(appjs.indexOf("openCabBoxWizard(needs); return;") === -1,
     "il wizard non parte più dall'apertura del layer");
});
t("la barra dice quanti canali mancano, e «Collega» rispetta i cablaggi a mano", () => {
  reset(); A.state.cab.on = true;
  add("astamic", 200, 200); add("astamic", 400, 200); add("stagebox", 900, 700);
  A.__cabRes = null;
  eq(A.patchList().rows.filter((r) => !r.spare && !r.box).length, 2,
     "inserire la box NON collega: i canali restano liberi finché non lo chiedi");
  cabla();
  const pl = A.patchList();
  eq(pl.rows.filter((r) => !r.spare && !r.box).length, 0, "dopo «Collega» sono tutti cablati");
  ok(appjs.indexOf('bar.className="cab-bar"') > -1, "la barra esiste in cima alla lista");
  ok(appjs.indexOf("Tutti i canali sono cablati") > -1, "e dice anche quando non c'è nulla da fare");
});
t("inserire NON collega: né audio, né elettrico, né P.M.", () => {
  reset();
  /* Simone 28/07: «non voglio che si colleghino in automatico — se inserisco una stage box si attiva
     il collegamento e vedo i cavi». Vale per tutti e tre i motori. */
  add("cantante", 200, 200); add("stagebox", 900, 700); A.__cabRes = null;
  eq(A.cabResult(true).links.length, 0, "audio: nessun cavo dall'inserimento");
  add("comboamp", 300, 300); add("distro32", 800, 300); A.__elecRes = null;
  eq((A.elecResult(true).loadLinks || []).length, 0, "elettrico: nessuna linea dall'inserimento");
  add("mixhub", 500, 500); add("hearback", 550, 500); A.__mondRes = null;
  eq((A.monDigEngine().links || []).length, 0, "P.M.: nessun aggancio dall'inserimento");
  cabla();
  ok(A.cabResult(true).links.length > 0, "ma «Collega» li fa tutti");
});
t("un collegamento chiesto accende il motore (o il cavo non si vedrebbe)", () => {
  reset();
  eq(A.state.cab.on, false, "motore spento all'inizio");
  const mic = add("cantante", 200, 200); const box = add("stagebox", 900, 700);
  A.cabSetItemBox(mic, box.id);
  ok(A.state.cab.on, "collegare a mano accende il motore audio");
  reset();
  A.elecManual("x"); ok(A.state.elec.on, "idem per l'elettrico");
  reset();
  A.mondManual("y"); ok(A.state.mond.on, "idem per il P.M.");
});
/* Dal confronto con una channel list vera (28/07): delle nove colonne che il fonico compila a mano,
   quattro mancavano o erano sepolte. Qui le tre recuperate con i dati che avevamo già. */
t("il PDF input list ha FOH come colonna sua, separata dalla sorgente", () => {
  ok(appjs.indexOf('trow("#","SORGENTE","FOH","MIC / DI","ASTA","PATCH"') > -1,
     "sei colonne: il nome sul banco non è più accodato al nome dello strumento fra virgolette");
  eq(appjs.indexOf("r.name+(r.short?'  «'+r.short+'»':\"\")"), -1, "via l'accodamento");
});
t("asta e nome-banco vivono nella channel list, non nella colonna", () => {
  /* 28/07 (variante B): la colonna è un'ANTEPRIMA — una riga per canale, numero · nome · patch.
     Asta, microfono, 48V e nome-banco si leggono e si cambiano nella finestra, dove c'è spazio. */
  ok(appjs.indexOf('row.className="patch-lite"') > -1, "la colonna usa la riga a un livello");
  ok(appjs.indexOf('data-stand=') > -1, "l'asta è una colonna della channel list");
  ok(appjs.indexOf('class="cl-short"') > -1, "e il nome sul banco pure");
  ok(stylesCss.indexOf(".patch-lite{") > -1, "con il suo stile");
});
t("le mandate alla macchina cuffie prendono il nome dai gruppi sul palco", () => {
  reset(); A.state.cab.on = true;
  add("batteria", 300, 200); add("bassstand", 500, 300); add("gtstand", 700, 300);
  add("corista", 500, 500); add("vlnpost", 900, 400);
  A.__cabRes = null;
  const n = A.pmFeedNames(8);
  eq(n.length, 8, "una mandata per uscita, sempre");
  ["Drums", "Bass", "Guit", "Archi", "Voci"].forEach((g) =>
    ok(n.indexOf(g) > -1, "manca il gruppo «" + g + "»; ottenuti: " + n.join(", ")));
  ok(n[0] === "Drums", "l'ordine è quello dei banchi della channel list");
  reset();
  eq(A.pmFeedNames(4).join(","), "Mandata 1,Mandata 2,Mandata 3,Mandata 4",
     "palco vuoto: nomi generici, non un blocco anonimo");
});
t("le tastiere prendono due mandate (in cuffia si vogliono in stereo)", () => {
  reset(); A.state.cab.on = true;
  add("stagepiano", 400, 400); A.__cabRes = null;
  const n = A.pmFeedNames(8);
  ok(n.indexOf("Key L") > -1 && n.indexOf("Key R") > -1, "Key L e Key R; ottenuti: " + n.join(", "));
  eq(A.pmFeedNames(1)[0], "Key", "con una sola uscita resta mono, senza la L che prometterebbe una R");
});
t("il fulmine collega UN canale solo, senza toccare gli altri", () => {
  reset(); A.state.cab.on = true;
  const v1 = add("corista", 200, 300), v2 = add("corista", 500, 300), v3 = add("corista", 800, 300);
  add("stagebox", 1000, 700); A.__cabRes = null;
  const key = A.patchList().rows.find((r) => r.itemId === v2.id).key;
  const box = A.cabConnectOne(key);
  ok(box, "il canale trova la sua destinazione");
  const dopo = A.patchList().rows;
  eq(dopo.filter((r) => r.box).length, 1, "cablato solo quello chiesto");
  eq(dopo.find((r) => r.itemId === v2.id).box != null, true, "ed è proprio lui");
  ok(!dopo.find((r) => r.itemId === v1.id).box, "gli altri restano liberi");
  ok(!dopo.find((r) => r.itemId === v3.id).box);
  eq(A.state.cab.manual[key].auto, 1, "marcato come scelta del sistema: «Collega» potrà ridistribuirlo");
});
t("il fulmine non tocca un canale già cablato e non inventa destinazioni", () => {
  reset(); A.state.cab.on = true;
  const v = add("corista", 200, 300); const box = add("stagebox", 900, 700); A.__cabRes = null;
  const key = A.patchList().rows[0].key;
  A.cabSetItemBox(v, box.id);                       // scelta a mano
  const prima = A.state.cab.manual[key].box;
  eq(A.cabConnectOne(key), prima, "già cablato: restituisce la destinazione e non la cambia");
  eq(A.state.cab.manual[key].auto, undefined, "e resta «a mano», non diventa automatico");
  reset(); A.state.cab.on = true;
  add("corista", 200, 300); A.__cabRes = null;      // nessuna stage box sul palco
  eq(A.cabConnectOne(A.patchList().rows[0].key), null, "senza destinazione non collega nulla");
});
t("il fulmine c'è solo sulle righe non cablate, ed è VISIBILE senza passarci sopra", () => {
  /* 28/07 — aveva opacity:0 e compariva solo in hover: con due canali da collegare non si vedeva
     nessun comando. Ora la riga non cablata mostra il fulmine al posto del cestino. */
  ok(appjs.indexOf('zp.setAttribute("aria-label","Collega questo canale")') > -1, "nome accessibile");
  ok(appjs.indexOf('if(r.box){') > -1 && appjs.indexOf('lite-trash') > -1, "cablato = cestino, non cablato = fulmine");
  eq(stylesCss.indexOf(".cab-one{border:none;background:none;color:var(--accent-strong);font-size:11px;cursor:pointer;\n    opacity:0"), -1,
     "niente più opacity:0 sul fulmine");
  ok(stylesCss.indexOf(".lite-btn") > -1, "i due bottoni di riga hanno uno stile comune");
});
t("la Monitor list resta a due livelli (là il nome si troncava)", () => {
  ok(stylesCss.indexOf(".patch-row.editable>.psrc{grid-area:1/2/2/3}") > -1, "nome sulla prima riga");
  ok(stylesCss.indexOf(".patch-row.editable>.pmic{grid-area:2/2/3/3") > -1, "tipo sulla seconda");
  ok(appjs.indexOf('hd.innerHTML=\'<span>#</span><span>Monitor</span>') > -1, "ed è la Monitor list a usarla");
});
t("la riga del layer porta il suo numero", () => {
  reset(); A.state.cab.on = true; A.state.elec.on = true;
  add("astamic", 300, 300); add("astamic", 500, 300); add("stagebox", 900, 700);
  A.__cabRes = null; A.__elecRes = null;
  const L = A.layerRegistry();
  const by = (id) => L.filter((x) => x.id === id)[0];
  eq(A.layerSummary(by("cabin")), "2", "sotto un layer «Input» il numero nudo basta");
  eq(A.layerSummary(by("stage")), "12 × 8 m", "il palco dice la misura, non un conteggio");
  reset();
  eq(A.layerSummary(by("mus")), "", "niente musicisti: nessun numero, non uno zero");
});
t("il cestino non sta più accanto all'occhio", () => {
  eq(appjs.indexOf('tr.className="layer-ico layer-trash"'), -1,
     "azzerava tutti i percorsi a due pixel dall'occhio");
  ok(appjs.indexOf('rb.className="adv-btn adv-reset"') > -1, "ora è in fondo al corpo del layer");
  ok(appjs.indexOf("I collegamenti fatti a mano su questa lista vengono persi") > -1,
     "e chiede conferma prima di azzerare");   /* «lista», non «layer»: rename UI del 28/07 */
});
t("nessun collega-tutto è rimasto nell'interfaccia", () => {
  /* il cablaggio si fa un cavo alla volta (28/07): questi testi vivevano sui bottoni rimossi */
  eq(appjs.indexOf('go.textContent="Collega"'), -1, "bottone Collega della barra Input list");
  eq(appjs.indexOf("⚡ <span>Cablaggio automatico</span>"), -1, "⚡ Cablaggio automatico di lista");
  eq(appjs.indexOf("function layerAutoConnect"), -1, "il ponte verso i motori");
  eq(appjs.indexOf('b1.textContent="Collega automaticamente"'), -1, "personal monitor: collega tutti i liberi");
  eq(appjs.indexOf('b3.textContent="Collega i mixerini liberi'), -1, "hub: collega tutti i mixerini");
  /* l'alternativa uno-a-uno c'è per tutte e tre le liste */
  ok(appjs.indexOf("function cabConnectOne") > -1, "ingressi e monitor");
  ok(appjs.indexOf("function elecConnectOne") > -1, "carichi");
  ok(appjs.indexOf('title="Collega questo monitor"') > -1, "fulmine sulla Monitor list");
  ok(appjs.indexOf('title="Collega questo carico"') > -1, "fulmine sulla lista carichi");
  /* aggiungere un elemento non è cablare: l'hub si può ancora creare, senza collegare nulla */
  ok(appjs.indexOf('b2.textContent="Aggiungi hub ("+hd.model+")"') > -1, "resta la creazione dell'hub");
});
t("Dividi · Duplica · Elimina stanno su una riga sola", () => {
  ok(stylesCss.indexOf("#props .btns{display:flex;flex-wrap:nowrap") > -1,
     "con flex-wrap:wrap il terzo bottone andava a capo");
  ok(stylesCss.indexOf("#props .btns .btn{width:auto;flex:1 1 0") > -1,
     "base 0: si dividono la larghezza invece di pretendere 110px a testa");
});
t("la rotazione non salta a 0 mentre stai digitando", () => {
  ok(appjs.indexOf('if(el.value==="" || !isFinite(raw)) return;') > -1,
     "campo vuoto a metà digitazione: non deve ruotare l'elemento a 0");
});
t("il toggle si chiama «Postazione» / «Strumento solo», non più «Illustrato» / «Schematico»", () => {
  const html = readFileSync(join(root, "app/index.html"), "utf8");
  ok(html.indexOf(">Postazione</button>") > -1, "il primo bottone dice cosa disegna");
  ok(html.indexOf(">Strumento solo</button>") > -1, "il secondo pure");
  eq(html.indexOf(">Illustrato</button>"), -1, "il vecchio nome descriveva lo stile, non il contenuto");
  eq(html.indexOf(">Schematico</button>"), -1);
});
t("direttore: sempre illustrato — NON in LOOK_ART, niente toggle Aspetto", () => {
  eq(A.look2Art({ type: "direttore" }), null);        /* fuori da LOOK_ART: nessuna sostituzione da render-interception */
  ok(!A.hasLookToggle({ type: "direttore" }));        /* niente Aspetto: il draw disegna sempre l'illustrazione + podio/leggio */
  eq(A.dirSize({ podio: false })[1], 114);            /* footprint base = illustrazione musDirettore (90×114) */
  eq(A.dirSize({ podio: true })[0], 120);             /* col podio = piattaforma 120×120 */
});
t("strumenti a misura reale: pezzi batteria/timpani NON ridimensionabili; strutture sì", () => {
  ["timp51R","timp58R","timp66R","timp74R","timp81R","tomR","crashR","rideR","timpsingolo","kickdrum","tomdrum","hihat"]
    .forEach((k) => ok(!A.TYPES[k].resizable, k + " non deve essere resizable (misura reale)"));
  ["pedana","truss","fondale","tappeto","metro"].forEach((k) => ok(A.TYPES[k].resizable === true, k + " resta ridimensionabile"));
});
t("batteria: come il timpanista — NON in LOOK_ART, niente toggle Aspetto; batterista in mezzo al kit", () => {
  eq(A.look2Art({ type: "batteria" }), null);         /* fuori da LOOK_ART: il draw è sempre il kit schematico + persona */
  ok(!A.hasLookToggle({ type: "batteria" }));         /* niente Aspetto */
  const ctl = A.COMP.batteria.controls.map((c) => c.key);
  ok(ctl.includes("mus") && ctl.includes("stool"));   /* toggle indipendenti Musicista + Sgabello */
  eq(A.COMP.batteria.reduced.join(","), "mus,stool,leggio"); /* pannello ridotto: solo questi due (il kit su misura è "Dividi") */
});
t("batteria seat slot: c'è se Musicista O Sgabello; sparisce se entrambi off", () => {
  const seat = (p) => A.drumSlots(p).some((s) => s.seat);
  ok(seat({ mus: true, stool: true }));
  ok(seat({ mus: true, stool: false }));
  ok(seat({ mus: false, stool: true }));
  ok(!seat({ mus: false, stool: false }));
});
t("batteristaR: elemento persona a misura reale — 0 canali, non resizable, catalog-visibile", () => {
  reset();
  eq(chans(add("batteristaR", 300, 300)).length, 0);   /* persona, non sorgente audio */
  ok(!A.TYPES.batteristaR.resizable);                   /* misura reale */
  ok(A.TYPES.batteristaR.catalog !== false);            /* draggabile dal catalogo */
});
t("z-order batterista: sopra lo sgabello, sotto i fusti/piatti", () => {
  const zDrum = A.TYPES.kickR.z || 2;
  ok((A.TYPES.batteristaR.z || 2) < zDrum, "batterista sotto i fusti");
  ok((A.TYPES.stoolR.z || 2) < zDrum, "sgabello sotto i fusti");
  ok((A.TYPES.stoolR.z || 2) <= (A.TYPES.batteristaR.z || 2), "sgabello non sopra il batterista");
  const ex = A.explodeBatteria({ type: "batteria", parts: { mus: true, stool: true } });
  const iStool = ex.findIndex((p) => p.type === "stoolR"), iBatt = ex.findIndex((p) => p.type === "batteristaR");
  ok(iStool >= 0 && iBatt > iStool, "explode: batterista dopo lo sgabello (sopra a parità di z)");
});
t("Dividi batteria: include il batterista se Musicista ON, non se OFF", () => {
  const withMus = A.explodeBatteria({ type: "batteria", label: "Dr", parts: { mus: true, stool: true } });
  const noMus = A.explodeBatteria({ type: "batteria", label: "Dr", parts: { mus: false, stool: true } });
  ok(withMus.some((p) => p.type === "batteristaR"));
  ok(!noMus.some((p) => p.type === "batteristaR"));
  ok(noMus.some((p) => p.type === "stoolR"));           /* lo sgabello resta comunque */
});
t("conteggio Sgabelli batteria: rispetta il toggle (solo musicista → 0 sgabelli)", () => {
  reset();
  const a = add("batteria", 100, 100);                       /* stool default true */
  const b = add("batteria", 300, 100); A.parts(b).stool = false; A.parts(b).mus = true;   /* solo musicista */
  eq(A.countAccessori().sgabelli, 1);                         /* solo la prima conta lo sgabello */
});
t("hasLookToggle: Fase 1 (vlnpost) sì; batteria/direttore e non mappati no", () => {
  ok(A.hasLookToggle({ type: "vlnpost" }));
  ok(!A.hasLookToggle({ type: "batteria" })); ok(!A.hasLookToggle({ type: "direttore" })); ok(!A.hasLookToggle({ type: "astamic" }));
});
t("Musicista/Sgabello NON cambiano i canali: batteria = 8 con e senza persona/sgabello", () => {
  reset(); const a = add("batteria", 400, 400); const nA = chans(a).length;
  reset(); const b = add("batteria", 400, 400); const p = A.parts(b); p.mus = false; p.stool = false; A.__cabRes = null; const nB = chans(b).length;
  eq(nA, nB); eq(nA, 8);
});
t("migrazione Fase 2: musBatteria→batteria, musDirettore→direttore, musChitElettrica→gtstand; senza twin resta", () => {
  const s = { _v: 2, items: [{ type: "musBatteria" }, { type: "musDirettore" }, { type: "musChitElettrica" }, { type: "musChitClassica" }, { type: "musFisarmonica" }], inputs: [], outputs: [] };
  A.normalizeState(s);
  eq(s.items.map((i) => i.type), ["batteria", "direttore", "gtstand", "musChitClassica", "musFisarmonica"]);
});
t("catalogo Fase 2: 11 twin nascoste; senza twin (chitarra classica, fisarmonica, trombone basso) restano", () => {
  ["musArpa", "musTimpani", "musPercussioni", "musBatteria", "musPianoGranCoda", "musPianoMezzaCoda", "musTastiera", "musChitElettrica", "musChitAcustica", "musBasso", "musDirettore"].forEach((k) => ok(A.TYPES[k].catalog === false, k + " catalog:false"));
  ["musChitClassica", "musFisarmonica", "musTromboneBasso"].forEach((k) => ok(A.TYPES[k].catalog !== false, k + " resta visibile"));
});

t("timpani: toggle Musicista + Sgabello indipendenti (niente Aspetto); non in LOOK_ART/DRAW_LOOK", () => {
  ok(!A.hasLookToggle({ type: "timpani" }), "timpani NON ha il toggle Aspetto (usa Musicista/Sgabello)");
  eq(A.look2Art({ type: "timpani" }), null);
  ok(!A.LOOK_ART.timpani && !A.DRAW_LOOK.timpani);
  const keys = A.COMP.timpani.controls.map((c) => c.key);
  ok(keys.indexOf("mus") >= 0 && keys.indexOf("stool") >= 0, "controls Musicista + Sgabello presenti");
});
t("timpani: il posto (seat) c'è se Musicista O Sgabello; sparisce se entrambi off", () => {
  ok(A.timpSlots({ count: 2, layout: "arco", mus: true, stool: false }).some((s) => s.seat), "solo musicista → posto presente");
  ok(A.timpSlots({ count: 2, layout: "arco", mus: false, stool: true }).some((s) => s.seat), "solo sgabello → posto presente");
  ok(!A.timpSlots({ count: 2, layout: "arco", mus: false, stool: false }).some((s) => s.seat), "nessuno → niente posto");
});
t("migrazione: musTimpani → timpani (schema configurabile + timpanista in mezzo)", () => {
  const s = { _v: 2, items: [{ type: "musTimpani" }], inputs: [], outputs: [] };
  A.normalizeState(s);
  eq(s.items[0].type, "timpani");
});

console.log("\nRubrica contatti — logica pura (spec 15/07):");
t("contactKey: normalizza maiuscole/spazi; vuoto = '|'", () => {
  eq(A.contactKey({ name: " Mario Rossi ", contact: "333-0000001" }), "mario rossi|333-0000001");
  eq(A.contactKey({}), "|");
});
t("rubricaDedupe: tiene la prima occorrenza, scarta chiavi vuote", () => {
  const out = A.rubricaDedupe([
    { name: "Marco", contact: "333", role: "Fonico di sala" },
    { name: "marco", contact: "333", role: "DUPLICATO" },
    { name: "", contact: "" },
    { name: "Anna", contact: "334" },
  ]);
  eq(out.length, 2); eq(out[0].role, "Fonico di sala"); eq(out[1].name, "Anna");
});
t("contactsFromDocs: doc multi-variante + legacy piatto, tronca ai limiti, deduplica", () => {
  const doc = { variants: [
    { state: { contacts: [{ role: "Service locale", name: "Alfa", contact: "045" }] } },
    { state: { contacts: [{ role: "Service locale", name: "Alfa", contact: "045" }, { name: "X".repeat(99), contact: "1" }] } },
  ] };
  const legacy = { contacts: [{ name: "Organizzatore", contact: "info@esempio.it" }] };
  const out = A.contactsFromDocs([doc, legacy, null]);
  eq(out.length, 3);
  eq(out[0].name, "Alfa");
  eq(out[1].name.length, 60, "name troncato a 60");
  eq(out[2].name, "Organizzatore");
});

/* ===== EQUIPMENT INTELLIGENCE (fase 2, spec H) — resolve puro + wattOf model-driven ===== */
console.log("\nEquipment Intelligence — resolve/watt/dims (spec H):");
t("equipResolve: snapshot ⊕ override (override vince), item nudo = {}", () => {
  const it = { modelData: { a: { value: 1 }, b: { value: 2 } }, modelOverride: { b: { value: 99, reliability: "user_override" } } };
  eq(A.equipVal(it, "a"), 1); eq(A.equipVal(it, "b"), 99, "override per-progetto vince sullo snapshot");
  eq(A.equipVal({}, "a"), null); eq(A.equipVal(null, "a"), null);
});
t("equipWatt: W di targa; unit A → W a 230V (derived); potenza audio MAI usata; null-safe", () => {
  eq(A.equipWatt({ modelData: { powerConsumption_W: { value: 5, unit_orig: "W" } } }), 5, "P16-M 5W");
  eq(A.equipWatt({ modelData: { powerConsumption_W: { value: 1.5, unit_orig: "A" } } }), 345, "LEOPARD 1.5A@230V (derived)");
  eq(A.equipWatt({ modelData: { power_handling_W: { value: 2150, unit_orig: "W" } } }), null, "potenza AUDIO ≠ consumo: ignorata");
  eq(A.equipWatt({ modelData: { powerConsumption_W: { value: null } } }), null); eq(A.equipWatt({}), null);
});
t("wattOf usa il consumo del modello (it.watt manuale resta prioritario)", () => {
  reset(); const it = add("amprack", 300, 300);
  const base = A.wattOf(it);
  it.modelData = { powerConsumption_W: { value: 300, unit_orig: "W", reliability: "official" } };
  eq(A.wattOf(it), 300, "modello vince sul generico (era " + base + ")");
  it.watt = 111; eq(A.wattOf(it), 111, "override manuale it.watt vince su tutto");
});
t("equipDimsCm: mm→cm, null se mancanti/non numerici", () => {
  const it = { modelData: { dims_w_mm: { value: 684 }, dims_d_mm: { value: 550 } } };
  const d = A.equipDimsCm(it); eq(d.w, 68); eq(d.d, 55);
  eq(A.equipDimsCm({ modelData: { dims_w_mm: { value: 684 } } }), null, "manca la profondità → null (mai inventare)");
  eq(A.equipDimsCm({}), null);
});
t("equipPhantom + equipName: ribbon_danger dal modello; nome robusto (stringa o SourcedValue)", () => {
  eq(A.equipPhantom({ modelData: { phantom: { value: "ribbon_danger" } } }), "ribbon_danger");
  eq(A.equipName({ modelData: { brand: "Royer", model: "R-121" } }), "Royer R-121");
  eq(A.equipName({ modelData: { brand: { value: "Shure" }, model: { value: "SM57" } } }), "Shure SM57");
  eq(A.equipName({}), null);
});
t("audit: elemento con modello ribbon passivo → avviso 'MAI +48V'", () => {
  reset(); const it = add("astamic", 300, 300);
  it.modelData = { brand: "Royer", model: "R-121", phantom: { value: "ribbon_danger", reliability: "official" } };
  const found = A.auditEngine().findings.filter(f => /nastro passivo|MAI \+48V/i.test(f.msg));
  eq(found.length >= 1, true, "avviso ribbon presente");
});

t("Input List dal modello: mic reale + phantom di targa sul canale derivato", () => {
  reset(); const it = add("astamic", 300, 300);   // default IN_SRC: SM58 (dinamico, no 48V)
  let r0 = A.patchList().rows.find(r => r.itemId === it.id);
  eq(r0.mic, "SM58"); eq(r0.p48, false, "default: dinamico senza phantom");
  // modello condensatore assegnato → mic reale + 48V dal datasheet
  it.modelData = { category: "microfono", model: "KM184", phantom: { value: "required", reliability: "official" } };
  A.__cabRes = null;
  let r1 = A.patchList().rows.find(r => r.itemId === it.id);
  eq(r1.mic, "KM184", "il canale mostra il modello reale");
  eq(r1.p48, true, "phantom di targa: required → 48V");
  eq(r1.stand, "asta giraffa", "stand da MIC_DEFAULTS quando il nome combacia");
  // ribbon passivo → phantom OFF per costruzione (l'audit avvisa già)
  it.modelData = { category: "microfono", model: "R-121", phantom: { value: "ribbon_danger", reliability: "official" } };
  A.__cabRes = null;
  let r2 = A.patchList().rows.find(r => r.itemId === it.id);
  eq(r2.mic, "R-121"); eq(r2.p48, false, "ribbon passivo: mai 48V sul derivato");
  // override manuale del canale vince sul modello
  A.cabSetMic(r2.key, "SM57");
  let r3 = A.patchList().rows.find(r => r.itemId === it.id);
  eq(r3.mic, "SM57", "override manuale (cabSetMic) prioritario sul modello");
  // modello NON-microfono (es. line array) → canale invariato
  reset(); const it2 = add("astamic", 300, 300);
  it2.modelData = { category: { value: "line_array" }, model: { value: "LEOPARD" }, powerConsumption_W: { value: 1.5, unit_orig: "A" } };
  A.__cabRes = null;
  let r4 = A.patchList().rows.find(r => r.itemId === it2.id);
  eq(r4.mic, "SM58", "categoria non-microfono: il canale resta col suggerito");
});

t("equipCatsFor: campo modello solo sugli elementi tecnici pertinenti (mai musicisti/arredo)", () => {
  eq(JSON.stringify(A.equipCatsFor({ type: "astamic" })), JSON.stringify(["microfono"]), "asta mic → solo microfono");
  eq(A.equipCatsFor({ type: "hearback" }), null, "personal mixer → null (unificato 28/07: il modello è il campo pm, blocco «Personal monitor»)");
  eq(A.equipCatsFor({ type: "mixhub" }), null, "hub PM → null, stessa ragione");
  eq(JSON.stringify(A.equipCatsFor({ type: "q338" })), JSON.stringify(["console"]), "console → console");
  eq(JSON.stringify(A.equipCatsFor({ type: "arraylarge" })), JSON.stringify(["line_array", "subwoofer", "amps"]), "PA → array/sub/amps");
  eq(A.equipCatsFor({ type: "stagebox" }), null, "stagebox → null (unificato: il modello è il campo hw STAGEBOX_DB)");
  eq(A.equipCatsFor({ type: "vlnpost" }), null, "postazione violino → nessun campo");
  eq(A.equipCatsFor({ type: "direttore" }) || A.equipCatsFor({ type: "conductor" }) || null, null, "direttore → nessun campo");
  eq(A.equipCatsFor({ type: "sedia" }), null, "sedia → nessun campo");
  eq(A.equipCatsFor(null), null);
  eq(A.equipFieldLabel(["microfono"]), "Microfono reale");
});

t("production: normalizeState crea i 6 sistemi, scarta risposte fuori enum, tronca le note", () => {
  const s0 = A.normalizeState({ items: [], stage: { w: 1200, d: 800, blocks: [{ x: 0, y: 0, w: 1200, d: 800 }] } });
  eq(!!s0.production, true); eq(s0.production.asked, false);
  eq(Object.keys(s0.production.systems).length, 6);
  eq(s0.production.systems.luci.ans, null, "nessun default implicito: niente piazzato bianco");
  const s1 = A.normalizeState({ items: [], stage: { w: 1200, d: 800, blocks: [{ x: 0, y: 0, w: 1200, d: 800 }] },
    production: { asked: true, systems: { playback: { ans: "service", note: "X".repeat(999) }, luci: { ans: "HACK" }, video: { ans: "configurato" } } } });
  eq(s1.production.asked, true);
  eq(s1.production.systems.playback.ans, "service");
  eq(s1.production.systems.playback.note.length, 300, "note troncate a 300");
  eq(s1.production.systems.luci.ans, null, "valore fuori enum → null");
  eq(s1.production.systems.video.ans, "configurato");
});
t("productionSummary: solo sistemi dichiarati (mai inventare), testi corretti", () => {
  const s = { production: { asked: true, systems: {
    playback: { ans: "service", note: "" }, video: { ans: "no", note: "" }, recaudio: { ans: null, note: "" },
    recvideo: { ans: "da_definire", note: "" }, streaming: { ans: null, note: "" },
    luci: { ans: "piazzato_bianco", note: "lettura spartiti" } } } };
  const rows = A.productionSummary(s);
  eq(rows.length, 3, "no e null non compaiono");
  eq(rows.find(r => r.key === "playback").text, "a carico del service tecnico");
  eq(rows.find(r => r.key === "recvideo").text.includes("da definire con un tecnico"), true);
  eq(rows.find(r => r.key === "luci").text, "piazzato bianco uniforme — lettura spartiti");
  eq(A.productionSummary({}).length, 0);
});

t("produzione fase 3: ITEM_USO copre i 7 tipi regia; usoSystemKey mappa uso→sistema", () => {
  ["laptop", "audiointerface", "camera", "proiettore", "schermo", "ledwallmod", "consolaluci"].forEach(k =>
    eq(!!A.ITEM_USO[k], true, "ITEM_USO manca: " + k));
  eq(!!A.ITEM_USO["vlnpost"], false, "postazione musicista: nessun campo utilizzo");
  // un computer NON è automaticamente playback: senza uso → nessun sistema
  eq(A.usoSystemKey("laptop", undefined), null);
  eq(A.usoSystemKey("laptop", "rec_audio"), "recaudio");
  eq(A.usoSystemKey("laptop", "luci"), "luci");
  eq(A.usoSystemKey("audiointerface", "entrambe"), "recaudio");
  eq(A.usoSystemKey("camera", "documentativa"), null, "camera documentativa: nessuna regia video assunta");
  eq(A.usoSystemKey("camera", "rec_streaming"), "streaming");
  eq(A.usoSystemKey("proiettore", "computer"), "video", "schermo/proiettore attivano sempre i contributi video");
  eq(A.usoSystemKey("consolaluci", null), "luci");
  eq(A.usoSystemKey("sedia", "x"), null);
});

t("produzione fase 4 — Scenario A: solo musicisti = ZERO falsi errori di produzione", () => {
  reset(); add("vlnpost", 300, 300); add("grancoda", 500, 300);
  const A4 = A.auditEngine();
  const prod = A4.findings.filter(f => f.cat === "Produzione");
  eq(prod.filter(f => f.lvl === "err").length, 0, "nessun errore produzione");
  eq(prod.filter(f => f.lvl === "warn").length, 0, "nessun avviso produzione");
});
t("produzione fase 4 — Scenario B: interfaccia senza utilizzo → 'da definire' (mai errore)", () => {
  reset(); add("audiointerface", 300, 300);
  const A4 = A.auditEngine();
  const td = A4.findings.filter(f => f.lvl === "todef" && /utilizzo/.test(f.msg));
  eq(td.length >= 1, true, "todef presente");
  eq((A4.todefs || 0) >= 1, true, "conteggio todefs nel return");
  eq(A4.findings.filter(f => f.cat === "Produzione" && f.lvl === "err").length, 0, "mai errore");
});
t("produzione fase 4 — playback 'configurato' senza postazione → avviso; con postazione → ok", () => {
  reset(); A.state.production.systems.playback.ans = "configurato";
  let W = A.auditEngine().findings.filter(f => f.lvl === "warn" && /playback/i.test(f.msg));
  eq(W.length, 1, "incoerenza reale segnalata");
  const it = add("laptop", 300, 300); it.uso = "playback_audio";
  W = A.auditEngine().findings.filter(f => f.lvl === "warn" && /playback/i.test(f.msg));
  eq(W.length, 0, "postazione presente: nessun avviso");
  A.state.production.systems.playback.ans = null;
});
t("produzione fase 4 — luci: mai piazzato bianco implicito; testo dichiarato", () => {
  reset();
  eq(A.productionLuciText(A.state), "Da definire.", "nessuna scelta → dichiarato, non inventato");
  A.state.production.systems.luci.ans = "service";
  eq(A.productionLuciText(A.state), "Luci a cura del service tecnico.");
  A.state.production.systems.luci.ans = "piazzato_bianco"; A.state.production.systems.luci.note = "";
  eq(/Piazzato bianco diffuso/.test(A.productionLuciText(A.state)), true, "piazzato SOLO se scelto (testo classico)");
  A.state.rider.luci = "Testo mio";
  eq(A.productionLuciText(A.state), "Testo mio", "il testo esplicito dell'utente vince");
  A.state.rider.luci = ""; A.state.production.systems.luci.ans = null;
});

t("produzione fase 5 — Scenario C: proiettore+schermo → sistema video attivato, sorgente richiesta, mai errore", () => {
  reset(); add("proiettore", 300, 300); add("schermo", 500, 300);
  const A5 = A.auditEngine();
  const prod = A5.findings.filter(f => f.cat === "Produzione");
  eq(prod.some(f => f.lvl === "todef" && /sorgente del contenuto/.test(f.msg)), true, "sorgente richiesta (da definire)");
  eq(prod.some(f => f.lvl === "todef" && /contributi video/.test(f.msg)), true, "sistema video da dichiarare nel Controllo tecnico");
  eq(prod.filter(f => f.lvl === "err").length, 0, "mai errore");
  // dichiarato nel Controllo tecnico + sorgente scelta → i todef si chiudono
  A.state.production.systems.video.ans = "configurato";
  A.state.items.forEach(i => { if (i.type === "proiettore" || i.type === "schermo") i.uso = "computer"; });
  const dopo = A.auditEngine().findings.filter(f => f.cat === "Produzione" && f.lvl === "todef");
  eq(dopo.length, 0, "tutto dichiarato: nessun aspetto aperto");
  A.state.production.systems.video.ans = null;
});
t("produzione fase 5 — Scenario D: rec multitraccia da definire → split da concordare (con n. canali reali)", () => {
  reset(); add("grancoda", 300, 300); add("vlnpost", 500, 300);   // canali reali >1
  add("laptop", 700, 300).uso = "rec_audio";   /* l'ultimo item puo' essere la DI del laptop */
  const A5 = A.auditEngine();
  const split = A5.findings.filter(f => f.lvl === "todef" && /split/.test(f.msg));
  eq(split.length, 1, "split da concordare");
  eq(/con \d+ canali/.test(split[0].msg), true, "porta il numero di canali reali");
  // dichiarata GIÀ CONFIGURATA → fiducia all'utente: niente todef split
  A.state.production.systems.recaudio.ans = "configurato";
  eq(A.auditEngine().findings.filter(f => f.lvl === "todef" && /split/.test(f.msg)).length, 0, "configurato: nessun todef split");
  A.state.production.systems.recaudio.ans = null;
});
t("produzione fase 5 — Scenario E: camera documentativa = nessuna assunzione di regia/streaming", () => {
  reset(); const c = add("camera", 300, 300); c.uso = "documentativa";
  const prod = A.auditEngine().findings.filter(f => f.cat === "Produzione");
  eq(prod.filter(f => f.lvl === "err" || f.lvl === "warn").length, 0, "nessun errore/avviso");
  eq(prod.some(f => /streaming|regia/.test(f.msg)), false, "nessuna regia video o streaming assunti");
});

t("pagine-vista per layer: il solo temporaneo pilota layerShown (cabin on → cabout off)", () => {
  reset(); A.state.cab.on = true; A.state.mond.on = true;
  // senza solo: entrambi visibili
  eq(A.layerShown("cabin"), true); eq(A.layerShown("cabout"), true); eq(A.layerShown("mond"), true);
  // con solo cabin (come fa stageSceneSvg per la pagina INGRESSI): solo cabin+net
  const keep = A.layerSoloUI;
  A.layerSoloUI = { cabin: true, net: true };
  eq(A.layerShown("cabin"), true); eq(A.layerShown("net"), true);
  eq(A.layerShown("cabout"), false, "ritorni esclusi dalla pagina Ingressi");
  eq(A.layerShown("mond"), false, "P.M. esclusi dalla pagina Ingressi");
  A.layerSoloUI = { mond: true };
  eq(A.layerShown("mond"), true); eq(A.layerShown("cabin"), false);
  A.layerSoloUI = keep;
  // classificazione fg per le nuove pagine
  reset(); const wedge = add("wedge", 300, 300);
  eq(A.layerFgItem("cabout", wedge), true, "wedge = fg della pagina Monitor");
  eq(A.layerFgItem("cabin", wedge), false, "wedge non è fg della pagina Ingressi");
});

t("productionStatusLine: conteggi risposte e da-definire", () => {
  reset();
  let st = A.productionStatusLine(A.state);
  eq(st.answered, 0, "nessuna risposta all'inizio");
  eq(st.todef, 6, "null conta come da definire");
  A.state.production.systems.playback.ans = "no";
  A.state.production.systems.video.ans = "configurato";
  A.state.production.systems.recaudio.ans = "da_definire";
  A.state.production.systems.recvideo.ans = "non_so";
  A.state.production.systems.streaming.ans = "service";
  A.state.production.systems.luci.ans = "da_concordare";
  st = A.productionStatusLine(A.state);
  eq(st.answered, 6, "tutte risposte");
  eq(st.todef, 2, "da_definire + non_so; luci da_concordare NON è todef");
  A.state.production.systems.luci.ans = "da_definire";
  eq(A.productionStatusLine(A.state).todef, 3, "luci da_definire conta");
});

t("pdfSuggestedKeys: suggerite tra le disponibili, mai le neutre", () => {
  const pages=[{key:"view-cabin"},{key:"rider"},{key:"pmlist"},{key:"cabmap"},{key:"todefine"}];
  eq(JSON.stringify(A.pdfSuggestedKeys(pages)), JSON.stringify(["view-cabin","pmlist","todefine"]));
  eq(A.pdfSuggestedKeys([]).length, 0);
});

t("productionElementHints: interfaccia audio senza dichiarazioni → invito mirato", () => {
  reset();
  /* reset() non tocca state.production: azzero i sistemi lasciati dai test precedenti */
  Object.keys(A.state.production.systems).forEach(k => { A.state.production.systems[k].ans = null; });
  eq(A.productionElementHints(A.state).length, 0, "palco vuoto: nessun invito");
  add("audiointerface", 300, 300);
  const h=A.productionElementHints(A.state);
  eq(h.length, 1);
  eq(/interfaccia audio/.test(h[0]), true, "l'invito nomina l'elemento");
  A.state.production.systems.playback.ans="no";
  A.state.production.systems.recaudio.ans="configurato";
  eq(A.productionElementHints(A.state).length, 0, "sistemi dichiarati: niente invito");
  add("camera", 400, 300);
  eq(/camera/.test(A.productionElementHints(A.state)[0]), true, "camera senza rec/streaming dichiarati");
});

t("pdfHeaderPropose: salvato > contatto primario > vuoto", () => {
  reset();
  A.state.pdfHeader = ""; A.state.contacts = [];
  eq(A.pdfHeaderPropose(A.state), "", "niente rubrica: vuoto");
  A.state.contacts = [
    { role: "Produzione", name: "Anna B.", contact: "anna@esempio.it", note: "" },
    { role: "Fonico di sala", name: "Marco V.", contact: "+39 333 000 0000", note: "" }
  ];
  eq(A.pdfHeaderPropose(A.state), "Fonico di sala: Marco V. · +39 333 000 0000", "primario = ruolo tecnico/sala, non il primo della lista");
  A.state.pdfHeader = "Testo mio";
  eq(A.pdfHeaderPropose(A.state), "Testo mio", "il testo salvato vince sempre");
  eq(A.pdfHeaderFromContact({ role: "", name: "Solo Nome", contact: "" }), "Solo Nome", "solo nome, senza ruolo");
  // cascata con account Google (nome · email): dopo la rubrica, prima del vuoto
  const acct = { role: "", name: "Nome Account", contact: "utente@esempio.it" };
  eq(A.pdfHeaderPropose(A.state, acct), "Testo mio", "il salvato vince anche sull'account");
  A.state.pdfHeader = "";
  eq(A.pdfHeaderPropose(A.state, acct), "Fonico di sala: Marco V. · +39 333 000 0000", "la rubrica del progetto vince sull'account");
  A.state.contacts = [];
  eq(A.pdfHeaderPropose(A.state, acct), "Nome Account · utente@esempio.it", "senza rubrica: account Google");
  eq(A.pdfHeaderPropose(A.state, null), "", "senza nulla: vuoto");
});

t("mond: il cavo segue il mixerino quando lo si sposta (cache invalidata)", () => {
  reset(); A.state.mond.on = true;
  const m = add("hearback", 300, 300), h = add("mixhub", 600, 300);
  A.mondManual(m.id).to = h.id; A.__mondRes = null;
  let l = A.mondResult().links[0];
  eq(!!l, true, "link creato");
  const x0 = l.pts[0][0], y0 = l.pts[0][1];
  eq(Math.abs(x0 - 300) < 80 && Math.abs(y0 - 300) < 80, true, "parte vicino al mixerino");
  // sposto l'elemento come fa il drag (aggiorna x/y e poi render+save, SENZA toccare la cache)
  m.x = 1000; m.y = 800;
  l = A.mondResult().links[0];
  eq(Math.abs(l.pts[0][0] - 1000) < 80 && Math.abs(l.pts[0][1] - 800) < 80, true,
     "il cavo parte dalla NUOVA posizione del mixerino");
});

t("pannello cavo: selectedCableInfo per un link P.M. + ripristina percorso", () => {
  reset(); A.state.mond.on = true;
  const m = add("hearback", 300, 300), h = add("mixhub", 600, 300);
  A.mondManual(m.id).to = h.id;
  A.mondManual(m.id).pts = [[450, 200]];              // segmento fatto "a mano"
  A.selMond = m.id; A.selCab = null; A.selElec = null;
  const info = A.selectedCableInfo();
  eq(!!info, true, "info trovata");
  eq(info.title, "Cavo personal monitor");
  eq(info.hasPts, true, "segnala il percorso modificato a mano");
  eq(info.rows.some(r => r[0] === "Lunghezza"), true, "riga lunghezza presente");
  info.resetPts();                                     // il tasto Ripristina percorso
  eq((A.state.mond.manual[m.id].pts || []).length, 0, "segmenti cancellati");
  eq(A.state.mond.manual[m.id].to, h.id, "il collegamento resta");
  A.selMond = null;
});

t("postazione a due: distanza default 90 cm (mai sotto il minimo fisico)", () => {
  reset();
  const v = add("vln1x2", 300, 300);
  eq(v.sep, 90, "addItem diretto: 90 cm subito");
  const cb = add("cbx2", 500, 300);
  eq(cb.sep, 100, "contrabbassi doppi: il minimo fisico 100 vince su 90");
  delete v.sep; delete cb.sep;
  const ns = A.normalizeState(A.state); if (ns) A.state = ns;
  eq(A.state.items.find(i => i.type === "vln1x2").sep, 90, "normalize (progetti caricati): 90 cm");
  eq(A.state.items.find(i => i.type === "cbx2").sep, 100, "normalize: minimo fisico rispettato");
  const single = add("vlnpost", 700, 300);
  eq(single.sep, 90, "postazione singola: sep pronto a 90 per quando diventa doppia");
});

t("shareOpts: default copia ON, contatti OFF (privacy); override persistiti", () => {
  reset();
  delete A.state.shareOpts;
  let ns = A.normalizeState(A.state); if (ns) A.state = ns;
  eq(A.state.shareOpts.copy, true, "copia permessa di default");
  eq(A.state.shareOpts.contacts, false, "contatti nel link SPENTI di default");
  A.state.shareOpts = { copy: false, contacts: true };
  ns = A.normalizeState(A.state); if (ns) A.state = ns;
  eq(A.state.shareOpts.copy, false, "scelta copia=off rispettata");
  eq(A.state.shareOpts.contacts, true, "opt-in contatti rispettato");
});

t("contactEligible: bottone Contatto solo sugli elementi-persona", () => {
  eq(A.contactEligible("vlnpost"), true, "postazione violino");
  eq(A.contactEligible("vln1x2"), true, "postazione doppia");
  eq(A.contactEligible("cantante"), true, "voce");
  eq(A.contactEligible("stagepiano"), true, "tastiera");
  eq(A.contactEligible("direttore"), true, "direttore");
  eq(A.contactEligible("batteria"), true, "batteria");
  eq(A.contactEligible("wedge"), false, "monitor: no");
  eq(A.contactEligible("laptop"), false, "computer: no");
  eq(A.contactEligible("stagebox"), false, "stage box: no");
});

t("icRoleMatch: sul violino solo i violini, mai i violoncelli", () => {
  eq(A.icRoleMatch("Postazione violino", "Violino"), true, "violino ↔ violino");
  eq(A.icRoleMatch("Violino I", "Violino II"), true, "I e II sono entrambi violinisti");
  eq(A.icRoleMatch("Violoncello", "Violoncello"), true);
  eq(A.icRoleMatch("Postazione violino", "Violoncello"), false, "violoncello NON è affine al violino");
  eq(A.icRoleMatch("Violoncello", "Violino"), false, "e viceversa");
  eq(A.icRoleMatch("Direttore", "Fonico di sala"), false);
  eq(A.icRoleMatch("Violino I", ""), false, "senza ruolo: non suggerito (si trova cercando)");
  eq(A.icRoleMatch("Cantante", "cantante"), true, "case-insensitive");
});

t("evento: evDate/evTime facoltativi, validati e persistiti", () => {
  reset();
  delete A.state.evDate; delete A.state.evTime;
  let ns = A.normalizeState(A.state); if (ns) A.state = ns;
  eq(A.state.evDate, "", "default vuoto");
  eq(A.state.evTime, "", "default vuoto");
  A.state.evDate = "2026-08-01"; A.state.evTime = "21:30";
  ns = A.normalizeState(A.state); if (ns) A.state = ns;
  eq(A.state.evDate, "2026-08-01", "data valida preservata");
  eq(A.state.evTime, "21:30", "orario valido preservato");
  A.state.evDate = "spazzatura"; A.state.evTime = "25h";
  ns = A.normalizeState(A.state); if (ns) A.state = ns;
  eq(A.state.evDate, "", "data non valida azzerata");
  eq(A.state.evTime, "", "orario non valido azzerato");
});

t("layer Musicisti: fg = persone, visibilità da musLayerUI, attivo solo con persone", () => {
  reset();
  const v = add("vlnpost", 300, 300), w = add("wedge", 500, 300);
  eq(A.layerFgItem("mus", v), true, "violinista = fg del layer Musicisti");
  eq(A.layerFgItem("mus", w), false, "wedge no");
  eq(A.layerShown("mus"), true, "visibile di default");
  A.musLayerUI.vis = false;
  eq(A.layerShown("mus"), false, "occhio chiuso");
  A.musLayerUI.vis = true;
  const reg = A.layerRegistry();
  eq(reg.some(L => L.id === "mus" && L.active), true, "attivo con una persona sul palco");
  A.state.items = [];
  eq(A.layerRegistry().some(L => L.id === "mus" && L.active), false, "senza persone: non attivo");
  // il solo Musicisti deve SOPRAVVIVERE a pruneSolo quando ci sono persone (bug 18/07)
  add("vlnpost", 300, 300);
  A.layerSoloUI = { mus: true };
  A.pruneSolo();
  eq(!!A.layerSoloUI.mus, true, "solo Musicisti vivo con persone sul palco");
  A.state.items = [];
  A.pruneSolo();
  eq(!!A.layerSoloUI.mus, false, "senza persone il solo decade");
  A.layerSoloUI = {};
});

/* 25/07: le misure seguono la geometria reale (XLR 26 mm di passo, max 16 per fila come sui 19").
   Piu' canali = telaio piu' grande, non connettori piu' fitti. */
t("stagebox: le misure seguono i canali come nella realta'", () => {
  reset();
  const sb = add("stagebox", 400, 200);
  const dim = (o) => { Object.assign(sb, o); A.sbAutoSize(sb); return [sb.w, sb.d].join("x"); };
  const d8 = dim({ ch: 8, outCh: 0 }), d16 = dim({ ch: 16, outCh: 8 }), d32 = dim({ ch: 32, outCh: 16 });
  ok(d8 !== d16 && d16 !== d32, "8, 16 e 32 canali devono avere misure diverse: " + [d8, d16, d32].join(" / "));
  const [w8, h8] = d8.split("x").map(Number), [w16, h16] = d16.split("x").map(Number), [w32, h32] = d32.split("x").map(Number);
  eq(w8, w16, "fino a 16 canali la larghezza non cambia (8 connettori per fila)");
  ok(w32 > w16, "oltre i 16 canali la fila si allarga (16 per fila, come un 19\")");
  ok(h16 > h8, "piu' file di connettori = piu' profondita'");
  ok(w16 < 58 && h16 < 46, "una stage box vera e' piu' piccola del vecchio 58x46: " + d16);
  /* il passo dei connettori resta identico fra box diverse: e' il telaio a cambiare */
  const L8 = A.sbLayout({ type: "stagebox", ch: 8, outCh: 0 }), L32 = A.sbLayout({ type: "stagebox", ch: 32, outCh: 16 });
  const passo = (L) => (L.w - 2 * A.SB_PAD - A.SB_CTRL) / L.cols;   /* la larghezza e' arrotondata al cm: tolleranza */
  ok(Math.abs(passo(L8) - A.SB_PITCH) < 0.05 && Math.abs(passo(L32) - A.SB_PITCH) < 0.05,
    "il passo dei connettori deve restare 26 mm su ogni box: " + passo(L8).toFixed(2) + " vs " + passo(L32).toFixed(2));
  eq(L32.per, 16, "oltre 16 canali si usano 16 connettori per fila");
  eq(L8.per, 8, "fino a 16 canali, 8 per fila");
});
t("stagebox: modelli reali e misure personalizzate non vengono toccati", () => {
  reset();
  const sb = add("stagebox", 400, 200);
  sb.ch = 16; A.sbAutoSize(sb);
  sb.hw = "tio1608d"; const prima = [sb.w, sb.d].join("x");
  sb.ch = 32; A.sbAutoSize(sb);
  eq([sb.w, sb.d].join("x"), prima, "col modello hw le misure vengono dal datasheet");
  delete sb.hw; sb.w = 77; sb.d = 33; sb.ch = 8; A.sbAutoSize(sb);
  eq([sb.w, sb.d].join("x"), "77x33", "una misura personalizzata non va sovrascritta");
});
t("stagebox: una box appena creata ha gia' le misure dei suoi canali", () => {
  reset();
  const b8 = A.addItem("stagebox", { x: 200, y: 200, ch: 8, outCh: 0 });
  const b32 = A.addItem("stagebox", { x: 600, y: 200, ch: 32, outCh: 16 });
  const g = (it) => [it.w, it.d].join("x");
  ok(g(b8) !== "58x46" && g(b32) !== "58x46", "addItem usa ancora le misure fisse del tipo");
  ok(g(b8) !== g(b32), "8 e 32 canali devono nascere con misure diverse: " + g(b8) + " / " + g(b32));
  eq(g(b32), [A.sbLayout(b32).w, A.sbLayout(b32).d].join("x"));
});
t("stagebox: il pallino dei cavi sta sul bordo, non sul pannello", () => {
  const box = { x: 500, y: 300, w: 33, d: 17 };
  const a = A.boxAnchor(box);
  eq(a[0], 500, "il pallino resta centrato in orizzontale");
  ok(a[1] > box.y + box.d / 2, "il pallino deve stare FUORI dal pannello, verso il pubblico: " + a[1]);
  ok(a[1] < box.y + box.d / 2 + 8, "ma attaccato alla box, non staccato: " + a[1]);
  /* i cavi devono arrivare li', non al centro: nessun capo cavo hard-coded sul centro della box */
  ok(appjs.indexOf("concat([[b.x,b.y]])") === -1 && appjs.indexOf("[[m.box.x,m.box.y]]") === -1,
    "restano capi cavo agganciati al centro della box");
});
t("stagebox: i progetti vecchi (58x46, 34x26) migrano alle misure reali", () => {
  reset();
  const sb = add("stagebox", 400, 200);
  sb.w = 58; sb.d = 46; sb.ch = 16; sb.outCh = 8; A.sbAutoSize(sb);
  ok(sb.w !== 58 || sb.d !== 46, "la misura legacy non e' stata migrata");
  const dopo = [sb.w, sb.d].join("x");
  A.sbAutoSize(sb); eq([sb.w, sb.d].join("x"), dopo, "sbAutoSize deve essere idempotente");
});

t("rack: contenuti ordinati, U dai datasheet noti, orfani liberati dal normalize", () => {
  reset();
  const rk = add("rack", 500, 200);
  const b1 = add("stagebox", 500, 200); b1.hw = "rio3224d2"; b1.rackId = rk.id; b1.rackPos = 1;
  const b2 = add("stagebox", 500, 200); b2.hw = "rio1608d2"; b2.rackId = rk.id; b2.rackPos = 0;
  const hub = add("mixhub", 500, 200); hub.rackId = rk.id; hub.rackPos = 2;
  let ns = A.normalizeState(A.state); if (ns) A.state = ns;
  eq(A.state.items.find(i => i.type === "rack").rackU, 12, "default 12U");
  const cont = A.rackContents(rk.id);
  eq(cont.map(x => x.hw || x.type).join(","), "rio1608d2,rio3224d2,mixhub", "ordine per rackPos");
  eq(A.rackUsedU(rk.id), 2 + 3 + 1, "U: 2 (Rio16) + 3 (Rio32) + 1 (default hub)");
  cont[2].rackUh = 2;
  eq(A.rackUsedU(rk.id), 7, "U modificabile a mano vince");
  // rack eliminato → gli apparecchi si liberano
  A.state.items = A.state.items.filter(i => i.id !== rk.id);
  ns = A.normalizeState(A.state); if (ns) A.state = ns;
  eq(A.state.items.some(i => i.rackId), false, "nessun rackId orfano dopo il normalize");
});

t("F2: device ID + FOH continuo + porte riservate/pinnate + conflitti", () => {
  reset();
  A.state.cab.on = true; A.state.cab.mode = "auto"; A.state.cab.manual = {};
  const b32 = add("stagebox", 700, 250); b32.hw = "rio3224d2";
  const b16 = add("stagebox", 900, 250); b16.hw = "rio1608d2"; b16.sbId = 1;   // il 16 diventa ID1 → FOH 1-16
  const mic = add("astamic", 880, 400);
  A.__cabRes = null;
  let R = A.audioCablingEngine();
  const B16 = R.boxes.find(b => b.id === b16.id), B32 = R.boxes.find(b => b.id === b32.id);
  eq(B16.eid, 1, "sbId esplicito vince"); eq(B16.fohBase, 0, "ID1 parte da FOH 1");
  eq(B32.fohBase, 16, "la 32 continua da 17");
  const l = R.links.find(x => x.s.it.id === mic.id);
  eq(l.box.id, b16.id, "il mic va sulla box vicina");
  const row = A.patchList().rows.find(r => r.key === l.key);
  eq(row.foh, B16.fohBase + l.ch, "canale FOH continuo in lista"); eq(A.patchList().hasFoh, true, "hasFoh con 2 box");
  // porta riservata: la 1 resta libera (spare), il mic scala
  b16.sbRes = [l.ch]; A.__cabRes = null; R = A.audioCablingEngine();
  const l2 = R.links.find(x => x.s.it.id === mic.id);
  ok(l2.ch !== l.ch, "la porta riservata viene saltata");
  // pin manuale porta 5 + nome breve
  A.cabManual(l2.key).port = 5; A.cabManual(l2.key).short = "VOX";
  A.__cabRes = null; R = A.audioCablingEngine();
  const l3 = R.links.find(x => x.s.it.id === mic.id);
  eq(l3.ch, 5, "porta pinnata rispettata"); eq(l3.pinned, true, "flag pinned");
  eq(A.patchList().rows.find(r => r.key === l3.key).short, "VOX", "nome breve in lista");
  // conflitto: seconda sorgente pinnata sulla stessa porta → err
  const mic2 = add("astamic", 920, 400);
  A.__cabRes = null; R = A.audioCablingEngine();
  const lx = R.links.find(x => x.s.it.id === mic2.id);
  A.cabManual(lx.key).port = 5; A.__cabRes = null; R = A.audioCablingEngine();
  ok(R.issues.some(i => i.lvl === "err" && /Porta duplicata/.test(i.msg)), "porta duplicata = errore");
  // device ID duplicato → warn
  delete A.state.cab.manual[l3.key]; delete A.state.cab.manual[lx.key];
  b32.sbId = 1; A.__cabRes = null; R = A.audioCablingEngine();
  ok(R.issues.some(i => i.lvl === "warn" && /Device ID duplicato/.test(i.msg)), "ID duplicato = warn");
  // normalize sanifica sbId/sbRes fuori range
  b32.sbId = 99; b16.sbRes = [0, 3, 3, 70];
  let ns = A.normalizeState(A.state); if (ns) A.state = ns;
  const n32 = A.state.items.find(i => i.id === b32.id), n16 = A.state.items.find(i => i.id === b16.id);
  eq(n32.sbId, undefined, "sbId fuori range rimosso");
  eq(JSON.stringify(n16.sbRes), "[3]", "sbRes dedup + solo porte valide");
});

t("F3: ricevitori RF — associazione auto, pin, capienza, sorgente audio dal ricevitore", () => {
  reset();
  const v1 = add("wireless", 300, 200); v1.label = "Voce 1";
  const v2 = add("wireless", 350, 200); v2.label = "Voce 2";
  const pr = add("headset", 400, 200); pr.label = "Presentatore";
  // senza ricevitori: tutto come prima (i tx sono sorgenti)
  eq(A.rfAssign().rxs.length, 0, "nessun rx");
  eq(A.cabItemInputs(v1).length, 1, "senza rx il palmare resta sorgente");
  // rx generico da 2: i primi due assegnati, il terzo orfano
  const rx = add("rxrf", 600, 300);
  let R = A.rfAssign();
  eq(R.byTx[v1.id].ch, 1, "Voce 1 → ch 1"); eq(R.byTx[v2.id].ch, 2, "Voce 2 → ch 2");
  eq(R.orphans.length, 1, "Presentatore orfano");
  eq(A.cabItemInputs(v1).length, 0, "tx assegnato: 0 canali dal palmare");
  const chans = A.cabItemInputs(rx);
  eq(chans.length, 2, "il ricevitore è la sorgente");
  eq(chans[0].name, "Voce 1", "nome canale dal tx"); eq(chans[0].mic, "Beta 58A", "capsula da IN_SRC");
  eq(A.cabItemInputs(pr).length, 1, "l'orfano resta sorgente diretta");
  ok(A.rfIssues().some(i => i.lvl === "warn" && /senza ricevitore/.test(i.msg)), "warn orfano");
  // pin esplicito: Presentatore sul ch 1 → Voce 1 scala, Voce 2 orfana (2 posti)
  pr.rxId = rx.id; pr.rxCh = 1;
  R = A.rfAssign();
  eq(R.byTx[pr.id].ch, 1, "pin rispettato"); eq(R.byTx[v1.id].ch, 2, "auto scala");
  eq(R.orphans[0].id, v2.id, "Voce 2 orfana");
  // modello reale: ULXD4Q = 4 canali → tutti dentro
  rx.hw = "ulxd4q";
  R = A.rfAssign();
  eq(R.orphans.length, 0, "capienza 4: nessun orfano");
  eq(A.rxCapOf(rx), 4, "canali di targa");
  // frequenza duplicata = err; fuori banda nota = warn
  v1.rf = "524.375"; v2.rf = "524.375";
  ok(A.rfIssues().some(i => i.lvl === "err" && /duplicata/.test(i.msg)), "freq duplicata = err");
  delete v2.rf; rx.band = "R1-9"; v1.rf = "700.000";
  ok(A.rfIssues().some(i => i.lvl === "warn" && /fuori dalla banda/.test(i.msg)), "700 MHz fuori R1-9 = warn");
  v1.rf = "524.375";
  ok(!A.rfIssues().some(i => /fuori dalla banda/.test(i.msg)), "524.375 in R1-9: ok");
  // lista RF: colonna ricevitore
  const row = A.rfList().rows.find(r => r.name === "Voce 1");
  ok(/ch/.test(row.rx), "lista: ricevitore + canale");
  // normalize: rx eliminato → pin puliti, tx tornano sorgenti
  A.state.items = A.state.items.filter(i => i.id !== rx.id);
  let ns = A.normalizeState(A.state); if (ns) A.state = ns;
  eq(A.state.items.some(i => i.rxId != null), false, "rxId orfano rimosso");
  eq(A.cabItemInputs(A.state.items.find(i => i.id === v1.id)).length, 1, "il palmare torna sorgente");
});

t("F3: catena coassiale antenna->splitter->ricevitori, avvisi topologia", () => {
  reset();
  const rx1 = add("rxrf", 500, 300); const rx2 = add("rxrf", 560, 300);
  const a1 = add("rfant", 200, 150); const a2 = add("rfant", 260, 150);
  // senza splitter con 2 rx: antenna sul piu vicino + warn
  let C = A.rfChain();
  eq(C.links.length, 2, "2 antenne collegate");
  ok(C.links.every(l => l.lenM > 0), "metri calcolati");
  ok(C.issues.some(i => /senza splitter/.test(i.msg)), "warn: serve splitter con 2 rx");
  // con lo splitter: ant->split + split->rx, niente warn
  const sp = add("rfsplit", 380, 220);
  C = A.rfChain();
  eq(C.links.filter(l => l.kind === "ant").length, 2, "antenne sullo splitter");
  eq(C.links.filter(l => l.kind === "rx").length, 2, "splitter sui ricevitori");
  ok(!C.issues.some(i => /senza splitter/.test(i.msg)), "warn sparito");
  // overflow: 5 ricevitori su uno splitter 1:4
  for (let i = 0; i < 3; i++) add("rxrf", 600 + i * 40, 300);
  C = A.rfChain();
  ok(C.issues.some(i => /uscite tipiche sono 4/.test(i.msg)), "warn oltre 4 uscite");
  // lista: infrastruttura presente
  const kinds = A.rfList().rows.map(r => r.kind).join("|");
  ok(/Antenna direttiva 90/.test(kinds) && /Distribuzione RF/.test(kinds), "antenne+splitter in lista");
  // modello reale dal campo (Sernaglia): ADP UHF = 100 gradi di targa, vince sul campo manuale
  a1.hw = "adpuhf"; a1.antAng = 70;
  eq(A.antAngOf(a1), 100, "targa ADP 100 gradi");
  ok(/direttiva 100.*ADP/.test(A.rfList().rows.map(r => r.kind).join("|")), "lista col modello");
});

t("F3: rete/Dante — switch a stella, trunk console, ridondanza e porte", () => {
  reset();
  A.state.cab.on = true; A.state.cab.mode = "auto"; A.state.cab.mixer = "dm3";
  A.state.cab.home = { kind: "foh" };
  const b1 = add("stagebox", 300, 300); b1.hw = "rio3224d2";
  const b2 = add("stagebox", 900, 300); b2.hw = "rio1608d2";
  add("astamic", 320, 400); add("astamic", 880, 400);
  A.__cabRes = null;
  // senza switch: tratte dirette + warn "switch"
  let N = A.netEngine();
  eq(N.runs.length, 2, "2 tratte dirette");
  ok(N.runs.every(r => r.kind === "box" && !r.sw), "dirette alla console");
  ok(N.issues.some(i => /Switch rete/.test(i.msg)), "warn: consiglia lo switch");
  // con lo switch: 2 box->switch + 1 trunk
  const sw = add("netswitch", 600, 600);
  A.__cabRes = null; N = A.netEngine();
  eq(N.runs.filter(r => r.kind === "box" && r.sw).length, 2, "box a stella sullo switch");
  eq(N.runs.filter(r => r.kind === "trunk").length, 1, "un solo trunk verso la console");
  eq(N.swUsed, 3, "3 porte Primary");
  ok(!N.issues.some(i => /Switch rete/.test(i.msg)), "consiglio sparito");
  // ridondanza: porte doppie; 5 porte non bastano piu
  A.state.netRed = true; sw.swPorts = 5;
  A.__cabRes = null; N = A.netEngine();
  eq(N.swUsed, 6, "Primary+Secondary = 6 porte");
  ok(N.runs.every(r => r.red), "tutte le tratte ridondate (Dante)");
  ok(N.issues.some(i => i.lvl === "err" && /porte/.test(i.msg)), "err porte insufficienti");
  sw.swPorts = 8; A.__cabRes = null; N = A.netEngine();
  ok(!N.issues.some(i => i.lvl === "err" && /porte/.test(i.msg)), "8 porte bastano");
  // normalize: swPorts fuori range rimosso
  sw.swPorts = 99; let ns = A.normalizeState(A.state); if (ns) A.state = ns;
  eq(A.state.items.find(i => i.id === sw.id).swPorts, undefined, "swPorts sanificato");
  A.state.netRed = false;
});

t("Output list: bus console -> porte out (auto consecutive, pin, conflitti, mai duplicati)", () => {
  reset();
  A.state.cab.on = true; A.state.cab.mode = "auto"; A.state.cab.mixer = "dm3";
  A.state.cab.home = { kind: "foh" };
  const b1 = add("stagebox", 300, 300); b1.hw = "rio3224d2"; b1.sbId = 1;   // 8 out
  const b2 = add("stagebox", 900, 300); b2.hw = "rio1608d2"; b2.sbId = 2;   // 8 out
  const w = add("wedge", 320, 500);   // 1 mix monitor derivato
  add("astamic", 320, 400);
  A.state.buses = [];
  A.__cabRes = null;
  let L = A.busList();
  eq(L.auto.length, 1, "mix monitor derivato presente");
  const monBox = L.auto[0].box, monPort = L.auto[0].ports[0];
  // bus stereo auto: prime 2 consecutive libere (dopo il monitor se stessa box)
  A.state.buses.push({ id: "bA", name: "MAIN L/R", kind: "st", dest: "P.A." });
  A.__cabRes = null; L = A.busList();
  const main = L.rows[0];
  eq(main.ports.length, 2, "stereo = 2 porte");
  ok(main.ports[1] === main.ports[0] + 1, "porte consecutive");
  if (main.box.id === monBox.id) ok(main.ports[0] !== monPort, "non pesta il monitor");
  // pin: porta 7 su ID2
  A.state.buses.push({ id: "bB", name: "TV L/R", kind: "st", boxId: b2.id, port: 7 });
  A.__cabRes = null; L = A.busList();
  const tv = L.rows.find(r => r.bus.id === "bB");
  eq(tv.box.id, b2.id, "pin box rispettato"); eq(tv.ports.join(","), "7,8", "pin porta 7-8");
  eq(tv.pinned, true, "flag pinned");
  // conflitto: altro bus pinnato sulla stessa porta -> err e riassegnato altrove
  A.state.buses.push({ id: "bC", name: "REC L/R", kind: "st", boxId: b2.id, port: 8 });
  A.__cabRes = null; L = A.busList();
  ok(L.issues.some(i => i.lvl === "err" && /occupata/.test(i.msg)), "pin in conflitto = err");
  const rec = L.rows.find(r => r.bus.id === "bC");
  ok(rec.box && !(rec.box.id === b2.id && rec.ports[0] === 8), "riassegnato altrove");
  // saturazione: 16 out totali - riempio tutto -> bus senza porta, mai perso
  for (let i = 0; i < 12; i++) A.state.buses.push({ id: "bF" + i, name: "X" + i, kind: "st" });
  A.__cabRes = null; L = A.busList();
  ok(L.unpatched.length >= 1, "bus senza porta out");
  ok(L.issues.some(i => /senza porta out/.test(i.msg)), "err out esaurite");
  eq(L.rows.length, A.state.buses.length, "nessun bus perso dalle righe");
  // normalize: kind farlocco -> st; boxId orfano -> pulito; senza nome -> via
  A.state.buses = [{ id: "z1", name: "OK", kind: "boh", boxId: "manca", port: 3 }, { name: "  " }];
  let ns = A.normalizeState(A.state); if (ns) A.state = ns;
  eq(A.state.buses.length, 1, "bus senza nome eliminato");
  eq(A.state.buses[0].kind, "st", "kind sanificato");
  eq(A.state.buses[0].boxId, undefined, "boxId orfano rimosso");
  A.state.buses = [];
});

t("Sub-snake analogica -> rack I/O: blocco contiguo, FOH del Rio, riservate, fallback main", () => {
  reset();
  A.state.cab.on = true; A.state.cab.mode = "auto"; A.state.cab.mixer = "dm3";
  A.state.cab.home = { kind: "foh" };
  const rio = add("stagebox", 900, 300); rio.hw = "rio3224d2"; rio.sbId = 1;
  const ana = add("stagebox", 200, 300); ana.ch = 8; ana.outCh = 0;      // generica = analogica
  const m1 = add("astamic", 180, 400); const m2 = add("astamic", 220, 400);  // vicini all'analogica
  const dir = add("astamic", 880, 400);                                   // diretto al rio
  A.__cabRes = null;
  let R = A.audioCablingEngine();
  const bA = R.boxes.find(b => b.id === ana.id), bR = R.boxes.find(b => b.id === rio.id);
  eq(bA.digital, false, "generica = analogica"); eq(bR.digital, true, "rio = rack I/O");
  eq(bA.fohBase, null, "l'analogica non ha blocco FOH proprio");
  ok(bA.up && bA.up.box.id === rio.id, "coda agganciata al rio");
  eq(bA.up.n, 2, "2 canali raccolti");
  ok(bA.up.p0 >= 1, "blocco assegnato");
  // le porte del blocco risultano occupate sul rio, con provenienza
  ok(bR.taken[bA.up.p0] && bR.snkFrom[bA.up.p0] === bA.letter, "porta del rio occupata dalla coda");
  // patch list: FOH dal rio, patch con freccia
  const pl = A.patchList();
  const rowM = pl.rows.find(r => r.itemId === m1.id);
  ok(rowM.foh === bR.fohBase + bA.up.map[1] || rowM.foh === bR.fohBase + bA.up.map[2] || rowM.foh >= 1, "FOH dal rio");
  ok(rowM.patch.indexOf("\u2192") > 0 && /ID1:/.test(rowM.patch), "patch A->ID1:porta");
  const rowD = pl.rows.find(r => r.itemId === dir.id);
  ok(/ID1\u00b7/.test(rowD.patch), "il diretto resta ID1-porta");
  // la snake dell'analogica punta al rio
  const sk = R.snakes.find(k => k.box.id === ana.id);
  ok(sk && sk.up && sk.x2 === rio.x, "snake verso il rack I/O");
  // riservate del rio rispettate: riservo le prime 30 -> blocco impossibile = err
  rio.sbRes = Array.from({ length: 31 }, (_, i) => i + 1); A.__cabRes = null;
  R = A.audioCablingEngine();
  ok(R.issues.some(i => i.lvl === "err" && /porte contigue/.test(i.msg)), "err senza blocco contiguo");
  delete rio.sbRes;
  // sbTo=main: comportamento classico (multipolare al punto principale, FOH proprio)
  ana.sbTo = "main"; A.__cabRes = null;
  R = A.audioCablingEngine();
  const bA2 = R.boxes.find(b => b.id === ana.id);
  ok(!bA2.up && bA2.fohBase != null, "main = niente coda, blocco FOH proprio");
  // normalize: sbTo con id inesistente -> pulito
  ana.sbTo = "fantasma"; let ns = A.normalizeState(A.state); if (ns) A.state = ns;
  eq(A.state.items.find(i => i.id === ana.id).sbTo, undefined, "sbTo orfano rimosso");
});

t("F4: linee numerate del distro + connettore (auto, pin, override)", () => {
  reset();
  A.state.elec.on = true; A.state.elec.mode = "auto"; A.state.elec.manual = {};
  A.state.elec.supply = { kind: "left" };
  const d = add("distro32", 100, 300);
  const h1 = add("testamobile", 200, 300);   // moving head, >0W
  const h2 = add("testamobile", 240, 300);
  const rk = add("rack", 300, 300);           // rack audio → PowerCON, ma serve wattOf>0
  A.__elecRes = null;
  let R = A.electricEngine();
  const links = R.loadLinks;
  ok(links.length >= 2, "carichi collegati");
  // numeri progressivi distinti per distro
  const nums = links.map(l => l.line).sort((a, b) => a - b);
  eq(new Set(nums).size, nums.length, "numeri linea distinti");
  ok(nums[0] === 1, "parte da 1");
  // connettore dedotto: moving head (5A) = Schuko
  const lh = links.find(l => l.load.it.id === h1.id);
  eq(lh.conn.k, "sk", "moving head <16A = Schuko");
  // override connettore = CEE
  A.state.elec.manual[h1.id] = { conn: "cee" };
  A.__elecRes = null; R = A.electricEngine();
  eq(R.loadLinks.find(l => l.load.it.id === h1.id).conn.k, "cee", "override CEE");
  // pin numero linea 7
  A.state.elec.manual[h1.id] = { line: 7 };
  A.__elecRes = null; R = A.electricEngine();
  const lh2 = R.loadLinks.find(l => l.load.it.id === h1.id);
  eq(lh2.line, 7, "linea pinnata a 7"); eq(lh2.linePinned, true, "flag pin");
  // gli altri non collidono col 7
  ok(R.loadLinks.filter(l => l.load.it.id !== h1.id).every(l => l.line !== 7), "nessuna collisione col pin");
  // loadList espone line/conn
  const row = A.loadList().rows.find(r => r.loadId === h1.id);
  eq(row.line, 7, "line in lista"); ok(row.conn, "conn label in lista");
  // normalize: line/conn fuori range puliti
  A.state.elec.manual[h1.id] = { line: 99, conn: "xxx", distro: d.id };
  let ns = A.normalizeState(A.state); if (ns) A.state = ns;
  eq((A.state.elec.manual[h1.id] || {}).line, undefined, "line fuori range rimossa");
  eq((A.state.elec.manual[h1.id] || {}).conn, undefined, "conn invalido rimosso");
  A.state.elec.manual = {};
});

/* ---- Lista Power: la barra e il cestino (veste 29/07, stessa grammatica dell'Input) ---- */
t("la barra Power legge la FASE piu' carica, non la somma dei kW", () => {
  reset();
  A.state.elec.on = true; A.state.elec.mode = "auto"; A.state.elec.manual = {};
  A.state.elec.supply = { kind: "left" };
  add("distro63", 1100, 100);       // 63 A x3 = tanta capienza in assoluto
  const ci = add("ciabatta", 100, 700);   // 16 A monofase: e' lei a soffrire per prima
  /* due carichi veri sulla ciabatta: 2500 + 1000 = 3500 W = 15,2 A, cioe' il 95% del suo
     interruttore. (Prima qui c'era un dimmer rack come carico da 3600 W: dal 29/07 il dimmer e'
     una DESTINAZIONE — assorbe quello che porta — e non serve piu' a fare da peso.) */
  const amp = add("amprack", 120, 690), hz = add("hazer", 160, 690);
  A.state.elec.manual[amp.id] = { distro: ci.id };
  A.state.elec.manual[hz.id] = { distro: ci.id };
  A.__elecRes = null;
  const R = A.electricEngine();
  const w = A.elecWorstPhase(R);
  eq(w.letter, "Q2", "la piu' carica in PERCENTUALE e' la ciabatta, non il distro grosso");
  eq(w.cap, 16, "la capienza e' quella del suo interruttore");
  ok(w.a > 0.85 * w.cap, "ed e' oltre la soglia con cui il motore avvisa: " + w.a.toFixed(1) + " A");
  eq(A.elecWorstPhase({ distros: [] }), null, "senza quadri non c'e' capienza da dichiarare");
});

t("il cestino della lista Power scollega un carico e libera la sua linea", () => {
  reset();
  A.state.elec.on = true; A.state.elec.mode = "manual"; A.state.elec.manual = {};
  A.state.elec.supply = { kind: "left" };
  add("distro32", 1100, 100);
  const h = add("testamobile", 300, 300);
  ok(A.elecConnectOne(h.id), "il fulmine collega");
  A.__elecRes = null;
  eq(A.loadList().rows.find(r => r.loadId === h.id).linked, true, "collegato");
  eq(A.elecUnlinkOne(h.id), 1, "il cestino scollega");
  A.__elecRes = null;
  const row = A.loadList().rows.find(r => r.loadId === h.id);
  eq(row.linked, false, "torna da collegare");
  eq(row.ok, true, "e non e' un errore: in manual-first «da collegare» e' lo stato normale");
  eq(A.state.elec.manual[h.id], undefined, "in manual-first l'override sparisce del tutto");
  // in auto resta la pietra tombale, o il motore lo ricollegherebbe da solo al render dopo
  A.state.elec.mode = "auto"; A.__elecRes = null; A.elecConnectOne(h.id);
  A.elecUnlinkOne(h.id);
  eq((A.state.elec.manual[h.id] || {}).deleted, true, "in auto resta {deleted:true}");
  A.state.elec.manual = {};
});

t("anche il carico non ancora collegato dichiara la sua spina", () => {
  reset();
  A.state.elec.on = true; A.state.elec.mode = "manual"; A.state.elec.manual = {};
  const rk = add("amprack", 400, 300);     // rack audio = PowerCON
  const par = add("parluci", 600, 300);    // 150 W = Schuko
  A.__elecRes = null;
  const rows = A.loadList().rows;
  eq(rows.every(r => !r.linked), true, "manual-first: nessuno collegato");
  eq(rows.find(r => r.loadId === rk.id).conn, "PowerCON", "il rack vuole una PowerCON, e si sa prima di tirare il cavo");
  eq(rows.find(r => r.loadId === par.id).conn, "Schuko");
});

t("Macchina cuffie: hub -> bus console (16 ch contigui), o Dante = nota", () => {
  reset();
  A.state.cab.on = true; A.state.cab.mode = "auto"; A.state.cab.mixer = "dm3";
  A.state.cab.home = { kind: "foh" };
  const box = add("stagebox", 500, 300); box.hw = "rio3224d2"; box.sbId = 1;   // 16 out
  add("astamic", 520, 400);
  const hub = add("mixhub", 300, 500); hub.pm = "p16d";   // Powerplay P16-D, Ultranet
  A.state.buses = [];
  A.__cabRes = null;
  let L = A.busList();
  /* 28/07 (caso reale): UNA RIGA PER MANDATA, ognuna col suo nome — come il documento che il fonico
     consegna («keyl · keyr · drums · bass · guit · archi · fiati · voci»), non un blocco anonimo. */
  const cufs = L.auto.filter(a => a.cuf);
  eq(cufs.length, 16, "16 mandate, una riga ciascuna (Ultranet)");
  const ports = cufs.map(c => c.ports[0]);
  ok(ports.every((p, i) => i === 0 || p === ports[i - 1] + 1), "blocco contiguo");
  eq(cufs[0].tag, "CUF", "tag CUF");
  ok(cufs.every(c => c.name && c.name.length), "ogni mandata ha un nome");
  ok(cufs.some(c => /voci/i.test(c.name)), "il gruppo presente sul palco dà il nome: c'è una voce → «Voci»");
  const cuf = { ports: ports, tag: cufs[0].tag, cuf: true };   /* compat con le asserzioni successive */
  // canali override
  hub.pmFeedCh = 8; A.__cabRes = null; L = A.busList();
  eq(L.auto.filter(a => a.cuf).length, 8, "override 8 canali → 8 mandate");
  delete hub.pmFeedCh;
  // Dante = niente uscite, solo nota info
  hub.pmFeed = "dante"; A.__cabRes = null; L = A.busList();
  ok(!L.auto.some(a => a.cuf), "via Dante: nessuna riga bus");
  ok(L.issues.some(i => i.lvl === "info" && /via rete Dante/.test(i.msg)), "nota Dante");
  delete hub.pmFeed;
  // out esaurite: box da pochi canali + hub 16 -> err
  box.hw = null; box.ch = 8; box.outCh = 8; A.__cabRes = null; L = A.busList();
  ok(L.issues.some(i => i.lvl === "err" && /uscite contigue/.test(i.msg)), "err senza 16 out contigue");
  // pmIsHub e helper
  eq(A.pmIsHub(hub), true, "mixhub = hub");
  eq(A.pmFeedChOf(hub), 16, "default Ultranet 16");
  // normalize: pmFeed/pmFeedCh invalidi puliti
  hub.pmFeed = "boh"; hub.pmFeedCh = 99;
  let ns = A.normalizeState(A.state); if (ns) A.state = ns;
  const nh = A.state.items.find(i => i.id === hub.id);
  eq(nh.pmFeed, undefined, "pmFeed invalido rimosso"); eq(nh.pmFeedCh, undefined, "pmFeedCh fuori range rimosso");
  A.state.buses = [];
});

t("Hub produzione: reparti tecnici derivati dal palco + extra a mano", () => {
  reset();
  // palco vuoto: nessun reparto tecnico
  eq(A.productionDepts().length, 0, "palco vuoto = 0 reparti");
  // audio + monitor + power dal palco
  A.state.cab.on = true; A.state.cab.mode = "auto"; A.state.cab.mixer = "dm3"; A.state.cab.home = { kind: "foh" };
  add("stagebox", 500, 300).hw = "rio3224d2";
  add("astamic", 520, 400);
  add("wedge", 540, 500);
  A.state.elec.on = true; A.state.elec.mode = "auto"; A.state.elec.supply = { kind: "left" };
  add("distro32", 100, 300); add("testamobile", 200, 300);
  A.__cabRes = null; A.__elecRes = null;
  let d = A.productionDepts();
  const keys = d.map(x => x.key);
  ok(keys.indexOf("audio") >= 0, "reparto Audio derivato");
  ok(keys.indexOf("monitor") >= 0, "reparto Monitor derivato");
  ok(keys.indexOf("power") >= 0, "reparto Power derivato");
  ok(d.find(x => x.key === "audio").plot === true, "audio = dal palco");
  ok(/ingressi/.test(d.find(x => x.key === "audio").detail), "detail con conteggio");
  // extra a mano
  A.state.production.depts = [{ id: "dp1", name: "Catering" }];
  d = A.productionDepts();
  const cat = d.find(x => x.name === "Catering");
  ok(cat && cat.extra === true && cat.plot === false, "extra = aggiunto a mano");
  // normalize: depts preservati e sanificati
  A.state.production.depts = [{ id: "dp1", name: "  Luci  " }, { name: "" }, { name: "x".repeat(60) }];
  let ns = A.normalizeState(A.state); if (ns) A.state = ns;
  eq(A.state.production.depts.length, 2, "vuoto scartato, 2 restano");
  eq(A.state.production.depts[0].name, "Luci", "nome trimmato");
  ok(A.state.production.depts[1].name.length === 40, "nome troncato a 40");
  ok(A.state.production.depts.every(x => x.id), "id garantito");
  A.state.production.depts = [];
});

t("equip: un DI mostra solo modelli DI, un mic solo microfoni", () => {
  eq(JSON.stringify(A.equipCatsFor({ type: "distereo" })), JSON.stringify(["di"]), "DI stereo → solo di");
  eq(JSON.stringify(A.equipCatsFor({ type: "dimono" })), JSON.stringify(["di"]), "DI mono → solo di");
  eq(JSON.stringify(A.equipCatsFor({ type: "astamic" })), JSON.stringify(["microfono"]), "asta mic → solo microfono");
  eq(JSON.stringify(A.equipCatsFor({ type: "giraffa" })), JSON.stringify(["microfono"]), "giraffa → solo microfono");
  eq(A.equipFieldLabel(["di"]), "Modello DI", "label DI");
  ok(A.STAGEBOX_DB["rio3224d2"].equip === "yamaha-rio3224-d2", "hw Rio3224 agganciato al prodotto verificato");
  ok(A.STAGEBOX_DB["dl32"].equip === "midas-dl32", "hw DL32 agganciato al prodotto verificato");
  eq(A.equipFieldLabel(["microfono"]), "Microfono reale", "label microfono");
});

t("DI box unico: canali (mono/stereo/multi) + tipo (passiva/attiva) + icona", () => {
  reset();
  const m = add("dimono", 100, 100);
  eq(A.diCh(m), "mono", "default mono");
  eq(A.diChannels(m), 1, "mono = 1 canale");
  eq(A.cabItemInputs(m).length, 1, "mono = 1 ingresso");
  m.diCh = "stereo";
  eq(A.cabItemInputs(m).length, 2, "stereo = 2 ingressi L/R");
  m.diCh = "multi"; m.diMultiCh = 8;
  eq(A.cabItemInputs(m).length, 8, "multi = 8 ingressi");
  m.diCh = "mono"; m.diType = "attiva";
  ok(/attiva/i.test(A.cabItemInputs(m)[0].mic), "attiva → mic 'DI attiva' (phantom)");
  // ingombri REALI da catalogo (27/07): mono 13x10 (ProDI/AR-133), stereo 19x13 (ProD2), multi 48x24 (rack 19")
  eq(JSON.stringify(A.diFootprint({ type: "dimono", diCh: "mono" })), JSON.stringify([13, 10]), "footprint mono");
  eq(JSON.stringify(A.diFootprint({ type: "dimono", diCh: "stereo" })), JSON.stringify([19, 13]), "footprint stereo");
  eq(JSON.stringify(A.diFootprint({ type: "dimono", diCh: "multi" })), JSON.stringify([48, 24]), "footprint multi (rack 19\")");
  ok(A.TYPES.dimono.w === 13 && A.TYPES.dimono.d === 10, "il tipo nasce con l'ingombro reale");
  ok(A.diDraw({ type: "dimono", diCh: "mono", diType: "passiva", w: 30, d: 26 }).indexOf("tec fill") > -1, "passiva ha XLR out");
  ok(A.diDraw({ type: "dimono", diCh: "mono", diType: "attiva", w: 30, d: 26 }).indexOf("#16a34a") > -1, "attiva ha LED verde");
  ok(A.diDraw({ type: "dimono", diCh: "stereo", diSchema: true, w: 48, d: 28 }).match(/path/g).length === 2, "schematico stereo = 2 triangoli");
  const st = add("distereo", 200, 100);
  eq(A.cabItemInputs(st).length, 2, "vecchio distereo = 2 canali (compat)");
});

t("parapetto: disegno contenuto nella profondità (allineamento snap/bordo)", () => {
  reset();
  const par = add("parapetto", 400, 250);
  eq(par.d, 8, "profondità di default 8 cm (richiesta utente 19/07; il draw ora segue it.d → montanti contenuti anche a 8)");
  // il draw non deve contenere coordinate y oltre ±d/2 (prima i montanti erano a ±12 su d=8)
  const svg = A.TYPES.parapetto.draw(par);
  const ys = (svg.match(/y[12]?="(-?[\d.]+)"/g) || []).map(m => Math.abs(parseFloat(m.match(/(-?[\d.]+)/)[1])));
  const maxY = Math.max.apply(null, ys);
  ok(maxY <= par.d / 2 + 0.5, "nessuna coordinata oltre ±d/2 (era ±12 su d=8): max=" + maxY);
});

t("sicurezza: 7 nuovi presidi + info sull'elemento (descrizione/portata/note)", () => {
  const nuovi = ["estport", "uscemerg", "puntoracc", "primsocc", "idrante", "lucemerg", "segnalet"];
  nuovi.forEach(t => {
    ok(A.TYPES[t] && A.TYPES[t].cat === "Sicurezza e site", t + " nel catalogo Sicurezza");
    ok(A.SAFETY_INFO[t], t + " ha i campi info");
    ok(A.TYPES[t].draw({ w: A.TYPES[t].w, d: A.TYPES[t].d }).length > 20, t + " ha un disegno");
  });
  // normalize: campi safety sanificati (stringa non vuota, troncati)
  reset();
  const e = add("estport", 100, 100);
  e.safeDesc = "  Estintore CO2  "; e.safeCap = "x".repeat(80); e.safeNote = "";
  let ns = A.normalizeState(A.state); if (ns) A.state = ns;
  const n = A.state.items.find(i => i.id === e.id);
  eq(n.safeDesc, "Estintore CO2".slice(0, 120), "descrizione conservata");
  ok(n.safeCap.length === 80 || n.safeCap.length <= 120, "portata troncata");
  eq(n.safeNote, undefined, "nota vuota rimossa");
});

t("decisione 4A: elementDept mappa gli elementi al reparto tecnico", () => {
  reset();
  const sb = add("stagebox", 100, 100); sb.hw = "rio3224d2";
  eq(A.elementDept(sb), "audio", "stage box → audio");
  eq(A.elementDept(add("astamic", 120, 100)), "audio", "microfono → audio");
  eq(A.elementDept(add("wedge", 140, 100)), "monitor", "wedge → monitor");
  eq(A.elementDept(add("rxrf", 160, 100)), "rf", "ricevitore → rf");
  eq(A.elementDept(add("rfant", 180, 100)), "rf", "antenna → rf");
  eq(A.elementDept(add("netswitch", 200, 100)), "rete", "switch → rete");
  eq(A.elementDept(add("distro32", 220, 100)), "power", "distro → power");
  eq(A.elementDept(add("testamobile", 240, 100)), "power", "carico (testa mobile) → power");
  eq(A.elementDept(add("sedia", 260, 100)), null, "sedia → nessun reparto");
  eq(A.elementDept(add("pedana", 280, 100)), null, "pedana → nessun reparto");
  ok(A.DEPT_NAME.audio === "Audio" && A.DEPT_NAME.power === "Power", "nomi reparto");
});

t("layer Output: iemant (rack TX in-ear) fa parte della catena", () => {
  reset();
  const tx = add("iemant", 300, 300);
  eq(A.layerFgItem("cabout", tx), true, "rack TX in-ear = fg del layer Output (come i beltpack)");
  A.state.cab.on = true;
  A.layerSoloUI = { cabout: true };
  A.pruneSolo();
  eq(!!A.layerSoloUI.cabout, true, "il solo Output sopravvive col motore acceso");
  A.state.cab.on = false; A.state.items = [];
  A.pruneSolo();
  eq(!!A.layerSoloUI.cabout, false, "senza motore il solo decade");
  A.layerSoloUI = {};
});

t("Layer v3: Ingressi/Output sempre in lista, P.M. situazionale, stato motore", () => {
  reset();
  const reg = A.layerRegistry();
  const cin = reg.find(L => L.id === "cabin"), cout = reg.find(L => L.id === "cabout"), el = reg.find(L => L.id === "elec");
  ok(!reg.some(L => L.id === "cabaudio"), "il layer unico cabaudio non esiste piu'");
  eq(cin.active, true, "Input in lista anche a motore spento");
  eq(cin.engineOn, false, "motore spento");
  eq(cout.active, true, "Output in lista anche a motore spento");
  eq(el.active, true, "Power in lista");
  eq(reg.find(L => L.id === "mond").active, false, "P.M. situazionale: senza mixerini non compare (Q2-A)");
  A.add ? null : null;
  A.state.items.push({ id: "pm1", type: "mixp16", x: 100, y: 100, rot: 0, w: 40, d: 30 });
  ok(A.layerRegistry().find(L => L.id === "mond").active || !A.MON_DIG_NODE["mixp16"], "con un mixerino P.M. compare (se il tipo esiste)");
  A.state.items = [];
  A.state.cab.on = true; A.state.elec.on = true;
  const reg2 = A.layerRegistry();
  eq(reg2.find(L => L.id === "cabin").engineOn, true, "motore ingressi acceso");
  eq(reg2.find(L => L.id === "cabout").engineOn, true, "motore output acceso");
  ok(typeof cin.activate === "function" && typeof cout.activate === "function" && typeof el.activate === "function", "activate presenti");
});

t("D-L2A: cabConnectAll materializza la proposta (solo box reali, manuali intatti)", () => {
  reset();
  // stato costruito SENZA addItem (= progetto caricato: l'auto-connect non scatta sui load)
  A.state.items = [
    { id: "m1", type: "astamic", x: 200, y: 200, rot: 0, w: 30, d: 30, label: "Mic 1" },
    { id: "w1", type: "wedge", x: 300, y: 300, rot: 0, w: 50, d: 40, label: "Mon 1" },
    { id: "b1", type: "stagebox", x: 400, y: 200, rot: 0, w: 60, d: 40, label: "SB" }
  ];
  A.state.cab.on = true; A.state.cab.mode = "manual"; A.state.cab.manual = {}; A.__cabRes = null;
  let R = A.cabResult(true);
  ok(R.pending.length >= 1, "in manuale l'ingresso è pending (" + R.pending.length + ")");
  ok(R.mixes.some(m => m.pending), "il mix monitor è pending");
  const n = A.cabConnectAll();
  ok(n >= 2, "collegati ingresso + mix (n=" + n + ")");
  R = A.cabResult(true);
  eq(R.pending.length, 0, "nessun ingresso pending dopo il collega-tutto");
  eq(R.mixes.filter(m => m.pending).length, 0, "nessun mix pending");
  eq(A.state.cab.mode, "manual", "il mode resta manual (override espliciti)");
  ok(R.links.some(l => l.box && !l.box.auto), "il cavo va su una box REALE");
  // idempotente: secondo giro non tocca nulla
  eq(A.cabConnectAll(), 0, "secondo giro: niente da collegare");
});

t("Layer v3: Palco = tutto, occhi in OR (viste)", () => {
  reset();
  add("vlnpost", 300, 300);      // musicista
  add("sedia", 500, 300);        // attrezzatura pura (nessun layer tecnico)
  const mic = add("astamic", 350, 300);   // sorgente (layer Ingressi)
  A.layerSoloUI = {}; A.layerAccOpen = null;
  A.stageLayerUI.vis = true; A.musLayerUI.vis = true; A.state.cab.on = false;
  let mk = A.sceneMarkup();
  ok(!/display="none"/.test(mk.split("layItems")[1] || mk), "Palco acceso: tutto visibile");
  // Palco acceso + Musicisti SPENTO: i musicisti restano (Palco = tutto — demo approvata)
  A.musLayerUI.vis = false;
  mk = A.sceneMarkup();
  ok(!/mus-item" display="none"/.test(mk), "Palco acceso mostra i musicisti anche con l'occhio Musicisti spento");
  A.musLayerUI.vis = true;
  // Palco SPENTO + solo Musicisti acceso: si vedono SOLO i musicisti
  A.stageLayerUI.vis = false; A.state.cab.on = false;
  mk = A.sceneMarkup();
  ok(!/mus-item" display="none"/.test(mk), "musicisti visibili col Palco spento");
  ok(/st-item" display="none"/.test(mk), "attrezzatura nascosta col Palco spento");
  // Palco SPENTO + Ingressi acceso: il mic (sorgente) si vede, la sedia no
  A.musLayerUI.vis = false; A.state.cab.on = true; A.state.cab.showInputs = true;
  mk = A.sceneMarkup();
  const chunks = mk.match(/<g class="st-item"[^>]*>/g) || [];
  ok(chunks.some(c => c.indexOf("display") < 0), "almeno un elemento tecnico (mic) visibile via Ingressi");
  ok(chunks.some(c => c.indexOf('display="none"') >= 0), "la sedia resta nascosta");
  A.musLayerUI.vis = true; A.stageLayerUI.vis = true;
  // fuoco Palco = vista d'insieme (tutto a fuoco)
  const v = A.state.items.find(x => x.type === "vlnpost");
  eq(A.layerFgItem("stage", v), true, "Palco contiene tutto (anche i musicisti)");
  // Ingressi = sorgenti + catena; Output = monitor
  eq(A.layerFgItem("cabin", mic), true, "mic = layer Ingressi");
  const w = add("wedge", 520, 320);
  eq(A.layerFgItem("cabout", w), true, "wedge = layer Output");
  eq(A.layerFgItem("cabin", w), false, "wedge NON è Ingressi");
  // niente slider opacità nel registro (resta solo la Planimetria)
  const withOp = A.layerRegistry().filter(L => L.opacity != null).map(L => L.id);
  eq(JSON.stringify(withOp), JSON.stringify(["venue"]), "opacità solo sulla Planimetria");
});

t("Layer v2: il cablaggio si CHIEDE (non nasce dall'inserimento) + stile cavi + pallini", () => {
  reset();
  A.state.cab.style = "curve";
  /* 28/07 (Simone): «non voglio che si colleghino in automatico — se inserisco una stage box si
     attiva il collegamento e vedo i cavi». Inserire non collega più: lo chiede la barra «Collega». */
  A.addItem("astamic", { x: 200, y: 200 });
  A.addItem("stagebox", { x: 400, y: 200 });
  A.__cabRes = null;
  eq(A.cabResult(true).links.length, 0, "inserire la box NON disegna cavi");
  cabla();
  let R = A.cabResult(true);
  eq(R.pending.length, 0, "dopo «Collega» l'ingresso è cablato");
  ok(R.links.some(l => l.box && !l.box.auto), "cavo su box reale");
  // una sorgente aggiunta DOPO resta libera finché non la si collega
  A.addItem("astamic", { x: 250, y: 250 });
  A.__cabRes = null;
  eq(A.cabResult(true).pending.length, 1, "la sorgente nuova resta da collegare");
  cabla();
  eq(A.cabResult(true).pending.length, 0, "«Collega» prende anche lei");
  // 2) stile cavi (28/07): diretto di default, segmentato = angoli retti. Niente più smussati.
  const pts = [[0, 0], [100, 0], [100, 80]];
  eq(A.cabDrawD([[0, 0], [100, 80]], pts), "M 0.0 0.0 L 100.0 80.0", "diretto: linea dritta sui punti grezzi");
  const seg = A.cabDrawD([[0, 0], [100, 80]], pts, "orto");
  eq(seg.indexOf("Q"), -1, "segmentato: angoli retti, nessuna curva");
  ok(seg.indexOf("L") > 0, "e resta una spezzata");
  // 3) canale alla partenza nel SOLO Ingressi + pallini sorgente sempre presenti
  A.layerSoloUI = { cabin: true };
  let mk = A.cablingMarkup();
  ok(mk.indexOf("cab-startlbl") >= 0, "solo Ingressi: etichetta canale alla partenza");
  ok(mk.indexOf("cab-srcdot") >= 0, "pallino sorgente sempre visibile");
  A.layerSoloUI = {};
  // 4) normalizeState sanifica lo stile: dal 28/07 tutto ciò che non è "orto" diventa diretto
  A.state.cab.style = "spazzatura";
  let ns = A.normalizeState(A.state); if (ns) A.state = ns;
  eq(A.state.cab.style, "dir", "stile non valido → diretto");
  A.state.cab.style = "loom";
  ns = A.normalizeState(A.state); if (ns) A.state = ns;
  eq(A.state.cab.style, "dir", "loom (vecchio) → diretto");
  /* il campo di lista resta sanificato ma non è più letto da nessuno: cabStyle() dice sempre "dir".
     "orto" è tornato un valore valido perché è lo stile del SINGOLO cavo segmentato. */
  eq(A.normCabStyle("orto"), "orto", "orto = segmentato, valore valido");
  eq(A.normCabStyle("curve"), "dir", "smussati non esistono più");
  A.state.cab.style = "dir";
  ns = A.normalizeState(A.state); if (ns) A.state = ns;
  eq(A.state.cab.style, "dir", "diretto preservato");
});

t("P.M.: connessione DIGITALE automatica all'hub, MAI ritorno analogico dalla box", () => {
  reset();
  add("stagebox", 500, 200);
  A.state.cab.on = true;
  const h = add("mixhub", 700, 300);       // hub (anche senza modello: pmIsHub)
  const m = add("hearback", 300, 300);     // mixerino
  pmCabla();                               // 28/07: l'aggancio si chiede, non nasce dall'inserimento
  const Rm = A.monDigEngine();
  ok((Rm.links || []).some(l => l.from.id === m.id && (l.to.id === h.id || l.toIsHub)), "mixerino → hub via Cat5 dopo la richiesta");
  const Rc = A.cabResult(true);
  ok(!(Rc.mixes || []).some(mx => (mx.sinks || []).some(sk => sk.id === m.id || sk.id === h.id)), "nessun mix ANALOGICO per i nodi digitali");
  ok(!(Rc.returnLinks || []).some(l => l.sink && (l.sink.id === m.id || l.sink.id === h.id)), "nessun ritorno analogico verso mixerino/hub");
  ok(!A.portDefs(m).some(p => p.kind === "mon"), "mixerino senza porta 'mon' (si collega solo in digitale)");
});

t("solo: S = isolamento (resto NASCOSTO), fuoco = fade 15%", () => {
  reset();
  add("vlnpost", 300, 300);   // musicista (nel solo Musicisti)
  add("sedia", 500, 300);     // contesto
  A.layerSoloUI = { mus: true }; A.layerSoloMode = "focus";
  let mk = A.sceneMarkup();
  ok(mk.indexOf("solo-bg") >= 0, "fuoco: il contesto c'è, sfumato");
  const nFocus = (mk.match(/class="item[ "]/g) || []).length;
  A.layerSoloMode = "iso";
  mk = A.sceneMarkup();
  ok(mk.indexOf("solo-bg") < 0, "S: nessun contesto sfumato");
  const nIso = (mk.match(/class="item[ "]/g) || []).length;
  ok(nIso < nFocus, "S: il contesto è proprio assente (" + nIso + " < " + nFocus + ")");
  ok(mk.indexOf("layStage") >= 0, "il perimetro del palco resta (il foglio)");
  A.layerSoloUI = {}; A.layerSoloMode = "focus";
});

t("layer tecnici: punti sezione + legenda + distribuzione omogenea tra box", () => {
  reset();
  // sezioni e colori stabili
  const v1 = add("vlnpost", 200, 200); v1.vsec = 1;
  const v2 = add("vlnpost", 260, 200); v2.vsec = 2;
  const bat = add("batteria", 400, 200);
  eq(A.sectionOf(v1), "Violini I"); eq(A.sectionOf(v2), "Violini II");
  ok(A.sectionOf(bat).length > 0, "la batteria ha una sezione");
  ok(A.sectionColor("Violini I") !== A.sectionColor("Viole"), "colori diversi per sezioni diverse");
  eq(A.sectionColor("Violini I"), A.sectionColor("Violini I"), "colore stabile");
  // nel solo Ingressi i musicisti diventano punti + compare la legenda
  A.state.cab.on = true;
  A.layerSoloUI = { cabin: true }; A.layerSoloMode = "iso";
  const mk = A.sceneMarkup();
  ok(mk.indexOf("secdot") >= 0, "musicisti come punti sezione");
  const leg = A.sectionLegendMarkup();
  ok(leg.indexOf("Violini I") >= 0 && leg.indexOf("Violini II") >= 0, "legenda con le sezioni presenti");
  A.layerSoloUI = {}; A.layerSoloMode = "focus";
  // distribuzione: 2 box quasi equidistanti → sorgenti spartite, non concentrate
  reset(); A.state.cab.on = true; A.state.cab.mode = "manual"; A.state.cab.manual = {};
  A.state.items = [
    { id: "bA", type: "stagebox", x: 300, y: 500, rot: 0, w: 60, d: 40 },
    { id: "bB", type: "stagebox", x: 360, y: 500, rot: 0, w: 60, d: 40 },
    { id: "m1", type: "astamic", x: 300, y: 200, rot: 0, w: 30, d: 30 },
    { id: "m2", type: "astamic", x: 320, y: 200, rot: 0, w: 30, d: 30 },
    { id: "m3", type: "astamic", x: 340, y: 200, rot: 0, w: 30, d: 30 },
    { id: "m4", type: "astamic", x: 360, y: 200, rot: 0, w: 30, d: 30 }
  ];
  A.__cabRes = null;
  A.cabConnectAll();
  const R = A.cabResult(true);
  const perBox = {}; R.links.forEach(l => { if (l.box) perBox[l.box.id] = (perBox[l.box.id] || 0) + 1; });
  ok((perBox.bA || 0) >= 1 && (perBox.bB || 0) >= 1, "collegamenti spartiti tra le box (" + JSON.stringify(perBox) + ")");
});

t("P.M. NON è nel layer Output (personal mixer digitali) + stili cavo per-layer", () => {
  reset();
  const hb = add("hearback", 300, 300);   // personal mixer
  const wd = add("wedge", 400, 300);       // monitor analogico
  const hub = add("mixhub", 500, 300);
  eq(A.layerFgItem("cabout", hb), false, "personal mixer NON in Output");
  eq(A.layerFgItem("cabout", wd), true, "wedge (monitor analogico) in Output");
  eq(A.layerFgItem("mond", hb), true, "personal mixer nel layer P.M.");
  eq(A.layerFgItem("mond", hub), true, "hub nel layer P.M.");
  // stili indipendenti per layer (2 stili: curve|dir)
  /* 28/07: lo stile non è più della lista ma del CAVO — le liste disegnano tutte diretto, e la
     forma si decide cavo per cavo col comando «Segmenta». */
  A.state.cab.style = "curve"; A.state.cab.styleOut = "curve"; A.state.mond.style = "dir"; A.state.elec.style = "curve";
  eq(A.cabStyle(), "dir", "Ingressi: diretto, qualunque cosa dica il vecchio state");
  eq(A.cabStyleOut(), "dir", "Output: diretto");
  eq(A.mondStyle(), "dir", "P.M.: diretto");
  eq(A.elecStyle(), "dir", "Corrente: diretto");
  A.state.cab.manual = { "k1": { seg: 1 }, "k2": {} };
  eq(A.cabStyleFor("k1"), "orto", "il cavo segmentato va ad angoli retti");
  eq(A.cabStyleFor("k2"), "dir", "gli altri restano diretti");
  eq(A.cabStyleFor("mai-visto"), "dir", "e un cavo senza override pure");
  A.state.elec.manual = { "e1": { seg: 1 } }; A.state.mond.manual = { "m1": { seg: 1 } };
  eq(A.elecStyleFor("e1"), "orto", "vale anche per la corrente");
  eq(A.mondStyleFor("m1"), "orto", "e per i personal monitor");
  // normalize preserva/sanifica (orto/loom vecchi → smussati)
  A.state.cab.styleOut = "loom"; A.state.mond.style = "spazzatura"; A.state.elec.style = "dir";
  const ns = A.normalizeState(A.state); if (ns) A.state = ns;
  eq(A.state.cab.styleOut, "dir", "styleOut loom → diretto (i progetti vecchi si appiattiscono)");
  eq(A.state.mond.style, "dir", "mond style non valido → diretto");
  eq(A.state.elec.style, "dir", "elec style valido preservato");
});

t("P.M.: un hub generico regge max 8 mixerini (capienza rispettata dall'auto-connect)", () => {
  reset();
  const hub = add("mixhub", 900, 300);   // hub generico → cap 8
  for (let i = 0; i < 10; i++) add("hearback", 100 + i * 40, 300);   // 10 mixerini generici
  pmCabla();   // 28/07: l'aggancio si chiede — poi l'hub NON deve sovraccaricarsi
  let R = A.monDigEngine();
  eq((R.hubLoad || {})[hub.id], 8, "l'hub si ferma a 8 (capienza)");
  eq(R.pending.length, 2, "i 2 eccedenti restano pendenti");
  ok(!R.issues.some(i => i.lvl === "err" && /porte di/.test(i.msg)), "nessun errore di over-capacità");
  // un secondo hub raccoglie gli eccedenti
  A.add ? null : null;
  const hub2 = add("mixhub", 200, 300);
  pmCabla();   // 28/07: anche il secondo hub raccoglie i pendenti solo se glielo si chiede
  R = A.monDigEngine();
  eq(R.pending.length, 0, "col secondo hub, dopo la richiesta, sono tutti collegati");
  ok(((R.hubLoad || {})[hub2.id] || 0) >= 2, "il secondo hub prende gli eccedenti");
});

t("vista cablaggio: senza vista la tavola e' completa, con la vista e' un filtro; Power = carichi a pallini", () => {
  reset();
  add("astamic", 300, 300);
  add("stagebox", 600, 400);
  add("comboamp", 200, 300);      // carico (ampli)
  add("distro32", 250, 480);
  A.state.cab.on = true; A.state.elec.on = true; A.__cabRes = null; A.__elecRes = null;
  cabla(); A.elecConnectAll(); A.__elecRes = null;   // 28/07: il cablaggio si chiede
  A.__cabStatic = false;   // nel sandbox window.__cabStatic è uno stub truthy: nel browser è falsy (export PDF a parte)
  /* 25/07: nessuna vista selezionata = TAVOLA COMPLETA (prima era "plot pulito senza cavi") */
  A.layerSoloUI = {}; A.layerAccOpen = null;
  let mk = A.cablingMarkup();
  ok(mk.indexOf("cab-line") >= 0, "senza vista selezionata i cavi Input devono vedersi");
  ok(A.elecMarkup().indexOf("elec-line") >= 0 || A.elecMarkup() !== "", "senza vista selezionata i cavi Power devono vedersi");
  /* una vista attiva su un ALTRO layer torna a filtrare */
  A.layerSoloUI = { elec: true };
  ok(A.cablingMarkup().indexOf("cab-line") < 0, "vista Power attiva: i cavi Input si tolgono di mezzo");
  A.layerSoloUI = { cabin: true };
  eq(A.elecMarkup(), "", "vista Input attiva: i cavi Power si tolgono di mezzo");
  /* l'occhio resta l'altro asse: chiuso, nasconde anche in vista completa */
  A.layerSoloUI = {}; A.state.cab.showInputs = false;
  ok(A.cablingMarkup().indexOf("cab-line") < 0, "occhio Input chiuso: niente cavi neanche in vista completa");
  A.state.cab.showInputs = true;
  // solo Input → cavi + pallino box
  A.layerSoloUI = { cabin: true };
  mk = A.cablingMarkup();
  ok(mk.indexOf("cab-line") >= 0, "cavi Input col layer selezionato");
  ok(mk.indexOf("cab-boxdot") >= 0, "pallino al centro della stage box");
  // solo Power → carichi come pallini sezione + legenda
  A.layerSoloUI = { elec: true };
  const amp = A.state.items.find(x => x.type === "comboamp");
  eq(A.techDotItem(amp, "elec"), true, "l'ampli (carico) diventa un pallino in Power");
  eq(A.techDotItem(A.state.items.find(x => x.type === "distro32"), "elec"), false, "il distro resta un dispositivo, non un pallino");
  const scene = A.sceneMarkup();
  ok(scene.indexOf("secdot") >= 0, "pallini nel layer Power");
  ok(A.sectionLegendMarkup().length > 0, "legenda Power");
  A.layerSoloUI = {};
});

t("Input: N pallini per musicista (postazione doppia = 2) + zona dal punto mic", () => {
  reset();
  const d = add("vlnpost", 400, 250); d.doppia = true; d.label = "Violini I"; d.label2 = "Violini I b";
  eq(A.cabItemInputs(d).length, 2, "la doppia genera 2 canali");
  eq(A.musicianSeats(d).length, 2, "2 sedute (2 musicisti)");
  const single = add("vlnpost", 600, 250);
  eq(A.musicianSeats(single).length, 1, "postazione singola = 1 seduta");
  cabla();   // 28/07: i pallini di partenza esistono sui cavi, che ora si chiedono
  A.layerSoloUI = { cabin: true };
  const dot = A.sectionDotMarkup(d);
  eq((dot.match(/secdot-c/g) || []).length, 2, "2 pallini sezione per la doppia");
  ok(dot.indexOf("Violini I b") >= 0, "il 2° musicista ha il suo nome");
  A.layerSoloUI = {};
  // zona: il cavo parte dal punto del microfono
  reset(); A.state.cab.on = true;
  add("stagebox", 800, 500);
  const z = add("miczone", 400, 250); z.pts = [[-50, -50], [50, -50], [50, 50], [-50, 50]];
  cabla();
  const R = A.audioCablingEngine();
  const zl = R.links.find(l => l.s.it.id === z.id);
  ok(zl, "la zona genera un canale");
  const anchor = A.portAnchor(z, "audio");
  ok(Math.abs(zl.pts[0][0] - anchor[0]) < 2 && Math.abs(zl.pts[0][1] - anchor[1]) < 2, "il cavo della zona parte dal punto mic");
});

/* ---- Ricerca catalogo: alias, normalizzazione, priorità, no-duplicati ---- */
console.log("\nRicerca catalogo (alias / normalizzazione):");
function searchKeys(q) { return (A.__spSearch ? A.__spSearch(q) : []).map(function (r) { return r.k; }); }
t("__spSearch esposto dal catalogo", () => { ok(typeof A.__spSearch === "function", "window.__spSearch mancante"); });
t("'tastiera' → tastiera singola + doppia", () => {
  const keys = searchKeys("tastiera");
  ok(keys.indexOf("tastiera") > -1, "manca la tastiera singola");
  ok(keys.indexOf("doppiatastiera") > -1, "manca la doppia tastiera");
});
t("la tastiera singola è un tipo reale e usabile", () => { ok(A.TYPES.tastiera && A.TYPES.tastiera.catalog !== false, "TYPES.tastiera assente o non nel catalogo"); });
t("'coro' → persone (corista) + dispositivi (mic/pedana coro)", () => {
  const keys = searchKeys("coro");
  ok(keys.indexOf("corista") > -1, "manca il corista");
  ok(keys.indexOf("micchoir") > -1 || keys.indexOf("pedanacoro") > -1, "manca un dispositivo del coro");
});
t("'voce' trova il cantante/corista", () => { ok(searchKeys("voce").indexOf("corista") > -1); });
t("'cantante' trova il corista", () => { ok(searchKeys("cantante").indexOf("corista") > -1); });
t("'singer' (inglese) trova il cantante/corista", () => { ok(searchKeys("singer").indexOf("corista") > -1); });
t("case-insensitive: 'TASTIERA' = 'tastiera'", () => { eq(searchKeys("TASTIERA").sort(), searchKeys("tastiera").sort()); });
t("normalizzazione accenti (_deacc riusato)", () => { eq(A._deacc("À la Séance"), "a la seance"); });
t("nessun duplicato nei risultati (k|nome unico per query)", () => {
  const seen = {}; A.__spSearch("mic").forEach(function (r) { const id = (r.k || "") + "|" + r.nome; ok(!seen[id], "duplicato: " + id); seen[id] = 1; });
});
/* Tre parole di mestiere misurate l'11/08 percorrendo il catalogo come lo percorre un fonico. */
t("'monitor' dà per primo il wedge, in ENTRAMBE le ricerche", () => {
  /* «Hub monitoraggio» e «Mixer monitor» vincevano per nome (la query inizia una parola) e il tie-break
     alfabetico li metteva davanti: chi digita «monitor» davanti a un palco vuole la spia a terra. */
  eq(searchKeys("monitor")[0], "wedge", "barra del catalogo: " + searchKeys("monitor").slice(0, 3).join(", "));
  eq(qaKeys("monitor")[0], "wedge", "ricerca rapida: " + qaKeys("monitor").slice(0, 3).join(", "));
});
t("'bassista' dà il bassista, non il suo ampli", () => {
  eq(searchKeys("bassista")[0], "bassstand", "primo: " + searchKeys("bassista").slice(0, 3).join(", "));
  ok(searchKeys("amplificatore").indexOf("bassamp") > -1, "e l'ampli resta a un dito con «amplificatore»");
});
t("'multicavo' e 'frusta' trovano qualcosa: prima non davano niente", () => {
  ok(searchKeys("multicavo").length > 0, "multicavo: nessun risultato");
  ok(searchKeys("frusta").length > 0, "frusta: nessun risultato");
  ok(qaKeys("multicavo").length > 0, "multicavo nella ricerca rapida: nessun risultato");
});
t("una query ceduta vale in tutte e due le ricerche, non solo nel quick-add", () => {
  /* il difetto di classe: due copie dello stesso ordinamento che divergono in silenzio */
  Object.keys(A.TYPES).filter((k) => A.TYPES[k] && A.TYPES[k].qaCede).forEach((k) => {
    A.TYPES[k].qaCede.split(/\s+/).filter(Boolean).forEach((q) => {
      const sp = searchKeys(q), qa = qaKeys(q);
      if (sp.indexOf(k) > -1) ok(sp[0] !== k, k + " vince ancora «" + q + "» nella barra del catalogo");
      if (qa.indexOf(k) > -1) ok(qa[0] !== k, k + " vince ancora «" + q + "» nella ricerca rapida");
    });
  });
});

t("priorità al nome: 'tastiera' → il primo risultato matcha sul nome", () => {
  const res = A.__spSearch("tastiera"); ok(res.length > 0);
  ok(A._deacc(res[0].nome).indexOf("tastiera") > -1, "il primo non matcha sul nome: " + res[0].nome);
});
t("query vuota → nessun risultato", () => { eq(A.__spSearch("").length, 0); eq(A.__spSearch("   ").length, 0); });

/* ---- Quick-add (doppio click sul palco): stessi alias della barra del catalogo ----
   Regressione 24/07: la ricerca rapida filtrava solo su nome e chiave del tipo, quindi "cantante",
   "voce", "singer", "frontman" trovavano l'elemento nella colonna sinistra e NIENTE col doppio click. */
console.log("\nRicerca rapida quick-add (parità con il catalogo):");
function qaKeys(q) { return (A.__qaSearch ? A.__qaSearch(q) : []).map(function (r) { return r.k; }); }
t("__qaSearch esposto (gemella di __spSearch)", () => { ok(typeof A.__qaSearch === "function", "window.__qaSearch mancante"); });
t("i sinonimi delle voci trovano la persona (uomo/donna)", () => {
  ["cantante", "cantanti", "voce", "voci", "solista", "corista", "coriste", "singer", "vocalist", "frontman", "coro"].forEach(function (q) {
    const r = A.__qaSearch(q);
    ok(r.some(x => x.k === "corista"), "'" + q + "' non trova la persona nel quick-add: " + JSON.stringify(r.map(x => x.nome)));
  });
});
t("alias inglesi e di categoria: 'keyboard' → tastiera", () => { ok(qaKeys("keyboard").indexOf("tastiera") > -1); });
t("parità catalogo/quick-add sugli alias del corista", () => {
  (A.TYPES.corista.alias || "").split(/\s+/).filter(Boolean).forEach(function (w) {
    if (searchKeys(w).indexOf("corista") > -1) ok(qaKeys(w).indexOf("corista") > -1, "alias solo nella colonna sinistra: " + w);
  });
});
t("non regredisce: nome, chiave tecnica e voci-azione", () => {
  ok(qaKeys("wedge").indexOf("wedge") > -1, "la chiave tecnica non trova più il wedge");
  ok(A.__qaSearch("violino").some(x => x.nome === "Violino I"), "manca Violino I");
  ok(!A.__qaSearch("audit").some(x => x.nome === "Audit progetto"), "il quick-add non deve suggerire le azioni (noQuick)");
});
/* Il quick-add taglia a 8: un match sulla sola CATEGORIA non deve scavalcare chi ha quella parola
   come nome/chiave/alias, o l'elemento cercato esce dalla lista e Invio ne inserisce un altro. */
t("match forte (nome/chiave/alias) prima del match di sola categoria", () => {
  ok(qaKeys("stagebox").indexOf("stagebox") > -1, "'stagebox' non trova piu' gli Stage box 8/16/24");
  ok(qaKeys("percussioni").indexOf("percussioni") > -1, "'percussioni' perde l'elemento con quella chiave");
  ok(qaKeys("console").indexOf("organoconsole") > -1, "'console' perde la consolle dell'organo");
  ok(qaKeys("mic").indexOf("micover") > -1, "'mic' perde l'overhead di sezione");
  ok(qaKeys("console").indexOf("mixer") === 0, "'console' non mette per primo la console/mixer");
});
t("le 3 varianti di stage box restano tutte raggiungibili con una parola sola", () => {
  const nomi = A.__qaSearch("stagebox").map(r => r.nome);
  ["Stage box 8", "Stage box 16", "Stage box 24"].forEach(n => ok(nomi.indexOf(n) > -1, "manca " + n));
});
t("ranking: il nome batte l'alias ('tastiera' → Tastiera prima)", () => {
  const r = A.__qaSearch("tastiera"); ok(r.length > 0);
  ok(A._deacc(r[0].nome).indexOf("tastiera") > -1, "primo risultato non sul nome: " + r[0].nome);
});
t("query vuota → nessun risultato", () => { eq(A.__qaSearch("").length, 0); eq(A.__qaSearch("   ").length, 0); });
t("max 8 suggerimenti", () => { ok(A.__qaSearch("a").length <= 8); });

/* ---- Adatta (fit): il palco E le scritte FONDO PALCO / PUBBLICO sempre dentro la vista ----
   Le scritte sono <text> in coordinate palco disegnate fuori dal rettangolo: nessuno le contava, e
   su palchi piccoli il margine proporzionale non bastava. Qui si simula l'area centrale reale
   (colonne larghe = canvas stretto) e si verifica che il viewBox le contenga davvero. */
console.log("\nAdatta / fit-to-view:");
function withCanvas(w, h, fn) {   /* svg e render sono stub: interessa solo il vb calcolato */
  const svg0 = A.svg, render0 = A.render, mob0 = A.isMobile;
  A.svg = { clientWidth: w, clientHeight: h, setAttribute() {}, getAttribute: () => "", style: {} };
  A.render = function () {};
  A.isMobile = () => w < 880;
  try { return fn(); } finally { A.svg = svg0; A.render = render0; A.isMobile = mob0; }
}
const CANVAS = [["due colonne larghe", 480, 700], ["una colonna", 820, 700], ["senza colonne", 1400, 700],
  ["finestra bassa", 1200, 320], ["finestra stretta e alta", 360, 900], ["mobile", 390, 620]];
t("contentBounds include le scritte del palco (sopra e sotto)", () => {
  reset(); A.applyStageSize(4, 3, false);   /* palco piccolo: e' il caso che si tagliava */
  const b = A.contentBounds(), d = A.stageDecorBounds();
  ok(b.y0 <= -55, "il bordo alto non copre FONDO PALCO: " + b.y0);
  ok(b.y1 >= A.state.stage.d + 41, "il bordo basso non copre PUBBLICO: " + b.y1);
  ok(b.x0 <= d.x0 && b.x1 >= d.x1, "quote laterali fuori dal riquadro");
});
t("Adatta: scritte dentro la vista con qualunque larghezza dell'area centrale", () => {
  [[4, 3], [8, 6], [12, 8], [20, 12]].forEach(([wm, dm]) => {
    reset(); A.applyStageSize(wm, dm, false);
    const d = A.stageDecorBounds();
    CANVAS.forEach(([nome, cw, ch]) => {
      withCanvas(cw, ch, () => A.fit());
      const v = A.vb;
      ok(v.x <= d.x0 && v.x + v.w >= d.x1, `palco ${wm}x${dm} · ${nome}: scritte fuori in orizzontale`);
      ok(v.y <= d.y0 && v.y + v.h >= d.y1, `palco ${wm}x${dm} · ${nome}: FONDO PALCO/PUBBLICO tagliati (vb.y=${v.y.toFixed(0)}, serve ${d.y0})`);
    });
  });
});
t("Adatta: margine di sicurezza reale attorno al contenuto", () => {
  reset(); A.applyStageSize(4, 3, false);
  const d = A.stageDecorBounds();
  withCanvas(1000, 700, () => A.fit());
  ok(A.vb.y <= d.y0 - 30, "meno di 30 cm d'aria sopra le scritte");
  ok(A.vb.y + A.vb.h >= d.y1 + 30, "meno di 30 cm d'aria sotto le scritte");
});
t("Adatta: gli elementi fuori dal palco restano dentro la vista", () => {
  reset(); A.applyStageSize(6, 4, false);
  add("wedge", -200, -300); add("wedge", A.state.stage.w + 250, A.state.stage.d + 200);
  const b = A.contentBounds();
  withCanvas(900, 700, () => A.fit());
  ok(A.vb.x <= b.x0 && A.vb.x + A.vb.w >= b.x1 && A.vb.y <= b.y0 && A.vb.y + A.vb.h >= b.y1, "contenuto fuori palco tagliato");
});
t("Adatta include le ancore dei cablaggi disegnate fuori dal palco", () => {
  reset(); A.applyStageSize(8, 6, false);
  const senza = A.contentBounds();
  A.state.cab.on = true; A.state.cab.home = { kind: "foh" };          // punto principale in sala: D+120
  A.state.elec.on = true; A.state.elec.supply = { kind: "rete", x: 0, y: 0 };  // arrivo corrente: D+108
  A.layerSoloUI = {}; A.__cabRes = null; A.__elecRes = null;
  const con = A.contentBounds();
  ok(con.y1 > senza.y1, "il riquadro non si allarga per le ancore sotto il palco");
  ok(con.y1 >= A.state.stage.d + 120, "il punto principale audio (FOH) resta fuori: " + con.y1);
  A.state.cab.on = false; A.state.elec.on = false; A.state.cab.home = null;
});
t("fitStage (nuovo palco) include anch'esso le scritte", () => {
  reset(); A.applyStageSize(5, 4, false);
  const d = A.stageDecorBounds();
  withCanvas(700, 700, () => A.fitStage());
  ok(A.vb.y <= d.y0 && A.vb.y + A.vb.h >= d.y1, "fitStage taglia le scritte");
});

/* ---- Sigle delle input list: un fonico digita "gtr", non "chitarra" ---- */
console.log("\nSigle da rider (gtr, bd, sn, kys…):");
t("le sigle trovano l'elemento giusto, su entrambe le ricerche", () => {
  const casi = { gtr: /chitarra/i, gt: /chitarra/i, bs: /basso/i, kb: /tastier|keys|piano/i, kys: /tastier|keys|piano/i,
    pno: /piano/i, vox: /donna|uomo/i, bgv: /donna|uomo/i, bd: /batteria|cassa/i, sn: /batteria|rullante/i,
    snr: /batteria|rullante/i, hh: /batteria/i, ft: /batteria/i, oh: /batteria|overhead/i, cym: /batteria|piatt/i,
    mons: /iem|wedge|monitor|personal/i, cans: /cuffie/i, casse: /array|fill|sub/i, tpt: /tromba/i, tbn: /trombone/i,
    hrn: /corno/i, tba: /tuba/i, fg: /fagotto/i, vla: /viola/i, vc: /violoncello/i, db: /contrabbasso/i,
    harp: /arpa/i, lx: /luci|par|dimmer|testa|sagoma/i, tb: /talkback/i };
  Object.keys(casi).forEach(q => {
    const qa = A.__qaSearch(q).map(r => r.nome), sp = A.__spSearch(q).map(r => r.nome);
    ok(qa.length && sp.length, "'" + q + "' non trova nulla");
    ok(qa.some(n => casi[q].test(n)), "quick-add, '" + q + "': " + JSON.stringify(qa.slice(0, 3)));
    ok(sp.some(n => casi[q].test(n)), "catalogo, '" + q + "': " + JSON.stringify(sp.slice(0, 3)));
  });
});
t("le sigle corte non pescano l'elemento sbagliato", () => {
  /* trappole trovate in fase di verifica: "kbd" faceva uscire le tastiere su "bd" (bass drum),
     "bsn" faceva uscire il fagotto su "sn" (snare). Quelle abbreviazioni sono state scartate. */
  ok(!/tastiera|keys|midi/i.test(A.__qaSearch("bd")[0].nome), "'bd' deve dare la batteria, non le tastiere");
  ok(!/fagotto/i.test(A.__qaSearch("sn")[0].nome), "'sn' deve dare il rullante, non il fagotto");
  ok(!/fagotto/i.test(A.__qaSearch("bs")[0].nome), "'bs' deve dare il basso, non il fagotto");
  ok(A.__qaSearch("pian").every(r => !/array|front fill|sub 2/i.test(r.nome)), "'pian' non deve pescare l'impianto");
});
t("le due ricerche ordinano allo stesso modo", () => {
  ["gtr", "kb", "tb", "mons", "vox", "batteria", "wedge", "cantante"].forEach(q => {
    const a = A.__qaSearch(q)[0], b = A.__spSearch(q)[0];
    ok(a && b, "'" + q + "' vuoto su una delle due");
    eq(a.nome, b.nome, "primo risultato diverso per '" + q + "'");
  });
});
t("la chiave tecnica si cerca anche dalla barra del catalogo", () => {
  ok(A.__spSearch("wedge").some(r => r.k === "wedge"));
  ok(A.__spSearch("micover").length > 0, "prima la chiave tecnica non era indicizzata nella barra");
});

/* ---- Quick-add: campo di ricerca e risultati con l'anteprima dell'elemento (variante B) ---- */
console.log("\nQuick-add (anteprime):");
t("il campo di ricerca dice ai gestori di password di stare alla larga", () => {
  ["data-lpignore", "data-1p-ignore", 'autocomplete","off"'].forEach(a =>
    ok(appjs.indexOf(a) > -1, "manca l'attributo anti-autofill: " + a));
});
t("le miniature dei risultati sono quelle del catalogo, in cache", () => {
  const e = { k: "wedge", nome: "Wedge monitor" };
  const a = A.qaIcon(e), b = A.qaIcon(e);
  ok(a && a.indexOf("<svg") > -1, "manca la miniatura");
  ok(a === b, "la seconda chiamata deve arrivare dalla cache");
  eq(A.qaIcon({ nome: "Azione senza tipo" }), "", "le voci senza tipo non hanno miniatura");
});

/* ---- Pedane: elementi come gli altri (27/07). Palco e pedane sono due cose diverse: il palco è la
   superficie, la pedana è un oggetto che ci si appoggia sopra e si lavora senza entrare in modalità. ---- */
console.log("\nPedane come elementi normali:");
t("la pedana si prende e si modifica sempre, senza modalita'", () => {
  reset(); A.stageEdit = false;
  const ped = add("pedana", 500, 300);
  ok(A.isRiser(ped), "resta un riser: continua a portarsi dietro chi ci sta sopra");
  ok(A.itemEditable(ped), "modificabile fuori dalla modalita' palco");
  ok(A.itemPickable(ped), "e selezionabile");
  A.stageEdit = true;
  try { ok(A.itemEditable(ped), "e anche dentro"); } finally { A.stageEdit = false; }
});
t("la pedana si allunga e si ruota come gli altri elementi", () => {
  reset();
  eq(A.TYPES.pedana.resizable, true, "maniglie di ridimensionamento");
  const ped = add("pedana", 500, 300);
  ped.w = 400; ped.d = 250; ped.rot = 45; ped.h = 60;
  eq([ped.w, ped.d, ped.rot, ped.h].join(","), "400,250,45,60", "misure, rotazione e altezza sono sue");
});
t("una pedana in un gruppo si muove con gli altri, come ogni elemento", () => {
  reset(); A.stageEdit = false;
  const ped = add("pedana", 500, 300), sedia = add("sedia", 480, 290);
  ped.grp = sedia.grp = "g1";
  eq([ped, sedia].filter(A.itemEditable).length, 2, "nessuno dei due e' bloccato");
});
t("il lucchetto ferma la pedana dov'e'", () => {
  reset();
  const ped = add("pedana", 500, 300);
  ok(A.itemEditable(ped), "aperta si muove");
  ped.locked = true;
  eq(A.itemEditable(ped), false, "col lucchetto chiuso non si sposta, non si allunga, non ruota");
  delete ped.locked;
  ok(A.itemEditable(ped), "riaperta torna a muoversi");
  ok(appjs.indexOf('class="lock-handle') > -1, "il lucchetto si disegna accanto alla maniglia di rotazione");
  ok(appjs.indexOf("openQuickAdd(svgPoint(e)") > -1, "col lucchetto chiuso il doppio clic apre la ricerca rapida");
});
/* Aspetto della pedana bloccata (variante A, Simone 27/07): attenuandola si confondeva col palco. */
t("la pedana bloccata si riconosce: perimetro marcato e lucchettino", () => {
  reset();
  const libera = A.TYPES.pedana.draw({ w: 200, d: 100 });
  const chiusa = A.TYPES.pedana.draw({ w: 200, d: 100, locked: true });
  eq(libera.indexOf("riser-fixed"), -1, "libera: perimetro normale");
  eq(libera.indexOf("riser-lock"), -1, "libera: nessun lucchetto sul disegno");
  ok(chiusa.indexOf("riser-fixed") > -1, "bloccata: perimetro marcato");
  ok(chiusa.indexOf("riser-lock") > -1, "bloccata: lucchettino nell'angolo");
  ok(stylesCss.indexOf(".ic.riser-fixed{stroke-width:3.6}") > -1, "il bordo piu' spesso arriva dal CSS");
  eq(stylesCss.indexOf(".riser-item.locked .item{opacity:.85}"), -1, "niente piu' trasparenza: si confondeva col palco");
  const piccola = A.TYPES.pedana.draw({ w: 60, d: 40, locked: true });
  ok(piccola.indexOf("riser-fixed") > -1, "anche la piccola ha il perimetro marcato");
  eq(piccola.indexOf("riser-lock"), -1, "sotto i 70x50 cm il lucchetto starebbe addosso all'angolo: si tace");
});

/* ---- Lucchetto anche sui tappeti, sulle forme e sulle zone di microfonazione (Simone 29/07): sono
   i FONDI del disegno, ci si posa sopra il resto e si spostano per sbaglio mentre si prende quello
   che ci sta sopra. ---- */
console.log("\nLucchetto: pedane, tappeti, forme e zone:");
t("i fondi del disegno si bloccano, gli altri elementi no", () => {
  reset();
  const ped = add("pedana", 500, 300), tap = add("tappeto", 400, 400), frm = add("forma", 300, 200), zon = add("miczone", 700, 300), met = add("metro", 800, 500);
  ok(A.isLockable(ped) && A.isLockable(tap) && A.isLockable(frm) && A.isLockable(zon) && A.isLockable(met), "pedana, tappeto, forma, zona e metro");
  /* «tutti gli elementi che servono per avere qualcosa sopra» (Simone 29/07): i piani d'appoggio
     e le strutture che portano i fari — dove il gesto sbagliato sposta anche il carico. */
  ["tavolo", "podio", "pedanacoro", "flightcase", "americana", "truss"].forEach((k) => {
    ok(A.isLockable(A.addItem(k, { x: 200, y: 200 })), k + ": ci sta sopra qualcosa, si blocca");
  });
  ["sedia", "wedge", "leggio", "cantante"].forEach((k) => {
    eq(A.isLockable(A.addItem(k, { x: 300, y: 300 })), false, k + ": non e' un piano d'appoggio");
  });
  const sedia = add("sedia", 600, 300), wedge = add("wedge", 700, 400);
  eq([sedia, wedge].filter(A.isLockable).length, 0, "sedia e wedge non hanno lucchetto");
  eq(A.isLockable(null), false, "niente elemento, niente lucchetto");
});
t("il lucchetto ferma tappeto, forma e zona esattamente come la pedana", () => {
  reset();
  const tap = add("tappeto", 400, 400), frm = add("forma", 300, 200), zon = add("miczone", 700, 300);
  ok(A.itemEditable(tap) && A.itemEditable(frm) && A.itemEditable(zon), "aperti si muovono");
  tap.locked = true; frm.locked = true; zon.locked = true;
  eq([tap, frm, zon].filter(A.itemEditable).length, 0, "chiusi non si spostano, non si allungano, non ruotano");
  delete tap.locked; delete frm.locked; delete zon.locked;
  eq([tap, frm, zon].filter(A.itemEditable).length, 3, "riaperti tornano a muoversi");
  const sedia = add("sedia", 600, 300);
  sedia.locked = true;   /* un vecchio progetto con la chiave sporca non deve inchiodare una sedia */
  ok(A.itemEditable(sedia), "il lucchetto vale solo dove esiste");
});
t("bloccato: niente maniglie di rotazione e di ridimensionamento", () => {
  reset();
  const p = add("pedana", 500, 400); p.w = 400; p.d = 240;
  A.selectOne(p.id);
  const libera = A.selHandlesMarkup();
  ok(libera.indexOf("rot-handle") > -1, "libera: si ruota");
  ok(libera.indexOf("rs-handle") > -1, "libera: si allunga");
  p.locked = true;
  const chiusa = A.selHandlesMarkup();
  eq(chiusa.indexOf("rot-handle"), -1, "la maniglia di rotazione sparisce sull'elemento bloccato");
  eq(chiusa.indexOf("rs-handle"), -1, "e con lei le maniglie dei lati e degli angoli");
  ok(chiusa.indexOf("lock-handle") > -1, "il lucchetto resta: e' l'unico modo per riaprire");
  ok(appjs.indexOf("_dcIt0 && isLockable(_dcIt0) && _dcIt0.locked===true") > -1,
    "il doppio clic attraversa il fondo bloccato e apre la ricerca rapida");
});
t("il lucchetto non viene letto come doppio clic sull'elemento", () => {
  /* chiudere e riaprire sono due clic vicini sulla stessa maniglia: finivano nel ramo del doppio
     clic, che sull'elemento bloccato apre la ricerca rapida — e il lucchetto non si riapriva piu' */
  ok(appjs.indexOf('var _onLock = e.target.closest ? e.target.closest(".lock-handle") : null;') > -1,
    "il doppio clic riconosce la maniglia");
  ok(/!_onCabEl && !_onPort && !_onLock && lastDown/.test(appjs), "e la lascia fuori");
});
t("il nome nell'etichetta del lucchetto e' quello dell'elemento", () => {
  reset();
  eq(A.lockNameOf(add("pedana", 100, 100)), "la pedana");
  eq(A.lockNameOf(add("tappeto", 200, 100)), "il tappeto");
  eq(A.lockNameOf(add("forma", 300, 100)), "la forma");
  eq(A.lockNameOf(add("miczone", 400, 100)), "la zona");
  eq(A.lockNameOf(add("metro", 500, 100)), "il metro");
  eq(A.lockNameOf(add("tavolo", 600, 100)), "il tavolo");
  eq(A.lockNameOf(add("flightcase", 700, 100)), "il flight case");
  eq(A.lockNameOf(add("americana", 800, 100)), "l\u2019americana");
});
t("la zona bloccata: perimetro marcato, lucchetto accanto alla sua etichetta, mic non trascinabile", () => {
  reset();
  const z = add("miczone", 500, 300); z.w = 300; z.d = 200;
  const libera = A.TYPES.miczone.draw(z);
  ok(libera.indexOf('stroke-width="1.6"') > -1, "libera: tratteggio normale");
  eq(libera.indexOf("riser-lock"), -1, "libera: nessun lucchettino");
  z.locked = true;
  const chiusa = A.TYPES.miczone.draw(z);
  ok(chiusa.indexOf('stroke-width="3.2"') > -1, "bloccata: perimetro marcato");
  ok(chiusa.indexOf("riser-lock") > -1, "bloccata: lucchettino");
  /* una zona e' un poligono qualsiasi: il lucchetto sta dove la zona gia' scrive, e il testo scala */
  const g = /riser-lock" transform="translate\((-?[\d.]+),(-?[\d.]+)\)/.exec(chiusa);
  const tx = /<text x="(-?[\d.]+)"/.exec(chiusa);
  ok(g && tx, "lucchetto ed etichetta presenti");
  ok(+tx[1] > +g[1] + 5, "l'etichetta si sposta a destra e non ci finisce sopra (" + g[1] + " vs " + tx[1] + ")");
  /* poligonale: il lucchetto segue l'angolo del suo bbox, non un centro immaginario */
  z.pts = [[-150, -100], [150, -60], [90, 100], [-120, 70]];
  const poly = /riser-lock" transform="translate\((-?[\d.]+),(-?[\d.]+)\)/.exec(A.TYPES.miczone.draw(z));
  eq(+poly[1], -138, "x = bordo sinistro del poligono + 12");
  eq(+poly[2], -87, "y = bordo alto del poligono + 13");
});
t("la zona bloccata non si rimodella: via vertici, «+» e pallino del microfono", () => {
  reset();
  const z = add("miczone", 500, 300); z.w = 300; z.d = 200;
  A.selectOne(z.id);
  ok(A.selHandlesMarkup().indexOf("mz-mid") > -1, "libera: i «+» per modellarla ci sono");
  z.locked = true;
  eq(A.selHandlesMarkup().indexOf("mz-mid"), -1, "vertici e «+» spariscono sul bloccato");
  ok(appjs.indexOf('if(!z || !itemEditable(z)) return \'\';') > -1, "il pallino mic non e' piu' trascinabile");
  ok(appjs.indexOf("il cavo parte da l\u00ec") > -1 || appjs.indexOf("il cavo parte da lì") > -1, "ma resta disegnato: il cavo parte da lì");
});
t("il tappeto bloccato si riconosce: perimetro marcato e lucchettino", () => {
  reset();
  const libero = A.TYPES.tappeto.draw({ w: 200, d: 160 });
  const chiuso = A.TYPES.tappeto.draw({ w: 200, d: 160, locked: true });
  eq(libero.indexOf("rug-fixed"), -1, "libero: tratteggio normale");
  eq(libero.indexOf("riser-lock"), -1, "libero: nessun lucchetto sul disegno");
  ok(chiuso.indexOf("rug-fixed") > -1, "bloccato: perimetro marcato");
  ok(chiuso.indexOf("riser-lock") > -1, "bloccato: lucchettino nell'angolo");
  ok(stylesCss.indexOf(".rug.rug-fixed{stroke-width:3.6}") > -1, "il bordo piu' spesso arriva dal CSS");
});
t("la forma bloccata: bordo piu' marcato, colore suo, lucchetto DENTRO la figura", () => {
  reset();
  const libera = A.TYPES.forma.draw({ w: 200, d: 140, shape: "circle", fill: "#b45309" });
  const chiusa = A.TYPES.forma.draw({ w: 200, d: 140, shape: "circle", fill: "#b45309", locked: true });
  ok(libera.indexOf('stroke-width="2"') > -1, "libera: tratto normale");
  ok(chiusa.indexOf('stroke-width="3.6"') > -1, "bloccata: tratto marcato");
  ok(chiusa.indexOf("#b45309") > -1 && chiusa.indexOf("riser-lock") > -1, "il lucchetto prende il colore della forma");
  /* in un cerchio, in un triangolo, in un rombo l'angolo del riquadro cade FUORI dalla figura: il
     lucchetto starebbe sospeso nel vuoto. Qui si misura davvero: alla quota del lucchetto la figura
     dev'essere larga abbastanza da contenerlo (il glifo e' largo 6 cm). */
  const posGlifo = (svg) => {
    const m = /riser-lock" transform="translate\((-?[\d.]+),(-?[\d.]+)\)/.exec(svg);
    return m ? { x: +m[1], y: +m[2] } : null;
  };
  const W = 200, D = 140, hw = W / 2, hd = D / 2;
  /* mezza larghezza della figura alla quota y, per come la disegna shapeGeom */
  const mezzaLarghezza = {
    circle: (y) => hw * Math.sqrt(Math.max(0, 1 - (y / hd) ** 2)),
    tri: (y) => hw * ((y + hd) / (2 * hd)),
    rhombus: (y) => hw * (1 - Math.abs(y) / hd),
    rect: () => hw,
    arrow: () => hw,
  };
  Object.keys(mezzaLarghezza).forEach((sh) => {
    const g = posGlifo(A.TYPES.forma.draw({ w: W, d: D, shape: sh, locked: true }));
    ok(g, sh + ": il lucchetto e' posizionato");
    eq(g.x, 0, sh + ": sull'asse, non nell'angolo");
    ok(g.y < 0 && g.y > -hd, sh + ": nella meta' alta, dentro il riquadro (" + g.y + ")");
    ok(mezzaLarghezza[sh](g.y) >= 4, sh + ": alla sua quota la figura lo contiene (" + mezzaLarghezza[sh](g.y).toFixed(1) + " cm)");
    ok(Math.abs(g.y) > 12, sh + ": e non finisce addosso al testo, che sta al centro");
  });
  const linea = posGlifo(A.TYPES.forma.draw({ w: 200, d: 140, shape: "line", locked: true }));
  ok(linea && linea.y > -14 && linea.y < 0, "la linea e' alta 8 cm: il lucchetto le sta appena sopra, non nel vuoto del riquadro");
  const dash = A.TYPES.forma.draw({ w: 200, d: 140, shapeStyle: "dashed", locked: true });
  ok(dash.indexOf('stroke-width="3.8"') > -1 && dash.indexOf('stroke-dasharray="10 7"') > -1, "anche tratteggiata resta tratteggiata");
  const piccola = A.TYPES.forma.draw({ w: 60, d: 40, locked: true });
  eq(piccola.indexOf("riser-lock"), -1, "sulle forme piccole il lucchetto si tace, come sulle pedane");
});
t("il blocco sopravvive al salvataggio", () => {
  reset();
  const s = A.normalizeState({
    stage: { w: 1200, d: 800 },
    items: [{ id: "i1", type: "tappeto", x: 400, y: 400, locked: true },
            { id: "i2", type: "forma", x: 300, y: 200, locked: true }],
  });
  eq(s.items.filter((i) => i.locked === true).length, 2, "tappeto e forma restano bloccati dopo un giro di normalizzazione");
});
/* ---- MANIGLIE SOPRA A TUTTO (Simone 29/07): «con due pedane non riesco a vedere il lucchetto della
   pedana che sta sotto, perche' viene coperto da quella sopra».
   Le maniglie stavano dentro il gruppo dell'elemento: chi veniva dopo nell'ordine di disegno ci
   passava sopra. Ora vivono in un layer proprio, l'ultimo della scena. Cio' che NON si poteva fare
   e' portare su l'elemento intero: la pedana e' il pavimento e finirebbe sopra a chi ci sta su. ---- */
console.log("\nManiglie dell'elemento selezionato:");
t("le maniglie non stanno nel disegno dell'elemento, ma nel layer che sta sopra a tutto", () => {
  reset();
  const p = add("pedana", 500, 400); p.w = 400; p.d = 240;
  A.selectOne(p.id);
  const disegno = A.itemMarkup(p);
  eq(disegno.indexOf("lock-handle"), -1, "il lucchetto non e' piu' dentro l'elemento");
  eq(disegno.indexOf("rot-handle"), -1, "e nemmeno la maniglia di rotazione");
  eq(disegno.indexOf("rs-handle"), -1, "ne' i quadratini per allungarla");
  const maniglie = A.selHandlesMarkup();
  ok(maniglie.indexOf("lock-handle") > -1 && maniglie.indexOf("rot-handle") > -1 && maniglie.indexOf("rs-handle") > -1,
    "ci sono tutte, nel loro layer");
});
t("con due pedane vicine le maniglie della selezionata restano sopra al disegno dell'altra", () => {
  reset();
  const sotto = add("pedana", 500, 400); sotto.w = 400; sotto.d = 240;   /* disegnata per prima */
  const sopra = add("pedana", 500, 180); sopra.w = 400; sopra.d = 240;   /* disegnata dopo: prima copriva le maniglie */
  A.selectOne(sotto.id);
  const scena = A.sceneMarkup();
  const finePedanaSopra = scena.lastIndexOf('data-id="' + sopra.id + '"');
  const inizioManiglie = scena.indexOf('class="sel-handles');
  ok(finePedanaSopra > -1 && inizioManiglie > -1, "in scena ci sono sia la pedana che copre sia le maniglie");
  ok(inizioManiglie > finePedanaSopra, "le maniglie sono scritte DOPO la pedana che copre: si vedono e si cliccano");
  ok(scena.indexOf('id="layHandles"') > scena.indexOf('id="layOverlay"'),
    "il layer delle maniglie e' l'ultimo: sopra anche ai cavi e ai blocchi del palco");
});
t("la pedana resta il pavimento: sotto a cio' che ci sta sopra, maniglie a parte", () => {
  /* la tentazione era disegnare per ultimo l'elemento selezionato: avrebbe portato la pedana sopra
     agli strumenti che ci poggiano. Sopra ci vanno solo le maniglie. */
  reset();
  const ped = add("pedana", 500, 400); ped.w = 400; ped.d = 240;
  const sedia = add("sedia", 500, 400);
  A.selectOne(ped.id);
  const scena = A.sceneMarkup();
  ok(scena.indexOf('data-id="' + ped.id + '"') < scena.indexOf('data-id="' + sedia.id + '"'),
    "la pedana selezionata resta disegnata prima della sedia che ci sta sopra");
});
t("le maniglie seguono l'elemento: stesso centro, stessa rotazione", () => {
  reset();
  const p = add("pedana", 320, 260); p.w = 400; p.d = 240; p.rot = 35;
  A.selectOne(p.id);
  ok(A.selHandlesMarkup().indexOf('transform="translate(320 260) rotate(35)"') > -1,
    "fuori dal gruppo dell'elemento, il transform se lo riporta dietro");
});
t("niente maniglie a mezz'aria: se l'elemento non e' sul palco, non ci sono", () => {
  reset();
  const p = add("pedana", 500, 400);
  A.selectOne(p.id);
  ok(A.selHandlesMarkup() !== "", "sul palco le maniglie ci sono");
  p.rackId = "r1";   /* finito dentro un rack: vive col rack, non e' disegnato */
  eq(A.selHandlesMarkup(), "", "chiuso in un rack non lascia maniglie sospese dov'era");
});
t("in due non si manovra: le maniglie sono di un elemento solo", () => {
  reset();
  const a = add("pedana", 300, 400), b = add("pedana", 800, 400);
  A.selectOne(a.id);
  ok(A.selHandlesMarkup() !== "", "una sola pedana selezionata: maniglie");
  A.selSet[b.id] = true; A.sel = b.id;
  eq(A.selHandlesMarkup(), "", "selezione multipla: nessuna maniglia, si sposta il blocco");
});
t("le maniglie portano con se' il reparto, cosi' i lucchetti dei layer valgono anche lassu'", () => {
  /* uscendo dal gruppo dell'elemento, le maniglie uscivano anche dai contenitori su cui lavorano i
     lucchetti dei layer (#layItems, .mus-item...): sarebbero rimaste afferrabili a reparto chiuso. */
  reset();
  const p = add("pedana", 500, 400);
  A.selectOne(p.id);
  ok(A.selHandlesMarkup().indexOf('class="sel-handles riser-item"') > -1, "la pedana e' del reparto pedane");
  const c = add("corista", 300, 300);
  A.selectOne(c.id);
  ok(A.selHandlesMarkup().indexOf("mus-item") > -1, "il musicista porta la classe dei Musicisti");
  ok(stylesCss.indexOf("body.stage-lock .sel-handles.riser-item") > -1, "e il CSS spegne le maniglie sul layer bloccato");
});
/* ---- SPECCHIA come azione (Simone 29/07): «elementi come Quinta devono avere la funzione specchia
   nella stessa riga di duplica ed elimina». Era una spunta nei Dettagli tecnici, e solo per i
   musicisti illustrati. ---- */
console.log("\nSpecchia (azione di riga):");
t("il comando sta nella riga di Duplica ed Elimina, non piu' in una spunta sepolta", () => {
  const html = readFileSync(join(root, "app/index.html"), "utf8");
  const riga = /<div class="btns" id="pActRow">([^]*?)<\/div>/.exec(html);
  ok(riga, "la riga azioni c'e'");
  ["pMirror", "pDup", "pDel"].forEach((id) => ok(riga[1].indexOf('id="' + id + '"') > -1, "manca " + id + " nella riga"));
  ok(riga[1].indexOf("Specchia") > -1, "col suo nome per esteso");
  eq(html.indexOf('id="pMirWrap"'), -1, "la vecchia spunta e' sparita: un comando solo");
  eq(html.indexOf('id="pMir"'), -1, "e con lei la sua casella");
  ok(html.indexOf('id="grpMirror"') > -1, "c'e' anche nella riga della selezione multipla");
});
t("si specchia tutto, tranne cio' che e' scritto", () => {
  reset();
  ["quinta", "scala", "rampa", "pedana", "wedge", "musArpa", "tappeto"].forEach((k) => {
    ok(A.canMirror(A.addItem(k, { x: 200, y: 200 })), k + ": si ribalta");
  });
  ["testo", "forma", "miczone", "metro"].forEach((k) => {
    eq(A.canMirror(A.addItem(k, { x: 300, y: 300 })), false, k + ": specchiarlo scriverebbe al contrario");
  });
});
t("il comando ribalta l'arte e torna indietro", () => {
  reset();
  const q = add("quinta", 400, 300);
  A.selectOne(q.id);
  A.mirrorSel();
  eq(q.mir, true, "specchiata");
  A.mirrorSel();
  eq(q.mir, undefined, "e si torna com'era, senza lasciare tracce nello stato");
});
t("con piu' elementi si specchia la DISPOSIZIONE, non solo le icone", () => {
  reset();
  const a = add("quinta", 200, 300), b = add("wedge", 800, 300), c = add("sedia", 500, 400);
  c.rot = 30;
  A.clearSelection(); [a, b, c].forEach((it) => { A.selSet[it.id] = true; A.sel = it.id; });
  const cx = (Math.min(a.x - a.w / 2, b.x - b.w / 2, c.x - c.w / 2) + Math.max(a.x + a.w / 2, b.x + b.w / 2, c.x + c.w / 2)) / 2;
  A.mirrorSel();
  eq(a.x, Math.round(2 * cx - 200), "chi stava a sinistra passa a destra");
  eq(b.x, Math.round(2 * cx - 800), "e viceversa");
  eq(c.y, 400, "la profondita' non si tocca: e' uno specchio sinistra/destra");
  eq(c.rot, 330, "le rotazioni si ribaltano con la disposizione");
  eq(a.mir, true, "e ogni icona si ribalta a sua volta");
  A.mirrorSel();
  eq([a.x, b.x, c.rot].join(","), [200, 800, 30].join(","), "un secondo specchio riporta tutto com'era");
  eq(a.mir, undefined, "icone comprese");
});
t("nel blocco specchiato il testo si sposta ma non si scrive al contrario", () => {
  reset();
  const q = add("quinta", 200, 300), t2 = add("testo", 700, 300);
  A.clearSelection(); [q, t2].forEach((it) => { A.selSet[it.id] = true; A.sel = it.id; });
  A.mirrorSel();
  ok(t2.x < 700, "il testo ha cambiato lato");
  eq(t2.mir, undefined, "ma non e' ribaltato: si leggerebbe allo specchio");
  eq(q.mir, true, "la quinta invece si ribalta");
});
t("una zona di microfonazione poligonale si specchia con i suoi vertici", () => {
  reset();
  const z = add("miczone", 400, 300);
  z.pts = [[-100, -60], [120, -40], [80, 70], [-90, 50]];
  const alt = add("quinta", 800, 300);
  A.clearSelection(); [z, alt].forEach((it) => { A.selSet[it.id] = true; A.sel = it.id; });
  A.mirrorSel();
  eq(z.pts[0][0], 100, "i vertici vivono nel frame della zona: si ribaltano anche loro");
  eq(z.pts[0][1], -60, "in profondita' restano dov'erano");
});
t("il lucchetto tiene fermo anche lo specchio del blocco", () => {
  reset();
  const a = add("quinta", 200, 300), tap = add("tappeto", 600, 300), b = add("quinta", 900, 300);
  tap.locked = true;
  const x0 = tap.x;
  A.clearSelection(); [a, tap, b].forEach((it) => { A.selSet[it.id] = true; A.sel = it.id; });
  A.mirrorSel();
  eq(tap.x, x0, "il tappeto bloccato non si sposta");
  ok(a.x !== 200, "gli altri si specchiano lo stesso");
});
t("lo specchio del blocco e' un'operazione simmetrica: due colpi e si torna", () => {
  reset();
  const a = add("quinta", 300, 300), b = add("quinta", 500, 300), c = add("scala", 700, 300);
  a.mir = true;   /* uno era gia' ribaltato: riflettendolo torna dritto, com'e' giusto in uno specchio */
  A.clearSelection(); [a, b, c].forEach((it) => { A.selSet[it.id] = true; A.sel = it.id; });
  const x0 = [a.x, b.x, c.x].join(",");
  A.mirrorSel();
  eq(a.mir, undefined, "chi era specchiato torna dritto");
  eq([b, c].filter((it) => it.mir === true).length, 2, "e gli altri si ribaltano");
  A.mirrorSel();
  eq([a.x, b.x, c.x].join(","), x0, "due specchi = tutto com'era");
  eq(a.mir, true, "stato delle icone compreso");
});
t("l'elemento specchiato lo dice nel disegno", () => {
  reset();
  const q = add("quinta", 400, 300);
  ok(A.itemMarkup(q).indexOf('scale(-1,1)') === -1, "libera: nessuna trasformazione");
  q.mir = true;
  ok(A.itemMarkup(q).indexOf('<g transform="scale(-1,1)">') > -1, "specchiata: l'arte e' ribaltata");
});
/* PIÈ DI PAGINA DEL PDF (27/07): i numeri che servono a chi allestisce, contati dagli elementi veri. */
t("il cartiglio riassume canali, leggii, sedute, personal mixer e ascolti", () => {
  reset(); A.state.cab.on = true; A.__cabRes = null;
  eq(A.pdfTotals().length, 0, "palco vuoto: niente riga");
  add("stagebox", 900, 100);
  add("corista", 200, 300); add("corista", 300, 300);
  add("hearback", 500, 400); add("mixhub", 600, 400);
  add("wedge", 400, 500); add("leggio", 700, 300); add("sedia", 750, 300);
  A.__cabRes = null;
  const t2 = A.pdfTotals().join(" · ");
  ok(/\d+ canali/.test(t2), "canali: " + t2);
  ok(/leggii|leggio/.test(t2), "leggii: " + t2);
  ok(/sedut/.test(t2), "sedute: " + t2);
  ok(/1 personal mixer \(1 hub\)/.test(t2), "personal mixer con l'hub: " + t2);
  ok(/1 spia/.test(t2), "spie al singolare: " + t2);
});
t("una postazione doppia conta due sedute e un leggio solo", () => {
  reset();
  const d = add("vln1x2", 300, 300);
  const tot = A.pdfTotals().join(" · ");
  ok(/2 sedute/.test(tot), "due musicisti, due sedie: " + tot);
  ok(/1 leggio\b/.test(tot), "ma un leggio in due: " + tot);
});
t("il cartiglio si alza quando c'e' la riga dei totali", () => {
  reset();
  const vuoto = A.cartHFor("", "a4", "landscape");
  add("leggio", 300, 300);
  const pieno = A.cartHFor("", "a4", "landscape");
  ok(pieno > vuoto, "va contata, o la scala automatica sceglie una scala che poi non entra");
});
t("il costruttore lavora SOLO la forma del palco", () => {
  const html = readFileSync(join(root, "app/index.html"), "utf8");
  eq(/id="bAddPedana"/.test(html), false, "«+ Pedana» non deve stare nel costruttore");
  ok(/id="bAddBlock"/.test(html) && /id="bAddSemi"/.test(html), "blocchi e semicerchio restano");
  ok((A.__catEntries || []).some(e => e.k === "pedana"), "la pedana si prende dal catalogo");
});

/* ---- Aste microfoniche: conteggio con le regole vere, non "un mic = un'asta" ----
   Nei rider reali le aste di batteria/ampli non si disegnano: si conta quante ne servono. */
console.log("\nAste microfoniche (conteggio):");
t("la batteria non produce un'asta per microfono: i tom vanno a clip", () => {
  reset();
  const dr = add("batteria", 500, 300);
  eq(A.cabItemInputs(dr).length, 8, "il kit di riferimento e' a 8 canali");
  const n = A.standNeeds();
  eq(n.giraffa.tot, 3, "hi-hat + 2 overhead vogliono una giraffa ciascuno");
  eq(n.bassa.tot, 2, "cassa e rullante top vanno su asta bassa");
  eq(n.clip.tot, 3, "rullante btm e i due tom vanno a clip, non su asta");
  eq(A.standTotal(n), 5, "8 canali di batteria = 5 aste vere, non 8");
});
t("microfonazione ridotta e soli overhead: le aste calano di conseguenza", () => {
  reset();
  const dr = add("batteria", 500, 300);
  dr.miking = "reduced";
  eq(A.standTotal(A.standNeeds()), 4, "kick + rullante + 2 OH");
  dr.miking = "oh";
  eq(A.standTotal(A.standNeeds()), 2, "solo i due overhead");
});
t("gli strumenti in DI non chiedono aste", () => {
  reset();
  add("stagepiano", 300, 300); add("bassstand", 500, 300); add("laptop", 700, 300);
  eq(A.standTotal(A.standNeeds()), 0, "DI e strumenti in linea non hanno supporti");
});
t("le voci contano l'asta che hanno gia' disegnata, senza doppiarla", () => {
  reset();
  const v = add("cantante", 400, 400); v.micMode = "tonda";
  let n = A.standNeeds();
  eq(n.dritta.tot, 1, "il cantante con asta tonda vale un'asta dritta");
  eq(n.dritta.gia, 1, "ed e' gia' disegnata nell'icona, non e' da aggiungere");
  v.micMode = "giraffa"; n = A.standNeeds();
  eq(n.giraffa.tot, 1); eq(n.dritta.tot, 0);
  v.micMode = "mano"; eq(A.standTotal(A.standNeeds()), 0, "col palmare non serve asta");
});
t("un'asta messa a mano dal catalogo si conta una volta sola", () => {
  reset();
  add("astamic", 300, 300); add("giraffa", 500, 300); add("astabassa", 700, 300);
  const n = A.standNeeds();
  eq(A.standTotal(n), 3, "tre oggetti asta = tre aste");
  eq(n.dritta.gia + n.giraffa.gia + n.bassa.gia, 3, "sono tutte gia' sul palco");
  eq(n.dritta.dedotte + n.giraffa.dedotte + n.bassa.dedotte, 0, "il loro canale non deve dedurne un'altra");
});
/* ---- Coppia stereo: due canali, UNA asta (Simone 29/07) ----
   Una ripresa stereo (ORTF, due panoramici su barra) occupa due canali ma un solo supporto:
   contarne due significa far portare al service un'asta in piu'. */
t("la Coppia stereo del catalogo vale un'asta sola, non una per canale", () => {
  reset();
  const c = add("coppiast", 500, 300);
  eq(A.cabItemInputs(c).length, 2, "la coppia da' due canali");
  eq(A.standTotal(A.standNeeds()), 1, "ma sta su una barra, su una sola asta");
});
t("il flag e' del SECONDO canale della coppia: la L porta l'asta, la R la condivide", () => {
  reset();
  const c = add("coppiast", 500, 300);
  eq(A.stereoPairSecond(c, 1), true, "il canale 1 e' la R di una coppia L/R");
  eq(A.stereoPairSecond(c, 0), false, "il canale 0 e' la L: non condivide, porta");
  eq(A.standSharedOf(c, 1), true, "sulla Coppia stereo la condivisione e' il default giusto");
  eq(A.standSharedOf(c, 0), false);
});
t("su un pianoforte stereo restano due aste finche' il fonico non dice il contrario", () => {
  reset();
  const p = add("grancoda", 500, 300);
  eq(A.cabItemInputs(p).length, 2, "piano ripreso stereo");
  eq(A.standTotal(A.standNeeds()), 2, "due panoramici, due aste: il default non decide per il fonico");
  A.cabSetStandShared(p.id + "#1", true);
  eq(A.standTotal(A.standNeeds()), 1, "dichiarata la barra, l'asta e' una");
  eq(A.state.cab.manual[p.id + "#1"].standShared, true, "il dato sta nell'override di canale, con `stand` e `p48`");
  ok(A.state.cab.manual[p.id + "#0"] === undefined, "e non si scrive nulla sulla riga che l'asta ce l'ha");
});
t("scegliere un supporto a mano esce dalla condivisione (una informazione sola, non due)", () => {
  reset();
  const c = add("coppiast", 500, 300);
  eq(A.standTotal(A.standNeeds()), 1);
  A.cabSetStand(c.id + "#1", "asta giraffa");
  eq(A.state.cab.manual[c.id + "#1"].standShared, false, "il false resta scritto: il default non deve tornare a decidere");
  eq(A.standTotal(A.standNeeds()), 2, "questo canale un'asta sua ce l'ha");
  A.cabSetStandShared(c.id + "#1", true);
  eq(A.state.cab.manual[c.id + "#1"].stand, undefined, "e tornando alla barra l'asta scelta sparisce");
  eq(A.standTotal(A.standNeeds()), 1);
});
t("fuori da una coppia stereo il flag non si legge nemmeno: niente stati fantasma", () => {
  reset();
  const p = add("grancoda", 500, 300);
  A.cabSetStandShared(p.id + "#1", true);
  eq(A.standTotal(A.standNeeds()), 1);
  p.stereo = false;                                    /* piano ripreso mono: la coppia non esiste piu' */
  A.__cabRes = null;
  eq(A.cabItemInputs(p).length, 1);
  eq(A.standTotal(A.standNeeds()), 1, "un canale, un'asta: il vecchio flag non toglie l'unica asta rimasta");
  p.stereo = true; A.__cabRes = null;
  eq(A.standTotal(A.standNeeds()), 1, "e tornando stereo la scelta di prima e' ancora li'");
});
t("la batteria: solo gli overhead sono una coppia, i mic ravvicinati no", () => {
  reset();
  const dr = add("batteria", 500, 300);
  const ov = A.cabItemInputs(dr).findIndex(c => /Overhead R/.test(c.name));
  eq(A.stereoPairSecond(dr, ov), true, "Overhead L/R e' una coppia");
  eq(A.stereoPairSecond(dr, 4), false, "il primo tom no");
  A.cabSetStandShared(dr.id + "#" + ov, true);
  eq(A.standNeeds().giraffa.tot, 2, "overhead su barra: hi-hat + una giraffa per la coppia, non due");
});
/* ---- Trascinamento: la coppia stereo si muove intera (Simone 29/07, decisione 4B) ----
   L e R vanno tenute attaccate e in ordine: sul banco il link stereo si fa su una coppia
   dispari-pari. Qui si prova la logica PURA — chi si muove con chi, e in che posto finisce —
   senza toccare il DOM: il gesto e' provato dagli spec Playwright. */
t("cabPairBlocks: la coppia stereo e' un blocco solo, i canali singoli no", () => {
  reset(); A.state.cab.on = true; A.__cabRes = null;
  const box = add("stagebox", 900, 130); box.ch = 16; box.outCh = 8;
  add("coppiast", 500, 300); add("astamic", 300, 400);
  cabla();
  const rows = A.patchList().rows;
  const L = rows.find(r => r.name === "Stereo L"), R = rows.find(r => r.name === "Stereo R");
  const solo = rows.find(r => /^Asta/.test(r.name));
  const b = A.cabPairBlocks();
  eq(b[L.key], [L.key, R.key], "prendendo la L si muove anche la R");
  eq(b[R.key], [L.key, R.key], "e prendendo la R si muove la stessa coppia");
  eq(b[solo.key], [solo.key], "un canale singolo si muove da solo");
});
t("cabPairBlocks: due righe gia' separate NON si ricongiungono da sole", () => {
  reset(); A.state.cab.on = true; A.__cabRes = null;
  const box = add("stagebox", 900, 130); box.ch = 16; box.outCh = 8;
  add("coppiast", 500, 300); add("astamic", 300, 400);
  cabla();
  const R = A.patchList().rows.find(r => r.name === "Stereo R");
  A.cabSetChannelNo(R.key, 3);                        /* separate a mano: e' una scelta dell'utente */
  const rows = A.patchList().rows;
  ok(rows.findIndex(r => r.name === "Stereo R") - rows.findIndex(r => r.name === "Stereo L") > 1, "ora sono lontane");
  const b = A.cabPairBlocks();
  eq(b[R.key], [R.key], "si muove solo la riga presa: riunirle nessuno l'ha chiesto");
});
t("il posto e' quello della riga su cui lasci: stessa regola della casella del numero", () => {
  const k = ["a", "b", "c", "d"];
  eq(A._dragOrderWith(k, ["a"], "c"), ["b", "c", "a", "d"], "verso il basso: prende il posto (e il numero) di c");
  eq(A._dragOrderWith(k, ["d"], "b"), ["a", "d", "b", "c"], "verso l'alto: stessa regola nel verso opposto");
  eq(A._dragOrderWith(k, ["a"], "a"), k, "lasciata dov'era: non cambia niente");
});
t("un blocco arriva intero, e non si spacca nemmeno da fuori", () => {
  const k = ["L", "R", "voce", "basso"];
  const blocks = { L: ["L", "R"], R: ["L", "R"], voce: ["voce"], basso: ["basso"] };
  eq(A._dragOrderWith(k, ["L", "R"], "voce", blocks), ["voce", "basso", "L", "R"],
     "la coppia lasciata sul terzo canale ci arriva intera, L su dispari");
  eq(A._dragOrderWith(k, ["L", "R"], "voce", blocks), A._dragOrderWith(k, ["L", "R"], "voce"),
     "prendere la R o la L e' lo stesso gesto: il blocco e' uno");
  eq(A._dragOrderWith(["voce", "L", "R", "basso"], ["basso"], "R", blocks), ["voce", "basso", "L", "R"],
     "una riga estranea si ferma PRIMA della coppia invece di infilarsi fra L e R");
  eq(A._dragOrderWith(["voce", "L", "R", "basso"], ["basso"], "R"), ["voce", "L", "basso", "R"],
     "senza la mappa dei blocchi resterebbe la vecchia regola: la coppia si spaccherebbe");
});

t("il vocabolario dei supporti e' uno solo (niente inglese contro italiano)", () => {
  const generati = new Set(Object.values(A.MIC_DEFAULTS).map(d => d.stand).filter(Boolean));
  generati.forEach(v => ok(A.standKindOf(Object.keys(A.MIC_DEFAULTS).find(k => A.MIC_DEFAULTS[k].stand === v)) !== undefined,
    "valore non classificabile: " + v));
  ok(A.STAND_SUGGEST.indexOf("asta giraffa") > -1 && A.STAND_SUGGEST.indexOf("tall boom") === -1,
    "il datalist deve usare lo stesso vocabolario dei valori generati");
});

/* ---- CATALOGO MICROFONI (MIC_DB, 29/07) --------------------------------------------------------
   Il rischio vero di un catalogo che cresce non e' il dato sbagliato (si vede): e' l'ETICHETTA DI
   SUPPORTO scritta con parole nuove. standKindFromLabel non la riconosce, quel microfono sparisce
   dal conteggio delle aste del rider, e nessuno se ne accorge finche' il service non arriva senza
   un'asta. Questi test sono la rete. */
console.log("\nCatalogo microfoni (MIC_DB):");
t("ogni supporto del catalogo e' classificabile da standKindFromLabel", () => {
  const kinds = new Set(A.STAND_KINDS.map(([k]) => k));
  const rotti = [];
  Object.keys(A.MIC_DB).forEach((k) => {
    const st = A.MIC_DB[k].stand;
    ok(typeof st === "string", k + ": il campo stand deve esserci (\"\" = nessun supporto)");
    if (st === "") return;                       // DI, lavalier, microfono in linea: nessuna asta, ed e' giusto
    const kind = A.standKindFromLabel(st);
    if (kind === null || !kinds.has(kind)) rotti.push(k + " → «" + st + "»");
  });
  eq(rotti, [], "supporti che il conteggio delle aste NON sa contare");
});
t("ogni voce del catalogo ha marca, modello, tipo, direttivita' e phantom dichiarati", () => {
  const TIPI = new Set(["dinamico", "condensatore", "nastro"]);
  const rotti = [];
  Object.keys(A.MIC_DB).forEach((k) => {
    const d = A.MIC_DB[k];
    if (!d.brand || !d.model) rotti.push(k + ": marca/modello");
    else if (!TIPI.has(d.type)) rotti.push(k + ": tipo «" + d.type + "»");
    // i pickup a CONTATTO leggono la vibrazione del legno, non l'aria: una figura polare non ce
    // l'hanno per costruzione. L'eccezione vale solo se il dato la dichiara (contatto:true), cosi'
    // resta una scelta scritta e non un campo dimenticato che passa inosservato.
    else if (!d.pol && !d.contatto) rotti.push(k + ": direttivita'");
    else if (d.contatto && d.pol) rotti.push(k + ": dichiarato a contatto ma con una direttivita'");
    else if (typeof d.p48 !== "boolean") rotti.push(k + ": phantom non dichiarato");
  });
  eq(rotti, [], "voci incomplete (una specifica assente e' meglio di una inventata, ma questi campi sono di targa)");
});
t("MIC_DEFAULTS si DERIVA dal catalogo: asta e 48V non si scrivono due volte", () => {
  Object.keys(A.MIC_DB).forEach((k) => {
    eq(A.micInfo(k).stand, A.MIC_DB[k].stand, k + ": l'asta della channel list e' quella del catalogo");
    eq(A.micInfo(k).p48, !!A.MIC_DB[k].p48, k + ": il phantom della channel list e' quello del catalogo");
  });
  // le voci che microfoni NON sono restano scritte a mano, e devono restare
  eq(A.micInfo("DI").stand, "", "la DI non ha asta");
  eq(A.micInfo("SM57/e906").stand, "asta bassa", "«SM57/e906» e' un modo di dire della channel list, non un modello");
});
t("i microfoni che c'erano prima non cambiano ne' asta ne' phantom", () => {
  // le 14 voci storiche: se una cambia, cambiano i rider gia' consegnati
  const storiche = { "SM58": ["asta dritta", false], "Beta 58A": ["asta dritta", false],
    "SM57": ["asta bassa", false], "e906": ["clip/asta bassa", false], "e904": ["clip", false],
    "D6": ["asta bassa", false], "Beta 91A": ["interno/terra", true], "MD421": ["asta bassa/clip", false],
    "SM81": ["asta giraffa", true], "KM184": ["asta giraffa", true], "C414": ["asta giraffa", true],
    "DPA 4099": ["clip strumento", true], "DPA 4066": ["headset", true], "DPA 4088": ["headset", true] };
  Object.keys(storiche).forEach((k) => {
    eq([A.micInfo(k).stand, A.micInfo(k).p48], storiche[k], k);
  });
});
t("i condensatori che NON vogliono il +48V della console restano a phantom spento", () => {
  // «condensatore ⇒ phantom» e' la regola, e proprio per questo le eccezioni sono fragili: sembrano
  // sviste, e chi passa di qui e' tentato di «correggerle». Se qualcuna diventa true, l'audit chiede
  // un +48V che non serve — e su una capsula wireless o su un valvolare col suo alimentatore quel
  // 48V non arriva nemmeno dove crede. Ogni riga qui sotto ha il motivo scritto accanto.
  const spenti = {
    "K2": "valvolare: lo alimenta il suo alimentatore dedicato",
    "RE920": "lo alimenta il bodypack a 5 V",
    "C555 L": "archetto da bodypack",
    "TL47": "lavalier da bodypack",
    "MME 865": "capsula wireless",
    "KK 105 S": "capsula wireless",
    "E6": "miniatura da bodypack",
    "B3": "miniatura da bodypack",
    "B6": "miniatura da bodypack",
    "ME 2": "lavalier da bodypack",
    "ME 3": "archetto da bodypack",
  };
  Object.keys(spenti).forEach((k) => {
    ok(A.MIC_DB[k], k + ": la voce deve esistere nel catalogo");
    eq(A.MIC_DB[k].type, "condensatore", k + ": la prova ha senso solo su un condensatore");
    eq(A.micInfo(k).p48, false, k + ": " + spenti[k] + " — il +48V della console non c'entra");
  });
});
t("il nome di targa del microfono trova la stessa asta della sigla da rider", () => {
  // Lo stesso microfono si scrive «C451» sul rider e «C451 B» sul datasheet — ed è il secondo che
  // finisce nel canale quando si assegna il «Microfono reale». Col confronto esatto quel canale
  // usciva SENZA ASTA: il fonico dichiarava il modello vero e il rider smetteva di chiederla al
  // service. Qui si verifica sulle coppie che il campo `model` scrive davvero diverse dalla chiave.
  const diverse = Object.keys(A.MIC_DB)
    .filter((k) => A.MIC_DB[k].model && A.MIC_DB[k].model !== k)
    .map((k) => [k, A.MIC_DB[k].model]);
  ok(diverse.length > 20, "la prova ha senso solo se molti nomi di targa differiscono dalla chiave");
  const rotti = [];
  diverse.forEach(([k, model]) => {
    const a = A.micInfo(k), b = A.micInfo(model);
    if (a.stand !== b.stand || a.p48 !== b.p48) rotti.push(k + " ≠ «" + model + "»");
  });
  eq(rotti, [], "col nome di targa il canale perde asta o phantom");
  // e non deve diventare indulgente: due modelli diversi restano diversi
  eq(A.micInfo("SM7B").stand !== A.micInfo("SM57").stand, true, "SM7B e SM57 non sono lo stesso microfono");
});
t("ogni microfono usato dai default del palco sta nel catalogo", () => {
  // IN_SRC / IN_MULTI / MIKING assegnano un mic per tipo: se quel nome non e' nel catalogo,
  // il canale nasce senza asta e senza phantom (micInfo cade nel ramo "sconosciuto")
  const usati = new Set();
  Object.values(A.IN_SRC).forEach((m) => usati.add(m));
  Object.values(A.IN_MULTI).forEach((rows) => rows.forEach(([, m]) => usati.add(m)));
  const fuori = [...usati].filter((m) => m && !A.MIC_DB[m] && !A.MIC_DEFAULTS[m]);
  eq(fuori, [], "microfoni assegnati dal palco che il catalogo non conosce");
});

console.log("\nCompletamento del microfono (micSearch):");
t("scrivo «u87» e mi compare l'U87", () => {
  const r = A.micSearch("u87").map((x) => x.key);
  ok(r.length > 0, "nessun suggerimento per «u87»");
  eq(r[0], "U87", "l'U87 deve essere il PRIMO, non uno dei tanti");
});
t("il completamento non e' sensibile a maiuscole, accenti e spazi", () => {
  eq(A.micSearch("U87").map((x) => x.key)[0], "U87", "maiuscole");
  eq(A.micSearch("  u87 ").map((x) => x.key)[0], "U87", "spazi attorno");
  ok(A.micSearch("md 421").map((x) => x.key).indexOf("MD421") > -1, "spaziato come sul datasheet");
  ok(A.micSearch("md421").map((x) => x.key).indexOf("MD421") > -1, "attaccato come sul rider");
});
t("si cerca anche per marca e per uso, non solo per sigla", () => {
  ok(A.micSearch("neumann").map((x) => x.key).indexOf("KM184") > -1, "per marca");
  ok(A.micSearch("shure").map((x) => x.key).length >= 4, "per marca: piu' di un risultato");
  ok(A.micSearch("cassa").map((x) => x.key).indexOf("D6") > -1, "per uso sul palco");
});
t("chi digita una sigla la vede in cima, non a meta' elenco", () => {
  eq(A.micSearch("sm58").map((x) => x.key)[0], "SM58");
  eq(A.micSearch("km184").map((x) => x.key)[0], "KM184");
  eq(A.micSearch("d6").map((x) => x.key)[0], "D6");
});
t("campo vuoto = nessun suggerimento (non si apre un elenco addosso a chi non ha scritto niente)", () => {
  eq(A.micSearch(""), []); eq(A.micSearch("   "), []);
  eq(A.micSearch("zzzqwerty"), [], "nessun modello: elenco vuoto, e il campo resta com'e' scritto");
});
t("il +48V acceso su un nastro passivo e' un ERRORE, non un'inezia", () => {
  reset();
  const it = add("astamic", 300, 300);
  const key = A.patchList().rows.find((r) => r.itemId === it.id).key;
  A.cabSetMic(key, "R-121");                       // nastro PASSIVO
  A.cabSetP48(key, true);                          // il fonico lo accende a mano
  const iss = auditFind(/nastro PASSIVO/i);
  eq(iss.length, 1, "l'audit deve dirlo");
  eq(iss[0].lvl, "err", "non e' un consiglio: il phantom brucia il nastro");
  // un nastro ATTIVO il +48V lo VUOLE: non deve comparire nulla
  A.cabSetMic(key, "R-122 MKII");
  eq(auditFind(/nastro PASSIVO/i).length, 0,
     "R-122 MKII e' attivo (p48 true nel catalogo): niente allarme");
});
t("un microfono scritto a mano resta com'e': il catalogo suggerisce, non obbliga", () => {
  reset();
  const it = add("astamic", 300, 300);
  const key = A.patchList().rows.find((r) => r.itemId === it.id).key;
  A.cabSetMic(key, "Bidule 9000");                 // modello che nel catalogo non c'e'
  const r = A.patchList().rows.find((x) => x.key === key);
  eq(r.mic, "Bidule 9000", "il valore scritto a mano non viene ne' corretto ne' buttato");
  eq(r.stand, "", "sconosciuto = nessuna asta dedotta (mai inventata)");
  eq(r.p48, false, "sconosciuto = niente phantom dedotto");
});

/* ---- Asta gigante (29/07): la giraffa da coro/orchestra, treppiede largo e braccio lungo ----
   Misure dai datasheet (K&M 20811 base Ø 1485 mm · Proel PRO300BK base Ø 1500, braccio 1350-2050 ·
   K&M 21231 braccio 1070-1870 · Proel PRO400BK braccio 1400-2350): NON e' una giraffa scalata. */
console.log("\nAsta gigante:");
t("l'ingombro e' quello vero: treppiede da un metro e mezzo, non una giraffa ingrandita", () => {
  const g = A.TYPES.astagigante, gir = A.TYPES.giraffa;
  eq(g.w, 150, "larghezza = Ø del treppiede aperto (K&M 20811 148,5 · Proel PRO300BK 150)");
  eq(g.d, 215, "profondita' = mezza base dietro il palo (75) + sbraccio del braccio (140)");
  eq(A.ASTAG.d, A.ASTAG.base / 2 + A.ASTAG.sbraccio, "l'ingombro si deriva dalle due misure, non si scrive due volte");
  ok(g.w > gir.w * 2 && g.d > gir.d * 3, "deve leggersi come 'gigante' accanto alla giraffa normale");
  ok(A.ASTAG.sbraccio >= 140 && A.ASTAG.sbraccio <= 187,
    "lo sbraccio disegnato sta dentro TUTTE le corse di catalogo (107-187 · 135-205 · 140-235)");
});
t("la pianta e' disegnata in cm reali e sta dentro il suo riquadro", () => {
  const svg = A.TYPES.astagigante.draw({});
  ok(!/transform|scale\(|viewBox/.test(svg), "niente scalature: le coordinate sono gia' in cm");
  const nums = (svg.replace(/#[0-9a-f]{3,8}/gi, "").match(/-?\d+(\.\d+)?/g) || []).map(Number);
  ok(Math.max(...nums) <= 108 && Math.min(...nums) >= -108,
    "nessuna coordinata esce dalla meta' profondita' del riquadro (215/2)");
  ok((svg.match(/<ellipse/g) || []).length === 3, "tre piedi: e' un treppiede");
});
t("e' un tipo di asta a se': si conta come 'gigante', non come giraffa", () => {
  reset();
  add("astagigante", 400, 300);
  const n = A.standNeeds();
  eq(n.gigante.tot, 1, "una gigante sul palco = una asta gigante");
  eq(n.gigante.gia, 1, "e' gia' disegnata, non e' da aggiungere");
  eq(n.giraffa.tot, 0, "non deve finire nel mucchio delle giraffe");
  eq(n.gigante.dedotte, 0, "il suo canale non ne deve dedurre una seconda");
  eq(A.standTotal(n), 1, "conta fra le aste vere");
  eq(A.standKindOfItem({ type: "astagigante" }), "gigante");
  ok(A.STAND_KINDS.some(k => k[0] === "gigante" && k[1] === "Asta gigante"), "manca nel vocabolario dei supporti");
});
t("nella channel list la colonna Asta dice 'asta gigante', non 'asta giraffa'", () => {
  reset();
  const g = add("astagigante", 400, 300);
  const r = A.patchList().rows.find(x => x.itemId === g.id);
  eq(r.mic, "KM184", "monta lo stesso mic da ripresa d'insieme della giraffa");
  eq(r.stand, "asta gigante", "ma l'asta la dice l'oggetto sul palco, non il modello di microfono");
  ok(A.STAND_SUGGEST.indexOf("asta gigante") > -1, "la voce deve esserci anche nella tendina");
  /* le tre aste storiche non cambiano comportamento */
  reset();
  const a = add("astamic", 300, 300), b = add("giraffa", 500, 300), c = add("astabassa", 700, 300);
  const rows = A.patchList().rows;
  eq(rows.find(x => x.itemId === a.id).stand, "asta dritta");
  eq(rows.find(x => x.itemId === b.id).stand, "asta giraffa");
  eq(rows.find(x => x.itemId === c.id).stand, "asta bassa");
});
t("si trova col nome del mestiere, senza rubare le query degli altri", () => {
  ["gigante", "giraffa", "overhead", "coro", "boom"].forEach(w => {
    ok(A.__qaSearch(w).map(r => r.k).indexOf("astagigante") > -1, "il quick-add non la trova su: " + w);
    ok(A.__spSearch(w).map(r => r.k).indexOf("astagigante") > -1, "il catalogo non la trova su: " + w);
  });
  /* la ricerca e' una substring: la gigante non deve scavalcare chi possiede la parola */
  eq(A.__qaSearch("overhead")[0].k, "micover", "l'Overhead di sezione resta primo sulla sua parola");
  eq(A.__qaSearch("cori").map(r => r.k).indexOf("astagigante"), -1, "chi digita 'cori' cerca i coristi");
  ok(A.__qaSearch("mic").map(r => r.k).indexOf("micover") > -1, "la gigante ha spinto l'overhead fuori dai risultati di 'mic'");
  ok(A.__qaSearch("orchestra").map(r => r.k).indexOf("astagigante") === -1, "un alias 'orchestra' la metterebbe davanti agli strumenti");
});
t("e' presente in tutte le tabelle che elencano le aste", () => {
  ok(A.ESSENTIAL.astagigante, "catalogo essenziale");
  ok(A.NUMBERED_HW.astagigante, "numerazione progressiva (Asta gigante 1, 2, ...)");
  eq(A.INSTR_BASE.astagigante, "Asta gigante", "nome pieno per la numerazione");
  eq(A.IN_SRC.astagigante, "KM184", "sorgente audio a un canale come la giraffa");
  ok(A.H3D.astagigante > A.H3D.giraffa, "in 3D deve stare piu' in alto della giraffa");
  eq(A.TYPEMAT.astagigante, "black_metal");
  ok(/tripod|boom/.test(A.DESC3D.astagigante), "descrizione 3D mancante");
  eq(A.proAbbrName("Asta gigante 1"), "OH", "in modalita' sigla e' una ripresa dall'alto");
});
t("una gigante accanto a un cantante conta come il suo microfono (audit)", () => {
  reset();
  add("cantante", 400, 400, { micMode: "pano" });   /* in panoramica non produce canali: è il caso in cui l'avviso è vero */
  const msg = () => A.auditEngine().findings.filter(f => /senza microfono/i.test(f.msg)).length;
  eq(msg(), 1, "la voce senza canali va segnalata");
  add("astagigante", 400, 470);   /* 70 cm: dentro il raggio di 150 della regola */
  eq(msg(), 0, "con la gigante davanti la voce entra in lista: niente avviso");
});

/* ---- DI: un'opzione del pannello diventa un oggetto sul palco, e una tappa del cavo ----
   Prima scegliere "DI" cambiava solo l'etichetta del canale: nessuna scatoletta, nessun passaggio. */
console.log("\nDI come oggetto e nodo della catena:");
/* Il collegamento non è più automatico all'inserimento (Simone 28/07): i test che verificano i CAVI
   devono chiederlo, come fa l'utente con la barra «Collega». */
t("canali riservati: righe vere nella lista, con numero e patch", () => {
  reset(); A.state.cab.on = true; A.__cabRes = null;
  const box = add("stagebox", 850, 150); box.ch = 16; box.outCh = 8;
  const m1 = add("astamic", 300, 400), m2 = add("astamic", 400, 400);
  cabla();
  const base = A.patchList().rows;
  eq(base.length, 2, "senza riservate: solo le due sorgenti");
  // riservo la porta 2: diventa una RIGA, in mezzo, e la seconda sorgente scala al numero 3
  box.sbRes = [2]; A.__cabRes = null;
  const pl = A.patchList(), rows = pl.rows;
  eq(rows.length, 3, "la riservata è una riga della lista");
  const res = rows.filter(r => r.reserved);
  eq(res.length, 1, "una sola riga riservata");
  eq(res[0].port, 2, "la riga porta il numero di porta riservato");
  eq(res[0].name, "", "nessuna sorgente sulla riga riservata");
  ok(/2$/.test(res[0].patch), "la patch indica la porta: " + res[0].patch);
  eq(rows[1].reserved, true, "sta al posto della porta, non in coda");
  eq(rows.map(r => r.n).join(","), "1,2,3", "rinumerazione coerente 1..N");
  ok(rows[2].port > 2, "la sorgente dopo la riservata sta su una porta successiva");
  // liberandola la lista torna com'era
  A.cabFreePort(box.id, 2); A.__cabRes = null;
  eq(A.patchList().rows.length, 2, "liberata: la riga sparisce");
  ok(!box.sbRes, "sbRes ripulito quando resta vuoto");
});

t("canali riservati: non contano come «da collegare» e finiscono in CSV/PDF", () => {
  reset(); A.state.cab.on = true; A.__cabRes = null;
  const box = add("stagebox", 850, 150); box.ch = 16; box.outCh = 8;
  add("astamic", 300, 400);
  cabla();
  box.sbRes = [3, 5]; A.__cabRes = null;
  const rows = A.patchList().rows;
  eq(rows.filter(r => r.reserved).length, 2, "due riservate");
  eq(rows.filter(r => !r.spare && !r.reserved && !r.box).length, 0, "nessun canale risulta da collegare");
  const csv = A.channelListCsv({ format: "excel-it" }).csv;
  eq((csv.match(/RISERVATO/g) || []).length, 2, "le riservate sono esplicite nel CSV");
  const ah = A.channelListCsv({ format: "ah" }).csv;
  ok(ah.includes("SPARE"), "nel formato A&H il canale riservato è uno SPARE");
});

t("CSV: con più box il numero di canale è quello FOH, come nel pannello e nel PDF", () => {
  reset(); A.state.cab.on = true; A.__cabRes = null;
  const b1 = add("stagebox", 200, 150); b1.ch = 16; b1.outCh = 8; b1.sbId = 1;
  const b2 = add("stagebox", 900, 150); b2.ch = 16; b2.outCh = 8; b2.sbId = 2;
  add("astamic", 200, 400); const far = add("astamic", 900, 400);
  cabla();
  const pl = A.patchList();
  eq(pl.hasFoh, true, "due box con ID");
  const rFar = pl.rows.find(r => r.itemId === far.id);
  ok(rFar.foh > 16, "la sorgente sulla seconda box sta oltre il canale 16: " + rFar.foh);
  const righe = A.channelListCsv({ format: "excel-it" }).csv.split("\n").filter(Boolean);
  const suaRiga = righe.find(l => l.includes(rFar.name));
  eq(suaRiga.split(";")[0], String(rFar.foh), "nel CSV il numero è il canale FOH, non l'indice di riga");
});

t("canali riservati: con più box seguono la numerazione FOH continua", () => {
  reset(); A.state.cab.on = true; A.__cabRes = null;
  const b1 = add("stagebox", 200, 150); b1.ch = 16; b1.outCh = 8; b1.sbId = 1;
  const b2 = add("stagebox", 900, 150); b2.ch = 16; b2.outCh = 8; b2.sbId = 2;
  add("astamic", 200, 400); add("astamic", 900, 400);
  cabla();
  b2.sbRes = [4]; A.__cabRes = null;
  const pl = A.patchList();
  eq(pl.hasFoh, true, "due box con ID → numerazione FOH");
  const res = pl.rows.filter(r => r.reserved)[0];
  eq(res.foh, 20, "porta 4 della seconda box = FOH 20 (16+4)");
});

function cabla() { A.__cabRes = null; A.cabConnectAll(); A.__cabRes = null; }
function pmCabla() { A.__mondRes = null; try { A.pmAutoConnect(); } catch (e) {} A.pmAutoConnectBasic(); A.__mondRes = null; }
function diSetup() {
  reset(); A.state.cab.on = true; A.layerSoloUI = {}; A.__cabRes = null;
  const box = add("stagebox", 850, 150); box.ch = 16; box.outCh = 8;
  const gtr = add("musChitClassica", 300, 400);
  cabla();
  return { box, gtr };
}
t("scegliere DI crea la scatoletta accanto allo strumento, legata a lui", () => {
  const { gtr } = diSetup();
  ok(!A.diLinked(gtr), "non deve esistere prima");
  gtr.miking = "di"; const di = A.diApply(gtr);
  ok(di && di.type === "dimono", "nessuna DI creata");
  eq(di.diFor, gtr.id, "la DI non e' legata allo strumento");
  eq(gtr.diId, di.id, "lo strumento non conosce la sua DI");
  ok(Math.hypot(di.x - gtr.x, di.y - gtr.y) < 120, "la DI deve nascere ACCANTO allo strumento: " + [di.x, di.y]);
  ok(/^DI \d+$/.test(di.label || ""), "etichetta progressiva mancante: " + di.label);
});
t("il cavo passa DENTRO la DI: strumento → DI → stage box", () => {
  const { gtr } = diSetup();
  gtr.miking = "di"; const di = A.diApply(gtr); cabla();
  const l = (A.cabResult().links || [])[0];
  ok(l, "nessun cavo generato");
  ok(l.pts.length >= 3, "il percorso deve avere una tappa in mezzo: " + JSON.stringify(l.pts));
  ok(l.pts.some(p => Math.abs(p[0] - di.x) < 2 && Math.abs(p[1] - di.y) < 2), "il cavo non passa dalla DI");
  eq((A.cabResult().links || []).length, 1, "la DI non deve aggiungere canali");
});
/* Bug 26/07 (Simone): "chitarra classica con DI, col cablaggio automatico occupa 2 ingressi".
   La DI generata (diFor) è una tappa del cavo, non una sorgente: i canali sono quelli dello strumento. */
t("la DI non raddoppia gli ingressi in stage box ne' le righe della lista canali", () => {
  const { gtr } = diSetup();
  gtr.miking = "di"; A.diApply(gtr); cabla();
  eq(A.cabItemInputs(A.diLinked(gtr)).length, 0, "la DI generata non ha canali propri");
  eq(A.cabResult().totIn, 1, "ingressi contati");
  eq(A.patchList().rows.length, 1, "righe nella lista canali");
  eq(A.cabResult().boxes[0].used, 1, "canali occupati sulla stage box");
});
t("i tipi che nascono con la DI (basso, tastiere, acustica...) contano i canali una volta sola", () => {
  ["musBasso", "gtacustica", "keysamp", "stagepiano"].forEach(function (tp) {
    reset(); A.state.cab.on = true; A.layerSoloUI = {}; A.__cabRes = null;
    const b = A.addItem("stagebox", { x: 850, y: 150 }) || A.state.items[A.state.items.length - 1]; b.ch = 16;
    const it = add(tp, 300, 400);
    const atteso = A.cabItemInputs(it).length;
    A.diApply(it); A.__cabRes = null;
    eq(A.patchList().rows.length, atteso, tp + ": righe lista canali");
  });
});
t("una DI presa dal catalogo (senza strumento) resta una sorgente col suo canale", () => {
  reset(); A.state.cab.on = true; A.layerSoloUI = {}; A.__cabRes = null;
  const b = add("stagebox", 850, 150); b.ch = 16;
  const di = add("dimono", 300, 400);
  eq(A.cabItemInputs(di).length, 1, "la DI a se' stante deve avere il suo canale");
});
/* Bug 26/07: cablare senza stage box crashava (le drop box proposte non avevano taken/pins/res). */
t("il cablaggio automatico senza stage box propone le drop box e non crasha", () => {
  reset(); A.state.cab.on = true; A.layerSoloUI = {}; A.__cabRes = null;
  const g = add("musChitClassica", 300, 400); g.miking = "di"; A.diApply(g);
  add("cantante", 500, 400);
  A.__cabRes = null;
  A.cabConnectAll();                                   // prima lanciava: takePort su box senza taken
  A.state.cab.mode = "auto"; A.__cabRes = null;         // le drop box si propongono solo in modalita' auto
  const R = A.cabResult();
  ok(R.boxes.length > 0 && R.boxes.every(b => b.auto), "attese solo drop box proposte");
  ok(R.boxes.every(b => b.taken && b.pins && b.resMap), "le drop box devono avere la stessa forma delle box reali");
});
/* Il bottone "Cablaggio automatico" chiamava showToast, mai definita: ReferenceError → l'handler
   globale mostrava "Si e' verificato un problema imprevisto". */
t("showToast e guideDialog esistono davvero", () => {
  eq(typeof A.showToast, "function", "showToast");
  eq(typeof A.guideDialog, "function", "guideDialog");
});
t("quando manca la stage box il cablaggio automatico guida invece di rispondere 'tutto collegato'", () => {
  reset(); A.state.cab.on = true; A.layerSoloUI = {}; A.__cabRes = null;
  add("cantante", 300, 400);
  const need = A.autoConnectNeeds("cabin");
  /* 01/09 il titolo non nomina piu' la stage box (ora vale anche il mixer sul palco): l'ancora
     stabile e' l'AZIONE proposta, che e' quello che il test vuole davvero verificare. */
  ok(need && need.action && /stage box/i.test(need.action.label), "attesa la guida sulla stage box: " + JSON.stringify(need));
  ok(need.action && typeof need.action.run === "function", "la guida deve poter aggiungere la stage box");
  need.action.run();
  ok(A.state.items.some(A.cabIsBox), "la stage box non e' stata aggiunta");
  eq(A.autoConnectNeeds("cabin"), null, "con box e sorgenti non deve chiedere altro");
});
/* CATENA D'USCITA (Simone 26/07): microfonazione + pedaliera + uscita bilanciata devono parlarsi.
   Basso con pedaliera: basso → pedaliera → (DI se jack) → stage box. */
function outSetup() {
  reset(); A.state.cab.on = true; A.layerSoloUI = {}; A.__cabRes = null;
  const box = add("stagebox", 850, 150); box.ch = 16;
  const bs = add("bassstand", 300, 400);
  return { box, bs };
}
t("uno strumento che nasce in DI porta la sua DI gia' all'inserimento", () => {
  reset(); A.state.cab.on = true; A.__cabRes = null;
  const bs = add("bassstand", 300, 400);
  ok(A.diLinked(bs), "il basso nasce col prelievo di linea: la DI deve esserci");
  eq(A.state.items.filter(i => i.type === "dimono").length, 1, "una sola DI");
  eq(A.cabItemInputs(bs).length, 1, "un canale solo");
  const voce = add("cantante", 500, 400);
  ok(!A.diLinked(voce), "una voce non deve portarsi dietro una DI");
});
/* CATENA D'USCITA (Simone 27/07, variante C): lo strumento esce SEMPRE jack; poi DI, oppure
   pedaliera (jack o XLR), oppure ampli da cui si prende mic e/o DI out — o entrambi. */
function chainSetup(tp) {
  reset(); A.state.cab.on = true; A.layerSoloUI = {}; A.__cabRes = null;
  const box = add("stagebox", 850, 150); box.ch = 16;
  const it = add(tp || "bassstand", 300, 400);
  cabla();
  return { box, it };
}
t("i default di partenza rispecchiano la pratica: basso e acustica in DI, elettrica sul mic dell'ampli", () => {
  reset();
  const b = A.chainOf({ type: "bassstand" }), a = A.chainOf({ type: "gtacustica" }), e = A.chainOf({ type: "gtstand" });
  eq([b.tapLine, b.amp], [true, false], "basso: linea in DI");
  eq([a.tapLine, a.amp], [true, false], "acustica: linea in DI");
  eq([e.tapLine, e.amp, e.ampMic], [false, true, true], "elettrica: microfono sull'ampli");
});
t("dritto in DI: un canale e la DI ai piedi dello strumento", () => {
  const { it } = chainSetup();
  const c = A.chainOf(it);
  ok(c.tapLine && c.needDi, "il prelievo di linea e' sbilanciato: serve la DI");
  eq(A.cabItemInputs(it)[0].mic, "DI", "canale");
  const di = A.diLinked(it);
  ok(di && Math.hypot(di.x - it.x, di.y - it.y) < 120, "la DI sta accanto allo strumento");
});
t("pedaliera con uscita jack: la DI si sposta DOPO la pedaliera", () => {
  const { it } = chainSetup();
  A.chainToggle(it, "ped"); cabla();
  const c = A.chainOf(it);
  ok(c.ped && !c.pedXlr && c.needDi, "pedaliera jack: la DI ci vuole ancora");
  const di = A.diLinked(it), ped = A.chainNodePos(it, "pedaliera");
  ok(Math.hypot(di.x - ped[0], di.y - ped[1]) < Math.hypot(di.x - it.x, di.y - it.y),
    "la DI deve stare accanto alla pedaliera");
  A.__cabRes = null;
  const l = (A.cabResult().links || [])[0];
  ok(l.pts.some(p => Math.abs(p[0] - ped[0]) < 2 && Math.abs(p[1] - ped[1]) < 2), "il cavo passa dalla pedaliera");
  ok(l.pts.some(p => Math.abs(p[0] - di.x) < 2 && Math.abs(p[1] - di.y) < 2), "il cavo passa dalla DI");
});
t("pedaliera con uscita XLR: niente DI e il canale diventa XLR", () => {
  const { it } = chainSetup();
  A.chainToggle(it, "ped"); A.chainToggle(it, "pedxlr");
  const c = A.chainOf(it);
  ok(c.lineBal && !c.needDi, "bilanciata: nessuna DI");
  ok(!A.diLinked(it), "la DI deve sparire dal palco");
  eq(A.cabItemInputs(it)[0].mic, "XLR", "il canale non e' piu' DI");
  eq(A.patchList().rows.length, 1, "sempre un canale solo");
});
t("dall'ampli: microfono, DI out o entrambi — un canale per prelievo", () => {
  const { it } = chainSetup();
  A.chainToggle(it, "line");                 // spegne la linea
  A.chainToggle(it, "amp");                  // accende l'ampli: parte dal microfono
  eq(A.cabItemInputs(it).map(c => c.mic).join("+"), "MD421", "solo microfono sul cono");
  ok(!A.diLinked(it), "col microfono non serve nessuna DI");
  A.chainToggle(it, "ampdi");                // + DI out della testata
  eq(A.cabItemInputs(it).map(c => c.mic).join("+"), "MD421+DI out", "due canali distinti");
  eq(A.patchList().rows.length, 2, "due righe in lista canali");
  A.chainToggle(it, "ampmic");               // solo DI out
  eq(A.cabItemInputs(it).map(c => c.mic).join("+"), "DI out", "solo DI out");
  ok(!A.diLinked(it), "la DI out e' gia' bilanciata: niente DI esterna");
});
t("DI prima dell'ampli + microfono sul cono: due canali e la DI c'e'", () => {
  const { it } = chainSetup();
  A.chainToggle(it, "amp");                  // linea (default) + ampli col suo microfono
  const mics = A.cabItemInputs(it).map(c => c.mic);
  eq(JSON.stringify(mics), JSON.stringify(["DI", "MD421"]), "linea in DI + microfono");
  ok(A.diLinked(it), "il canale di linea e' sbilanciato: la DI serve");
});
t("acustica: il microfono sullo strumento e' un prelievo a se'", () => {
  const { it } = chainSetup("gtacustica");
  A.chainToggle(it, "strmic");
  eq(A.cabItemInputs(it).map(c => c.mic).join("+"), "DI+KM184", "DI del pickup + condensatore");
  A.chainToggle(it, "line");
  eq(A.cabItemInputs(it).map(c => c.mic).join("+"), "KM184", "solo microfono");
  ok(!A.diLinked(it), "senza prelievo di linea non serve la DI");
});
t("spegnere tutti i prelievi = nessun canale (e l'hint lo dice)", () => {
  const { it } = chainSetup();
  A.chainToggle(it, "line");
  eq(A.cabItemInputs(it).length, 0, "nessun canale");
  ok(/niente al mixer/.test(A.chainHint(it)), "l'hint deve avvisare: " + A.chainHint(it));
});
t("la vecchia microfonazione migra nella catena senza perdere niente", () => {
  reset();
  const casi = [
    ["bassstand", "di", ["DI"]],
    ["bassstand", "didmic", ["DI", "MD421"]],
    ["bassstand", "ampli", ["MD421"]],
    ["gtstand", "ampli", ["SM57"]],
    ["gtstand", "amplidi", ["DI", "SM57"]],
    ["gtacustica", "dimic", ["DI", "KM184"]],
    ["gtacustica", "mic", ["KM184"]],
    ["bassstand", "__nomic__", []]
  ];
  casi.forEach(function (c) {
    const it = { id: "x", type: c[0], x: 0, y: 0, miking: c[1] };
    A.chainMigrate(it);
    eq(JSON.stringify(A.cabItemInputs(it).map(x => x.mic)), JSON.stringify(c[2]), c[0] + " / " + c[1]);
    ok(it.miking === undefined, "la vecchia microfonazione va rimossa");
  });
});
t("l'uscita bilanciata dei vecchi progetti diventa la pedaliera XLR", () => {
  reset();
  const it = { id: "y", type: "bassstand", x: 0, y: 0, miking: "di", balOut: true, pedaliera: true };
  A.chainMigrate(it);
  eq(it.pedXlr, true, "balOut sulla pedaliera = uscita XLR");
  ok(it.balOut === undefined, "il vecchio campo va via");
  eq(A.cabItemInputs(it)[0].mic, "XLR", "canale bilanciato");
});
t("la catena vale per chitarre e basso, non per gli altri", () => {
  reset();
  [["bassstand", true], ["gtstand", true], ["gtacustica", true],
   ["cantante", false], ["stagepiano", false], ["laptop", false], ["bassamp", false]].forEach(function (c) {
    eq(A.hasChain({ type: c[0] }), c[1], c[0]);
  });
});
/* RICHIESTE SETUP (spec docs/richieste/SPEC_R1.md): le risposte del musicista non toccano il palco,
   diventano una proposta che il tecnico applica voce per voce. */
function propSetup() {
  reset(); A.state.cab.on = true; A.__cabRes = null;
  const box = add("stagebox", 850, 150); box.ch = 16;
  const gt = add("gtstand", 300, 400);
  return { box, gt };
}
const RISPOSTE_TIPO = {
  guitars: 2, stands: "double", stands_provider: "self", pedalboard: "yes",
  pedalboard_size: "large", amp: "combo", amp_provider: "self", amp_onstage: "yes",
  output: "mic", power: 2, notes: "uso un wah a pedale"
};
t("la proposta separa cosa c'e', cosa aggiungere e cosa verificare", () => {
  const { gt } = propSetup();
  const p = A.setupProposal(RISPOSTE_TIPO, gt);
  ok(p.presenti.length >= 1, "la postazione stessa e' gia' presente");
  const keys = p.aggiungere.map(v => v.key);
  ok(keys.includes("ped"), "pedaliera dichiarata: da aggiungere · " + keys.join(","));
  ok(keys.includes("power"), "due prese: punto corrente");
  ok(p.verificare.some(v => /wah/.test(v.why || "")), "la nota del musicista arriva al tecnico");
});
t("la proposta non ripropone cio' che e' gia' sulla postazione", () => {
  const { gt } = propSetup();
  A.chainToggle(gt, "ped");                       // il tecnico l'ha gia' messa
  const p = A.setupProposal(RISPOSTE_TIPO, gt);
  eq(p.aggiungere.filter(v => v.key === "ped").length, 0, "niente doppioni");
  ok(p.presenti.some(v => /Pedaliera/.test(v.label)), "va segnalata come gia' presente");
});
t("uscita jack: la proposta chiede la linea in DI; uscita microfono: il mic sull'ampli", () => {
  const { gt } = propSetup();
  const jack = A.setupProposal({ ...RISPOSTE_TIPO, output: "jack" }, gt);
  ok(jack.aggiungere.some(v => v.key === "line"), "linea in DI");
  // la chitarra elettrica nasce gia' col microfono sull'ampli: la proposta lo conferma, non lo duplica
  const mic = A.setupProposal({ ...RISPOSTE_TIPO, output: "mic" }, gt);
  ok(mic.presenti.some(v => /[Mm]icrofono/.test(v.label)), "microfono gia' previsto: " + JSON.stringify(mic.presenti));
  A.chainToggle(gt, "ampmic");                    // ora il mic NON c'e' piu'
  ok(A.setupProposal({ ...RISPOSTE_TIPO, output: "mic" }, gt).aggiungere.some(v => v.key === "ampmic"),
    "senza microfono va proposto");
  const both = A.setupProposal({ ...RISPOSTE_TIPO, output: "both" }, gt);
  eq(both.aggiungere.filter(v => v.key === "line" || v.key === "ampmic").length, 2, "due canali");
});
t("i 'non lo so' del musicista diventano cose da verificare, non decisioni", () => {
  const { gt } = propSetup();
  const p = A.setupProposal(
    { ...RISPOSTE_TIPO, amp: "unknown", output: "unknown", stereo: "unknown", amp_provider: "unknown" }, gt);
  ok(p.verificare.length >= 3, "attese piu' verifiche: " + JSON.stringify(p.verificare.map(v => v.label)));
  eq(p.aggiungere.some(v => v.key === "ampmic" || v.key === "line"), false,
    "senza sapere come esce il suono non si decide al posto suo");
});
t("applicare una voce della proposta cambia la catena, non il resto del palco", () => {
  const { gt } = propSetup();
  const prima = A.state.items.length;
  const p = A.setupProposal(RISPOSTE_TIPO, gt);
  const ped = p.aggiungere.filter(v => v.key === "ped")[0];
  A.setupProposalApply(ped, gt);
  eq(A.chainOf(gt).ped, true, "la pedaliera e' entrata nella catena");
  eq(A.state.items.length, prima, "nessun elemento nuovo per un flag della catena");
});
t("applicare il punto corrente posa una ciabatta accanto alla postazione", () => {
  const { gt } = propSetup();
  const p = A.setupProposal(RISPOSTE_TIPO, gt);
  const pw = p.aggiungere.filter(v => v.key === "power")[0];
  const nuovo = A.setupProposalApply(pw, gt);
  ok(nuovo && nuovo.type === "ciabatta", "attesa una ciabatta");
  ok(Math.hypot(nuovo.x - gt.x, nuovo.y - gt.y) < 200, "deve nascere vicino al musicista");
});
t("le risposte da sole non toccano mai il palco", () => {
  const { gt } = propSetup();
  const prima = JSON.stringify(A.state.items);
  A.setupProposal(RISPOSTE_TIPO, gt);
  eq(JSON.stringify(A.state.items), prima, "il motore della proposta e' puro");
});
/* 26/07 (Simone): "chitarre e bassi nel motore di ricerca non hanno l'illustrazione della persona".
   L'anteprima del catalogo/quick-add disegnava lo schema anche per i tipi che sul palco nascono
   illustrati (LOOK_ART): chitarre, basso, piani, stage piano, arpa, percussioni. */
t("l'anteprima dei tipi illustrati mostra il musicista, non lo schema", () => {
  const tipi = Object.keys(A.LOOK_ART);
  // 7 e non più 8: le percussioni sono uscite dalle illustrazioni il 30/07 (set componibile, come la batteria).
  ok(tipi.length >= 7, "attesi tutti i tipi LOOK_ART: " + tipi.join(","));
  const vero = A.libIcon;                                  // nel sandbox LIB_ICONS e' lo stub: si spia la delega
  A.libIcon = (k) => '<g data-art="' + k + '"></g>';
  try {
    tipi.forEach(function (tp) {
      const mini = A.miniSvg(tp, null, 8);
      ok(mini.indexOf('data-art="' + A.LOOK_ART[tp] + '"') > -1, tp + ": l'anteprima non usa l'illustrazione " + A.LOOK_ART[tp]);
    });
  } finally { A.libIcon = vero; }
  eq(A.look2Art({ type: "comboamp" }), null, "un ampli non deve diventare un musicista");
  eq(A.look2Art({ type: "bassstand", look: "schematico" }), null, "in aspetto schematico l'anteprima resta lo schema");
});
t("senza le illustrazioni caricate l'anteprima resta lo schema (niente riquadro vuoto)", () => {
  const mini = A.miniSvg("bassstand", null, 8);          // LIB_ICONS.musBasso assente nel sandbox
  ok(mini.indexOf("<svg") === 0 && mini.length > 120, "anteprima vuota: " + mini.slice(0, 80));
});
t("palco vuoto: il cablaggio automatico dice cosa aggiungere, per ogni layer", () => {
  reset(); A.state.cab.on = true;
  ["cabin", "cabout", "elec", "mond"].forEach(function (id) {
    const need = A.autoConnectNeeds(id);
    ok(need && need.title && need.msg, id + ": nessuna guida per il palco vuoto");
  });
});
t("la stage box si sceglie dalla DI, non dallo strumento", () => {
  const { gtr } = diSetup();
  const lontana = add("stagebox", 320, 380); lontana.ch = 16;   // vicinissima allo strumento
  gtr.miking = "di"; const di = A.diApply(gtr);
  di.x = 900; di.y = 160; A.__cabRes = null;                    // ma la DI e' stata portata vicino all'altra box
  const l = (A.cabResult().links || [])[0];
  ok(l && l.box, "nessuna box assegnata");
  const dBox = Math.hypot(l.box.x - di.x, l.box.y - di.y);
  ok(dBox < Math.hypot(lontana.x - di.x, lontana.y - di.y) + 1, "ha scelto la box vicina allo strumento invece che alla DI");
});
t("la DI segue lo strumento quando lo sposti, e resta dove la trascini", () => {
  const { gtr } = diSetup();
  gtr.miking = "di"; const di = A.diApply(gtr);
  const dx = di.x - gtr.x, dy = di.y - gtr.y;
  gtr.x += 200; gtr.y += 150; A.diSyncAll();
  eq([di.x - gtr.x, di.y - gtr.y].join(","), [dx, dy].join(","), "la DI non ha seguito lo strumento");
  di.x = gtr.x - 80; di.y = gtr.y - 60; A.diSaveOff(di);        // l'utente la trascina altrove
  gtr.x += 100; A.diSyncAll();
  eq([di.x - gtr.x, di.y - gtr.y].join(","), [-80, -60].join(","), "il nuovo posto scelto a mano non e' stato rispettato");
});
t("tolta l'opzione o cancellato lo strumento, la DI se ne va", () => {
  const { gtr } = diSetup();
  gtr.miking = "di"; A.diApply(gtr);
  gtr.miking = "mic"; A.diApply(gtr);
  ok(!A.diLinked(gtr) && !A.state.items.some(i => i.type === "dimono"), "la DI resta sul palco dopo aver scelto Mic");
  gtr.miking = "di"; const di2 = A.diApply(gtr);
  ok(di2, "non ricreata");
  A.selSet = {}; A.selSet[gtr.id] = true; A.sel = gtr.id; A.deleteSel();
  ok(!A.state.items.some(i => i.type === "dimono"), "cancellato lo strumento, la sua DI deve sparire");
});
t("uscita bilanciata a bordo: niente DI, cavo diretto", () => {
  const { gtr } = diSetup();
  gtr.miking = "di"; A.diApply(gtr);
  gtr.balOut = true; A.diApply(gtr); A.__cabRes = null;
  ok(!A.state.items.some(i => i.type === "dimono"), "con l'uscita bilanciata la DI non deve esserci");
  const l = (A.cabResult().links || [])[0];
  eq(l.pts.length, 2, "senza DI il cavo va diretto alla stage box");
});
t("strumento stereo → DI stereo (una scatoletta, due canali)", () => {
  reset(); A.state.cab.on = true; A.__cabRes = null;
  const box = add("stagebox", 800, 150); box.ch = 16;
  const keys = add("stagepiano", 400, 400);
  const di = A.diApply(keys);
  ok(di, "nessuna DI per la tastiera");
  eq(di.diCh, "stereo", "una tastiera stereo vuole una DI stereo");
  eq(A.state.items.filter(i => i.type === "dimono").length, 1, "una sola scatoletta");
  eq(A.cabItemInputs(keys).length, 2, "restano due canali (L/R)");
  ok(!A.isAudioSource(di), "la DI generata non deve contare come sorgente autonoma");
});

/* ---- Stage box: il pannello disegnato È il numero di canali ---- */
console.log("\nStage box (pannello sui canali reali):");
const sbConn = (mk) => (mk.match(/#0a0b0c|#0b1f1d/g) || []).length;   // un foro per connettore (lod 2)
const sbOn = (mk) => (mk.match(/#0b1f1d/g) || []).length;             // foro "acceso" = canale patchato
t("il numero di connettori disegnati e' esattamente IN + OUT", () => {
  reset(); A.__cabStatic = true;   // dettaglio pieno, come in export
  [[8, 4], [16, 8], [24, 12], [32, 16], [8, 0]].forEach(([ch, out]) => {
    const b = add("stagebox", 400, 300); b.ch = ch; b.outCh = out;
    eq(A.cabBoxCap(b), ch); eq(A.cabBoxCapOut(b), out);
    eq(sbConn(A.sbDraw(b)), ch + out, `box ${ch}/${out}: connettori disegnati diversi dai canali`);
    A.state.items.pop();
  });
});
t("i canali patchati si accendono, gli altri no", () => {
  reset(); A.__cabStatic = true; A.layerSoloUI = {};
  const box = add("stagebox", 700, 500); box.ch = 16; box.outCh = 8;
  eq(sbOn(A.sbDraw(box)), 0, "senza patch nessun connettore acceso");
  A.state.cab.on = true;
  add("cantante", 300, 300); add("astamic", 400, 300); cabla();
  const usati = Object.keys(A.sbPortUse(box).i).length;
  ok(usati > 0, "il motore non riporta canali occupati");
  eq(sbOn(A.sbDraw(box)), usati, "connettori accesi diversi dai canali patchati");
  eq(sbConn(A.sbDraw(box)), 24, "il totale dei connettori non deve cambiare col patch");
});
t("modello reale: i canali vengono dal database, non dai campi generici", () => {
  reset(); A.__cabStatic = true;
  const b = add("stagebox", 400, 300); b.ch = 8; b.outCh = 2; b.hw = "rio3224d2";   // 32 in / 16 out
  eq(A.cabBoxCap(b), 32); eq(A.cabBoxCapOut(b), 16);
  eq(sbConn(A.sbDraw(b)), 48, "il pannello ignora il modello reale");
});
t("la sub-stagebox usa lo stesso pannello (8/4 di default)", () => {
  reset(); A.__cabStatic = true;
  const b = add("substg", 400, 300);
  eq(sbConn(A.sbDraw(b)), A.cabBoxCap(b) + A.cabBoxCapOut(b));
  ok(A.TYPES.substg.draw(b).length > 200, "disegno vuoto");
});
t("livello di dettaglio: export sempre al massimo, misura assente non degrada", () => {
  const b = { type: "stagebox", w: 58, d: 46, ch: 16 };
  A.__cabStatic = true; eq(A.sbLod(b), 2, "in export serve il dettaglio pieno");
  A.__cabStatic = false;
  const vb0 = A.vb;
  A.vb = { x: 0, y: 0, w: 400, h: 300 };   // svg del sandbox non misurabile → fallback conservativo
  eq(A.sbLod(b), 2);
  A.vb = vb0; A.__cabStatic = true;
});
t("nel PDF il dettaglio non dipende dallo zoom dello schermo", () => {
  /* La funzione va delimitata dove FINISCE, non dopo N caratteri: con una finestra fissa basta
     aggiungere due righe di commento perché l'ultima riga cercata resti fuori — l'11/08 la finestra
     di 6000 ha tagliato a metà `window.__scenePrint=_keepPrint` e il test è diventato rosso senza
     che il codice fosse cambiato. Un test che misura la lunghezza del sorgente invece del suo
     contenuto è un allarme che suona da solo. */
  const _i = appjs.indexOf("function stageSceneSvg");
  const _f = appjs.indexOf("\nfunction ", _i + 1);
  const fn = appjs.slice(_i, _f > -1 ? _f : undefined);
  const iFlag = fn.indexOf("window.__scenePrint=true"), iItems = fn.indexOf("sortedItems().forEach");
  ok(iFlag > -1, "manca il flag di disegno per la stampa");
  ok(iItems > -1 && iFlag < iItems, "il flag stampa si accende dopo aver gia' disegnato gli elementi");
  ok(fn.indexOf("window.__scenePrint=_keepPrint") > -1, "il flag stampa non viene ripristinato");
  ok(appjs.indexOf("if(window.__scenePrint || window.__cabStatic) return 2") > -1, "sbLod non onora il flag stampa");
});
t("nessuna dipendenza dall'icona di libreria fissa", () => {
  ok(appjs.indexOf('drawLibFit("stagebox"') === -1, "stagebox usa ancora l'icona a 24 XLR fissi");
  ok(appjs.indexOf('drawLibFit("substg"') === -1, "substg usa ancora l'icona fissa");
});

/* ---- Vista completa vs viste layer, e selezionabilita' ---- */
console.log("\nViste layer e selezionabilita':");
t("nessuna vista selezionata: tutti i cablaggi visibili (cabLayerLive)", () => {
  A.layerSoloUI = {}; A.layerAccOpen = null; A.__cabStatic = false;
  ["cabin", "cabout", "mond", "elec"].forEach(id => ok(A.cabLayerLive(id), "layer spento in vista completa: " + id));
});
t("vista selezionata: filtra sugli altri layer", () => {
  A.__cabStatic = false; A.layerSoloUI = { cabin: true };
  ok(A.cabLayerLive("cabin"), "il layer selezionato deve restare acceso");
  ["cabout", "mond", "elec"].forEach(id => ok(!A.cabLayerLive(id), "layer non filtrato: " + id));
  A.layerSoloUI = {};
});
t("export PDF: la vista la decide la pagina, non lo stato UI", () => {
  A.__cabStatic = true; A.layerSoloUI = { cabin: true };
  ["cabin", "cabout", "mond", "elec"].forEach(id => ok(A.cabLayerLive(id), "__cabStatic deve bypassare il filtro: " + id));
  A.__cabStatic = false; A.layerSoloUI = {};
});
t("un elemento non disegnato non e' selezionabile col rettangolo", () => {
  reset(); A.layerSoloUI = {}; A.layerAccOpen = null;
  const w = add("wedge", 400, 400);
  A.stageLayerUI.vis = true; A.musLayerUI.vis = true;
  ok(A.itemPickable(w), "in vista completa dev'essere selezionabile");
  A.stageLayerUI.vis = false; A.state.cab.showReturns = false; A.state.cab.on = false;
  ok(!A.itemPickable(w), "occhi chiusi: non deve essere selezionabile");
  A.stageLayerUI.vis = true; A.state.cab.showReturns = true;
  const r = add("rack", 700, 300); const inRack = add("wedge", 700, 300); inRack.rackId = r.id;
  ok(!A.itemPickable(inRack), "elemento dentro un rack: non selezionabile");
});
t("in vista layer selezionata il contesto non e' selezionabile", () => {
  reset(); const p = add("corista", 300, 300); const box = add("stagebox", 600, 400);
  A.state.cab.on = true; A.__cabRes = null;
  A.layerSoloUI = { cabin: true };
  ok(A.itemPickable(box), "la stage box appartiene alla vista Input: selezionabile");
  ok(!A.itemPickable(p) || A.itemInSoloLayer(p), "il contesto sfumato non dev'essere selezionabile");
  A.layerSoloUI = {};
});

/* ---- Vocabolario di ricerca (SEARCH_ALIAS): come i fonici chiamano davvero le cose ---- */
console.log("\nVocabolario di ricerca (mestieri, gergo, plurali):");
t("SEARCH_ALIAS e' fuso nei TYPES (una sola fonte per le due ricerche)", () => {
  ok(A.SEARCH_ALIAS && Object.keys(A.SEARCH_ALIAS).length > 20, "tabella alias mancante o vuota");
  Object.keys(A.SEARCH_ALIAS).forEach(k => {
    ok(A.TYPES[k], "alias su un tipo inesistente: " + k);
    ok((A.TYPES[k].alias || "").indexOf(A.SEARCH_ALIAS[k].split(" ")[0]) > -1, "alias non fuso in TYPES." + k);
  });
});
t("i termini da fonico trovano l'elemento giusto", () => {
  const casi = { chitarrista: /chitarra/i, bassista: /basso/i, drummer: /batteri/i, tastierista: /tastiera|piano/i,
    pianista: /piano/i, amplificatore: /ampli|combo|stack/i, "in ear": /iem|in-ear/i,
    radiomicrofono: /wireless/i, intercom: /talkback/i, cavo: /passacavi|multicore|patch/i, alimentazione: /distro|multipresa|quadro/i,
    kick: /batteria/i, transenne: /transenna/i, seguipersona: /follow spot/i, "occhio di bue": /follow spot/i,
    router: /switch rete/i, computer: /portatile|laptop/i, spia: /wedge/i, telecamera: /camera/i, "tromba a coulisse": /trombone/i };
  Object.keys(casi).forEach(q => {
    const nomi = A.__qaSearch(q).map(r => r.nome);
    ok(nomi.length > 0, "'" + q + "' non trova nulla");
    ok(nomi.some(n => casi[q].test(n)), "'" + q + "' trova " + JSON.stringify(nomi.slice(0, 3)) + ", atteso " + casi[q]);
  });
});
/* MICROFONO AD ARCHETTO (Simone 27/07): l'archetto in testa per chi suona con le mani occupate,
   e come modalita' mic delle voci. DPA 4088 direzionale: piu' rifiuto del 4066 omni, serve con le spie. */
t("la chitarra classica musicista ha anche l'aspetto schematico", () => {
  reset();
  const it = add("musChitClassica", 300, 300);
  eq(A.hasLookToggle(it), true, "il toggle Illustrato/Schematico deve esserci");
  it.look = "schematico";
  const sch = A.TYPES.musChitClassica.draw(it);   // nel sandbox l'illustrazione e' uno stub: si verifica il ramo schematico
  // lo schematico DEVE essere identico a quello della chitarra acustica (stesso disegno, stessi accessori)
  const stessiFlag = x => ({ sedia: x.sedia, leggio: x.leggio, ampli: x.ampli, pedaliera: x.pedaliera });
  eq(sch, A.TYPES.gtacustica.draw(stessiFlag(it)), "schematico della classica ≠ schematico dell'acustica");
  [["sedia", true], ["leggio", true], ["ampli", true], ["pedaliera", true]].forEach(function (f) {
    it[f[0]] = f[1];
    eq(A.TYPES.musChitClassica.draw(it), A.TYPES.gtacustica.draw(stessiFlag(it)), "diverso con " + f[0]);
  });
});
t("l'archetto e' proposto solo a chi suona con le mani occupate", () => {
  reset();
  [["gtstand", true], ["bassstand", true], ["stagepiano", true], ["batteria", true],
   ["percussioni", true], ["djset", true], ["musChitClassica", true],
   ["saxalto", false], ["tromba", false], ["vln1", false], ["stagebox", false], ["cantante", false]]
    .forEach(c => eq(A.canHeadMic({ type: c[0] }), c[1], c[0]));
});
t("lo strumentista che canta guadagna un canale voce, in coda ai suoi", () => {
  reset(); A.state.cab.on = true; A.__cabRes = null;
  const box = add("stagebox", 850, 150); box.ch = 16;
  const g = add("gtstand", 300, 400); g.label = "Chitarra";
  const soli = A.cabItemInputs(g).length;
  g.headMic = "archetto"; A.__cabRes = null;
  const conVoce = A.cabItemInputs(g);
  eq(conVoce.length, soli + 1, "un canale in piu'");
  eq(conVoce[conVoce.length - 1].mic, "DPA 4088", "archetto direzionale");
  eq(conVoce[conVoce.length - 1].name, "Chitarra voce", "si legge nella input list");
  g.headMic = "asta"; A.__cabRes = null;
  eq(A.cabItemInputs(g).slice(-1)[0].mic, "SM58", "giraffa davanti alla bocca");
  g.headMic = "boh";
  eq(A.cabItemInputs(g).length, soli, "un valore inventato non aggiunge canali");
});
t("anche le tastiere stereo e la batteria prendono la voce", () => {
  reset(); A.state.cab.on = true; A.__cabRes = null;
  const k = add("stagepiano", 300, 300); k.headMic = "archetto";
  const mics = A.cabItemInputs(k).map(c => c.mic);
  eq(mics[mics.length - 1], "DPA 4088", "in coda ai due canali stereo: " + mics.join("+"));
  const b = add("batteria", 600, 300); b.headMic = "archetto";
  eq(A.cabItemInputs(b).length, A.cabItemInputs({ type: "batteria" }).length + 1, "batterista che canta");
});
t("archetto anche come microfono della voce", () => {
  reset();
  const c = add("cantante", 300, 300); c.label = "Voce";
  eq(A.cabItemInputs(c)[0].mic, "SM58", "di partenza e' il palmare su base tonda");
  c.micMode = "archetto";
  eq(A.micModeOf(c), "archetto", "la modalita' esiste");
  eq(A.cabItemInputs(c)[0].mic, "DPA 4088", "col archetto cambia il microfono");
});
t("l'archetto non chiede aste, la giraffa si", () => {
  reset();
  const c = add("cantante", 300, 300); c.micMode = "archetto";
  eq(A.standKindOfItem(c), "headset", "voce con archetto");
  c.micMode = "tonda"; eq(A.standKindOfItem(c), "dritta", "voce su base tonda");
  const g = add("gtstand", 500, 300); g.headMic = "archetto";
  eq(A.standKindOfItem(g), "headset", "chitarrista con archetto: nessuna asta da portare");
  g.headMic = "asta"; eq(A.standKindOfItem(g), "giraffa", "con la giraffa serve l'asta");
});
/* 27/07: la scelta dell'area di stampa vive nel PANNELLO DESTRO (variante B), non piu' in una
   finestra che entrando in modifica cadeva in basso a sinistra. */
t("il riassunto dice sempre cosa verra' stampato", () => {
  reset();
  A.state.stage.w = 1200; A.state.stage.d = 800;
  delete A.state.printFrame;
  ok(/tutto il palco/.test(A.frameSummaryText()), "senza area: " + A.frameSummaryText());
  A.state.printFrame = A.frameStageRect();
  ok(/palco esatto/.test(A.frameSummaryText()), "area = palco, va distinta: " + A.frameSummaryText());
  A.state.printFrame = { x: 100, y: 50, w: 600, h: 400 };
  ok(/area scelta/.test(A.frameSummaryText()), "area ritagliata: " + A.frameSummaryText());
  delete A.state.printFrame;
});
/* EXPORT PDF (27/07): bug trovati dall'orchestra di agenti sul codice dell'export. */
t("la scala personalizzata regge vuoto, zero, decimali e notazione esponenziale", () => {
  [["", 75], ["0", 10], ["5", 10], ["800", 500], ["1e3", 500], ["62.5", 63], ["abc", 75], [null, 75], ["-20", 10]]
    .forEach(c => eq(A.pdfScaleClamp(c[0]), c[1], "input " + JSON.stringify(c[0])));
});
// ── FORMATO E VERSO DEL FOGLIO (11/08) ─────────────────────────────────────────────────────────
// «Nel PDF c'è la scala ma non so se stamparlo in A3 o A4»: 1:100 su A3 e 1:100 su A4 sono due fogli
// diversi, e senza il formato la scala non basta per stampare. E il verso del foglio, finora sempre
// orizzontale di partenza, costa una scala intera quando il palco è più profondo che largo.
t("il cartiglio dice anche su che foglio si stampa", () => {
  eq(A.paperLabel("a4", "landscape"), "A4 orizzontale");
  eq(A.paperLabel("a3", "portrait"), "A3 verticale");
  /* e il PDF lo scrive davvero, accanto all'avvertenza sulla stampa al 100% */
  const src = readFileSync(join(root, "app.js"), "utf8");
  ok(/paperLabel\(L\.paper, L\.orient\)/.test(src), "pdfCartiglio non compone il formato dal layout");
  ok(src.indexOf('SCALA 1:"+N') > -1, "e la scala resta dov'era");
});

t("il verso del foglio si sceglie da solo, e sceglie quello che stampa più grande", () => {
  reset();
  const setStage = (w, d) => { A.state.stage = { w, d, blocks: [{ x: 0, y: 0, w, d }] }; };
  const scala = (o) => A.autoScale("a4", o, A.cartHFor("", "a4", o));

  setStage(600, 1600);   /* stretto e profondo: in orizzontale ci sta solo a 1:200, in verticale a 1:100 */
  eq(A.pdfBestOrient("a4", "auto", ""), "portrait", "orizz 1:" + scala("landscape") + " · vert 1:" + scala("portrait"));
  ok(scala("portrait") < scala("landscape"), "e il verticale guadagna davvero una scala");

  setStage(1600, 600);   /* largo e basso: il caso opposto */
  eq(A.pdfBestOrient("a4", "auto", ""), "landscape");

  /* a parità di scala il disegno stampato è IDENTICO nei due versi: non c'è ragione di girare il
     foglio, e si resta su orizzontale — il verso in cui uno stage plot si guarda. */
  setStage(1000, 1000);
  eq(scala("landscape"), scala("portrait"), "il quadrato entra uguale in tutti e due");
  eq(A.pdfBestOrient("a4", "auto", ""), "landscape", "quindi resta orizzontale");
  setStage(800, 600);
  eq(A.pdfBestOrient("a4", "auto", ""), "landscape", "il palco da club resta orizzontale");
});

t("la scelta automatica vale anche con una scala fissata a mano", () => {
  reset();
  A.state.stage = { w: 600, d: 1600, blocks: [{ x: 0, y: 0, w: 600, d: 1600 }] };
  /* a 1:100 il palco profondo 16 m entra solo in verticale: chi non entra ritaglia, e chi ritaglia perde */
  eq(A.pdfBestOrient("a4", "100", ""), "portrait");
  const box = A.pdfStageBox(100, "a4", "portrait", A.cartHFor("", "a4", "portrait"));
  eq(box.cropped, false, "e in verticale ci sta tutto");
});

t("l'altezza del cartiglio e' una sola per anteprima, avviso ed export", () => {
  const corto = A.cartHFor("", "a4", "landscape");
  const lungo = A.cartHFor("x".repeat(120), "a4", "portrait");
  eq(corto, 22, "senza riferimento il cartiglio e' quello base");
  ok(lungo > corto, "un riferimento lungo alza il cartiglio: " + lungo);
  // la scala automatica deve tenerne conto: con cartiglio piu' alto c'e' meno area di disegno
  const largo = A.autoScale("a4", "portrait", 22), stretto = A.autoScale("a4", "portrait", lungo);
  ok(stretto >= largo, "col cartiglio alto la scala non puo' essere piu' generosa");
});
t("la nota interna di un contatto non finisce nel PDF", () => {
  const src = readFileSync(join(root, "app.js"), "utf8").match(/heading\("CONTATTI E RUOLI"\);[\s\S]{0,400}?\}\); \}/);
  ok(src, "sezione contatti del rider non trovata");
  eq(/c\.note/.test(src[0]), false, "la nota del contatto e' un appunto interno: " + src[0].slice(0, 200));
});
t("il riferimento del cartiglio, se svuotato, resta svuotato", () => {
  eq(A.pdfHeaderPropose({ pdfHeader: "Mario · 333" }, null), "Mario · 333", "quello scelto vale");
  eq(A.pdfHeaderPropose({ pdfHeader: "", pdfHeaderOff: true }, { name: "Simone", contact: "s@x.it" }), "",
    "svuotato apposta: non si ripropone l'account");
  ok(A.pdfHeaderPropose({}, { name: "Simone", contact: "s@x.it" }).indexOf("Simone") > -1,
    "mai impostato: la proposta ci sta");
});
/* 27/07: elemento FORMA — un tipo con l'asse `shape`, sei voci nel catalogo, testo dentro. */
t("la forma e' un tipo solo, con sei geometrie", () => {
  reset();
  eq(A.SHAPES.length, 6, "rettangolo, cerchio, triangolo, rombo, freccia, linea");
  const it = add("forma", 300, 300);
  eq(A.shapeOf(it), "rect", "di default e' un rettangolo");
  it.shape = "circle"; eq(A.shapeOf(it), "circle", "cambia geometria senza cambiare tipo");
  it.shape = "inventata"; eq(A.shapeOf(it), "rect", "una geometria sconosciuta torna al rettangolo");
  eq(A.shapeFillOf({}), "#0d9488", "colore di default");
  eq(A.shapeFillOf({ fill: "javascript:alert(1)" }), "#0d9488", "un colore non valido non entra nel disegno");
  eq(A.shapeStyleOf({ shapeStyle: "dashed" }), "dashed");
  eq(A.shapeStyleOf({ shapeStyle: "boh" }), "solid");
});
t("ogni geometria disegna qualcosa di suo, col colore scelto", () => {
  reset();
  const it = add("forma", 300, 300); it.fill = "#b45309";
  const markup = {};
  A.SHAPES.forEach(sh => { it.shape = sh[0]; markup[sh[0]] = A.drawShape(it); });
  ok(/ellipse/.test(markup.circle), "cerchio = ellisse");
  ok(/polygon/.test(markup.tri) && /polygon/.test(markup.rhombus) && /polygon/.test(markup.arrow), "triangolo, rombo e freccia sono poligoni");
  ok(/rect/.test(markup.rect) && /rect/.test(markup.line), "rettangolo e linea");
  ok(markup.rect.indexOf("#b45309") > -1, "il colore scelto finisce nel disegno");
  const uniche = new Set(Object.values(markup));
  eq(uniche.size, 6, "sei disegni diversi");
});
t("il testo dentro la forma si allinea come quello libero", () => {
  reset();
  const f = add("forma", 300, 300); f.label = "BACKLINE";
  ok(A.drawShape(f).indexOf('text-anchor="middle"') > -1, "nella forma il testo nasce centrato");
  f.align = "right";
  ok(A.drawShape(f).indexOf('text-anchor="end"') > -1, "a destra");
  const t2 = add("testo", 500, 300); t2.label = "Note di palco";
  ok(A.drawTextBox(t2).indexOf('text-anchor="start"') > -1, "il testo libero nasce a sinistra");
  t2.align = "center";
  ok(A.drawTextBox(t2).indexOf('text-anchor="middle"') > -1, "centrato");
  t2.align = "right";
  const m = A.drawTextBox(t2);
  ok(m.indexOf('text-anchor="end"') > -1 && m.indexOf('x="' + (t2.w / 2 - 8) + '"') > -1, "a destra, ancorato al bordo");
});
/* Il bug del 27/07: l'allineamento non si vedeva e nella forma il testo usciva dal riquadro, perché
   .txtbox-line{text-anchor:start} nel CSS batteva l'attributo sul <text> (proprietà di presentazione:
   la regola di classe vince). Questo test presidia il CSS, non solo il markup. */
t("nessuna regola CSS puo' ribaltare l'allineamento del testo", () => {
  const regola = (stylesCss.match(/\.txtbox-line\{[^}]*\}/) || [""])[0];
  ok(regola, "regola .txtbox-line non trovata");
  eq(/text-anchor/.test(regola), false, "text-anchor nel CSS batterebbe l'attributo: " + regola);
  const f = { type: "forma", w: 200, d: 120, label: "x", align: "right" };
  const m = A.drawShape(f);
  ok(m.indexOf('text-anchor="end"') > -1 && /style="[^"]*text-anchor:end/.test(m),
    "l'allineamento va anche nello style inline, cosi' nessuna classe lo ribalta");
});
t("cercando una geometria si trova la voce giusta", () => {
  reset();
  const primi = q => A.__qaSearch(q).map(r => r.nome)[0];
  eq(primi("quadrato"), "Rettangolo", "quadrato → rettangolo");
  eq(primi("cerchio"), "Cerchio");
  eq(primi("triangolo"), "Triangolo");
  eq(primi("rombo"), "Rombo");
  eq(primi("freccia"), "Freccia");
});
/* 27/07 (Simone): «l'etichetta deve partire sempre dal nome intero; la sigla la sceglie l'utente,
   e gli si chiede se applicarla a tutti gli strumenti simili». */
t("l'etichetta di un elemento nuovo e' il nome intero, non la sigla", () => {
  reset();
  const it = add("cantante", 300, 300);
  eq(it.labelMode, undefined, "il default non si memorizza");
  eq(A.lblText("Voce solista", it, true), "Voce solista", "deve uscire il nome intero");
  it.labelMode = "abbr";
  ok(A.lblText("Voce solista", it, true).length < "Voce solista".length, "in sigla il testo si accorcia");
  it.labelMode = "hidden";
  eq(A.lblText("Voce solista", it, true), "", "nascosta");
});
t("la sigla si puo' estendere agli altri elementi dello stesso tipo", () => {
  reset();
  const a = add("cantante", 200, 300), b = add("cantante", 400, 300), c = add("astamic", 600, 300);
  a.labelMode = "abbr";
  const simili = A.state.items.filter(o => o !== a && o.type === a.type && (o.labelMode || "full") !== "abbr");
  eq(simili.length, 1, "un solo cantante da convertire");
  simili.forEach(o => { o.labelMode = "abbr"; });
  eq(b.labelMode, "abbr", "il secondo cantante segue");
  eq(c.labelMode, undefined, "l'asta microfono non c'entra: resta col nome intero");
});
/* 27/07 (Simone), dopo la prova sul campo: la pedana torna FRA GLI ELEMENTI — serve anche come
   singola area rialzata da posare — e resta parte del palco (si muove in «Palco e pedane»). */
t("la pedana e' un elemento del catalogo e porta anche al costruttore", () => {
  const quick = A.__qaSearch("pedana").map(r => r.nome);
  ok(quick.some(n => /^Pedana 2/i.test(n)), "la pedana singola deve esserci: " + JSON.stringify(quick));
  const voci = (A.__catEntries || []).filter(e => /pedana|praticabile/i.test((e.nome || "") + " " + (e.kw || "")));
  ok(voci.some(e => e.k === "pedana"), "voce di catalogo per il tipo pedana");
  ok(voci.some(e => e.nome === "Forma del palco"), "cercando pedana si trova anche il costruttore del palco");
  eq(A.TYPES.pedana.resizable, true, "si allunga trascinando");
});
t("nessun alias inquina le query comuni (la ricerca e' una substring)", () => {
  /* "monitor" deve restare la query dei wedge: se un alias ci infila il LED wall, e' rumore */
  ok(!A.__qaSearch("monitor").map(r => r.nome).slice(0, 3).some(n => /LED wall/i.test(n)), "'monitor' inquinato dal video");
  ok(A.__qaSearch("mic").map(r => r.k).indexOf("micchoir") > -1, "'mic' non trova piu' i microfoni");
  /* "piano" puo' legittimamente pescare le tastiere (stage piano), non altro */
  ok(A.__qaSearch("piano").map(r => r.nome).every(n => /piano|panchetta|tastiera/i.test(n)), "'piano' ha preso risultati fuori tema");
});
t("il match a META' parola non scavalca quello a inizio parola", () => {
  /* difetto storico: "Bagno chi-mic-o" davanti a microfoni e aste perche' il nome contiene "mic" */
  const mic = A.__qaSearch("mic").map(r => r.nome);
  const bagno = mic.findIndex(n => /Bagno chimico/i.test(n));
  const overhead = mic.findIndex(n => /Overhead/i.test(n));
  ok(overhead > -1, "'mic' perde l'overhead di sezione");
  ok(bagno === -1 || bagno > overhead, "il bagno chimico scavalca ancora i microfoni");
  ok(A.__qaSearch("mic").slice(0, 4).every(r => /mic/i.test(r.nome)), "i primi 4 di 'mic' non sono microfoni");
});
t("ogni parola del vocabolario funziona su ENTRAMBE le ricerche", () => {
  const parole = new Set();
  Object.values(A.SEARCH_ALIAS).forEach(s => s.split(/\s+/).forEach(w => { if (w.length > 3) parole.add(w); }));
  parole.forEach(w => {
    ok(A.__spSearch(w).length > 0, "catalogo a zero su: " + w);
    ok(A.__qaSearch(w).length > 0, "quick-add a zero su: " + w);
  });
});

/* ---- Striscia value-proposition (SEO-06): RIMOSSA il 24/07 ----
   Al primo accesso finiva sempre dietro la welcome card (z-index 6 vs 50, sottoalbero inert) e li' si
   marcava "vista": non era mai utilmente visibile, e la welcome card dice gia' le stesse cose.
   Questi test presidiano la rimozione completa: niente markup, CSS o script orfani. */
console.log("\nStriscia value-proposition (#homePromo, rimossa):");
const indexHtml = readFileSync(join(root, "app/index.html"), "utf8");
t("nessun residuo nell'HTML generato", () => {
  ["homePromo", "hp-text", "hp-cta", "hpStart", "hpClose", "hpSeen", "hpDismiss"].forEach(s =>
    ok(indexHtml.indexOf(s) === -1, "residuo in index.html: " + s));
});
t("nessuna regola CSS orfana", () => { ok(stylesCss.indexOf("homePromo") === -1 && stylesCss.indexOf("hp-cta") === -1); });
t("nessun residuo nel bundle app.js", () => { ok(appjs.indexOf("homePromo") === -1 && appjs.indexOf("hpSeen") === -1); });
t("il canvas resta il primo figlio di <main> (nessun overlay in cima)", () => {
  ok(/<main><svg id="svg"/.test(indexHtml), "struttura di <main> alterata dalla rimozione");
});

/* ---- Popup dimensioni palco: validazione, gating dallo stato, creazione palco ---- */
console.log("\nPopup dimensioni palco:");
t("parseStageDim: accetta interi/decimali con . o , e spazi", () => { eq(A.parseStageDim("8"), 8); eq(A.parseStageDim("6,5"), 6.5); eq(A.parseStageDim("6.5"), 6.5); eq(A.parseStageDim(" 10 "), 10); });
t("parseStageDim: rifiuta zero/negativi/vuoto/testo/incompleto", () => { eq(A.parseStageDim("0"), null); eq(A.parseStageDim("-3"), null); eq(A.parseStageDim(""), null); eq(A.parseStageDim("abc"), null); eq(A.parseStageDim("3."), null); });
t("isFreshBlankProject: true su progetto vuoto default (nuovo esplicito)", () => {
  reset(); A.location.hash = ""; const f = A.foreignDoc; A.foreignDoc = function () { return false; };
  try { ok(A.isFreshBlankProject(true) === true); } finally { A.foreignDoc = f; }
});
t("isFreshBlankProject: false se c'è già lavoro (titolo)", () => {
  reset(); A.location.hash = ""; const f = A.foreignDoc; A.foreignDoc = function () { return false; }; A.state.titolo = "X";
  try { ok(A.isFreshBlankProject(true) === false); } finally { A.foreignDoc = f; A.state.titolo = ""; }
});
t("isFreshBlankProject: false su viewer/consulenza (foreignDoc)", () => {
  reset(); A.location.hash = ""; const f = A.foreignDoc; A.foreignDoc = function () { return true; };
  try { ok(A.isFreshBlankProject(true) === false); } finally { A.foreignDoc = f; }
});
t("isFreshBlankProject: deep-link #p= soppresso, ma 'Nuovo' esplicito lo ignora", () => {
  reset(); A.location.hash = "#p=abc"; const f = A.foreignDoc; A.foreignDoc = function () { return false; };
  try { ok(A.isFreshBlankProject(false) === false, "deep-link non deve mostrare il popup"); ok(A.isFreshBlankProject(true) === true, "File→Nuovo ignora l'hash residuo"); } finally { A.foreignDoc = f; A.location.hash = ""; }
});
t("isFreshBlankProject: guarda il DOCUMENTO, non la sola variante attiva", () => {
  reset(); A.location.hash = ""; const f = A.foreignDoc; A.foreignDoc = function () { return false; };
  const vs = A.VARIANTS.slice();
  try {
    ok(A.isFreshBlankProject(true) === true, "documento davvero vuoto: il popup misure ci vuole");
    A.VARIANTS.push({ name: "Variante B", state: { titolo: "Lavoro esistente", items: [] } });
    ok(A.isFreshBlankProject(true) === false, "seconda variante con lavoro: non e' un progetto nuovo");
  } finally { A.foreignDoc = f; A.VARIANTS.length = 0; vs.forEach(v => A.VARIANTS.push(v)); }
});
t("applyStageSize: rettangolo singolo centrato con le misure (m→cm)", () => {
  reset(); A.applyStageSize(10, 7, false);
  eq(A.state.stage.w, 1000); eq(A.state.stage.d, 700); eq(A.state.stage.blocks.length, 1);
  eq(A.state.stage.blocks[0].x, 0); eq(A.state.stage.blocks[0].y, 0); eq(A.state.stage.blocks[0].w, 1000); eq(A.state.stage.blocks[0].d, 700);
  ok(!A.state.stage._provisional);
});
t("applyStageSize provvisorio: marca _provisional (dimensioni da confermare)", () => { reset(); A.applyStageSize(8, 6, true); ok(A.state.stage._provisional === true); });
t("stateHasMeaningfulWork: false su default, true dopo un palco custom", () => {
  reset(); ok(A.stateHasMeaningfulWork(A.state) === false); A.applyStageSize(9, 5, false); ok(A.stateHasMeaningfulWork(A.state) === true);
});

/* ---- Audit raggiungibile (regressione: ingresso perso con la rimozione di "Liste tecniche" il 17/07) ---- */
console.log("\nAudit progetto (raggiungibilità):");
t("il catalogo espone la voce-azione 'Audit progetto'", () => {
  const e = (A.__catEntries || []).find(x => x.nome === "Audit progetto");
  ok(e, "voce 'Audit progetto' assente dal catalogo (ingresso Audit perso)");
  ok(typeof e.action === "function", "la voce Audit non ha un'azione");
});
t("toggleAuditView accende auditActive (unico gate del pannello #auditSec)", () => {
  A.auditActive = false; A.toggleAuditView(); ok(A.auditActive === true, "toggleAuditView non ha attivato l'audit"); A.auditActive = false;
});
t("ricerca 'audit' e 'controlla' trovano l'Audit", () => {
  ok(A.__spSearch("audit").some(r => r.nome === "Audit progetto"), "'audit' non trova l'Audit");
  ok(A.__spSearch("controlla").some(r => r.nome === "Audit progetto"), "'controlla' (alias) non trova l'Audit");
});

/* ---- Undo: printFrame (area di stampa/export) escluso dalla cronologia (bug undo poco prevedibile) ---- */
console.log("\nUndo / printFrame:");
t("printFrame NON crea passi di undo (mutazione invisibile dell'export)", () => {
  reset(); A.resetHistory();
  add("batteria", 400, 400);
  const before = A.undoStack.length;
  A.state.printFrame = { x: 0, y: 0, w: 500, h: 500 }; A.save();
  A.state.printFrame = { x: 0, y: 0, w: 700, h: 700 }; A.save();
  eq(A.undoStack.length, before, "printFrame ha creato passi di undo");
});
t("printFrame è preservato attraverso undo (non è contenuto undoable)", () => {
  reset(); A.resetHistory();
  add("cantante", 300, 300);
  A.state.printFrame = { x: 1, y: 2, w: 300, h: 300 }; A.save();
  add("comboamp", 200, 200);
  A.undo();
  ok(A.state.printFrame && A.state.printFrame.w === 300, "printFrame perso dopo undo");
});
t("undo di un elemento reale funziona ancora (non regredito)", () => {
  reset(); A.resetHistory();
  add("batteria", 400, 400);
  eq(A.state.items.length, 1);
  A.undo();
  eq(A.state.items.length, 0, "undo non ha rimosso l'elemento");
});
t("helper export toast esposti (pdfSave/toastDownloaded)", () => {
  ok(typeof A.pdfSave === "function" && typeof A.toastDownloaded === "function");
});

/* ===================================================================================
   LUCI COME REPARTO (blocco A) — le luci smettono di essere icone mute e diventano
   una richiesta: funzione, quantità, apparecchio, temperatura, posizione.
   La riga della lista è la fonte del numero; le icone sul palco la illustrano.
   =================================================================================== */
console.log("\n— Luci: modello e migrazione —");

t("le sorgenti luminose sul palco diventano righe, una per tipo", () => {
  reset();
  add("sagomatore", 100, 100); add("sagomatore", 200, 100);
  add("parluci", 300, 100); add("parluci", 400, 100); add("parluci", 500, 100);
  const L = A.lightsFromItems(A.state.items);
  eq(L.rows.length, 2, "attese 2 righe (sagomatore, parluci)");
  const sag = L.rows.filter((r) => r.gear === "sagomatore")[0];
  const par = L.rows.filter((r) => r.gear === "parluci")[0];
  eq(sag.n, 2, "sagomatori"); eq(par.n, 3, "PAR/wash");
  eq(sag.items.length, 2, "icone agganciate al sagomatore");
});

t("la funzione nasce vuota: nessuno indovina se un sagomatore è frontale o contro", () => {
  reset();
  add("sagomatore", 100, 100);
  eq(A.lightsFromItems(A.state.items).rows[0].fn, "");
});

t("struttura e regia non diventano richieste luci", () => {
  reset();
  add("americana", 300, 50); add("consolaluci", 100, 600); add("dimmerluci", 200, 600);
  eq(A.lightsFromItems(A.state.items).rows.length, 0);
});

t("le macchine d'atmosfera invece si chiedono", () => {
  reset();
  add("fumomachine", 100, 100); add("hazer", 200, 100);
  eq(A.lightsFromItems(A.state.items).rows.length, 2);
});

t("un progetto senza luci non produce righe", () => {
  reset();
  add("cantante", 300, 300);
  eq(A.lightsFromItems(A.state.items).rows.length, 0);
});

t("normalizeState costruisce le luci dai progetti che non le avevano (v5 → v6)", () => {
  const s = A.normalizeState({ items: [{ id: "x1", type: "sagomatore", x: 10, y: 10 }] });
  ok(s.lights && Array.isArray(s.lights.rows), "state.lights mancante dopo la migrazione");
  eq(s.lights.rows.length, 1);
  eq(s.lights.rows[0].n, 1);
  eq(s.lights.blackout, null, "l'oscurabilità non si inventa");
});

t("normalizeState non tocca le luci già dichiarate", () => {
  const s = A.normalizeState({
    items: [{ id: "x1", type: "sagomatore", x: 10, y: 10 }],
    lights: { rows: [{ id: "r1", fn: "frontale", n: 4, gear: "sagomatore", items: [] }], blackout: true, mood: "calda" },
  });
  eq(s.lights.rows.length, 1);
  eq(s.lights.rows[0].n, 4, "la quantità scritta a mano è stata sovrascritta");
  eq(s.lights.blackout, true);
});

t("la quantità non scende mai sotto le icone disegnate", () => {
  const rows = [{ id: "r1", fn: "frontale", n: 4, gear: "sagomatore", items: ["a", "b"] }];
  eq(A.lightsNormalizeRows(rows, ["a", "b"])[0].n, 4, "4 richieste con 2 disegnate deve restare 4");
});

t("disegnare una quinta icona alza la quantità richiesta", () => {
  const rows = [{ id: "r1", fn: "frontale", n: 4, gear: "sagomatore", items: ["a", "b", "c", "d", "e"] }];
  eq(A.lightsNormalizeRows(rows, ["a", "b", "c", "d", "e"])[0].n, 5);
});

t("un'icona cancellata dal palco si stacca dalla riga ma non abbassa la richiesta", () => {
  const rows = [{ id: "r1", fn: "frontale", n: 4, gear: "sagomatore", items: ["a", "b"] }];
  const out = A.lightsNormalizeRows(rows, ["a"]);   /* "b" non è più sul palco */
  eq(out[0].items, ["a"], "l'icona morta è rimasta agganciata");
  eq(out[0].n, 4, "la richiesta è stata abbassata da una cancellazione");
});

t("dividere una riga da 4 in 2+2 spartisce le icone e non cambia il totale", () => {
  const rows = [{ id: "r1", fn: "", n: 4, gear: "sagomatore", items: ["a", "b", "c", "d"] }];
  const out = A.lightsSplitRow(rows, "r1", 2);
  eq(out.length, 2, "attese due righe dopo la divisione");
  eq(out[0].n + out[1].n, 4, "il totale è cambiato");
  eq(out[0].items.length, 2); eq(out[1].items.length, 2);
  ok(out[0].id !== out[1].id, "le due righe hanno lo stesso id");
  eq(out[1].gear, "sagomatore", "l'apparecchio non è stato ereditato");
});

t("dividere una riga da 4 lasciando 1 dà 3 + 1", () => {
  const rows = [{ id: "r1", fn: "frontale", n: 4, gear: "sagomatore", items: [] }];
  const out = A.lightsSplitRow(rows, "r1", 1);
  eq([out[0].n, out[1].n], [3, 1]);
});

t("non si divide una riga da 1", () => {
  const rows = [{ id: "r1", fn: "frontale", n: 1, gear: "sagomatore", items: [] }];
  eq(A.lightsSplitRow(rows, "r1", 1).length, 1, "una riga da 1 è stata divisa");
});

console.log("\n— Luci: il testo del rider —");

/* Il caso che ha motivato il blocco A: un rider impaginato a mano fuori dal software.
   Questo test è il contratto — le stesse parole devono uscire dal dato. */
function riderLights() {
  return {
    blackout: true, mood: "calda, morbida e teatrale",
    rows: [
      { id: "r1", fn: "frontale", n: 4, gear: "proiettori LED Warm White", gearAlt: "sagomatori LED", color: "3200 K", items: [] },
      { id: "r2", fn: "controluce", n: 4, gear: "proiettori LED Warm White", items: [] },
      { id: "r3", fn: "fondale", n: 3, gear: "Wash LED RGBW", items: [] },
    ],
  };
}

t("l'oscurabilità dichiarata apre la sezione luci", () => {
  const L = A.lightsRiderLines(riderLights());
  eq(L[0], { kind: "p", text: "Lo spettacolo richiede un ambiente completamente oscurabile." });
});

t("una richiesta con alternativa e temperatura si legge come nel rider vero", () => {
  const L = A.lightsRiderLines(riderLights());
  eq(L[1], { kind: "h", text: "Frontale" });
  eq(L[2], { kind: "li", text: "n.4 proiettori LED Warm White oppure sagomatori LED 3200 K." });
});

t("una richiesta senza alternativa né temperatura resta asciutta", () => {
  const L = A.lightsRiderLines(riderLights());
  eq(L[4], { kind: "li", text: "n.4 proiettori LED Warm White." });
});

t("il clima chiude la sezione", () => {
  const L = A.lightsRiderLines(riderLights());
  eq(L[L.length - 1], { kind: "p", text: "L'illuminazione dovrà essere calda, morbida e teatrale." });
});

t("gli apparecchi di catalogo si declinano al plurale", () => {
  const L = A.lightsRiderLines({ blackout: null, mood: "", rows: [{ id: "r1", fn: "frontale", n: 4, gear: "sagomatore", items: [] }] });
  eq(L[1], { kind: "li", text: "n.4 sagomatori." });
});

t("un solo apparecchio resta al singolare", () => {
  const L = A.lightsRiderLines({ blackout: null, mood: "", rows: [{ id: "r1", fn: "frontale", n: 1, gear: "sagomatore", items: [] }] });
  eq(L[1], { kind: "li", text: "n.1 sagomatore." });
});

t("la posizione con altezza entra nella richiesta", () => {
  const L = A.lightsRiderLines({ blackout: null, mood: "", rows: [{ id: "r1", fn: "controluce", n: 4, gear: "sagomatore", pos: "elevatore", posH: "4", items: [] }] });
  eq(L[1], { kind: "li", text: "n.4 sagomatori su elevatore a 4 m." });
});

t("due richieste con la stessa funzione stanno sotto una sola intestazione", () => {
  const L = A.lightsRiderLines({ blackout: null, mood: "", rows: [
    { id: "r1", fn: "frontale", n: 2, gear: "sagomatore", items: [] },
    { id: "r2", fn: "frontale", n: 3, gear: "parluci", items: [] },
  ] });
  eq(L.filter((x) => x.kind === "h").length, 1, "intestazione Frontale duplicata");
  eq(L.filter((x) => x.kind === "li").length, 2);
});

t("le funzioni escono nell'ordine del mestiere, non di inserimento", () => {
  const L = A.lightsRiderLines({ blackout: null, mood: "", rows: [
    { id: "r1", fn: "fondale", n: 3, gear: "parluci", items: [] },
    { id: "r2", fn: "frontale", n: 4, gear: "sagomatore", items: [] },
  ] });
  eq(L.filter((x) => x.kind === "h").map((x) => x.text), ["Frontale", "Fondale / ciclorama"]);
});

t("una richiesta ancora senza funzione non viene inventata", () => {
  const L = A.lightsRiderLines({ blackout: null, mood: "", rows: [{ id: "r1", fn: "", n: 4, gear: "sagomatore", items: [] }] });
  eq(L.filter((x) => x.kind === "h").map((x) => x.text), ["Funzione da assegnare"]);
});

t("senza luci dichiarate la sezione non esiste", () => {
  eq(A.lightsRiderLines({ blackout: null, mood: "", rows: [] }), []);
});

t("il testo del rider scritto a mano vince sulla lista", () => {
  reset();
  A.state.lights = riderLights();
  A.state.rider = { luci: "Le luci le porta la produzione." };
  eq(A.riderData().luci, "Le luci le porta la produzione.");
});

t("senza testo a mano il rider prende la sezione generata dalla lista", () => {
  reset();
  A.state.lights = riderLights();
  ok(A.riderData().luci.indexOf("n.4 proiettori LED Warm White oppure sagomatori LED 3200 K.") >= 0,
    "la richiesta generata non è finita nel rider");
});

console.log("\n— Luci: le regole di audit —");

function lightRules() { return (A.auditEngine().findings || []).map((x) => x.rule).filter(Boolean); }
function hasRule(k) { return lightRules().indexOf(k) >= 0; }

t("L1 — una richiesta senza funzione viene contestata", () => {
  reset(); add("sagomatore", 100, 100);
  A.state.lights = { rows: [A.lightRow({ fn: "", n: 4, gear: "sagomatore", color: "3200 K" })], blackout: true, mood: "" };
  ok(hasRule("luci-fn"), "L1 non è scattata");
});

t("L1 tace quando ogni richiesta dice cosa fa", () => {
  reset(); add("sagomatore", 100, 100);
  A.state.lights = { rows: [A.lightRow({ fn: "frontale", n: 4, gear: "sagomatore", color: "3200 K" })], blackout: true, mood: "" };
  ok(!hasRule("luci-fn"), "L1 è scattata a torto");
});

t("L2 — con delle luci in lista l'oscurabilità va dichiarata", () => {
  reset(); add("sagomatore", 100, 100);
  A.state.lights = { rows: [A.lightRow({ fn: "frontale", n: 4, gear: "sagomatore", color: "3200 K" })], blackout: null, mood: "" };
  ok(hasRule("luci-blackout"), "L2 non è scattata");
});

t("L2 tace anche quando la risposta è «no»", () => {
  reset(); add("sagomatore", 100, 100);
  A.state.lights = { rows: [A.lightRow({ fn: "frontale", n: 4, gear: "sagomatore", color: "3200 K" })], blackout: false, mood: "" };
  ok(!hasRule("luci-blackout"), "una risposta negativa vale come dichiarazione");
});

t("L2 tace su un progetto senza luci", () => {
  reset(); add("cantante", 300, 300);
  ok(!hasRule("luci-blackout"));
});

t("L3 — una sorgente senza temperatura o colore non è un'informazione", () => {
  reset(); add("sagomatore", 100, 100);
  A.state.lights = { rows: [A.lightRow({ fn: "frontale", n: 4, gear: "sagomatore", color: "" })], blackout: true, mood: "" };
  ok(hasRule("luci-colore"), "L3 non è scattata");
});

t("L3 non chiede il colore a una macchina del fumo", () => {
  reset(); add("fumomachine", 100, 100);
  A.state.lights = { rows: [A.lightRow({ fn: "effetto", n: 1, gear: "fumomachine", color: "" })], blackout: true, mood: "" };
  ok(!hasRule("luci-colore"), "L3 è scattata su una macchina d'atmosfera");
});

t("L4 — delegare le luci senza dire cosa serve viene contestato", () => {
  reset();
  A.state.production = { asked: true, depts: [], systems: { luci: { ans: "venue", note: "" } } };
  A.state.lights = { rows: [], blackout: null, mood: "" };
  ok(hasRule("luci-delega-vuota"), "L4 non è scattata");
});

t("L4 tace se la lista dice cosa serve alla venue", () => {
  reset(); add("sagomatore", 100, 100);
  A.state.production = { asked: true, depts: [], systems: { luci: { ans: "venue", note: "" } } };
  A.state.lights = { rows: [A.lightRow({ fn: "frontale", n: 4, gear: "sagomatore", color: "3200 K" })], blackout: true, mood: "" };
  ok(!hasRule("luci-delega-vuota"), "L4 è scattata con la lista piena");
});

t("L5 — un elevatore senza altezza lascia due spettacoli possibili", () => {
  reset(); add("sagomatore", 100, 100);
  A.state.lights = { rows: [A.lightRow({ fn: "frontale", n: 4, gear: "sagomatore", color: "3200 K", pos: "elevatore", posH: "" })], blackout: true, mood: "" };
  ok(hasRule("luci-altezza"), "L5 non è scattata");
});

t("L5 non chiede l'altezza di una luce a terra", () => {
  reset(); add("sagomatore", 100, 100);
  A.state.lights = { rows: [A.lightRow({ fn: "fondale", n: 3, gear: "sagomatore", color: "RGBW", pos: "terra", posH: "" })], blackout: true, mood: "" };
  ok(!hasRule("luci-altezza"), "L5 è scattata su una luce a terra");
});

t("L6 — i cartelli scritti a mano vicino alle luci vengono intercettati", () => {
  reset();
  add("sagomatore", 100, 100);
  const txt = add("testo", 180, 100);
  txt.label = "Nota di regia";
  A.state.lights = { rows: [A.lightRow({ fn: "frontale", n: 1, gear: "sagomatore", color: "3200 K" })], blackout: true, mood: "" };
  ok(hasRule("luci-cartelli"), "L6 non è scattata");
});

t("L6 lascia in pace un testo lontano che non parla di luci", () => {
  reset();
  add("sagomatore", 100, 100);
  const txt = add("testo", 900, 900);
  txt.label = "SET LIST";
  A.state.lights = { rows: [A.lightRow({ fn: "frontale", n: 1, gear: "sagomatore", color: "3200 K" })], blackout: true, mood: "" };
  ok(!hasRule("luci-cartelli"), "L6 è scattata su un testo lontano che non parla di luci");
});

/* Il caso reale: il cartello del frontale sta a 2,7 m dalla luce più vicina — fuori da
   qualunque soglia ragionevole. Ma PARLA di luci, e il palco ne ha: tanto basta. */
t("L6 riconosce un cartello che parla di luci anche se è lontano", () => {
  reset();
  add("sagomatore", 100, 100);
  const txt = add("testo", 900, 900);
  txt.label = "FRONTALE SU ELEVATORE 4M CON PAR CALDI";
  A.state.lights = { rows: [A.lightRow({ fn: "frontale", n: 1, gear: "sagomatore", color: "3200 K" })], blackout: true, mood: "" };
  ok(hasRule("luci-cartelli"), "un cartello che nomina frontale, elevatore e PAR non è stato riconosciuto");
});

t("L6 tace se sul palco non c'è nessuna luce", () => {
  reset();
  const txt = add("testo", 100, 100);
  txt.label = "FRONTALE SU ELEVATORE 4M CON PAR CALDI";
  ok(!hasRule("luci-cartelli"), "senza luci sul palco non è una nota sulle luci");
});

t("il cartello diventa una nota del reparto, non di una richiesta a caso", () => {
  reset();
  add("sagomatore", 100, -50);          /* i contro, in alto */
  const wash = add("parluci", 300, 50); /* i wash, più vicini al cartello del contro */
  const txt = add("testo", 300, -100);
  txt.label = "CONTRO SU ELEVATORE 4M CON PAR CALDI";
  A.state.lights = A.lightsFromItems(A.state.items);
  const f = A.auditEngine().findings.filter((x) => x.rule === "luci-cartelli")[0];
  f.act.run();
  eq(A.state.items.filter((i) => i.type === "testo").length, 0, "il cartello è rimasto sul palco");
  eq(A.state.lights.notes, ["CONTRO SU ELEVATORE 4M CON PAR CALDI"], "il testo non è finito nelle note del reparto");
  ok(A.state.lights.rows.every((r) => !r.note), "il testo è stato attribuito a una richiesta: non si può indovinare di quale luce parli");
});

t("le note del reparto finiscono in fondo alla sezione luci del rider", () => {
  const L = A.lightsRiderLines({ blackout: null, mood: "", notes: ["CONTRO SU ELEVATORE 4 M"],
    rows: [A.lightRow({ fn: "frontale", n: 4, gear: "sagomatore" })] });
  eq(L[L.length - 1], { kind: "li", text: "CONTRO SU ELEVATORE 4 M" });
});

console.log("\n— Luci: le etichette a bordo palco —");

t("una richiesta disegnata porta la sua etichetta sul palco", () => {
  reset();
  const a = add("sagomatore", 100, -50), b = add("sagomatore", 500, -50);
  A.state.lights = { rows: [A.lightRow({ fn: "controluce", n: 4, gear: "sagomatore", color: "LED warm 3200 K", pos: "elevatore", posH: "4", items: [a.id, b.id] })], blackout: true, mood: "" };
  const lab = A.lightsLabels();
  eq(lab.length, 1);
  eq(lab[0].text, "CONTROLUCE SU ELEVATORE A 4 M · LED WARM 3200 K");
});

t("l'etichetta si posa al centro delle icone di quella richiesta", () => {
  reset();
  const a = add("sagomatore", 100, -50), b = add("sagomatore", 500, -50);
  A.state.lights = { rows: [A.lightRow({ fn: "controluce", n: 2, gear: "sagomatore", pos: "elevatore", posH: "4", items: [a.id, b.id] })], blackout: true, mood: "" };
  eq(A.lightsLabels()[0].x, 300, "non è a metà fra le due icone");
});

t("una richiesta non ancora disegnata non scrive nulla sul palco", () => {
  reset();
  A.state.lights = { rows: [A.lightRow({ fn: "frontale", n: 4, gear: "sagomatore", pos: "elevatore", posH: "4", items: [] })], blackout: true, mood: "" };
  eq(A.lightsLabels().length, 0);
});

t("senza niente da dire non compare nessuna etichetta", () => {
  reset();
  const a = add("sagomatore", 100, -50);
  A.state.lights = { rows: [A.lightRow({ fn: "", n: 1, gear: "sagomatore", items: [a.id] })], blackout: null, mood: "" };
  eq(A.lightsLabels().length, 0, "un'etichetta vuota è peggio di nessuna etichetta");
});

t("la sola funzione basta per meritare un'etichetta", () => {
  reset();
  const a = add("sagomatore", 100, -50);
  A.state.lights = { rows: [A.lightRow({ fn: "frontale", n: 1, gear: "sagomatore", items: [a.id] })], blackout: null, mood: "" };
  eq(A.lightsLabels()[0].text, "FRONTALE");
});


/* ================= MONTAGGIO DEI FARI (Simone 29/07) ==========================================
   Il faro a terra, su stativo e appeso sono tre montaggi diversi: cambia il materiale e cambia
   l'altezza del punto luce. Il montaggio è un ATTRIBUTO — nessun oggetto in piu' da tenere vivo —
   e la struttura dell'appeso si trova per geometria, come la pedana trova chi ci sta sopra. */
console.log("\n— Fari: PC, fresnel e montaggio —");

t("il catalogo ha finalmente il PC e il fresnel, i due fari base del teatro", () => {
  reset();
  ok(A.TYPES.farope && A.TYPES.fresnel, "i tipi esistono");
  eq(A.TYPES.farope.cat, "Luci"); eq(A.TYPES.fresnel.cat, "Luci");
  eq(A.WATT.farope, 500, "500 W di default (lampada 300/500), si abbassa dal pannello");
  ok(A.LIGHT_GEAR.farope && A.LIGHT_GEAR.fresnel, "entrano nel rider col loro nome");
  eq(A.LIGHT_GEAR.farope.plur, "fari PC");
  ok(/plft50pcn/.test(A.TYPES.farope.alias||""), "la ricerca trova anche il modello Proel");
  eq(/piano/.test(A.TYPES.farope.alias||""), false, "ma «piano» resta del pianoforte");
});
t("in pianta il PC si distingue dal fresnel per la lente", () => {
  reset();
  const pc = A.TYPES.farope.draw({ w: 22, d: 26 }), fr = A.TYPES.fresnel.draw({ w: 24, d: 28 });
  ok(pc.indexOf("<path") > -1 && fr.indexOf("<path") > -1, "tutti e due hanno la lente in avanti");
  const anelli = (t2) => (t2.match(/class="ic thin" fill="none"/g) || []).length;
  eq(anelli(pc), 0, "PC: lente liscia");
  eq(anelli(fr), 2, "fresnel: lente ad anelli");
});
t("il montaggio nasce «a terra» e non tocca la posizione", () => {
  reset();
  const f = add("farope", 300, 200);
  eq(A.mountModeOf(f), "floor", "default e migrazione dei progetti gia' fatti");
  eq(f.mount, undefined, "a terra non scrive niente nello stato");
  eq(A.mountHOf(f), 25, "altezza tipica di un faro poggiato");
  eq(A.mountNote(f), "", "e in pianta non si scrive nulla: poggiato e' il caso normale");
});
t("su stativo: altezza suggerita 250 cm, modificabile nei limiti", () => {
  reset();
  const f = add("farope", 300, 200);
  A.mountSet(f, { mode: "stand", h: A.MOUNT_H_DEF.stand });
  eq(A.mountHOf(f), 250);
  eq(A.mountNote(f), "stativo 2,5 m", "in pianta compare l'altezza");
  A.mountSet(f, { h: 320 }); eq(A.mountHOf(f), 320, "si alza");
  A.mountSet(f, { h: 5 });    eq(A.mountHOf(f), A.MOUNT_H_MIN, "sotto il minimo si ferma al minimo");
  A.mountSet(f, { h: 9999 }); eq(A.mountHOf(f), A.MOUNT_H_MAX, "e sopra al massimo");
});
t("appeso: la struttura si trova per geometria, e non c'e' nessun id da tenere vivo", () => {
  reset();
  const am = add("americana", 600, 100); am.w = 400; am.d = 30;
  const f = add("farope", 500, 100);
  A.mountSet(f, { mode: "hung", h: 400 });
  eq(A.hangSupportOf(f), am, "sotto l'americana = appeso a quella");
  eq(A.hangItemsOf(am).length, 1, "e l'americana sa chi porta");
  eq(f.mount.supportId, undefined, "nessun id memorizzato: niente da riparare");
  f.x = 100;
  eq(A.hangSupportOf(f), null, "spostato via, si sgancia da solo");
});
t("l'americana che si sposta porta con se' i fari appesi", () => {
  reset();
  const am = add("americana", 600, 100); am.w = 400; am.d = 30;
  const f = add("farope", 500, 100), g = add("parluci", 700, 100), terra = add("farope", 500, 500);
  [f, g].forEach((x) => A.mountSet(x, { mode: "hung", h: 400 }));
  const presi = A.hangItemsOf(am);
  eq(presi.length, 2, "i due appesi");
  eq(presi.indexOf(terra), -1, "il faro a terra resta dov'e'");
});
t("se l'americana sparisce i fari restano dove sono, e l'audit lo dice", () => {
  reset();
  const am = add("americana", 600, 100); am.w = 400; am.d = 30;
  const f = add("farope", 500, 100);
  A.mountSet(f, { mode: "hung", h: 400 });
  const x0 = f.x, y0 = f.y;
  A.state.items = A.state.items.filter((it) => it.id !== am.id);
  eq([f.x, f.y].join(","), [x0, y0].join(","), "il faro non si sposta e non si cancella");
  eq(A.mountModeOf(f), "hung", "resta dichiarato appeso: e' un dato dell'utente, non lo riscriviamo noi");
  eq(A.hangSupportOf(f), null, "ma senza struttura");
  A.__cabRes = null; A.__elecRes = null;
  const f2 = A.auditEngine().findings.filter((x) => /appeso/.test(x.msg));
  eq(f2.length, 1, "una criticita', una sola: " + JSON.stringify(f2.map((z) => z.msg)));
});
t("gli avvisi sui fari appesi sono aggregati, non uno per faro", () => {
  reset();
  for (let i = 0; i < 5; i++) A.mountSet(add("farope", 100 + i * 60, 300), { mode: "hung", h: 400 });
  A.__cabRes = null; A.__elecRes = null;
  const msg = A.auditEngine().findings.filter((x) => /appesi|appeso/.test(x.msg)).map((x) => x.msg);
  eq(msg.length, 1, "un avviso solo: " + JSON.stringify(msg));
  ok(/5 fari/.test(msg[0]), "che dice quanti sono: " + msg[0]);
});
t("il cavo di sicurezza si dichiara, e finche' non lo e' l'audit lo ricorda", () => {
  reset();
  const am = add("americana", 600, 100); am.w = 400; am.d = 30;
  const f = add("farope", 500, 100);
  A.mountSet(f, { mode: "hung", h: 400 });
  eq(A.mountSafetyOf(f), "unspecified", "di default e' da verificare");
  A.__cabRes = null; A.__elecRes = null;
  ok(A.auditEngine().findings.some((x) => /cavo di sicurezza/.test(x.msg)), "l'audit lo chiede");
  A.mountSet(f, { safety: "present" });
  A.__cabRes = null; A.__elecRes = null;
  eq(A.auditEngine().findings.filter((x) => /cavo di sicurezza/.test(x.msg)).length, 0, "dichiarato, tace");
});
t("il montaggio sopravvive a salvataggio, duplicazione e valori sporchi", () => {
  reset();
  const s = A.normalizeState({
    stage: { w: 1200, d: 800 },
    items: [
      { id: "i1", type: "farope", x: 100, y: 100, mount: { mode: "hung", h: "420", safety: "present" } },
      { id: "i2", type: "farope", x: 200, y: 100, mount: { mode: "volante", h: "abc", safety: "boh", note: "x".repeat(500) } },
    ],
  });
  eq(s.items[0].mount.h, 420, "l'altezza torna numero");
  eq(s.items[0].mount.mode, "hung");
  eq(s.items[1].mount && s.items[1].mount.mode, undefined, "un modo inventato torna «a terra»");
  eq(s.items[1].mount && s.items[1].mount.safety, undefined, "e uno stato inventato sparisce");
  ok(!s.items[1].mount || s.items[1].mount.note.length <= 120, "la nota e' troncata");
  reset();
  const f = add("farope", 300, 300);
  A.mountSet(f, { mode: "stand", h: 260 });
  A.selectOne(f.id); A.duplicateSel();
  const copia = A.state.items[A.state.items.length - 1];
  eq(A.mountModeOf(copia), "stand", "la copia nasce montata come l'originale");
  eq(A.mountHOf(copia), 260);
});
t("il supporto si disegna sotto l'apparecchio, e a terra non si disegna", () => {
  reset();
  const f = add("farope", 300, 300);
  eq(A.mountUnderSvg(f), "", "a terra: niente stativo inesistente");
  A.mountSet(f, { mode: "stand" });
  const st = A.mountUnderSvg(f);
  eq((st.match(/<line/g) || []).length, 3, "treppiede: tre gambe");
  A.mountSet(f, { mode: "hung" });
  ok(A.mountUnderSvg(f).indexOf("<rect") > -1, "appeso: il morsetto");
});

console.log("\n— Luci da studio e video: le nove tipologie —");

const STUDIO = ["ledcob", "ledmono", "ledpanel", "ledflex", "ledtube", "openface", "hmi", "fresnelled", "softlight"];

t("le nove tipologie stanno nel reparto Luci, sul banco «Video e studio»", () => {
  reset();
  STUDIO.forEach((k) => {
    ok(A.TYPES[k], "manca il tipo " + k);
    eq(A.TYPES[k].cat, "Luci", k + ": categoria di catalogo");
    eq(A.TYPES[k].sub, "Video e studio", k + ": sottocategoria");
    eq(A.subOf(k), "Video e studio", k + ": il catalogo deve mostrarlo sotto il suo banco, non dentro «Luci»");
    eq(A.catOf(k), "Luci e video", k + ": macro-categoria");
  });
  eq(A.subOf("parluci"), "Luci", "i fari da palco restano dove sono sempre stati");
});
t("le misure sono l'ingombro reale in pianta, e le proporzioni fra loro reggono", () => {
  reset();
  STUDIO.forEach((k) => {
    const t2 = A.TYPES[k];
    ok(t2.w > 0 && t2.d > 0, k + ": senza ingombro");
    ok(!t2.resizable, k + ": misura reale, non si stira a piacere");
  });
  const W = (k) => A.TYPES[k].w, D = (k) => A.TYPES[k].d;
  ok(W("ledtube") > W("softlight"), "il tubo e' il piu' lungo di tutti (~1 m)");
  ok(W("softlight") > W("ledflex"), "il soft e' piu' largo del telo flessibile");
  ok(W("ledflex") > W("ledpanel"), "il telo 2x2 ft e' piu' largo di un 1x1");
  ok(W("ledpanel") > W("ledcob"), "il pannello e' piu' largo di una testa COB");
  ok(W("ledcob") > W("ledmono"), "e la testa COB piu' della monolight tutto-in-uno");
  ok(D("ledtube") < D("ledflex") && D("ledflex") < D("ledpanel"), "tubo, telo e pannello: profondita' crescente, tutti sottili");
  ok(D("hmi") >= 40 && W("hmi") >= 40, "l'HMI e' il corpo piu' grosso: 1,8 kW e alimentatore a parte");
  ok(W("ledtube") / D("ledtube") > 10, "il tubo si riconosce dalla proporzione: una barra, non una scatola");
  ok(W("ledpanel") / D("ledpanel") > 2, "il pannello e' un rettangolo sottile");
});
t("ogni tipologia ha un disegno suo, e nessuno tocca transform/scale/viewBox", () => {
  reset();
  const svg = {};
  STUDIO.forEach((k) => {
    const t2 = A.TYPES[k], s = t2.draw({ type: k, w: t2.w, d: t2.d });
    ok(s.length > 100, k + ": disegno troppo povero per distinguersi");
    eq(/transform=|scale\(|viewBox/.test(s), false, k + ": scala reale — niente transform/scale/viewBox nell'icona");
    ok(!/\bNaN\b|undefined/.test(s), k + ": coordinate sporche nel path");
    svg[k] = s;
  });
  const distinti = new Set(Object.values(svg));
  eq(distinti.size, STUDIO.length, "due tipologie disegnate uguali");
});
t("i segni che le fanno riconoscere a colpo d'occhio", () => {
  reset();
  const dis = (k) => A.TYPES[k].draw({ type: k, w: A.TYPES[k].w, d: A.TYPES[k].d });
  const anelli = (s) => (s.match(/class="ic thin" fill="none"/g) || []).length;
  eq(anelli(dis("fresnelled")), 2, "fresnel LED: la lente ad anelli, come il fresnel da palco");
  eq(anelli(dis("hmi")), 0, "HMI: ottica liscia, non ad anelli");
  ok(dis("hmi").indexOf("<rect") > -1 && (dis("hmi").match(/<rect/g) || []).length > (dis("fresnelled").match(/<rect/g) || []).length,
    "HMI: un corpo in piu' — l'alimentatore dietro, che il LED non ha");
  const of2 = dis("openface");
  ok(of2.indexOf('class="ic fill"') > -1, "open-face: la lampada nuda si vede — non c'e' lente davanti");
  eq((of2.match(/ A /g) || []).length, 1, "open-face: riflettore aperto, senza anelli");
  ok(Math.abs(parseFloat(of2.match(/<path class="ic" d="M (-?[\d.]+)/)[1])) > A.TYPES.openface.w * 0.4,
    "open-face: il riflettore e' largo quanto l'apparecchio, non un occhiello in mezzo alla scocca");
  ok(dis("ledflex").indexOf(" q ") > -1, "flessibile: il bordo ondulato di un telo");
  eq((dis("ledcob").match(/ A /g) || []).length, 2, "COB: la ghiera dell'attacco frontale (due archi concentrici)");
  eq((dis("hmi").match(/ A /g) || []).length, 1, "HMI: ottica sola, senza ghiera");
  ok(dis("ledpanel").indexOf('class="dotS"') > -1, "pannello: la matrice di LED sulla faccia");
  ok(dis("ledtube").indexOf('class="ic soft thin"') > -1, "tubo: il lato che illumina, verso il fronte");
  ok(dis("softlight").indexOf('class="ic soft thin"') > -1, "soft: il diffusore davanti alla scocca");
});
t("nel rider si chiamano col nome del mestiere, singolare e plurale", () => {
  reset();
  STUDIO.forEach((k) => ok(A.LIGHT_GEAR[k], k + ": non entra nella lista luci"));
  eq(A.lightGearText("ledpanel", 3), "pannelli LED");
  eq(A.lightGearText("ledtube", 1), "tubo LED");
  eq(A.lightGearText("ledflex", 4), "LED flessibili");
  eq(A.lightGearText("hmi", 2), "HMI", "le sigle non si pluralizzano");
  eq(A.lightGearText("softlight", 1), "soft light");
});
t("ereditano il montaggio dei fari: a terra, su stativo, appeso", () => {
  reset();
  STUDIO.forEach((k) => ok(A.isMountable({ type: k }), k + ": senza montaggio, e uno stativo da studio e' il caso normale"));
  const p = add("ledpanel", 300, 200);
  eq(A.mountModeOf(p), "floor", "nasce a terra come tutti gli altri apparecchi");
  eq(A.mountNote(p), "", "e a terra non si scrive niente in pianta");
  A.mountSet(p, { mode: "stand", h: A.MOUNT_H_DEF.stand });
  eq(A.mountNote(p), "stativo 2,5 m", "sullo stativo l'altezza compare");
  eq((A.mountUnderSvg(p).match(/<line/g) || []).length, 3, "e il treppiede si disegna sotto");
  const am = add("americana", 600, 100); am.w = 400; am.d = 30;
  const tb = add("ledtube", 500, 100);
  A.mountSet(tb, { mode: "hung", h: 350 });
  eq(A.hangSupportOf(tb), am, "un tubo appeso alla barra la trova per geometria, come un faro");
});
t("la vista Luci le mostra insieme ai fari da palco", () => {
  reset();
  STUDIO.forEach((k) => ok(A.layerFgItem("luci", { type: k }), k + ": fuori dalla vista Luci"));
});
t("ogni tipologia dichiara il suo assorbimento: nessun buco nel piano elettrico", () => {
  reset();
  STUDIO.forEach((k) => {
    ok(A.hasWatt(k), k + ": senza potenza il piano elettrico lo conta zero");
    ok(A.WATT[k] >= 80 && A.WATT[k] <= 2000, k + ": valore fuori scala per la categoria");
  });
  ok(A.WATT.hmi > A.WATT.openface, "l'HMI da 1,8 kW pesa piu' di un open-face LED");
  ok(A.WATT.ledtube < A.WATT.ledpanel, "un tubo a batteria e' il carico piu' leggero");
  eq(A.techGapCheck().senzaPotenza.filter((k) => STUDIO.indexOf(k) > -1).length, 0, "la guardia dei metadati non trova buchi");
  const t2 = A.TYPES.hmi;
  eq(A.wattOf({ type: "hmi", w: t2.w, d: t2.d }), 2000);
  eq(A.wattOf({ type: "hmi", w: t2.w, d: t2.d, watt: 575 }), 575, "e sul singolo apparecchio si corregge a mano");
});
t("pesano quello che pesano: i totali del tech pack li vedono", () => {
  reset();
  STUDIO.forEach((k) => ok(A.WEIGHT[k] > 0, k + ": peso mancante"));
  ok(A.WEIGHT.hmi > A.WEIGHT.ledtube * 5, "un HMI e un tubo LED non si trasportano allo stesso modo");
  add("softlight", 300, 300);
  eq(A.totalWeightKg(), A.WEIGHT.softlight);
});
t("il modello lo porta il catalogo in-code, e ce n'e' UNO SOLO", () => {
  /* Le due meta' di questo lavoro sono nate in parallelo e volevano due cose diverse: le tipologie
     davano alle luci da studio il campo «Modello del faro» (DB Supabase), il catalogo in-code
     glielo toglieva per non averne due sullo stesso elemento. Vince il secondo: e' la decisione
     presa (catalogo nel sorgente, che funziona offline) ed e' lo stesso doppione gia' corretto per
     le stage box il 18/07 e per i personal monitor il 28/07. */
  reset();
  STUDIO.forEach((k) => {
    eq(A.equipCatsFor({ type: k }), null, k + ": niente campo dal DB, avrebbe due modelli");
    ok(A.LIGHT_MODEL_DB && Object.keys(A.LIGHT_MODEL_DB).length > 30, "il catalogo in-code c'e'");
  });
  /* i fari DA PALCO invece continuano ad avere il loro, che viene dal DB */
  eq(A.equipCatsFor({ type: "farope" }), ["faro"], "il PC teatrale tiene «Modello del faro»");
  eq(A.equipFieldLabel(["faro"]), "Modello del faro");
});
t("gli alias le trovano senza inquinare le query di sempre", () => {
  reset();
  const primo = (q) => (A.__qaSearch(q)[0] || {}).k;
  eq(primo("cob"), "ledcob");
  eq(primo("pannello"), "ledpanel");
  eq(primo("tubo"), "ledtube");
  eq(primo("flex"), "ledflex");
  eq(primo("hmi"), "hmi");
  eq(primo("soft"), "softlight");
  eq(primo("open face"), "openface");
  eq(primo("monolight"), "ledmono");
  ["luce continua", "set", "studio"].forEach((q) =>
    ok(A.__qaSearch(q).some((r) => STUDIO.indexOf(r.k) > -1), "il gergo del set non trova niente: " + q));
  /* le query storiche non devono cambiare padrone (la ricerca e' una substring) */
  eq(primo("tuba"), "tuba", "«tuba» resta dell'ottone, non del tubo LED");
  eq(primo("par"), "parluci", "«par» resta del PAR da palco");
  eq(primo("faro"), "farope", "«faro» resta dei fari da palco");
  ok(A.__qaSearch("piano").every((r) => STUDIO.indexOf(r.k) === -1), "«piano» non pesca luci da studio");
  ok(A.__qaSearch("mic").slice(0, 4).every((r) => STUDIO.indexOf(r.k) === -1), "«mic» resta dei microfoni");
  ok(A.__qaSearch("monitor").every((r) => STUDIO.indexOf(r.k) === -1), "«monitor» resta dei wedge");
});
t("sei essenziali (il kit di tutti i giorni), tre sotto «Mostra tutti»", () => {
  reset();
  ["ledcob", "ledmono", "ledpanel", "ledflex", "ledtube", "softlight"].forEach((k) => ok(A.isEss(k), k + ": deve vedersi subito"));
  ["openface", "hmi", "fresnelled"].forEach((k) => ok(!A.isEss(k), k + ": set strutturato, non kit quotidiano"));
});
t("le misure hanno una provenienza dichiarata nel sorgente: niente numeri inventati", () => {
  const src = readFileSync(join(root, "index.template.html"), "utf8");
  const blocco = src.slice(src.indexOf("LUCI VIDEO E STUDIO"), src.indexOf("strobo:"));
  ok(blocco.length > 500, "il blocco di catalogo non si trova piu'");
  [/LS 300d II/, /amaran 300c/, /Astra 6X/, /F22c/, /Titan Tube/, /Arrilite/, /M18/, /L7-C/, /SkyPanel/].forEach((rx) =>
    ok(rx.test(blocco), "manca il riferimento da cui viene la misura: " + rx));
});

console.log("\n— Uscita dalle liste —");

t("aprire una lista mette in «modo lista», uscire la chiude", () => {
  reset();
  A.layerAccOpen = "cabin";
  ok(A.inListMode(), "con una lista aperta si è in modo lista");
  eq(A.exitListMode(), true, "l'uscita deve dire che c'era davvero una lista aperta");
  eq(A.layerAccOpen, null, "la lista è rimasta aperta");
  ok(!A.inListMode());
});

t("anche il solo su un layer conta come modo lista", () => {
  reset();
  A.layerAccOpen = null; A.layerSoloUI = { cabin: true };
  ok(A.inListMode(), "un layer in solo è modo lista");
  A.exitListMode();
  eq(Object.keys(A.layerSoloUI).length, 0, "il solo non è stato tolto");
});

t("uscire dalle liste lascia andare anche i cavi selezionati", () => {
  reset();
  A.layerAccOpen = "cabin"; A.selCab = "x"; A.selCabSet = { x: 1 };
  A.exitListMode();
  eq(A.selCab, null); eq(Object.keys(A.selCabSet).length, 0);
});

t("fuori da una lista l'uscita non ha niente da chiudere", () => {
  reset();
  A.layerAccOpen = null; A.layerSoloUI = {};
  eq(A.exitListMode(), false, "senza liste aperte deve dire che non c'era nulla da chiudere");
});

t("il click sul vuoto chiude la lista ovunque, dentro o fuori dal palco", () => {
  /* la condizione sul lato del bordo non c'è più: il vuoto è vuoto (Simone 28/07 sera) */
  const html = readFileSync(join(root, "app.js"), "utf8");
  const riga = (html.match(/if\(inListMode\(\)[^)]*\)\s*exitListMode\(\);/) || [""])[0];
  ok(riga, "manca la chiamata a exitListMode dal click sul vuoto");
  eq(riga.indexOf("isOutsideStage"), -1, "il click sul vuoto distingue ancora dentro/fuori dal palco: " + riga);
});


/* ============ QUARTETTO RIPRESO A ZONE (Simone 29/07) ==========================================
   «Ho un quartetto con le zone di registrazione. L'input list, se provo a collegare in automatico,
   mi dice che non c'è niente da collegare, ma in realtà c'è la zona del violoncello.»
   Radice: «e' una sorgente da microfonare» (isAudioSource, che esclude apposta le zone) veniva usato
   dove serviva «produce canali». Con la ripresa a zone gli strumenti coperti non producono canali e
   la zona non contava: totale zero, con la lista piena di righe sotto gli occhi. */
console.log("\n— Ripresa a zone: cosa conta come canale —");

t("una zona produce un canale, e chi copre non ne produce piu'", () => {
  reset();
  const vc = add("violoncello", 500, 400);
  const z = add("miczone", 500, 400); z.w = 220; z.d = 200;
  eq(A.cabItemInputs(z).length, 1, "la zona = un canale mono");
  eq(A.cabItemInputs(vc).length, 0, "lo strumento coperto non ne produce piu': lo riprende la zona");
  eq(A.isAudioSource(z), false, "la zona NON e' una sorgente da microfonare: e' gia' lei il microfono");
  ok(A.hasChannels(z), "ma canali ne produce, ed e' questo che conta per il cablaggio");
});
t("un palco ripreso SOLO a zone non e' un palco vuoto", () => {
  reset();
  const vc = add("violoncello", 500, 400), vla = add("violapost", 340, 380);
  const z1 = add("miczone", 500, 400); z1.w = 220; z1.d = 200;
  const z2 = add("miczone", 340, 380); z2.w = 220; z2.d = 200;
  add("stagebox", 1100, 100);
  A.state.cab.on = true; A.state.cab.mode = "manual"; A.__cabRes = null;
  eq(A.patchList().rows.length, 2, "la Input list ha due canali");
  eq(A.autoConnectNeeds("cabin"), null, "e la guida non dice piu' «non c'e' niente da collegare»");
});
t("senza NIENTE sul palco la guida continua a dirlo", () => {
  reset();
  const g = A.autoConnectNeeds("cabin");
  ok(g && /niente da collegare/.test(g.title), "il caso vero del palco vuoto resta segnalato: " + (g && g.title));
});
t("con i canali ma senza stage box la guida chiede la stage box", () => {
  reset();
  const vc = add("violoncello", 500, 400);
  const z = add("miczone", 500, 400); z.w = 220; z.d = 200;
  A.__cabRes = null;
  const g = A.autoConnectNeeds("cabin");
  ok(g && g.action && /stage box/i.test(g.action.label), "il passo successivo e' quello giusto: " + (g && g.title));
});
t("nella vista Ingressi la zona sta in primo piano: e' lei la sorgente", () => {
  reset();
  const vc = add("violoncello", 500, 400);
  const z = add("miczone", 500, 400); z.w = 220; z.d = 200;
  ok(A.layerFgItem("cabin", z), "la zona non sfuma nello sfondo mentre il canale e' suo");
  ok(A.layerFgItem("cabin", vc), "e lo strumento che riprende resta visibile con lei");
});
t("il fulmine collega il canale della zona alla stage box", () => {
  reset();
  const vc = add("violoncello", 500, 400);
  const z = add("miczone", 500, 400); z.w = 220; z.d = 200;
  const box = add("stagebox", 1100, 100); box.ch = 16;
  A.state.cab.on = true; A.state.cab.mode = "manual"; A.state.cab.manual = {}; A.__cabRes = null;
  const riga = A.patchList().rows[0];
  eq(A.cabConnectOne(riga.key), box.id, "collegata alla box");
  A.__cabRes = null;
  ok(A.patchList().rows[0].box, "e la riga ora ha il suo patch");
});


/* ====== «CAMBIO LA DIMENSIONE A TUTTE?» (Simone 29/07) ========================================
   Con dieci quinte sul palco, rifare dieci volte lo stesso gesto e' lavoro inutile — e il comando
   «Applica a tutti» accanto all'etichetta bisogna sapere che c'e'. Ora lo chiede l'app, dopo il
   gesto e senza fermare nessuno. */
console.log("\n— La dimensione dell'etichetta, e gli altri come lui —");

t("la domanda ha senso solo se ci sono davvero altri come lui, con una misura diversa", () => {
  reset();
  const a = add("quinta", 200, 300), b2 = add("quinta", 400, 300), c = add("wedge", 600, 300);
  eq(A.lblSizeOf(a), 14, "il default e' 14 anche quando lblSize non c'e'");
  eq(A.lblSizeSiblings(a).length, 0, "tutte alla stessa misura: niente da chiedere");
  a.lblSize = 1;
  eq(A.lblSizeSiblings(a).length, 1, "ora l'altra quinta e' diversa");
  eq(A.lblSizeSiblings(a).indexOf(c), -1, "il wedge non c'entra: si guarda lo stesso tipo");
  b2.lblSize = 1;
  eq(A.lblSizeSiblings(a).length, 0, "allineate: la domanda decade");
});
t("il metro bloccato non si sposta e non si allunga piu'", () => {
  reset();
  const m = add("metro", 400, 300);
  ok(A.itemEditable(m), "libero si prende dai capi e si allunga");
  m.locked = true;
  eq(A.itemEditable(m), false, "bloccato resta la quota che hai preso");
  ok(/it\.type==="metro"/.test(appjs), "il metro ha ancora le sue due maniglie di lunghezza, quando e' libero");
});
t("un elemento solo del suo tipo non fa domande", () => {
  reset();
  const q = add("quinta", 200, 300);
  q.lblSize = 1;
  eq(A.lblSizeSiblings(q).length, 0);
});
t("la riga della domanda esiste nel pannello, accanto allo slider", () => {
  const html = readFileSync(join(root, "app/index.html"), "utf8");
  ok(html.indexOf('id="pLblSizeAll"') > -1, "la riga c'e'");
  ok(html.indexOf('id="pLblSizeAllYes"') > -1, "col suo comando");
  ok(/id="pLblSizeAll"[^>]*hidden/.test(html), "e nasce nascosta: compare solo dopo il gesto");
  ok(appjs.indexOf("_lblSizeAsk=it.id") > -1, "si accende sull'elemento appena toccato");
  ok(stylesCss.indexOf(".ask-all{") > -1, "lo stile sta nel design system, non inline");
});
t("applicare a tutti allinea gli altri e non tocca i tipi diversi", () => {
  reset();
  const a = add("quinta", 200, 300), b2 = add("quinta", 400, 300), c2 = add("quinta", 600, 300);
  const w = add("wedge", 800, 300);
  w.lblSize = 20;
  a.lblSize = 1;
  A.lblSizeSiblings(a).forEach((o) => { o.lblSize = A.lblSizeOf(a); });   /* quello che fa il bottone */
  eq([a, b2, c2].map((x) => A.lblSizeOf(x)).join(","), "1,1,1", "le quinte sono allineate");
  eq(A.lblSizeOf(w), 20, "il wedge resta com'era");
});


/* ====== B5: POSIZIONE E ALTEZZA, UN DATO SOLO (Simone 29/07) ==================================
   La riga del rider aveva la sua posizione, le icone hanno il montaggio: due posti per la stessa
   cosa sono due posti che si contraddicono. Vince cio' che dice il palco, dove il palco parla. */
console.log("\n— Luci: la posizione la dice il palco —");

t("un faro su stativo detta la posizione della sua riga, ovunque", () => {
  reset();
  const f = add("farope", 300, 400);
  A.mountSet(f, { mode: "stand", h: 250 });
  const r = A.lightRow({ fn: "frontale", n: 1, gear: "farope", items: [f.id] });
  A.state.lights = { rows: [r], blackout: true, mood: "" };
  const P = A.lightRowPos(r);
  eq(P.pos, "stativo"); eq(P.h, "2,5"); eq(P.dalPalco, true);
  ok(/su stativo a 2,5 m/.test(A.lightRowText(r)), "nel rider: " + A.lightRowText(r));
  ok(/STATIVO A 2,5 M/.test(A.lightsLabels()[0].text), "e sull'etichetta a bordo palco: " + A.lightsLabels()[0].text);
});
t("appeso a un'americana: lo dice il rider, e a una truss lo distingue", () => {
  reset();
  const am = add("americana", 600, 100); am.w = 400; am.d = 30;
  const f = add("farope", 500, 100);
  A.mountSet(f, { mode: "hung", h: 420 });
  const r = A.lightRow({ fn: "controluce", n: 1, gear: "farope", items: [f.id] });
  eq(A.lightRowPos(r).pos, "americana");
  ok(/su americana a 4,2 m/.test(A.lightRowText(r)), A.lightRowText(r));
  A.state.items = A.state.items.filter((x) => x.id !== am.id);
  const tr = add("truss", 600, 100); tr.w = 400; tr.d = 30;
  A.__cabRes = null;
  eq(A.lightRowPos(r).pos, "truss", "su una truss non si scrive «americana»");
});
t("«a terra» resta implicito: il default non si dichiara da solo", () => {
  reset();
  const f = add("farope", 300, 400);   /* nessun montaggio scelto: e' il default */
  const r = A.lightRow({ fn: "frontale", n: 1, gear: "farope", items: [f.id] });
  const P = A.lightRowPos(r);
  eq(P.dalPalco, false, "il palco non dichiara niente");
  eq(P.pos, "", "e il rider non scrive «a terra» al posto dell'utente");
});
t("quello che l'utente ha scritto a mano resta, se il palco tace", () => {
  reset();
  const r = A.lightRow({ fn: "frontale", n: 4, gear: "sagomatore", pos: "elevatore", posH: "4", items: [] });
  const P = A.lightRowPos(r);
  eq([P.pos, P.h, P.dalPalco].join(" "), "elevatore 4 false", "le luci in sala non stanno sul palco: la riga e' l'unica fonte");
  ok(/su elevatore a 4 m/.test(A.lightRowText(r)), A.lightRowText(r));
});
t("il palco vince su quanto scritto a mano: niente due verita'", () => {
  reset();
  const f = add("farope", 300, 400);
  A.mountSet(f, { mode: "stand", h: 180 });
  const r = A.lightRow({ fn: "frontale", n: 1, gear: "farope", pos: "americana", posH: "6", items: [f.id] });
  const P = A.lightRowPos(r);
  eq([P.pos, P.h].join(" "), "stativo 1,8", "vale l'apparecchio disegnato, non la vecchia riga");
});
t("apparecchi con montaggi diversi: la riga lo dice invece di sceglierne uno", () => {
  reset();
  const am = add("americana", 600, 100); am.w = 400; am.d = 30;
  const a = add("farope", 500, 100), b2 = add("farope", 300, 400);
  A.mountSet(a, { mode: "hung", h: 400 });
  A.mountSet(b2, { mode: "stand", h: 250 });
  const r = A.lightRow({ fn: "frontale", n: 2, gear: "farope", items: [a.id, b2.id] });
  ok(A.lightRowPos(r).misto, "riconosciuto");
  ok(/montaggi diversi/.test(A.lightRowText(r)), "nel rider: " + A.lightRowText(r));
  A.state.lights = { rows: [r], blackout: true, mood: "" };
  eq(/MONTAGGI|M$/.test(A.lightsLabels()[0].text), false, "a bordo palco non si stampa una quota falsa: " + A.lightsLabels()[0].text);
});
t("la Lista luci del PDF porta il montaggio, e dice che viene dal palco", () => {
  reset();
  const f = add("farope", 300, 400);
  A.mountSet(f, { mode: "stand", h: 250 });
  A.state.lights = { rows: [A.lightRow({ fn: "frontale", n: 1, gear: "farope", items: [f.id] })], blackout: true, mood: "" };
  const riga = A.lightsList().rows[0];
  eq(riga.pos, "Stativo · 2,5 m");
  eq(riga.dalPalco, true);
});
t("stativo e truss sono posizioni del rider, con la loro altezza", () => {
  ok(A.LIGHT_POS.some((p) => p[0] === "stativo"), "«stativo» si puo' anche scrivere a mano");
  ok(A.LIGHT_POS.some((p) => p[0] === "truss"));
  ok(A.LIGHT_POS_H.stativo && A.LIGHT_POS_H.truss, "e portano un'altezza, come l'americana");
});


/* ====== DENTRO UNA ZONA PANORAMICA (Simone 29/07) =============================================
   «Se uno strumento e' dentro una zona panoramica, in automatico eredita il microfono panoramico
   della sezione; se ha entrambi, nel pannello ci sara' l'opzione mic strumento + panoramico.»
   Il comportamento c'era gia' ma viveva in una spunta che non lo diceva («Mic singolo anche in
   zona»): ora sono due scelte con i nomi di cio' che finisce in channel list. */
console.log("\n— Strumento dentro una zona panoramica —");

t("in zona lo strumento eredita il panoramico: un canale solo, ed e' quello della sezione", () => {
  reset();
  const vla = add("violapost", 400, 400);
  const z = add("miczone", 400, 400); z.w = 300; z.d = 260;
  A.state.cab.on = true; A.__cabRes = null;
  eq(A.itemInMicZone(vla), z, "e' dentro la zona");
  eq(A.effOwnMic(vla), false, "di default non porta il suo microfono");
  eq(A.cabItemInputs(vla).length, 0, "niente canale suo");
  eq(A.cabItemInputs(z).length, 1, "il canale e' quello della zona");
});
t("con entrambi i canali diventano due", () => {
  reset();
  const vla = add("violapost", 400, 400);
  const z = add("miczone", 400, 400); z.w = 300; z.d = 260;
  vla.ownMic = true;   /* quel che fa il bottone «Mic strumento + panoramico» */
  A.__cabRes = null;
  eq(A.cabItemInputs(vla).length, 1, "il suo microfono torna in lista");
  eq(A.cabItemInputs(z).length, 1, "e il panoramico resta");
});
t("i close-obligati nascono gia' con il loro microfono, anche dentro la zona", () => {
  reset();
  const kick = add("grancassa", 400, 400);
  const z = add("miczone", 400, 400); z.w = 400; z.d = 400;
  ok(A.effOwnMic(kick), "un kick dentro una panoramica tiene il suo mic: nessuno lo riprende da lontano");
});
t("il pannello dice cosa entra in channel list, invece di una spunta da interpretare", () => {
  const html = readFileSync(join(root, "app/index.html"), "utf8");
  ok(html.indexOf('id="pOwnMicMode"') > -1, "il controllo a due scelte c'e'");
  ok(html.indexOf("Solo panoramico") > -1 && html.indexOf("Mic strumento + panoramico") > -1, "coi nomi giusti");
  eq(html.indexOf('id="pOwnMic"'), -1, "la vecchia spunta e' sparita: un comando solo");
  ok(appjs.indexOf("Un canale solo: lo riprende il panoramico") > -1, "e la nota dice quale microfono eredita");
});


/* ====== CAVI POWER: UN TRACCIATO SOLO, E TUTTI AL CENTRO (Simone 29/07) =======================
   «Quando clicco su un cavo power la visualizzazione non e' buona, c'e' sia quello inclinato che
   quello a novanta gradi. E poi devono finire tutti convergenti al centro degli elementi, come i
   cavi input.» */
console.log("\n— Cavi power: tracciato e capi —");

t("selezionare una linea DIRITTA non disegna un secondo cavo ad angolo retto", () => {
  ok(/var _dirE=\(elecStyleFor\(selElec\)==="dir"\);/.test(appjs), "si guarda lo stile della linea selezionata");
  ok(/if\(!_dirE\) for\(var pi=0;pi<polyE\.length-1;pi\+\+\)/.test(appjs), "i lati ortogonali si disegnano solo quando la linea e' segmentata");
  /* e' lo stesso rimedio dell'audio: la' il difetto era gia' stato corretto il 21/07 */
  ok(appjs.indexOf("_dirSel ?") > -1, "l'audio continua ad avere il suo");
});
t("il cavo di corrente nasce e muore al CENTRO dell'elemento, come quello audio", () => {
  reset();
  const amp = add("amprack", 300, 400);
  eq(A.portAnchor(amp, "pow").join(","), "300,400", "una porta sola: al centro");
  const combo = add("comboamp", 600, 400);
  ok(A.portKinds(combo).length > 1, "il combo ha audio e corrente");
  eq(A.portAnchor(combo, "pow").join(","), "600,400", "anche con piu' porte il CAVO va al centro");
  eq(A.portAnchor(combo, "audio").join(","), "600,400", "come quello audio, che era gia' cosi'");
});
t("i PALLINI restano distinti: due prese nello stesso punto non si prendono col dito", () => {
  reset();
  const combo = add("comboamp", 600, 400);
  const pa = A.portDotPos(combo, "audio"), pp = A.portDotPos(combo, "pow");
  ok(pa[0] !== pp[0] || pa[1] !== pp[1], "audio e corrente hanno pallini in due posti diversi");
  const solo = add("amprack", 300, 400);
  eq(A.portDotPos(solo, "pow").join(","), A.portAnchor(solo, "pow").join(","), "con una porta sola pallino e cavo coincidono");
});
t("il capo del cavo elettrico segue davvero l'elemento", () => {
  reset();
  add("distro32", 800, 100);
  const combo = add("comboamp", 300, 400);
  A.state.elec.on = true; A.state.elec.mode = "auto"; A.__elecRes = null;
  const l = (A.elecResult(true).loadLinks || []).filter((x) => x.load.it.id === combo.id)[0];
  ok(l, "il carico e' collegato");
  eq(l.pts[l.pts.length - 1].join(","), [combo.x, combo.y].join(","), "il capo e' il centro del combo");
});

/* ====== CATALOGO MODELLI — LUCI CONTINUE DA STUDIO/VIDEO (29/07) ==============================
   Il catalogo sta nel sorgente, come STAGEBOX_DB e PM_DB: offline e senza passaggi a mano in
   produzione. Qui si difendono le due promesse che valgono piu' del catalogo stesso:
   (1) ogni voce dichiara cio' che serve a chi monta (potenza, attacco, alimentazione, controllo);
   (2) CIO' CHE IL PRODUTTORE NON DICHIARA NON C'E' — mai uno zero al posto di un buco, perche'
       uno zero in un rider e' una bugia, un campo vuoto e' una domanda onesta. */
console.log("\n— Catalogo modelli: luci continue da studio/video —");

const LM = A.LIGHT_MODEL_DB;
const lmKeys = Object.keys(LM);

t("il catalogo non e' vuoto e ogni voce ha marca, modello e fascia", () => {
  ok(lmKeys.length >= 15, "voci in catalogo: " + lmKeys.length);
  lmKeys.forEach((k) => {
    const d = LM[k];
    ok(typeof d.brand === "string" && d.brand.trim(), k + ": manca la marca");
    ok(typeof d.model === "string" && d.model.trim(), k + ": manca il modello");
    ok(["base", "pro", "cinema"].indexOf(d.tier) >= 0, k + ": fascia sconosciuta (" + d.tier + ")");
  });
});

t("ogni voce dichiara una potenza, e ogni campo dichiarato usa un termine noto", () => {
  lmKeys.forEach((k) => {
    const d = LM[k];
    const w = d.watt != null ? d.watt : d.wattRated;
    ok(typeof w === "number" && isFinite(w) && w > 0, k + ": potenza mancante o non numerica");
    if ("att" in d) ok(A.LIGHT_ATT[d.att], k + ": attacco sconosciuto (" + d.att + ")");
    if ("power" in d) { ok(d.power.length, k + ": alimentazione vuota"); d.power.forEach((p) => ok(A.LIGHT_PWR[p], k + ": alimentazione sconosciuta (" + p + ")")); }
    if ("ctrl" in d) { ok(d.ctrl.length, k + ": controllo vuoto"); d.ctrl.forEach((c) => ok(A.LIGHT_CTRL[c], k + ": controllo sconosciuto (" + c + ")")); }
  });
});

/* Attacco, alimentazione e controllo servono a chi monta, ma qualche produttore non li pubblica.
   La regola non e' «riempi comunque»: e' «se manca, DILLO». Un campo vuoto senza spiegazione e'
   una dimenticanza; un campo vuoto con la nota che lo dichiara e' un'informazione. */
t("il campo che manca e' sempre spiegato in chiaro, mai lasciato a se' stesso", () => {
  lmKeys.forEach((k) => {
    const d = LM[k];
    ["att", "power", "ctrl"].forEach((f) => {
      if (!(f in d)) ok(String(d.note || "").trim(), k + ": manca «" + f + "» e non c'e' una nota che spieghi perche'");
    });
  });
});

t("la sigla senza produttore non finge di essere un modello", () => {
  const q = LM.oem_q310_100w;
  ok(q, "la luce OEM che l'utente possiede davvero e' in catalogo");
  eq(q.ver, "partial", "e si presenta come da verificare");
  ok(!("att" in q) && !("cri" in q) && !("color" in q), "senza scheda ufficiale non dichiara attacco, CRI ne' colore");
  ok(/NESSUNA SCHEDA UFFICIALE/.test(q.note), "e lo scrive: " + q.note);
  ok(/verificare/.test(A.lightModelSpecText(q)), "nel pannello arriva l'avviso: " + A.lightModelSpecText(q));
});

t("cio' che non si sa e' ASSENTE: mai null, mai zero", () => {
  lmKeys.forEach((k) => {
    const d = LM[k];
    Object.keys(d).forEach((f) =>
      ok(d[f] !== null && d[f] !== undefined, k + "." + f + " = null: il campo non dichiarato va TOLTO, non azzerato"));
    ["watt", "wattRated", "cri", "kg"].forEach((f) => {
      if (f in d) ok(typeof d[f] === "number" && d[f] > 0, k + "." + f + ": non e' un numero positivo");
    });
    if ("cct" in d) {
      ok(Array.isArray(d.cct) && d.cct.length === 2, k + ": la CCT si scrive [min,max]");
      ok(d.cct[0] > 0 && d.cct[1] >= d.cct[0], k + ": intervallo CCT incoerente");
    }
    if ("lamp" in d) ok(A.LIGHT_LAMP[d.lamp], k + ": sorgente sconosciuta (" + d.lamp + ")");
    if ("color" in d) ok(A.LIGHT_COLOR[d.color], k + ": colore sconosciuto (" + d.color + ")");
  });
});

t("nessun peso della testa spacciato per dichiarato quando non lo e'", () => {
  ok(!("kg" in LM.aputure_ls300x), "LS 300x: Aputure non pubblica il peso della sola testa, quindi il campo non c'e'");
  ok(/non dichiarato/.test(LM.aputure_ls300x.note || ""), "e la riga lo dice");
});

t("l'assorbimento non si confonde con la potenza nominale", () => {
  eq(LM.smallrig_rc120d.watt, 150, "RC 120D: 150 W assorbiti, non i 120 del nome commerciale");
  ok(!("watt" in LM.nanlite_forza300ii), "Nanlite non pubblica l'assorbimento: il campo non c'e'");
  eq(LM.nanlite_forza300ii.wattRated, 350, "resta la potenza nominale, scritta come tale");
  ok(/nominali/.test(A.lightModelSpecText(LM.nanlite_forza300ii)),
    "e il pannello lo dichiara: " + A.lightModelSpecText(LM.nanlite_forza300ii));
  ok(/assorbiti/.test(A.lightModelSpecText(LM.aputure_ls600dpro)),
    "dove l'assorbimento c'e', si chiama col suo nome: " + A.lightModelSpecText(LM.aputure_ls600dpro));
});

t("la riga di specifiche non stampa i campi che non esistono", () => {
  const s = A.lightModelSpecText(LM.aputure_ls300x);
  ok(!/kg/.test(s), "niente peso inventato: " + s);
  ok(/Bowens S/.test(s) && /350 W/.test(s), "ma quello che c'e' si legge: " + s);
});

t("scegliere un modello porta i watt sull'elemento", () => {
  eq(A.wattOf({ type: "farope", lm: "aputure_ls600dpro" }), 720);
  eq(A.wattOf({ type: "farope", lm: "smallrig_rc120d" }), 150);
  eq(A.wattOf({ type: "farope", lm: "nanlux_evoke2400b" }), 2400, "senza assorbimento vale il nominale dichiarato");
});

/* Trovato provando davvero nel browser: il campo Watt del pannello guardava solo la tabella dei
   TIPI, quindi su una tipologia nuova (senza default) i watt del modello arrivavano al motore
   elettrico ma restavano invisibili all'utente. */
t("il campo Watt compare anche se e' il MODELLO a dichiarare il consumo", () => {
  eq(A.hasWatt("__tipo_senza_watt"), false);
  eq(A.hasWattItem({ type: "__tipo_senza_watt" }), false, "senza modello non c'e' niente da mostrare");
  eq(A.hasWattItem({ type: "__tipo_senza_watt", lm: "aputure_ls600dpro" }), true);
  eq(A.wattOf({ type: "__tipo_senza_watt", lm: "aputure_ls600dpro" }), 720);
});

t("senza modello si torna al default del tipo, e il valore scritto a mano vince su tutto", () => {
  eq(A.wattOf({ type: "farope" }), A.WATT.farope);
  eq(A.wattOf({ type: "farope", lm: "aputure_ls1200dpro", watt: 300 }), 300);
});

t("un modello che non esiste non inventa watt", () => {
  eq(A.wattOf({ type: "farope", lm: "non_esiste_questo" }), A.WATT.farope);
  eq(A.lightModelWatt({ type: "farope", lm: "non_esiste_questo" }), null);
});

t("il campo modello vale per le luci da studio, non per i fari da palco", () => {
  eq(A.lightModelApplies({ type: "parluci" }), false, "il PAR ha gia' il suo «Modello del faro» dal catalogo prodotti");
  eq(A.lightModelApplies({ type: "farope" }), false);
  eq(A.lightModelApplies({ type: "chitarra" }), false);
  /* la tipologia della sottocategoria «Video e studio» prende il campo DA SOLA: e' cosi' che il
     catalogo funziona con le tipologie che arrivano dopo, senza toccare una riga di codice */
  A.TYPES.__lucecobtest = { nome: "Luce LED COB", cat: "Luci", sub: "Video e studio", w: 30, d: 30 };
  A.EQUIP_CATS_BY_TYPE.__lucecobtest = ["faro"];
  try {
    eq(A.lightModelApplies({ type: "__lucecobtest" }), true);
    eq(A.equipCatsFor({ type: "__lucecobtest" }), null,
      "e non si ritrova DUE campi modello: quello del catalogo prodotti si spegne, come per stage box e personal monitor");
  } finally { delete A.TYPES.__lucecobtest; delete A.EQUIP_CATS_BY_TYPE.__lucecobtest; }
});

t("il modello finisce nella lista luci e nel rider, ma solo se le icone lo dichiarano uguale", () => {
  reset();
  const a = add("farope", 300, 400), b = add("farope", 400, 400);
  a.lm = "aputure_ls600dpro"; b.lm = "aputure_ls600dpro";
  A.state.lights = { rows: [A.lightRow({ fn: "frontale", n: 2, gear: "farope", items: [a.id, b.id] })], blackout: null, mood: "" };
  eq(A.lightsList().rows[0].model, "Aputure LS 600d Pro");
  ok(/Aputure LS 600d Pro/.test(A.lightRowText(A.state.lights.rows[0])),
    "e nel rider: " + A.lightRowText(A.state.lights.rows[0]));
  b.lm = "smallrig_rc350d";
  eq(A.lightsList().rows[0].model, "", "due modelli diversi non sono un modello: sono due richieste");
  delete b.lm;
  eq(A.lightsList().rows[0].model, "", "una senza modello e la riga non ne dichiara nessuno");
  delete a.lm;
  eq(A.lightsList().rows[0].model, "", "nessun modello, nessuna riga in piu' nel rider");
});

t("una richiesta senza icone non si inventa un modello", () => {
  reset();
  eq(A.lightRowModel({ items: [] }), "");
  eq(A.lightRowModel({ items: ["morto1", "morto2"] }), "", "icone cancellate: niente modello, niente errore");
});


/* ====== IL DIMMER E' UNA DESTINAZIONE (Simone 29/07) =========================================
   «Controlla perche' i PAR non si collegano nel dimmer rack.» Non si collegavano perche' il dimmer
   non era una destinazione: era un CARICO da 3600 W fissi, e i fari gli passavano accanto per
   andare dritti al quadro — il contrario di come si cabla. */
console.log("\n— Il dimmer rack alimenta le luci —");

t("il dimmer riceve i fari, e non e' piu' un carico da 3600 W a vuoto", () => {
  reset();
  const dim = add("dimmerluci", 850, 250);
  ok(A.elecIsDistro(dim), "e' una destinazione");
  eq(A.wattOf(dim), 0, "da solo non assorbe niente: assorbe quello che porta");
  eq(A.WATT.dimmerluci, undefined, "e non c'e' piu' un numero fisso in tabella");
});
t("i PAR si collegano al dimmer, non al quadro", () => {
  reset();
  add("dimmerluci", 850, 250); add("quadro", 950, 80);
  for (let i = 0; i < 4; i++) add("parluci", 200 + i * 140, 250);
  A.state.elec.on = true; A.state.elec.mode = "auto"; A.__elecRes = null;
  const R = A.elecResult(true);
  const alDimmer = (R.loadLinks || []).filter((l) => l.distro.it && l.distro.it.type === "dimmerluci");
  eq(alDimmer.length, 4, "tutti e quattro al dimmer");
  const dim = (R.distros || []).filter((d) => d.it && d.it.type === "dimmerluci")[0];
  eq(Math.round(dim.loadW), 600, "e il dimmer porta la loro potenza (4 x 150 W)");
});
t("il dimmer risale al quadro come una ciabatta, e la potenza sale con lui", () => {
  reset();
  const dim = add("dimmerluci", 850, 250), q = add("quadro", 950, 80);
  for (let i = 0; i < 4; i++) add("parluci", 200 + i * 140, 250);
  A.state.elec.on = true; A.state.elec.mode = "auto";
  A.state.elec.uplinks = {}; A.state.elec.uplinks[dim.id] = { to: q.id };   /* il cavo che tira l'utente */
  A.__elecRes = null;
  const R = A.elecResult(true);
  eq((R.uplinks || []).length, 1, "il cavo dimmer -> quadro c'e'");
  const quadro = (R.distros || []).filter((d) => d.it && d.it.id === q.id)[0];
  eq(Math.round(quadro.loadW), 600, "il quadro vede la potenza delle luci attraverso il dimmer");
});
t("i canali del dimmer si contano come le prese di una ciabatta", () => {
  reset();
  const dim = add("dimmerluci", 850, 250);
  eq(dim.prese, undefined, "il default non si scrive nello stato");
  dim.prese = 24;
  reset();
  const d2 = A.normalizeState({ stage: { w: 1200, d: 800 },
    items: [{ id: "i1", type: "dimmerluci", x: 100, y: 100, prese: 900 }] }).items[0];
  ok(d2.prese <= 48, "un numero assurdo viene riportato nei limiti: " + d2.prese);
});

/* ====== MODIFICATORI DELLE LUCI CONTINUE (29/07) ==============================================
   Il softbox e' un ATTRIBUTO della luce, come il montaggio: niente id, niente orfani. Qui si
   difendono le tre promesse che valgono piu' del catalogo dei modificatori:
   (1) in pianta l'ingombro prevalente e' il MODIFICATORE, non l'apparecchio;
   (2) l'avviso di attacco AVVISA senza bloccare, e TACE dove non si sa;
   (3) il modificatore compare dove compare gia' l'apparecchio, senza liste nuove. */
console.log("\n— Modificatori delle luci continue —");

t("il modificatore vive solo sulle luci continue, e nasce assente", () => {
  reset();
  STUDIO.forEach((k) => ok(A.modApplies({ type: k }), k + ": non accetta un modificatore"));
  ok(!A.modApplies({ type: "parluci" }), "il PAR da palco non ha modificatori da studio");
  ok(!A.modApplies({ type: "chitarra" }), "e nemmeno una chitarra");
  const c = add("ledcob", 300, 300);
  eq(A.modKindOf(c), "", "nasce nuda");
  eq(A.modText(c), "", "e non scrive niente da nessuna parte");
  eq([c.w, c.d], [A.TYPES.ledcob.w, A.TYPES.ledcob.d], "con le misure dell'apparecchio");
});

t("e' un ATTRIBUTO: si scrive sull'item, e sparisce con lui", () => {
  reset();
  const c = add("ledcob", 300, 300);
  A.modSet(c, { kind: "octa" });
  eq(c.mod.kind, "octa", "sta dentro l'item, non in una lista a parte");
  ok(!("id" in c.mod), "nessun id da tenere vivo");
  eq(A.state.items.length, 1, "e non ha creato un secondo oggetto sul palco");
  A.modSet(c, { kind: null });
  ok(!("mod" in c), "tolto il tipo, l'attributo sparisce del tutto (come mountSet)");
  eq([c.w, c.d], [A.TYPES.ledcob.w, A.TYPES.ledcob.d], "e l'ingombro torna quello dell'apparecchio");
});

t("l'ingombro in pianta e' quello del modificatore, non della luce", () => {
  reset();
  const c = add("ledcob", 300, 300);
  const base = [A.TYPES.ledcob.w, A.TYPES.ledcob.d];
  A.modSet(c, { kind: "octa" });
  eq(c.w, 120, "un ottagonale da 120 su una COB da 30 occupa 120 cm di palco");
  eq(c.d, base[1] + A.MOD_KINDS.octa.dep, "e in profondita' l'apparecchio piu' la sporgenza del box");
  ok(c.w > base[0] * 3, "l'ingombro prevalente e' suo, e di parecchio");
  /* lo snoot invece STRINGE: l'apparecchio resta il piu' largo, e il footprint non cala mai sotto di lui */
  A.modSet(c, { kind: "snoot" });
  eq(c.w, base[0], "uno snoot non rende la luce piu' stretta di com'e'");
  eq(c.d, base[1] + A.MOD_KINDS.snoot.dep, "ma sporge lo stesso");
});

t("lo stripbox ha un orientamento, e in pianta si vede il lato giusto", () => {
  reset();
  const c = add("ledcob", 300, 300);
  A.modSet(c, { kind: "strip" });
  eq(A.modFace(c), [140, 30], "misura tipica di categoria: 140×30");
  eq(c.w, 140, "orizzontale: il lato lungo attraversa il palco");
  A.modSet(c, { vert: true });
  eq(c.w, A.TYPES.ledcob.w, "verticale: in pianta si vede il lato corto (30), e vince la luce (30)");
  ok(/verticale/.test(A.modText(c)), "e il testo lo dice: " + A.modText(c));
  A.modSet(c, { vert: null });
  eq(c.w, 140, "tornando orizzontale l'ingombro torna quello di prima");
});

t("le misure sono TIPICHE di categoria e si correggono a mano", () => {
  reset();
  const c = add("ledcob", 300, 300);
  A.modSet(c, { kind: "octa" });
  eq(A.modFace(c), [120, 120], "la taglia piu' diffusa dell'ottagonale");
  A.modSet(c, { a: 95 });
  eq(A.modFace(c), [95, 95], "un tondo ha una misura sola: cambiarla cambia il diametro");
  eq(c.w, 95, "e il palco se ne accorge");
  A.modSet(c, { a: 9999 });
  eq(A.modFace(c)[0], 600, "misure fuori scala si fermano al limite");
  /* ogni tipologia dichiara una taglia sensata, nessuna a zero */
  Object.keys(A.MOD_KINDS).forEach((k) => {
    const K = A.MOD_KINDS[k];
    ok(K.dep > 0, k + ": sporgenza mancante");
    if (K.a != null) ok(K.a >= 10 && K.a <= 300 && K.b > 0, k + ": misura fuori scala per la categoria");
    ok(typeof K.nome === "string" && K.nome.trim(), k + ": manca l'etichetta del mestiere");
  });
  eq(A.MOD_ORDER.length, Object.keys(A.MOD_KINDS).length, "l'ordine del pannello copre tutte le tipologie");
});

t("cio' che si monta addosso all'apparecchio non inventa misure sue", () => {
  reset();
  const p = add("ledpanel", 300, 300);
  A.modSet(p, { kind: "grid" });
  eq(A.modFace(p), [A.TYPES.ledpanel.w, A.TYPES.ledpanel.w], "la griglia e' larga quanto il pannello: nessun numero inventato");
  eq(p.w, A.TYPES.ledpanel.w, "e non allarga il palco");
  eq(A.modText(p), "griglia (eggcrate)", "nel testo niente misure: " + A.modText(p));
});

t("il disegno: il modificatore davanti, l'apparecchio con le SUE misure", () => {
  reset();
  const c = add("ledcob", 300, 300);
  A.modSet(c, { kind: "octa" });
  const body = A.modBody(c);
  eq([body.it.w, body.it.d], [A.TYPES.ledcob.w, A.TYPES.ledcob.d], "il draw riceve le misure vere, non quelle gonfiate: niente icona stirata");
  eq(body.dy, -A.MOD_KINDS.octa.dep / 2, "il corpo arretra di mezza sporgenza");
  eq(body.modY, A.TYPES.ledcob.d / 2, "e il softbox si posa davanti, cosi' l'insieme resta centrato");
  const svg = A.modOverSvg(c);
  ok(svg.indexOf("<path") > -1 && svg.indexOf("<line") > -1, "c'e' la sagoma e c'e' la faccia che emette");
  eq(A.modOverSvg({ type: "ledcob" }), "", "senza modificatore non si disegna niente");
  /* la faccia marcata sta DAVANTI (+y, dentro il gruppo traslato): e' il segno che dice da che
     parte esce la luce, e senza di lei il softbox sarebbe un rettangolo muto */
  const faccia = svg.match(/<line class="ic" x1="([-\d.]+)" y1="([-\d.]+)"/);
  ok(faccia, "la faccia che emette non e' disegnata: " + svg);
  eq(+faccia[2], A.MOD_KINDS.octa.dep / 2, "ed e' sul bordo anteriore del modificatore");
  eq(Math.abs(+faccia[1]), 60, "larga quanto la faccia dell'ottagonale da 120");
});

t("l'avviso di attacco AVVISA e non blocca, e tace dove non si sa", () => {
  reset();
  const c = add("ledcob", 300, 300);
  A.modSet(c, { kind: "octa" });
  eq(A.modFit(c), null, "senza modello dichiarato non si conosce l'attacco: nessun avviso");
  c.lm = "aputure_ls300d2";                       /* Bowens */
  eq(A.modFit(c).ok, true, "Bowens su Bowens: compatibile");
  c.lm = "nanlux_evoke1200";                      /* NL mount */
  const bad = A.modFit(c);
  eq(bad.ok, false, "NL mount con un softbox Bowens non si monta");
  eq(bad.need, "bowens");
  eq(bad.adapt, "", "nessun adattatore documentato: si segnala e basta, non si inventa");
  c.lm = "nanlite_forza60ii";                     /* FM mount, adattatore Bowens IN DOTAZIONE */
  ok(/dotazione/.test(A.modFit(c).adapt), "l'adattatore noto si suggerisce: " + A.modFit(c).adapt);
  c.lm = "litepanels_gemini2x1";                  /* il produttore NON dichiara l'attacco */
  eq(A.modFit(c), null, "modello dichiarato ma attacco no: non sapere non e' un difetto da contestare");
  c.lm = "aputure_ls300d2";
  A.modSet(c, { kind: "umbrella" });
  eq(A.modFit(c), null, "l'ombrello sta sullo stativo: l'attacco non e' una domanda");
  A.modSet(c, { kind: "barn" });
  eq(A.modFit(c), null, "le barn doors sono l'accessorio dedicato dell'apparecchio");
});

t("l'audit lo dice UNA volta sola, non una per faro", () => {
  reset();
  for (let i = 0; i < 8; i++) {
    const l = add("ledcob", 200 + i * 60, 300);
    l.lm = "nanlux_evoke1200";
    A.modSet(l, { kind: "octa" });
  }
  const f = A.auditEngine().findings.filter((x) => x.rule === "luci-mod-attacco");
  eq(f.length, 1, "otto luci sbagliate = un avviso solo (come gli appesi orfani)");
  eq(f[0].lvl, "warn", "avvisa, non blocca");
  ok(/8 modificatori/.test(f[0].msg), "e dice quanti sono: " + f[0].msg);
  ok(/NL mount/.test(f[0].msg) && /Bowens/.test(f[0].msg), "con i due attacchi in chiaro: " + f[0].msg);
  /* tolto il modello, l'avviso sparisce: non si sa piu' niente, e non si sa non e' un errore */
  A.state.items.forEach((l) => { delete l.lm; });
  eq(A.auditEngine().findings.filter((x) => x.rule === "luci-mod-attacco").length, 0,
    "senza modello dichiarato l'audit tace");
});

t("compare dove compare l'apparecchio: lista luci e rider, senza liste nuove", () => {
  reset();
  const a = add("ledcob", 300, 400), b = add("ledcob", 400, 400);
  A.modSet(a, { kind: "octa" }); A.modSet(b, { kind: "octa" });
  A.state.lights = { rows: [A.lightRow({ fn: "frontale", n: 2, gear: "ledcob", items: [a.id, b.id] })], blackout: null, mood: "" };
  const row = A.state.lights.rows[0];
  eq(A.modRowText(row), "softbox ottagonale 120");
  eq(A.lightsList().rows[0].mod, "softbox ottagonale 120", "nella colonna «Apparecchio» della lista luci");
  ok(/luci LED COB con softbox ottagonale 120/.test(A.lightRowText(row)), "e nel rider: " + A.lightRowText(row));
  /* stessa regola del modello: due modificatori diversi nella stessa riga non sono un modificatore */
  A.modSet(b, { kind: "strip" });
  eq(A.modRowText(row), "", "due diversi = due richieste, non una");
  A.modSet(b, { kind: "octa" }); A.modSet(b, { a: 95 });
  eq(A.modRowText(row), "", "e nemmeno due misure diverse dello stesso tipo");
  A.modSet(b, { a: null });
  eq(A.modRowText(row), "softbox ottagonale 120", "tornate uguali, la riga lo ridichiara");
  A.modSet(b, { kind: null });
  eq(A.modRowText(row), "", "una senza modificatore e la riga non ne dichiara nessuno");
});

t("una richiesta senza icone non si inventa un modificatore", () => {
  reset();
  eq(A.modRowText({ items: [] }), "");
  eq(A.modRowText({ items: ["morto1"] }), "", "icone cancellate: niente modificatore, niente errore");
});

t("la griglia e' un accessorio del box, e si legge nel testo", () => {
  reset();
  const c = add("ledcob", 300, 300);
  A.modSet(c, { kind: "octa", grid: true });
  eq(A.modGrid(c), true);
  ok(/con griglia/.test(A.modText(c)), A.modText(c));
  A.modSet(c, { kind: "lantern" });
  eq(A.modGrid(c), false, "una lantern non prende la griglia: il flag non si trascina dietro");
});

console.log("\n— Catena dello strumento: i pallini di prelievo —");

/* Le x dei pallini (i <circle> dei tap) nel diagramma della catena. */
function tapX(it) {
  const m = A.chainSvgMarkup(it).match(/<circle cx="([\d.]+)"/g) || [];
  return m.map((c) => parseFloat(c.match(/cx="([\d.]+)"/)[1]));
}

t("linea e mic della chitarra acustica non finiscono nello stesso punto", () => {
  reset();
  const gt = add("gtacustica", 300, 300);
  gt.strMic = true;                       /* accende anche il microfono sullo strumento */
  const xs = tapX(gt);
  eq(xs.length, 2, "attesi due pallini: linea e mic");
  ok(xs[0] !== xs[1], "le due etichette sono sovrapposte: stessa x " + xs[0]);
});

t("i due pallini restano distinguibili anche da spenti", () => {
  reset();
  const gt = add("gtacustica", 300, 300);
  gt.tapLine = false; gt.strMic = false;
  const xs = tapX(gt);
  ok(Math.abs(xs[0] - xs[1]) >= 24, "troppo vicini: le etichette si toccano ancora (" + xs + ")");
});

t("con la pedaliera i pallini stanno su nodi diversi e non si scontrano", () => {
  reset();
  const gt = add("gtacustica", 300, 300);
  gt.pedaliera = true; gt.pedXlr = true; gt.strMic = true;
  const xs = tapX(gt);
  eq(xs.length, 3, "attesi tre pallini: linea, XLR, mic");
  eq(new Set(xs).size, 3, "due pallini condividono la stessa x: " + xs);
});

t("uno strumento senza microfono proprio tiene il suo unico pallino al centro", () => {
  reset();
  const b = add("bassstand", 300, 300);
  eq(tapX(b).length, 1, "il basso non ha il prelievo mic sullo strumento");
});

console.log("\n— Chitarre: cosa esce davvero —");

t("la chitarra acustica esce di default dal pickup, in DI", () => {
  eq(A.MIKING.gtacustica.def, "di");
  ok(A.MIKING.gtacustica.options.some((o) => o[0] === "mic"), "deve poter essere microfonata");
  ok(A.MIKING.gtacustica.options.some((o) => o[0] === "dimic"), "deve poter fare DI + mic insieme");
});

t("la chitarra classica di default si microfona: non ha il piezo", () => {
  eq(A.MIKING.musChitClassica.def, "mic");
});

console.log("\n— Channel list piena: cosa si apre sopra —");

/* Il valore di z-index di un selettore, letto dal CSS sorgente. */
function zOf(sel) {
  const re = new RegExp(sel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*\\{[^}]*z-index:\\s*(\\d+)");
  const m = stylesCss.match(re);
  return m ? +m[1] : null;
}

t("la channel list piena sta sopra la scala dei modali", () => {
  const cl = zOf(".cl-ov");
  ok(cl && cl > 50, "la finestra piena deve stare sopra i modali normali (è " + cl + ")");
});

t("un dialogo aperto DALLA channel list le finisce sopra, non sotto", () => {
  /* «il CSV non esporta nulla»: il picker si apriva a z 50 sotto la finestra a z 300, e il
     bottone sembrava morto. Stesso destino toccava al PDF (Simone, 28/07 sera). */
  const cl = zOf(".cl-ov"), sopra = zOf("body.cl-open .modal");
  ok(sopra, "manca la regola che alza i modali quando la channel list è aperta");
  ok(sopra > cl, "un dialogo aperto dalla channel list resta sotto di lei: " + sopra + " vs " + cl);
});

t("anche il toast si vede, quando la channel list è aperta", () => {
  const cl = zOf(".cl-ov"), t = zOf("body.cl-open #cloudToast");
  ok(t && t > cl, "il messaggio di conferma resterebbe nascosto dietro la finestra");
});

t("la conferma delle azioni distruttive resta sopra a tutto", () => {
  const conf = zOf("body.cl-open #confirmModal");
  const modale = zOf("body.cl-open .modal");
  ok(conf && modale && conf >= modale, "la conferma deve restare almeno alla pari dei dialoghi");
});

t("il CSV della channel list produce righe, non un file vuoto", () => {
  reset();
  A.state.cab.on = true;
  add("cantante", 400, 300);
  add("batteria", 600, 400);
  add("stagebox", 200, 700);
  A.__cabRes = null;
  const r = A.channelListCsv();
  eq(r.count, 9, "9 canali: 1 voce + 8 microfoni della batteria");
  const righe = r.csv.trim().split(/\r?\n/);
  eq(righe.length, 10, "intestazione + 9 righe");
  ok(righe[0].indexOf("Canale") > -1, "manca l'intestazione");
  ok(righe[1].indexOf("Kick") > -1 || righe[1].indexOf("Voce") > -1, "prima riga vuota: " + righe[1]);
});

console.log("\n— Postazione a 2: la distanza fra i due —");

t("ogni strumento ha la sua distanza minima fisica", () => {
  eq(A.minSepType("contrabbasso"), 100, "il contrabbasso ingombra di più");
  eq(A.minSepType("violoncello"), 78);
  eq(A.minSepType("vlnpost"), A.DEFAULT_SEP, "il violino sta al minimo generico");
});

t("una postazione a due nasce a 90 cm, mai sotto il minimo fisico", () => {
  eq(A.defSepOf({ type: "vlnpost" }), 90);
  eq(A.defSepOf({ type: "contrabbasso" }), 100, "90 sarebbe sotto il minimo del contrabbasso");
});

t("allargare la distanza allarga l'ingombro della postazione", () => {
  const cfg = A.POSTAZ.vlnpost;
  const stretta = A.sepToW(cfg, 90), larga = A.sepToW(cfg, 150);
  ok(larga > stretta, "l'ingombro non è cresciuto con la distanza");
  eq(larga - stretta, 60, "l'ingombro deve seguire la distanza uno a uno");
});

t("il violino I è una postazione configurabile: la distanza ha senso solo a due", () => {
  const solo = { type: "vlnpost", vsec: 1 };
  eq(A.sepCfg(solo), null, "da solo non c'è nessuna distanza da regolare");
  ok(A.sepCfg({ type: "vlnpost", vsec: 1, doppia: true }), "a due la distanza va regolata");
});

console.log("\n— DI presa dal catalogo: adozione —");

/* Il caso reale: una DI trascinata dal catalogo accanto a una chitarra acustica. Visivamente
   sono collegate, nel dato no: la DI resta una sorgente e dichiara canali che non esistono. */
function chitarraConDiSciolta(stereo) {
  reset();
  const gt = add("gtacustica", 300, 200);
  /* oggi la chitarra nasce con la SUA DI generata: il caso reale è quello di chi l'ha tolta
     e ha posato accanto una DI presa dal catalogo (o di un progetto salvato prima). */
  const gen = A.diLinked(gt);
  if (gen) { A.state.items = A.state.items.filter((x) => x.id !== gen.id); delete gt.diId; delete gt.diOff; }
  const di = add("dimono", 225, 200);
  if (stereo) di.diCh = "stereo";
  A.__cabRes = null;
  return { gt, di };
}

t("una DI presa dal catalogo dichiara canali suoi, oltre allo strumento", () => {
  const { di } = chitarraConDiSciolta(true);
  ok(A.isAudioSource(di), "la DI sciolta dovrebbe contare come sorgente");
  eq(A.patchList().rows.length, 3, "attesi 3 canali: chitarra + DI stereo L/R");
});

t("adottata dalla chitarra, la DI smette di contare canali suoi", () => {
  const { gt, di } = chitarraConDiSciolta(true);
  A.diAdopt(di, gt);
  A.__cabRes = null;
  eq(di.diFor, gt.id, "la DI non punta allo strumento");
  eq(gt.diId, di.id, "lo strumento non punta alla DI");
  ok(!A.isAudioSource(di), "la DI adottata conta ancora come sorgente");
  eq(A.patchList().rows.map((r) => r.name), ["Chitarra acustica 1"], "resta un canale solo: la chitarra");
});

t("la DI adottata resta dove l'utente l'aveva messa", () => {
  const { gt, di } = chitarraConDiSciolta(false);
  const pos = { x: di.x, y: di.y };
  A.diAdopt(di, gt);
  eq({ x: di.x, y: di.y }, pos, "la DI è saltata altrove dopo l'adozione");
});

t("non si adotta una DI per uno strumento che non passa da DI", () => {
  reset();
  const voce = add("cantante", 300, 200);
  const di = add("dimono", 225, 200);
  eq(A.diAdopt(di, voce), false, "una voce non ha bisogno di una DI");
  ok(!di.diFor);
});

t("adottare una DI al posto di un'altra libera la precedente", () => {
  const { gt, di } = chitarraConDiSciolta(false);
  const vecchia = A.diApply(gt);                 /* la chitarra aveva già la sua DI generata */
  ok(vecchia && gt.diId === vecchia.id);
  A.diAdopt(di, gt);
  eq(gt.diId, di.id, "lo strumento non è passato alla DI adottata");
  ok(!A.state.items.some((x) => x.id === vecchia.id), "la DI generata è rimasta orfana sul palco");
});

t("una DI riassegnata a un altro strumento lascia il primo senza", () => {
  const { gt, di } = chitarraConDiSciolta(false);
  const gt2 = add("gtacustica", 400, 200);
  const gen2 = A.diLinked(gt2);
  if (gen2) { A.state.items = A.state.items.filter((x) => x.id !== gen2.id); delete gt2.diId; delete gt2.diOff; }
  A.diAdopt(di, gt);
  A.diAdopt(di, gt2);
  eq(gt2.diId, di.id, "il nuovo strumento non ha preso la DI");
  eq(gt.diId, undefined, "il primo strumento punta ancora a una DI che ora serve un altro");
  eq(di.diFor, gt2.id);
});

t("gli strumenti candidati sono quelli vicini, che passano da DI e non ne hanno già una", () => {
  const { gt, di } = chitarraConDiSciolta(false);
  add("cantante", 340, 200);          /* vicino ma non passa da DI */
  const lontana = add("gtacustica", 3000, 3000);   /* passa da DI ma è lontanissima */
  eq(A.diCandidates(di).map((x) => x.id), [gt.id], "candidati sbagliati");
  ok(A.diLinked(lontana), "la chitarra lontana ha la sua DI generata: non è un candidato");
});

t("uno strumento che ha già la sua DI non compare fra i candidati", () => {
  reset();
  add("gtacustica", 300, 200);        /* nasce con la sua DI generata */
  const di = add("dimono", 225, 260);
  eq(A.diCandidates(di).length, 0, "una chitarra già servita non deve adottarne un'altra");
});

t("una DI in più accanto a uno strumento già servito non viene contestata", () => {
  reset();
  add("gtacustica", 300, 200);
  const di = add("dimono", 225, 260); di.diCh = "stereo";
  A.__cabRes = null;
  ok(!hasRule("di-orfana"), "è una DI in più, legittima: lo strumento ha già la sua");
});

t("l'adozione regge il fulmine e il cestino della channel list", () => {
  /* i comandi di riga sono stati riscritti il 28-29/07: la riga della DI sparisce dopo l'adozione,
     e quello che resta cablato è il canale dello strumento. */
  const { gt, di } = chitarraConDiSciolta(true);
  A.state.cab.on = true;
  const box = add("stagebox", 900, 700); A.__cabRes = null;
  const rigaDi = A.patchList().rows.find((r) => r.itemId === di.id);
  ok(rigaDi, "prima dell'adozione la DI ha la sua riga");
  eq(A.cabConnectOne(rigaDi.key), box.id, "il fulmine collega la riga della DI");
  A.diAdopt(di, gt); A.__cabRes = null;
  const dopo = A.patchList().rows;
  eq(dopo.length, 1, "dopo l'adozione resta il solo canale della chitarra");
  ok(!dopo.some((r) => r.itemId === di.id), "la DI non ha più una riga sua");
  eq(A.cabConnectOne(dopo[0].key), box.id, "il fulmine collega il canale dello strumento");
  eq(A.cabUnlinkOne(dopo[0].key), 1, "il cestino toglie un canale solo");
  ok(!A.patchList().rows.some((r) => r.box), "e la lista resta senza cavi, senza righe fantasma");
});

console.log("\n— DI orfana: la regola di audit —");

t("una DI sciolta accanto a uno strumento che passa da DI viene contestata", () => {
  chitarraConDiSciolta(true);
  ok(hasRule("di-orfana"), "la regola non è scattata");
});

t("la regola tace se la DI è adottata", () => {
  const { gt, di } = chitarraConDiSciolta(true);
  A.diAdopt(di, gt);
  A.__cabRes = null;
  ok(!hasRule("di-orfana"), "la regola è scattata su una DI adottata");
});

t("la regola tace su una DI usata da sola, senza strumenti intorno", () => {
  reset();
  add("dimono", 225, 200);
  A.__cabRes = null;
  ok(!hasRule("di-orfana"), "una DI isolata è una scelta legittima");
});

t("una DI che non dichiara canali non viene contestata (zona di microfonazione)", () => {
  /* la regola parla di «canali in più»: se i canali non ci sono, non c'è niente da dire.
     Il conto si chiede a itemChannels, la stessa fonte della channel list. */
  const { di } = chitarraConDiSciolta(true);
  di.ownMic = false;                                   /* dichiarata assorbibile dalla zona */
  const z = add("miczone", 260, 200); z.w = 400; z.d = 300; A.__cabRes = null;
  eq(A.itemChannels(di), 0, "dentro la zona la DI non dichiara canali");
  eq(A.hasChannels(di), false);
  ok(!hasRule("di-orfana"), "nessun canale di troppo: nessun rilievo");
});

t("la chiave della regola è unica: un solo rilievo «di-orfana» anche con due DI sciolte", () => {
  const { gt, di } = chitarraConDiSciolta(true);
  const gt2 = add("gtacustica", 800, 200);
  const gen2 = A.diLinked(gt2);
  if (gen2) { A.state.items = A.state.items.filter((x) => x.id !== gen2.id); delete gt2.diId; delete gt2.diOff; }
  add("dimono", 730, 200);
  A.__cabRes = null;
  const rilievi = A.auditEngine().findings.filter((x) => x.rule === "di-orfana");
  eq(rilievi.length, 1, "la dedup è per chiave: un rilievo solo");
  ok(/2 DI non sono associate/.test(rilievi[0].msg), rilievi[0].msg);
  ok(gt && di, "riferimenti usati");
});

t("il fix adotta la DI dello strumento vicino", () => {
  const { gt, di } = chitarraConDiSciolta(true);
  const f = A.auditEngine().findings.filter((x) => x.rule === "di-orfana")[0];
  f.act.run();
  A.__cabRes = null;
  eq(di.diFor, gt.id);
  eq(A.patchList().rows.length, 1, "dopo il fix resta il solo canale della chitarra");
});

console.log("\n— Porte della stage box: sceglierle a mano —");

function trePreseCollegate() {
  reset();
  A.state.cab.on = true; A.state.cab.mode = "auto"; A.state.cab.manual = {};
  const a = add("cantante", 300, 300);
  const b = add("cantante", 500, 300);
  const c = add("cantante", 700, 300);
  const box = add("stagebox", 200, 700);
  A.__cabRes = null;
  return { a, b, c, box };
}
function porte() {
  A.__cabRes = null;
  const m = {};
  A.patchList().rows.forEach((r) => { if (!r.reserved) m[r.name] = r.patch; });
  return m;
}
function duplicate() {
  A.__cabRes = null;
  return (A.cabResult(true).issues || []).filter((i) => /duplicata/i.test(i.msg));
}

t("senza scelte a mano le porte vanno in ordine crescente", () => {
  trePreseCollegate();
  eq(porte(), { "Cantante 1": "A·1", "Cantante 2": "A·2", "Cantante 3": "A·3" });
});

t("assegnare una porta gia' occupata sposta l'altro invece di litigare", () => {
  const { c } = trePreseCollegate();
  A.cabSetPort(c.id + "#0", 1);            /* il terzo vuole la porta 1, che ha il primo */
  const p = porte();
  eq(p["Cantante 3"], "A·1", "chi ha scelto la porta non l'ha ottenuta");
  ok(p["Cantante 1"] !== "A·1", "il vecchio occupante è rimasto sulla porta 1");
});

t("gli altri si ridispongono in ordine crescente sulle porte libere", () => {
  const { c } = trePreseCollegate();
  A.cabSetPort(c.id + "#0", 1);
  const p = porte();
  eq([p["Cantante 1"], p["Cantante 2"]], ["A·2", "A·3"], "i non scelti non sono in ordine");
});

t("scegliere una porta a mano non produce l'errore di porta duplicata", () => {
  const { c } = trePreseCollegate();
  A.cabSetPort(c.id + "#0", 1);
  eq(duplicate().length, 0, "il motore segnala ancora un conflitto: " + JSON.stringify(duplicate()));
});

t("chi sceglie per ultimo vince: il pin precedente sulla stessa porta si libera", () => {
  const { b, c } = trePreseCollegate();
  A.cabSetPort(b.id + "#0", 5);
  A.cabSetPort(c.id + "#0", 5);            /* stessa porta, scelta dopo */
  const p = porte();
  eq(p["Cantante 3"], "A·5", "l'ultima scelta non ha vinto");
  ok(p["Cantante 2"] !== "A·5", "due canali sono rimasti sulla stessa porta");
});

t("liberare la scelta rimette il canale in fila", () => {
  const { c } = trePreseCollegate();
  A.cabSetPort(c.id + "#0", 1);
  A.cabSetPort(c.id + "#0", 0);            /* 0 = torna automatica */
  eq(porte(), { "Cantante 1": "A·1", "Cantante 2": "A·2", "Cantante 3": "A·3" });
});

t("una porta oltre la capienza della box non si assegna", () => {
  const { c } = trePreseCollegate();
  eq(A.cabSetPort(c.id + "#0", 99), false, "una porta inesistente va rifiutata");
});

/* ── incroci con quello che è arrivato dopo il 28/07 ── */

t("un canale riservato non si fa rubare la porta da un pin salvato prima", () => {
  const { c, box } = trePreseCollegate();
  A.cabSetPort(c.id + "#0", 3);            /* stato salvato PRIMA: il terzo aveva scelto la 3 */
  box.sbRes = [3];                          /* poi quella porta è diventata un canale riservato */
  A.__cabRes = null;
  ok(porte()["Cantante 3"] !== "A·3", "il pin si è preso la porta riservata");
  const res = A.patchList().rows.filter((r) => r.reserved);
  eq(res.length, 1, "il canale riservato è sparito dalla lista");
  eq(res[0].patch, "A·3", "il riservato non ha più la sua porta");
  eq(duplicate().length, 0, "porta riservata e pin sulla stessa porta: " + JSON.stringify(duplicate()));
});

t("una porta riservata non si puo' scegliere a mano", () => {
  const { a, box } = trePreseCollegate();
  box.sbRes = [3]; A.__cabRes = null;
  eq(A.cabSetPort(a.id + "#0", 3), false, "la riservata va rifiutata");
  ok(!(A.state.cab.manual[a.id + "#0"] || {}).port, "l'override è stato scritto lo stesso");
});

t("scollegando la riga, la porta scelta se ne va col cavo", () => {
  const { c } = trePreseCollegate();
  A.cabSetPort(c.id + "#0", 1);
  A.cabUnlinkOne(c.id + "#0");
  ok(!(A.state.cab.manual[c.id + "#0"] || {}).port, "resta una prenotazione senza cavo");
  const p = porte();
  eq(p["Cantante 1"], "A·1", "la porta 1 non è tornata a chi la prendeva per primo");
});

t("ricollegando col fulmine il canale non si riprende la vecchia porta", () => {
  const { c } = trePreseCollegate();
  A.cabSetPort(c.id + "#0", 1);
  A.cabUnlinkOne(c.id + "#0");
  ok(A.cabConnectOne(c.id + "#0"), "il fulmine non ha ricollegato la riga scollegata");
  const p = porte();
  eq(p["Cantante 1"], "A·1", "il ritorno si è ripreso la porta di un altro");
  eq(p["Cantante 3"], "A·3", "il canale ricollegato non è tornato automatico");
  eq(duplicate().length, 0, JSON.stringify(duplicate()));
});

function batteriaEVoce() {
  reset();
  A.state.cab.on = true; A.state.cab.mode = "auto"; A.state.cab.manual = {};
  const bat = add("batteria", 400, 300);
  const voc = add("cantante", 800, 300);
  add("stagebox", 200, 700);
  A.__cabRes = null;
  return { bat, voc };
}

t("la porta scelta su una riga della batteria vale per il multipolare, non per la riga", () => {
  const { bat } = batteriaEVoce();
  A.cabSetPort(bat.id + "#2", 3);          /* la scelta si fa da una riga, ma il cavo è uno solo */
  eq(Object.keys(A.state.cab.manual).filter((k) => k.indexOf("grp:") === 0).length, 1, "scritto sulla chiave della riga invece che su quella del percorso");
  eq((A.state.cab.manual["grp:" + bat.id] || {}).port, 3);
});

t("il multipolare entra su porte consecutive dalla porta scelta", () => {
  const { bat } = batteriaEVoce();
  A.cabSetPort(bat.id + "#2", 3);
  const p = porte();
  eq([p["Batteria 1 - Kick"], p["Batteria 1 - Overhead R"]], ["A·3", "A·10"], "il blocco non è consecutivo");
  eq(p["Cantante 1"], "A·1", "la voce non ha preso la prima porta rimasta libera");
  eq(duplicate().length, 0, JSON.stringify(duplicate()));
});

t("scegliere una porta dentro il blocco del multipolare lo rimette automatico, senza conflitti", () => {
  const { bat, voc } = batteriaEVoce();
  A.cabSetPort(bat.id + "#2", 3);          /* batteria su 3…10 */
  A.cabSetPort(voc.id + "#0", 5);          /* la voce vuole la 5, che è dentro il blocco */
  const p = porte();
  eq(p["Cantante 1"], "A·5", "l'ultima scelta non ha vinto");
  ok(!(A.state.cab.manual["grp:" + bat.id] || {}).port, "il multipolare ha tenuto un pin che si sovrappone");
  ok(Object.values(p).filter((v) => v === "A·5").length === 1, "due canali sulla stessa porta");
  eq(duplicate().length, 0, JSON.stringify(duplicate()));
});


/* ====== IL TIPO DI ASTA LO DICE LA COLONNA, NON IL MICROFONO (Simone 29/07) ==================
   Il conteggio deduceva il supporto dal modello di microfono: si cambiava una riga in «asta
   gigante» e il pacchetto tecnico continuava a chiedere una giraffa. Rider e channel list si
   contraddicevano sullo stesso foglio. */
console.log("\n— Aste: la colonna vince sul microfono —");

t("il vocabolario si classifica per intero, da qualunque parte arrivi", () => {
  eq(A.standKindFromLabel("asta giraffa"), "giraffa");
  eq(A.standKindFromLabel("asta gigante"), "gigante", "«gigante» prima di «giraffa»: sono due aste diverse");
  eq(A.standKindFromLabel("asta bassa"), "bassa");
  eq(A.standKindFromLabel("asta dritta"), "dritta");
  eq(A.standKindFromLabel("clip strumento"), "clip");
  eq(A.standKindFromLabel("headset"), "headset");
  eq(A.standKindFromLabel("interno/terra"), "terra");
  eq(A.standKindFromLabel(""), null, "niente supporto: DI e strumenti in linea");
  eq(A.standKindFromLabel("—"), null, "il trattino della tendina non e' un'asta");
  /* ogni voce proposta nella colonna dev'essere classificabile: una voce che non si sa contare
     e' una voce che sparisce silenziosamente dal rider */
  A.STAND_SUGGEST.filter((x) => x !== "—" && x !== "da tavolo").forEach((v) => {
    ok(A.standKindFromLabel(v), "non classificata: " + v);
  });
});
t("scegliendo l'asta nella colonna, il conteggio la segue", () => {
  reset();
  add("stagebox", 900, 100);
  const coro = add("micchoir", 400, 300);
  A.state.cab.on = true; A.state.cab.mode = "auto"; A.state.cab.manual = {}; A.__cabRes = null;
  const key = A.patchList().rows[0].key;
  eq(A.standNeeds().giraffa.tot, 1, "il microfono suggerisce una giraffa");
  A.cabSetStand(key, "asta gigante");
  A.__cabRes = null;
  eq(A.standNeeds().gigante.tot, 1, "ora e' una gigante");
  eq(A.standNeeds().giraffa.tot, 0, "e la giraffa non si conta piu'");
});
t("tornando all'automatico torna il suggerimento del microfono", () => {
  reset();
  add("stagebox", 900, 100);
  add("micchoir", 400, 300);
  A.state.cab.on = true; A.state.cab.mode = "auto"; A.state.cab.manual = {}; A.__cabRes = null;
  const key = A.patchList().rows[0].key;
  A.cabSetStand(key, "asta gigante"); A.__cabRes = null;
  eq(A.standNeeds().gigante.tot, 1);
  A.cabSetStand(key, null); A.__cabRes = null;   /* «(dal mic)» */
  eq(A.standNeeds().giraffa.tot, 1, "torna a contare quello che il microfono suggerisce");
  eq(A.standNeeds().gigante.tot, 0);
});
t("l'asta condivisa resta condivisa anche cambiando tipo", () => {
  reset();
  add("stagebox", 900, 100);
  const st = add("coppiast", 400, 300);
  A.state.cab.on = true; A.state.cab.mode = "auto"; A.state.cab.manual = {}; A.__cabRes = null;
  const righe = A.patchList().rows.filter((r) => r.itemId === st.id);
  eq(A.standNeeds().giraffa.tot, 1, "la coppia stereo parte con un'asta sola");
  A.cabSetStand(righe[0].key, "asta gigante"); A.__cabRes = null;
  eq(A.standNeeds().gigante.tot, 1, "cambiata in gigante");
  eq(A.standNeeds().gigante.tot + A.standNeeds().giraffa.tot, 1, "e resta UNA: la barra e' sempre una");
});


console.log("\n— Il lucchettino su chi non se lo disegna da se' —");
t("il tavolo bloccato porta il lucchettino, e senza lucchetto niente", () => {
  reset();
  const t2 = add("tavolo", 400, 300);
  const libero = A.itemMarkup(t2);
  eq(libero.indexOf("riser-lock"), -1, "libero: nessun segno");
  t2.locked = true;
  ok(A.itemMarkup(t2).indexOf("riser-lock") > -1, "bloccato: il segno c'e'");
  /* deve stare DOPO il disegno, o l'arte dell'elemento se lo mangia */
  const mk = A.itemMarkup(t2);
  ok(mk.indexOf("riser-lock") > mk.indexOf("fWoodL"), "il lucchettino e' disegnato sopra il piano del tavolo");
});
t("anche una barra sottile lo porta: la soglia delle pedane la escludeva", () => {
  reset();
  const am = add("americana", 400, 200);   /* 200x30: profondita' sotto la soglia 70x50 */
  am.locked = true;
  ok(A.itemMarkup(am).indexOf("riser-lock") > -1, "l'americana bloccata si riconosce");
  const tiny = add("metro", 700, 500); tiny.w = 30; tiny.locked = true;
  /* il metro se lo disegna da se' e ha la sua soglia: qui si verifica solo che non esploda */
  ok(typeof A.itemMarkup(tiny) === "string", "nessun errore sugli elementi minuscoli");
});
t("il lucchetto ferma davvero i piani d'appoggio", () => {
  reset();
  const t3 = add("tavolo", 400, 300);
  ok(A.itemEditable(t3), "libero si sposta");
  t3.locked = true;
  eq(A.itemEditable(t3), false, "bloccato no");
  const am = add("americana", 600, 100); am.locked = true;
  eq(A.itemEditable(am), false, "e nemmeno l'americana, che porta i fari");
});

/* ═══════════════════════════════════════════════════════════════════════════
   IL MIXER È UNA DESTINAZIONE (29/07)
   Prima: cabIsBox(dm3) = false, portKinds(dm3) = ["pow"], e con un DM3 sul palco il motore
   proponeva una DROP BOX ignorando i 16 ingressi che la console ha davvero sul retro.
   ═══════════════════════════════════════════════════════════════════════════ */
console.log("\n— Il mixer e' una destinazione —");

t("mixer e interfaccia sono destinazioni: chi non ha una stage box collega li'", () => {
  /* CAMBIATO IL 01/09 su segnalazione di un utente: «possibilità di connettere le sorgenti audio
     agli ingressi locali del mixer (senza usare una stagebox)». Aveva un gruppo acustico, un mixer
     sul palco e nessuna stage box: i suoi 17 canali non avevano dove andare, e l'audit gli chiedeva
     una stage box che non ha e non vuole.
     Prima erano destinazioni solo le stage box e gli OTTO modelli di console con ingressi
     dichiarati: chi ha un mixer qualunque restava fuori, ed è il caso più comune fuori dai grandi
     service.

     PERCHÉ NON CONTRADDICE «nessun dato inventato». La regola vale sui MODELLI REALI: di un DM3 il
     numero o sta nel manuale o non si scrive. Un elemento GENERICO non ha un costruttore da
     smentire — è un segnaposto che dice «qui c'è un mixer», e quanti ingressi abbia lo sa l'utente.
     È esattamente il trattamento che le stage box generiche hanno sempre avuto: default 16, campo
     «Ingressi» nel pannello per correggerlo. */
  reset();
  const dm3 = add("dm3", 600, 700);
  const gen = add("mixer", 200, 700);
  const ifc = add("audiointerface", 400, 700);
  ok(A.cabIsDest(dm3), "il DM3 dichiara 16 ingressi mic/line: e' una destinazione");
  eq(A.cabBoxCap(dm3), 16, "capienza dal modello");
  eq(A.cabBoxCapOut(dm3), 8, "uscite dal modello");
  ok(A.cabIsDest(gen), "e ora lo e' anche la console generica");
  eq(A.cabBoxCap(gen), 16, "col taglio di un mixer da palco, che si cambia dal pannello");
  ok(A.cabIsDest(ifc), "e l'interfaccia audio, dove chi registra collega i microfoni");
  eq(A.cabBoxCap(ifc), 2, "senza modello: due ingressi, il taglio più diffuso");
  /* Col modello scelto vale il SUO numero, che è un dato di targa letto sul manuale. */
  ifc.hw = "umc1820";
  eq(A.cabBoxCap(ifc), 8, "col modello scelto valgono i suoi 8 ingressi, non il default");
  /* IL MIXER MONITOR RICEVE ANCHE LUI, dal 02/09. Questo test difendeva l'opposto — «distribuisce
     gli ascolti, non riceve i cavi» — e la regola e' caduta per due motivi, in quest'ordine:
     · l'icona: il monmix usa l'illustrazione di un banco coi FADER, mentre la «Console / mixer» e'
       un rettangolo schematico. L'elemento che promette ingressi era quello che non li aveva, ed e'
       per questo che l'utente della segnalazione ed830b3e l'aveva scelto — e ci e' cascato anche
       chi la regola l'aveva scritta il mattino stesso;
     · il fatto tecnico: un banco monitor analogico HA ingressi, riceve lo split dal palco. «Non
       riceve» descriveva il flusso di un sistema con FOH e monitor separati, non l'apparecchio. */
  const mon = add("monmix", 800, 700);
  ok(A.cabIsDest(mon), "anche il mixer monitor riceve i cavi: e' un banco");
  eq(A.cabBoxCap(mon), 16, "col taglio di un banco da palco, che si cambia dal pannello");
  /* I PERSONAL MIXER no, e per una ragione diversa: arrivano in rete dal loro rack. */
  const pm = add("hearback", 900, 700);
  ok(!A.cabIsDest(pm), "il personal mixer no: arriva in rete dal suo rack, non dai cavi di palco");
});

t("la risposta a una segnalazione si legge nell'app, e una volta sola", () => {
  /* 02/09 — la home promette «il box arriva a me, e rispondo io», ma un canale per rispondere non
     c'era: il box non chiede la mail, e quella dell'account Google non e' stata lasciata per essere
     ricontattati. Simone ha scelto di rispondere DENTRO il prodotto, al rientro di quella persona.
     Qui si guarda il codice del bundle: il giro intero (chiamata → finestra → «letta» → box) e'
     provato nel browser, dove esiste un DOM e una fetch. */
  ok(/my-feedback-replies/.test(appjs), "l'app chiede se c'e' una risposta per chi e' loggato");
  /* SEGNATA LETTA SOLO SE LA FINESTRA E' DAVVERO NEL DOM. Questo test difendeva l'ordine opposto
     («prima di mostrarla»), e l'ordine opposto ha fatto danno: il 02/09, in PRODUZIONE, una
     risposta e' stata segnata letta senza che nessuno l'avesse vista — la finestra non e' comparsa
     e il testo e' sparito per sempre. Di una cosa che non e' mai apparsa non resta traccia, quindi
     nessuno se ne accorge: e' il tipo di guasto che non si segnala da solo.
     Resta invece giusto non aspettare la chiusura, o chi ricarica se la ritroverebbe ogni volta. */
  const mostra = appjs.slice(appjs.indexOf("function mostra(r, tok)"), appjs.indexOf("function controlla()"));
  ok(mostra.indexOf("guideDialog(") < mostra.lastIndexOf("segnaLetta"),
     "«letta» viene DOPO aver aperto la finestra");
  ok(/if\(ov && document\.getElementById\("guideDlg"\)\) segnaLetta/.test(mostra),
     "e solo se la finestra e' davvero comparsa: se non compare, la risposta torna al prossimo giro");
  /* Senza login non si chiede niente: chi non ha un account non ha segnalazioni proprie. */
  ok(/if\(!tok\) return;/.test(appjs), "nessun token, nessuna chiamata");
  /* E non si mette una finestra sopra un'altra: il benvenuto e la guida vengono prima. */
  ok(/guideDlg[\s\S]{0,120}\.modal:not\(\[hidden\]\)/.test(appjs),
     "aspetta che lo schermo sia libero invece di sovrapporsi");
  /* Rete giu' o function ferma: si tace. Un avviso rotto non deve rompere l'editor. */
  const blocco = appjs.slice(appjs.indexOf("function controlla()"), appjs.indexOf("function quandoLibero"));
  ok(/catch\(function\(\)\{\}\)/.test(blocco), "se la chiamata fallisce non succede niente");
});

t("i bottoni delle finestre guida reggono il dito", () => {
  /* Misurato l'02/09: stavano a 38 px anche col dito. La regola generale non li prendeva —
     `.guide-actions .btn` e' piu' specifico di `.btn`, e una @media non aggiunge specificita'.
     Riguarda ogni finestra guida, «Segnalazione inviata» e la guida del cablaggio comprese. */
  const coarse = bloccoCoarse(stylesCss);
  ok(/\.guide-actions \.btn\{[^}]*min-height:44px/.test(coarse) ||
     /@media \(pointer:coarse\)\{ \.guide-actions \.btn\{min-height:44px\} \}/.test(stylesCss),
     "col dito arrivano a 44");
  /* E col mouse restano i 38 di sempre. */
  const fuori = stylesCss.replace(/@media \(pointer:coarse\)\{[^@]*/g, "");
  ok(/\.guide-actions \.btn\{min-height:38px\}/.test(fuori), "col mouse non cambia niente");
});

t("una finestra guida lunga scorre invece di uscire dallo schermo", () => {
  /* 02/09: la risposta a una segnalazione e' un testo vero, non due righe. Misurata a 529 px: su un
     telefono piccolo (~550 px utili) i due bottoni finivano FUORI, e quella finestra si chiude solo
     da li' o con Esc — che sul telefono non c'e'. Restava bloccata. */
  const card = (stylesCss.match(/\.guide-card\{[^}]*\}/) || [""])[0];
  ok(/max-height:85vh/.test(card), "la card non supera l'altezza dello schermo: " + card.slice(0, 80));
  ok(/overflow-y:auto/.test(card), "e il testo lungo scorre dentro");
  ok(/max-height:85dvh/.test(card), "con dvh prima di vh: su mobile vh conta la barra del browser");
});

t("gli a capo della finestra si vedono davvero", () => {
  /* guideDialog scrive il messaggio con textContent: senza white-space nel CSS i paragrafi
     collassano in una riga sola. La risposta a una segnalazione ne ha tre: richiamo, testo, firma. */
  ok(/\.guide-msg\{[^}]*white-space:pre-line/.test(stylesCss), "il messaggio rispetta gli a capo");
});

t("la snake della stage box arriva al banco che sta sul palco", () => {
  /* 02/09, su domanda di Simone: «non posso collegare la stage box al mixer?».
     No, e c'era di peggio: `state.cab.home` nasceva null e restava null — l'unico codice che lo
     scrive e' il trascinamento del badge, e il badge si disegna solo se home esiste GIA'. Circolo
     chiuso. E siccome la snake si spinge solo `if(home)`, ogni stage box restava collegata a
     NIENTE: nove canali dentro e nessun cavo che ne esce, con un DM3 disegnato lì accanto.
     Ora, se il banco e' sul palco, e' lui il capolinea — come lo dichiarano i documenti veri
     (Music Box SD: «2× CL5 + RIO1606 + RIO3224, all Dante enabled»: console e rack I/O insieme). */
  reset();
  A.state.cab.on = true; A.state.cab.mode = "auto";
  add("cantante", 300, 400); add("batteria", 500, 400);
  add("stagebox", 400, 700);
  const dm3 = add("dm3", 900, 750);
  A.__cabRes = null;
  const h = A.cabHomePoint();
  ok(h, "il capolinea esiste anche senza che l'utente lo scelga");
  eq(h.x, 900, "ed e' dove sta il banco");
  eq(h.y, 750, "sulle sue coordinate, non su un punto inventato");
  const R = A.audioCablingEngine();
  eq(R.snakes.length, 1, "la snake dalla box al banco c'e': prima erano zero");
  eq(Math.round(R.snakes[0].x2), dm3.x, "e finisce sul DM3");
  /* Il banco non tira una snake verso se stesso. */
  ok(!R.snakes.some((s) => s.box.isMixer), "dal mixer non parte nessuna snake");
});

t("col banco in sala il punto d'arrivo si puo' finalmente creare", () => {
  /* Il seguito del circolo chiuso: senza console sul palco il capolinea resta nullo, e il badge che
     lo sposta si disegna solo se esiste GIA'. Prima non c'era nessun modo di uscirne, e il caso era
     pure MUTO: le box raccoglievano i canali e il disegno taceva sul fatto che il multipolare non
     andava da nessuna parte. Il punto nasce in sala davanti al palco («FOH ≤30 m davanti al palco»,
     rider Pink Martini); da lì si trascina come si e' sempre fatto. */
  reset();
  A.state.cab.on = true; A.state.cab.mode = "auto";
  add("cantante", 300, 400); add("batteria", 500, 400);
  add("stagebox", 400, 700);
  A.__cabRes = null;
  let R = A.audioCablingEngine();
  eq(R.snakes.length, 0, "di partenza la snake non va da nessuna parte");
  const avviso = R.issues.filter((i) => i.code === "nohome")[0];
  ok(avviso, "e adesso l'audit lo dice invece di tacere: " + R.issues.map((i) => i.msg).join(" | "));
  eq(avviso.lvl, "warn", "a un livello che il pannello mostra");
  const g = A.autoConnectNeeds("cabin");
  ok(g && /non arrivano da nessuna parte/.test(g.title), "e la guida propone di rimediare: " + (g && g.title));
  ok(g && g.action, "con un'azione, non solo con un rimprovero");
  try { g.action.run(); } catch (e) { /* aggiunto() tocca il DOM: lo stato pero' e' scritto */ }
  eq(A.state.cab.home.kind, "foh", "il punto nasce in sala");
  eq(A.state.cab.home.x, Math.round(A.state.stage.w / 2), "in mezzo alla larghezza");
  ok(A.state.cab.home.y > A.state.stage.d, "e oltre il bordo del palco, dove sta il pubblico");
  A.__cabRes = null; R = A.audioCablingEngine();
  eq(R.snakes.length, 1, "ora la snake c'e'");
  ok(!R.issues.some((i) => i.code === "nohome"), "e l'avviso sparisce da se'");
  /* IL PUNTO DEV'ESSERE VISIBILE. Nasce oltre il bordo del palco: con la vista stretta finisce
     fuori schermo, e premere il bottone sembra non fare niente. Qui si verifica il presupposto —
     che l'ancora entri nei bounds del contenuto — e che l'azione chiami fit(). La vista vera
     (`vb`) non e' misurabile in questo sandbox: `vb.x` resta null senza un DOM, e l'ho verificata
     nel browser. */
  const b = A.contentBounds();
  ok(b.y1 >= A.state.cab.home.y, "il punto sta dentro i bounds del contenuto: " + b.y1 + " ≥ " + A.state.cab.home.y);
  const i0 = appjs.indexOf("Metti il punto d'arrivo");
  ok(i0 > 0, "l'azione esiste nel bundle");
  const azione = appjs.slice(i0, i0 + 800);
  /* Ancorato a `typeof fit===` e non a `fit()`: il commento accanto DICE «fit() allarga fino a
     comprenderlo», quindi cercando `fit()` il test trovava il commento e restava verde anche con
     la riga tolta. Provato rimettendo il difetto: prima passava, ora cade. */
  ok(/typeof fit===/.test(azione), "e l'azione adatta la vista, o il punto nasce fuori schermo");
});

t("i cinque posti dove possono finire i cavi si possono finalmente scegliere", () => {
  /* `HOME_LABELS` elenca sei destinazioni da sempre, ma CINQUE non erano raggiungibili da nessun
     punto dell'interfaccia: l'unico modo di toccare il punto era trascinarlo, e trascinandolo
     diventava sempre «personalizzato». Dove finiscono i cavi e' un'informazione del rider — «FOH
     ≤30 m davanti al palco» la chiede Pink Martini — non una coordinata anonima. */
  reset();
  A.state.stage = { w: 1200, d: 800, blocks: [{ x: 0, y: 0, w: 1200, d: 800 }] };
  const posti = {};
  ["foh", "monitor", "stagerack", "right", "left"].forEach((k) => {
    A.state.cab.home = { kind: k, x: 0, y: 0 };
    const p = A.cabHomePoint();
    ok(p, "«" + k + "» da' un punto");
    eq(p.name, A.HOME_LABELS[k], "e si chiama come nel menu, non «Punto principale»");
    posti[k] = p.x + "," + p.y;
  });
  eq(Object.keys(posti).length, 5, "cinque scelte");
  eq(new Set(Object.values(posti)).size, 5, "e cinque posti DIVERSI: " + JSON.stringify(posti));
  /* Il FOH sta in sala, oltre il palco: e' la sua definizione. Le uscite laterali stanno ai bordi. */
  A.state.cab.home = { kind: "foh", x: 0, y: 0 };
  ok(A.cabHomePoint().y > A.state.stage.d, "il FOH e' oltre il bordo del palco");
  A.state.cab.home = { kind: "left", x: 0, y: 0 };
  ok(A.cabHomePoint().x < A.state.stage.w / 2, "l'uscita SX sta a sinistra");
  A.state.cab.home = { kind: "right", x: 0, y: 0 };
  ok(A.cabHomePoint().x > A.state.stage.w / 2, "e la DX a destra");
  /* Il menu esiste e le offre tutte e cinque, piu' il ritorno all'automatico. */
  /* Con la parentesi: senza, `showHomeMenuX` passava lo stesso e la mutazione restava invisibile. */
  ok(/function showHomeMenu\(/.test(appjs), "il menu esiste");
  const menu = appjs.slice(appjs.indexOf("function showHomeMenu("), appjs.indexOf("function showCabMenu("));
  ok(/\["foh","monitor","stagerack","right","left"\]/.test(menu), "e le elenca tutte e cinque");
  ok(/state\.cab\.home=null/.test(menu), "col banco sul palco si puo' tornare all'automatico");
  /* Il clic sul badge lo apre; il trascinamento resta com'era. */
  ok(/else if\(typeof showHomeMenu==="function"\)/.test(appjs), "il clic senza trascinamento apre il menu");
  /* Essendo il primo menu che si apre col clic NORMALE, col dito ci si arriva davvero: prima
     `.cab-ctx` usciva solo col tasto destro, che sul telefono non esiste. */
  ok(/\.cab-ctx-i\{[^}]*min-height:44px/.test(bloccoCoarse(stylesCss)), "e col dito le voci reggono");
});

t("col banco sul palco non si chiede niente a nessuno", () => {
  /* L'avviso e la guida NON devono comparire quando il capolinea c'e' gia' per conto suo: sarebbe
     un cartello che chiede una cosa gia' fatta. */
  reset();
  A.state.cab.on = true; A.state.cab.mode = "auto";
  add("cantante", 300, 400); add("stagebox", 400, 700); add("dm3", 900, 750);
  A.__cabRes = null;
  const R = A.audioCablingEngine();
  ok(!R.issues.some((i) => i.code === "nohome"), "nessun avviso: il banco e' li'");
  const g = A.autoConnectNeeds("cabin");
  ok(!(g && /non arrivano da nessuna parte/.test(g.title)), "e nessuna guida: " + (g && g.title));
});

t("con piu' banchi vince quello con piu' ingressi, e senza banco resta la scelta all'utente", () => {
  reset();
  A.state.cab.on = true;
  add("stagebox", 400, 700);
  const piccolo = add("mixer", 800, 750); piccolo.ch = 8; piccolo.label = "PICCOLO";
  const grande = add("dm3", 1000, 750); grande.label = "DM3";
  A.__cabRes = null;
  eq(A.cabHomePoint().id, grande.id, "il banco principale e' quello con piu' ingressi");
  /* Senza nessun banco sul palco (console in sala) non si inventa un capolinea: la snake va dove
     lo dice l'utente, ed e' il caso che resta da coprire. */
  A.state.items = A.state.items.filter((x) => x.type === "stagebox");
  A.__cabRes = null;
  eq(A.cabHomePoint(), null, "senza banco sul palco non si inventa niente");
});

t("se gli strumenti sono fuori dal palco l'app lo dice e sa rimediare", () => {
  /* Segnalazione 2bb13cda: «non è possibile che faccia un palco così e tutti gli elementi fuori».
     Il progetto vero: palco 0,5×0,5 m e TRENTA elementi fuori, disposti bene — tastiere in fondo,
     chitarre a destra, mic del coro davanti. Non uno che non aveva capito l'editor: uno che non si
     era accorto del rettangolo. E l'app, che le coordinate le conosce tutte, taceva. */
  reset();
  A.state.stage = { w: 50, d: 50, blocks: [{ x: 0, y: 0, w: 50, d: 50 }] };
  const posati = [];
  for (let i = 0; i < 6; i++) posati.push(add("cantante", 600 + i * 180, 400));
  A.__cabRes = null;
  eq(A.elementiFuoriDalPalco().length, 6, "stanno tutti fuori");
  const f = A.auditEngine().findings.filter((x) => /fuori dal palco/.test(x.msg))[0];
  ok(f, "e l'audit lo dice: " + auditMsgs().join(" | "));
  eq(f.lvl, "err", "come errore: il rider esce con un palco vuoto e tutto disegnato accanto");
  ok(/0,5 m × 0,5 m/.test(f.msg), "e dice quanto misura il palco, che e' la causa: " + f.msg);
  ok(f.act && /Adatta/.test(f.act.label), "con l'azione che rimedia");
  /* Le distanze fra gli elementi sono il lavoro fatto: non devono cambiare. */
  const primaD = Math.round(Math.hypot(posati[0].x - posati[1].x, posati[0].y - posati[1].y));
  f.act.run();
  const dopoD = Math.round(Math.hypot(posati[0].x - posati[1].x, posati[0].y - posati[1].y));
  eq(dopoD, primaD, "il blocco si sposta intero: le distanze restano");
  eq(A.elementiFuoriDalPalco().length, 0, "e ora sono tutti dentro");
  A.__cabRes = null;
  ok(!A.auditEngine().findings.some((x) => /fuori dal palco/.test(x.msg)), "l'avviso sparisce");
  ok(A.state.stage.w >= 200 && A.state.stage.d >= 200, "e il palco ha una misura vera");
});

t("uno o due elementi fuori sono una scelta, non un errore", () => {
  /* Una cassa in platea, un tecnico a lato: succede e va bene. Si parla solo quando sono TANTI e
     sono la MAGGIORANZA — trenta su trenta sono un equivoco sul rettangolo, due su venti no. */
  reset();
  for (let i = 0; i < 10; i++) add("cantante", 200 + i * 90, 400);   /* dentro il palco 12×8 */
  add("wedge", 1400, 900); add("wedge", 1500, 900);                  /* due fuori, di proposito */
  A.__cabRes = null;
  eq(A.elementiFuoriDalPalco().length, 2, "due fuori");
  ok(!A.auditEngine().findings.some((x) => /fuori dal palco/.test(x.msg)),
     "e l'app non dice niente: " + auditMsgs().join(" | "));
});

t("un palco sotto i due metri non esiste, e l'app lo dice", () => {
  reset();
  A.state.stage = { w: 50, d: 50, blocks: [{ x: 0, y: 0, w: 50, d: 50 }] };
  add("cantante", 25, 25);   /* dentro: cosi' non scatta l'altro avviso */
  A.__cabRes = null;
  const f = A.auditEngine().findings.filter((x) => /più piccolo di così non esiste/.test(x.msg))[0];
  ok(f, "lo dice: " + auditMsgs().join(" | "));
  /* Un palco vero non lo fa scattare. */
  reset(); add("cantante", 300, 300); A.__cabRes = null;
  ok(!A.auditEngine().findings.some((x) => /più piccolo di così/.test(x.msg)), "e su un palco normale tace");
});

t("il badge non si disegna sopra il banco", () => {
  /* Segnalazione 05322f1a: «cos'è quel rettangolo verde? è un bug?». Sì, mio, del mattino stesso:
     col capolinea su un ELEMENTO il badge finiva esattamente sulle sue coordinate, coprendolo con
     un rettangolo verde che sembrava un artefatto. E non serviva — il banco si vede già, col nome
     sotto. Resta per i punti GEOMETRICI, che non hanno un elemento a rappresentarli. */
  reset(); A.state.cab.on = true;
  add("cantante", 300, 400); add("stagebox", 400, 700);
  const sq = add("sq6", 900, 750); sq.label = "A&H SQ-6";
  A.__cabRes = null;
  const h = A.cabHomePoint();
  eq(h.kind, "desk", "il capolinea e' il banco");
  eq(h.x, sq.x, "e sta sulle sue coordinate — per questo il badge lo coprirebbe");
  ok(/if\(R\.home && R\.home\.kind!=="desk"\)/.test(appjs), "quindi non si disegna");
  /* Ma per un punto geometrico il badge serve, o non c'e' niente da vedere ne' da trascinare. */
  A.state.cab.home = { kind: "foh", x: 600, y: 920 };
  A.__cabRes = null;
  eq(A.cabHomePoint().kind, "foh", "col punto in sala il badge torna");
});

t("il capolinea si cambia dal pannello del banco, visto che il badge non c'e'", () => {
  /* Senza badge sul disegno serviva un altro accesso al menu: sta nel pannello del banco, dove si
     sta gia' guardando quando ci si chiede dove finiscono i cavi. */
  const html = readFileSync(join(root, "app/index.html"), "utf8");
  ok(/id="pIsHomeRow"/.test(html), "la riga esiste");
  ok(/id="pHomeChange"/.test(html), "col bottone che apre il menu");
  ok(/hp\.kind==="desk" && hp\.id===it\.id/.test(appjs),
     "e compare SOLO sull'elemento che e' davvero il capolinea, non su ogni banco");
  ok(/showHomeMenu\(e\.clientX, e\.clientY\)/.test(appjs), "il bottone apre lo stesso menu del badge");
});

t("col mixer monitor sul palco i canali hanno dove andare", () => {
  /* Questo test difendeva l'avviso «il mixer monitor non riceve i cavi», scritto il mattino del
     02/09 e CADUTO la sera stessa: ora il monmix riceve come ogni banco, e un cartello che spiega
     un divieto tolto sarebbe solo rumore.
     Il caso della segnalazione ed830b3e — un banco solo, rinominato «MIXER» — ora funziona e basta,
     senza che nessuno debba cambiare elemento. */
  reset(); A.state.cab.on = true;
  add("cantante", 300, 500); add("batteria", 500, 500);
  const mon = add("monmix", 700, 900);
  mon.label = "MIXER";                      /* com'era nel progetto vero */
  A.__cabRes = null;
  ok(A.cabIsDest(mon), "e' una destinazione");
  const R = A.auditEngine();
  ok(!hasMsg(/mixer monitor/i), "e non si dice piu' niente: " + auditMsgs().join(" | "));
  eq(R.errs, 0, "nessun errore");
  const cab = A.audioCablingEngine();
  ok(cab.capTot >= cab.totIn, "i canali ci stanno: " + cab.totIn + " su " + cab.capTot);
});
t("un personal mixer non e' un mixer monitor, e non gli si dice la stessa frase", () => {
  /* Corretto da Simone il 02/09: il codice metteva monmix e hearback nella stessa condizione, e la
     frase parlava solo di «mixer monitor» — anche a chi ha un Hear Back. Sono due apparecchi
     diversi: il banco monitor sta a lato palco e ha i suoi ingressi; il personal mixer e' il
     mixerino del musicista, a valle di un rack, raggiunto in RETE. Nessuno dei due riceve i cavi
     di palco, ma per ragioni diverse — e chi legge deve riconoscere il proprio, non una categoria
     che non esiste. */
  reset(); A.state.cab.on = true;
  add("cantante", 300, 500); add("batteria", 500, 500);
  add("hearback", 700, 600);
  A.__cabRes = null; A.auditEngine();
  ok(hasMsg(/personal mixer arrivano in rete/), "al personal mixer si parla di rete: " + auditMsgs().join(" | "));
  ok(!hasMsg(/mixer monitor/), "e non lo si chiama mixer monitor");
  const g = A.autoConnectNeeds("cabin");
  ok(g && /in rete/i.test(g.title), "e anche la guida dice la cosa giusta: " + (g && g.title));
});

t("chi disegna un duo non vede l'avviso del monitor", () => {
  /* Non avere una stage box non e' un errore e non e' una mancanza: dal 31/08 «la porta il
     service». L'avviso e' per chi STA cablando, non per chi butta giu' un palco al volo. */
  reset(); A.state.cab.on = false;
  add("cantante", 300, 500); add("monmix", 700, 900);
  A.__cabRes = null; A.auditEngine();
  ok(!hasMsg(/mixer monitor manda gli ascolti/), "col cablaggio spento non si dice niente");
});

t("con un mixer sul palco l'audit non chiede piu' una stage box", () => {
  /* Il cuore della segnalazione: l'utente aveva il banco sul palco e l'app continuava a dirgli che
     mancava una stage box — un avviso che non poteva togliere se non comprando una scatola. */
  reset();
  add("cantante", 300, 600);
  const g = A.autoConnectNeeds("cabin");
  ok(g && /non hanno dove arrivare/.test(g.title), "senza destinazioni l'avviso c'e' ancora: " + (g && g.title));
  ok(/mixer|interfaccia/i.test(g.msg), "e dice che va bene anche il mixer, non solo la stage box");
  add("mixer", 600, 800);
  eq(A.autoConnectNeeds("cabin"), null, "col mixer sul palco l'avviso sparisce");
});

t("gli ingressi del mixer generico si dichiarano dal pannello", () => {
  /* Il default e' un punto di partenza, non una verita': senza il campo per correggerlo saremmo noi
     a decidere quanti ingressi ha il banco di un altro — vedi il commento del test qui sopra. */
  const html = readFileSync(join(root, "app/index.html"), "utf8");
  ok(/id="pLocInWrap"/.test(html), "il blocco del campo esiste nel markup pubblicato");
  ok(/id="pLocIn"[\s\S]{0,400}value="32"/.test(html), "e arriva fino a 32 ingressi");
  ok(/CAB_DEST_LOCALE\[it\.type\]\)\{ it\.ch=\+this\.value/.test(appjs),
     "e il cambio scrive davvero it.ch: senza il gestore il campo sarebbe una decorazione");
  reset();
  const gen = add("mixer", 200, 700);
  gen.ch = 24;
  eq(A.cabBoxCap(gen), 24, "e la capienza segue quello che ha dichiarato l'utente");
});

t("col DM3 sul palco il motore NON propone piu' una drop box", () => {
  reset();
  add("dm3", 600, 740);
  add("cantante", 400, 300);
  add("wedge", 400, 420);
  A.state.cab.on = true; A.state.cab.mode = "auto"; A.state.cab.manual = {}; A.__cabRes = null;
  const R = A.cabResult(true);
  eq(R.boxes.filter((b) => b.auto).length, 0, "nessuna drop box proposta");
  ok(!R.issues.some((i) => /drop box/i.test(i.msg)), "e nessun avviso che ne parli");
  eq(R.boxes.length, 1, "l'unica destinazione e' il mixer");
  ok(R.boxes[0].isMixer, "ed e' marcata come mixer");
  eq(R.links.filter((l) => !l.deleted).length, 1, "il canale della voce ci finisce dentro");
});

t("il mixer non tira una snake verso il punto principale: e' lui il capolinea", () => {
  reset();
  add("dm3", 600, 740);
  add("cantante", 400, 300);
  A.state.cab.on = true; A.state.cab.mode = "auto"; A.state.cab.manual = {}; A.__cabRes = null;
  eq(A.cabResult(true).snakes.length, 0);
});

t("le porte del mixer si contano e si esauriscono", () => {
  reset();
  add("dm3", 600, 740);
  for (let i = 0; i < 18; i++) add("cantante", 100 + i * 40, 300);
  A.state.cab.on = true; A.state.cab.mode = "auto"; A.state.cab.manual = {}; A.__cabRes = null;
  const R = A.cabResult(true);
  eq(R.boxes[0].cap, 16, "il DM3 ne ha 16");
  ok(R.issues.some((i) => i.code === "cap"), "18 voci su 16 ingressi: l'audit lo dice");
});

t("l'audit non chiede una stage box quando c'e' gia' un mixer con ingressi", () => {
  reset();
  add("dm3", 600, 740);
  for (let i = 0; i < 6; i++) add("cantante", 100 + i * 60, 300);
  A.state.cab.on = true; A.state.cab.mode = "auto"; A.state.cab.manual = {}; A.__cabRes = null;
  ok(!A.auditEngine().findings.some((f) => f.rule === "nobox"), "niente «manca la stage box»");
});

/* ── DM3 con e senza Dante ── */
t("il DM3 esiste in due versioni e il modello le distingue", () => {
  eq(A.MIXER_DB.dm3.dante, true, "DM3-D: Dante di serie");
  eq(A.MIXER_DB.dm3std.dante, false, "DM3 STANDARD: niente Dante");
  eq(A.MIXER_DB.dm3.in, A.MIXER_DB.dm3std.in, "stessi ingressi analogici");
  ok(A.mixerVariants("dm3").length === 2, "sul palco si sceglie quale delle due");
});

t("le connessioni offerte sono quelle che quel mixer ha davvero", () => {
  reset();
  const dm3 = add("dm3", 600, 740);
  eq(A.mixerConnOpts(dm3).map((o) => o.id), ["an", "usb", "dante"], "DM3-D: tutte e tre");
  dm3.hw = "dm3std";
  eq(A.mixerConnOpts(dm3).map((o) => o.id), ["an", "usb"], "DM3 STANDARD: niente Dante");
  const cl5 = add("mixer", 200, 740); cl5.hw = "cl5";
  eq(A.mixerConnOpts(cl5).map((o) => o.id), ["an", "dante"], "CL5: Dante si', USB TO HOST no");
});

/* ── Computer → mixer: con che cosa ── */
t("il MacBook in analogico occupa due ingressi mic/line", () => {
  reset();
  const dm3 = add("dm3", 600, 740);
  const mac = add("laptop", 300, 300);
  A.state.cab.on = true; A.state.cab.mode = "auto"; A.state.cab.manual = {}; A.__cabRes = null;
  const R = A.cabResult(true);
  eq(R.boxes[0].used, 2, "due canali = due ingressi");
  eq(R.links.filter((l) => l.via).length, 0, "nessuna via digitale");
  eq(R.links[0].label, "DM3-D 1", "il patch nomina la console, non una «box A» che non esiste");
  ok(mac && dm3);
});

t("scegliendo USB o Dante il computer non occupa piu' nessun ingresso analogico", () => {
  reset();
  const dm3 = add("dm3", 600, 740);
  const mac = add("laptop", 300, 300);
  A.state.cab.on = true; A.state.cab.mode = "auto"; A.state.cab.manual = {}; A.__cabRes = null;
  A.cabResult(true);
  A.cabSetVia(mac, "dante"); A.__cabRes = null;
  const R = A.cabResult(true);
  eq(R.boxes[0].used, 0, "gli ingressi mic/line restano tutti liberi");
  eq(R.links.filter((l) => l.via === "dante").length, 2, "due canali sulla rete Dante");
  eq(R.links[0].label, "DANTE 1");
  eq(A.patchList().rows[0].patch, "DANTE 1", "e la channel list lo dice");
});

t("una connessione che il mixer non ha torna analogica invece di restare appesa", () => {
  reset();
  const dm3 = add("dm3", 600, 740);
  const mac = add("laptop", 300, 300);
  A.state.cab.on = true; A.state.cab.mode = "auto"; A.state.cab.manual = {}; A.__cabRes = null;
  A.cabResult(true);
  A.cabSetVia(mac, "dante"); A.__cabRes = null;
  dm3.hw = "dm3std";   /* la stessa console, ma la versione senza Dante */
  A.__cabRes = null;
  const R = A.cabResult(true);
  eq(R.links.filter((l) => l.via).length, 0, "niente Dante su un DM3 STANDARD");
  eq(R.boxes[0].used, 2, "il segnale torna nei due ingressi analogici");
});

t("i canali entrati via USB non si contano fra quelli da infilare negli XLR", () => {
  reset();
  const dm3 = add("dm3", 600, 740);
  const mac = add("laptop", 300, 300);
  for (let i = 0; i < 16; i++) add("cantante", 100 + i * 40, 300);
  A.state.cab.on = true; A.state.cab.mode = "auto"; A.state.cab.manual = {}; A.__cabRes = null;
  A.cabResult(true);
  A.cabSetVia(mac, "usb"); A.__cabRes = null;
  const R = A.cabResult(true);
  ok(!R.issues.some((i) => i.code === "cap"), "16 voci + il Mac via USB stanno in 16 ingressi");
  ok(dm3);
});

t("i cavi USB/Dante non finiscono nel conteggio dei cavi XLR", () => {
  reset();
  add("dm3", 600, 740);
  const mac = add("laptop", 300, 300);
  A.state.cab.on = true; A.state.cab.mode = "auto"; A.state.cab.manual = {}; A.__cabRes = null;
  A.cabResult(true);
  A.cabSetVia(mac, "usb"); A.__cabRes = null;
  const R = A.cabResult(true);
  eq(Object.keys(R.cables).length, 0, "nessun taglio XLR da preparare");
});

t("solo un computer sceglie la via: un microfono entra e basta", () => {
  reset();
  const dm3 = add("dm3", 600, 740);
  const voce = add("cantante", 300, 300);
  A.state.cab.on = true; A.state.cab.mode = "auto"; A.state.cab.manual = {}; A.__cabRes = null;
  A.cabResult(true);
  A.cabSetVia(voce, "dante"); A.__cabRes = null;   /* scritto a forza: il motore lo ignora */
  const R = A.cabResult(true);
  eq(R.links.filter((l) => l.via).length, 0, "un microfono in Dante non ci va");
  eq(R.boxes[0].used, 1);
  ok(dm3);
});

t("su una stage box la via non esiste: resta un cavo analogico", () => {
  reset();
  add("stagebox", 600, 740);
  const mac = add("laptop", 300, 300);
  A.state.cab.on = true; A.state.cab.mode = "auto"; A.state.cab.manual = {}; A.__cabRes = null;
  A.cabResult(true);
  A.cabSetVia(mac, "usb"); A.__cabRes = null;
  const R = A.cabResult(true);
  eq(R.links.filter((l) => l.via).length, 0);
  eq(R.boxes[0].used, 2, "due ingressi della stage box, come sempre");
});

/* ── migrazione: i progetti gia' salvati ── */
t("un progetto vecchio con stage box E mixer non cambia destinazione ai suoi cavi", () => {
  reset();
  add("stagebox", 200, 700);
  add("dm3", 900, 740);
  const voce = add("cantante", 200, 300);   /* vicinissima alla stage box */
  A.state.cab.on = true; A.state.cab.mode = "auto"; A.state.cab.manual = {}; A.__cabRes = null;
  const R = A.cabResult(true);
  const l = R.links.filter((x) => x.s.it.id === voce.id)[0];
  ok(!l.box.isMixer, "il cavo resta sulla stage box vicina");
});

t("le console non ancora verificate restano quello che erano", () => {
  reset();
  const q = add("q338", 600, 740);
  ok(!A.cabIsDest(q), "senza dati di targa non e' una destinazione");
  eq(A.portKinds(q).indexOf("pow") >= 0, true, "e mantiene la sua presa di corrente");
});

t("il mixer NON eredita il pannello della stage box (misure e Device ID restano suoi)", () => {
  reset();
  const dm3 = add("dm3", 600, 740);
  ok(!A.cabIsBox(dm3), "cabIsBox resta falso: niente ridimensionamento sui canali");
  eq(dm3.w, A.TYPES.dm3.w, "la console tiene le sue misure reali");
  eq(dm3.d, A.TYPES.dm3.d);
});


/* ====== IL PALLINO NON INCHIODA PIU' GLI ELEMENTI PICCOLI (Simone 29/07) ====================
   Su una DI (13x10 cm) l'area di presa del pallino audio copre il 408% del corpo: ogni tentativo
   di spostarla faceva partire un cavo, e la DI restava inchiodata dov'era. */
console.log("\n— Il pallino della porta e gli elementi piccoli —");

t("sotto la soglia il pallino esce dal corpo, sopra resta al centro", () => {
  reset();
  const di = add("dimono", 300, 250);
  ok(A.portDotOutside(di), "una DI e' troppo piccola per tenerselo dentro");
  const p = A.portDotPos(di, "audio");
  ok(p[0] > di.x + di.w / 2, "il pallino sta FUORI dal bordo destro: " + p.join(","));
  eq(p[1], di.y, "alla stessa altezza del centro: si trova a colpo d'occhio");
  const voce = add("cantante", 600, 300);
  eq(A.portDotOutside(voce), false, "su un cantante 70x120 il pallino ci sta comodo");
  eq(A.portDotPos(voce, "audio").join(","), [voce.x, voce.y].join(","), "e resta al centro, dov'era");
});
t("il CAVO continua a partire dal centro, anche quando il pallino e' fuori", () => {
  reset();
  const di = add("dimono", 300, 250);
  eq(A.portAnchor(di, "audio").join(","), [di.x, di.y].join(","), "l'ancora del cavo non si sposta");
  const p = A.portDotPos(di, "audio");
  ok(p[0] !== di.x, "mentre il pallino si', altrimenti non si prenderebbe l'elemento");
});
t("la soglia guarda l'AREA, non un elenco di tipi", () => {
  reset();
  const di = add("dimono", 300, 250);
  ok(A.portDotOutside(di));
  di.w = 120; di.d = 90;   /* la stessa DI ingrandita a mano dall'utente */
  eq(A.portDotOutside(di), false, "cresciuta, il pallino torna dentro: la regola e' geometrica");
});


/* ====== UN CAVO CANCELLATO NON TIENE LA PORTA (Simone 29/07) =================================
   Il cavo tolto resta come fantasma ripristinabile, ma il motore gli assegnava lo stesso una porta:
   su una box da 8 bastavano otto ripensamenti per esaurirla con mezzo palco scollegato. */
console.log("\n— Cavi cancellati e porte —");

function scenaPorte() {
  reset();
  const box = add("stagebox", 900, 100); box.ch = 8;
  ["astamic", "musChitAcustica", "cantante"].forEach((t, i) => add(t, 200 + i * 180, 400));
  A.state.cab.on = true; A.state.cab.mode = "auto"; A.state.cab.manual = {}; A.__cabRes = null;
  return box;
}
const patch = () => { A.__cabRes = null; return A.patchList().rows.map((r) => r.patch); };

t("cancellando un cavo la sua porta torna libera, e le altre scalano", () => {
  scenaPorte();
  eq(patch().join(","), "A·1,A·2,A·3");
  A.cabDeleteKey(A.patchList().rows[0].key);
  eq(patch().join(","), "A·1,A·2", "due canali, due porte: la 3 non resta impegnata da un cavo che non c'e'");
  const R = A.cabResult(true);
  eq(R.boxes[0].used, 2, "e la box dichiara due porte occupate, non tre");
});
t("ripristinando il cavo tutto torna com'era", () => {
  scenaPorte();
  const k = A.patchList().rows[0].key;
  const prima = patch().join(",");
  A.cabDeleteKey(k);
  A.cabManual(k).deleted = false; A.__cabRes = null;
  eq(patch().join(","), prima, "il fantasma si riprende il suo posto");
});
t("con la box quasi piena, cancellare fa spazio davvero", () => {
  reset();
  const box = add("stagebox", 900, 100); box.ch = 4;
  for (let i = 0; i < 4; i++) add("astamic", 150 + i * 150, 400);
  A.state.cab.on = true; A.state.cab.mode = "auto"; A.state.cab.manual = {}; A.__cabRes = null;
  eq(A.cabResult(true).boxes[0].used, 4, "piena");
  A.cabDeleteKey(A.patchList().rows[0].key);
  A.__cabRes = null;
  eq(A.cabResult(true).boxes[0].used, 3, "cancellato uno, c'e' posto per un altro");
  add("cantante", 700, 500); A.__cabRes = null;
  const righe = A.patchList().rows.filter((r) => r.box);
  eq(righe.length, 4, "e la sorgente nuova entra: " + righe.map((r) => r.patch).join(","));
});

// ── SET PERCUSSIONI COMPONIBILE (30/07) ────────────────────────────────────────────────────────
// Segnalazione utente: «possibilità di inserire percussioni singole per creare setup ad hoc».
// Prima "percussioni" era un blocco unico e immutabile; ora è componibile come batteria e timpani.
console.log("\n— Set percussioni componibile —");

t("il set nasce a 2 congas + bongos, con la sua misura vera", () => {
  reset();
  const p = add("percussioni", 400, 400);
  eq(A.parts(p).congas, 2, "due congas di partenza");
  eq(A.parts(p).bongos, true, "e i bongos");
  const [w, d] = A.COMP.percussioni.size(p);
  eq(p.w, w, "la larghezza segue i pezzi montati"); eq(p.d, d, "e così la profondità");
  ok(w > 100 && w < 130, "due congas + bongos stanno in poco più di un metro: " + w + " cm");
});

t("togliendo un pezzo il set si stringe, rimettendolo torna com'era", () => {
  reset();
  const p = add("percussioni", 400, 400);
  const largo = p.w;
  A.parts(p).bongos = false; A.drawPercussioni(p);
  ok(p.w < largo, "senza bongos è più stretto: " + p.w + " < " + largo);
  A.parts(p).bongos = true; A.parts(p).congas = 3; A.drawPercussioni(p);
  ok(p.w > largo, "con tre congas è più largo: " + p.w);
  A.parts(p).congas = 2; A.parts(p).bongos = true; A.drawPercussioni(p);
  eq(p.w, largo, "e si torna esattamente alla misura di prima");
});

t("i canali seguono i pezzi montati: niente Bongos in lista se i bongos non ci sono", () => {
  reset();
  const p = add("percussioni", 400, 400);
  eq(chans(p).length, 2, "congas + bongos");
  A.parts(p).bongos = false;
  eq(chans(p).map((c) => c.name).join(","), chans(p)[0].name, "resta un canale solo");
  ok(!chans(p).some((c) => /bongos/i.test(c.name)), "e non promette i bongos: " + chans(p).map((c) => c.name));
  A.parts(p).congas = 0; A.parts(p).bongos = true;
  ok(chans(p).every((c) => !/congas/i.test(c.name)), "e viceversa senza congas");
});

t("«Dividi in elementi» dà i pezzi veri, uno per uno", () => {
  reset();
  const p = add("percussioni", 400, 400); p.label = "Perc";
  A.parts(p).congas = 3;
  ok(A.isDecomposable(p), "il set è scomponibile come la batteria");
  const pezzi = A.COMP.percussioni.explode(p);
  const tipi = pezzi.map((x) => x.type);
  eq(tipi.filter((x) => x === "tumba" || x === "conga" || x === "quinto").length, 3, "tre congas distinte: " + tipi);
  ok(tipi.indexOf("bongos") > -1, "i bongos"); ok(tipi.indexOf("percussionistaR") > -1, "e il percussionista");
  ok(pezzi.every((x) => !x.label || x.label.indexOf("Perc") === 0), "ogni pezzo porta il nome del set: " + pezzi.map((x) => x.label));
});

t("i pezzi singoli esistono da soli e sono ognuno una sorgente", () => {
  reset();
  ["conga", "quinto", "tumba", "bongos"].forEach(function (tp) {
    const it = add(tp, 300, 300);
    eq(it.type, tp, tp + " si può posare da solo");
    eq(chans(it).length, 1, tp + " vale un canale");
    ok(it.w > 0 && it.d > 0, tp + " ha una misura");
  });
  ok(A.TYPES.conga.catalog !== false, "la conga sta in catalogo");   // catalog non impostato = visibile
  ok(A.TYPES.quinto.catalog === false, "quinto e tumba nascono dal Dividi, non affollano il catalogo");
});

t("le misure sono quelle vere: quinto < conga < tumba, e i bongos sono i più piccoli", () => {
  reset();
  const q = add("quinto", 100, 100), c = add("conga", 200, 100), tm = add("tumba", 300, 100), b = add("bongos", 400, 100);
  ok(q.w < c.w && c.w < tm.w, "11\" < 11¾\" < 12½\": " + [q.w, c.w, tm.w]);
  ok(b.d < q.w, "i bongos sono più bassi di una conga: " + b.d + " < " + q.w);
});

t("le percussioni non sono più un'illustrazione fissa (come la batteria)", () => {
  reset();
  eq(A.LOOK_ART.percussioni, undefined, "fuori da LOOK_ART");
  const p = add("percussioni", 400, 400);
  eq(A.look2Art(p), null, "nessuna illustrazione da sostituire al set");
  ok(A.drawPercussioni(p).length > 0, "e il set si disegna comunque");
});

t("un progetto vecchio si riapre: l'illustrazione diventa il set, senza perdere nulla", () => {
  reset();
  const s = A.normalizeState({ _v: 2, items: [{ id: "x1", type: "musPercussioni", x: 300, y: 300, label: "Perc", w: 168, d: 125, look: "illustrato" }], stage: { w: 1200, d: 800 } });
  const it = s.items[0];
  eq(it.type, "percussioni", "il tipo illustrato diventa il set componibile");
  eq(it.label, "Perc", "l'etichetta resta");
  eq(it.look, undefined, "e l'aspetto orfano viene ripulito");
});

// ── PICCOLE PERCUSSIONI (30/07, blocco B) ──────────────────────────────────────────────────────
// Il rischio del blocco A: dieci percussioni sul palco = dieci canali. Nessuno microfona uno shaker
// con un canale suo — il banco si riprende con uno o due panoramici.
console.log("\n— Piccole percussioni —");

const PICCOLE = ["djembe", "surdo", "tamburello", "campanaccio", "templeblocks", "triangoloperc"];

t("le piccole percussioni nascono SENZA canale proprio", () => {
  reset();
  PICCOLE.forEach(function (tp) {
    const it = add(tp, 300, 300);
    eq(chans(it).length, 0, tp + " non porta un canale suo appena posato");
  });
});

t("ma se ne microfoni una, il canale compare col mic giusto", () => {
  reset();
  const dj = add("djembe", 300, 300);
  dj.miking = "close";
  eq(chans(dj).length, 1, "un canale");
  eq(chans(dj)[0].mic, "e904", "col microfono da tamburo");
  dj.miking = "pan";
  eq(chans(dj).length, 0, "e tornando al panoramico sparisce");
});

t("un banco percussioni intero costa due canali, non otto", () => {
  reset();
  PICCOLE.forEach(function (tp, i) { add(tp, 300 + i * 90, 400); });
  const tv = add("tavolopercussioni", 600, 520); tv.miking = "pan2"; tv.label = "Perc";
  eq(A.state.items.length, 7, "sette elementi sul palco");
  const righe = A.patchList().rows.map((r) => r.name);
  eq(righe.length, 2, "due canali soli: " + righe.join(", "));
  ok(righe.join(",").indexOf("L") > -1, "la coppia panoramica: " + righe);
});

t("il tavolo percussioni è il mic d'insieme: muto, poi 1, poi 2 panoramici", () => {
  reset();
  const tv = add("tavolopercussioni", 500, 400); tv.label = "Perc";
  eq(chans(tv).length, 0, "appena posato è solo un piano d'appoggio");
  tv.miking = "pan1"; eq(chans(tv).length, 1, "un panoramico");
  tv.miking = "pan2"; eq(chans(tv).length, 2, "coppia stereo");
  eq(chans(tv).map((c) => c.mic).join(","), "KM184,KM184", "condensatori");
});

t("il tavolo percussioni si blocca come gli altri piani d'appoggio", () => {
  reset();
  const tv = add("tavolopercussioni", 500, 400);
  ok(A.isLockable(tv), "ha il lucchetto");
  tv.locked = true;
  eq(A.itemEditable(tv), false, "e bloccato non si sposta");
});

t("una zona panoramica assorbe i piccoli, ma NON i tamburi che si microfonano da vicino", () => {
  reset();
  PICCOLE.forEach(function (tp) { ok(A.zoneAbsorbable({ type: tp }), tp + ": lo copre il panoramico"); });
  ["conga", "tumba", "bongos", "cajon", "timbales"].forEach(function (tp) {
    eq(A.zoneAbsorbable({ type: tp }), false, tp + ": tiene il suo close mic anche dentro una zona");
  });
});

t("le misure sono di categoria: surdo > djembe > tamburello", () => {
  reset();
  const s = add("surdo", 100, 100), d = add("djembe", 200, 100), tb = add("tamburello", 300, 100);
  ok(s.w > d.w && d.w > tb.w, "18\" > 12\" > 10\": " + [s.w, d.w, tb.w]);
  ok(tb.w >= 25 && tb.w <= 30, "un tamburello da 10 pollici sta in ~26 cm: " + tb.w);
});

// ── NOTA SULL'ELEMENTO (30/07) ─────────────────────────────────────────────────────────────────
// Quello che il disegno non sa dire: «shaker, claves, güiro» sul tavolo percussioni, «fornito dalla
// band» sull'ampli. Sul palco un puntino accanto al nome, il testo nella lista Note del rider.
console.log("\n— Nota sull'elemento —");

t("una nota si scrive, si legge e si cancella senza lasciare tracce", () => {
  reset();
  const it = add("tavolopercussioni", 400, 400);
  eq(A.noteOf(it), "", "appena posato non ha note");
  it.note = "shaker, claves, güiro";
  eq(A.noteOf(it), "shaker, claves, güiro", "la nota si legge");
  it.note = "   ";
  eq(A.noteOf(it), "", "solo spazi = nessuna nota");
});

t("la lista Note raccoglie le note di tutti, nell'ordine del palco", () => {
  reset();
  const tv = add("tavolopercussioni", 300, 300); tv.label = "Tavolo perc"; tv.note = "shaker, claves";
  add("sedia", 500, 300);                                   // senza nota: non deve comparire
  const am = add("comboamp", 700, 300); am.label = "Ampli"; am.note = "fornito dalla band";
  const L = A.noteList();
  eq(L.count, 2, "solo chi ha una nota");
  eq(L.rows[0].name, "Tavolo perc", "primo quello posato per primo");
  eq(L.rows[1].note, "fornito dalla band", "e la sua nota");
});

t("sul disegno il puntino c'è solo dove c'è una nota", () => {
  reset();
  const a = add("comboamp", 300, 300); a.label = "Ampli";
  eq(A.noteDot(a), "", "senza nota nessun segno");
  a.note = "fornito dalla band";
  ok(A.noteDot(a).indexOf("lbl-dot") > -1, "con la nota compare il puntino");
});

t("il segno non dipende dall'etichetta: vale anche per chi nasce anonimo", () => {
  reset();
  const p = add("pedana", 400, 400);
  eq(p.label, "", "le pedane nascono senza nome");
  p.note = "altezza 40 cm, con scaletta";
  ok(A.noteDot(p).indexOf("lbl-dot") > -1, "il segno c'e' lo stesso (che finisca sul disegno lo verifica l'e2e)");
});

t("la nota che arriva da un file altrui viene tagliata e ripulita", () => {
  const lunga = "x".repeat(500);
  const s = A.normalizeState({ _v: 5, items: [
    { id: "n1", type: "sedia", x: 100, y: 100, note: lunga },
    { id: "n2", type: "sedia", x: 200, y: 100, note: { cattivo: true } },
    { id: "n3", type: "sedia", x: 300, y: 100, note: "  spazi da togliere  " },
  ], stage: { w: 1200, d: 800 } });
  eq(s.items[0].note.length, 140, "tagliata a 140");
  eq(s.items[1].note, undefined, "un oggetto al posto del testo viene buttato");
  eq(s.items[2].note, "spazi da togliere", "spazi ripuliti");
});

t("la lista Note è fra le pagine del rider e del link condiviso", () => {
  reset();
  const it = add("comboamp", 400, 400); it.note = "fornito dalla band";
  const cfg = A.pdfListConfig().notelist;
  ok(cfg && cfg.data, "la pagina esiste nella configurazione unica delle liste");
  eq(cfg.title, "Note", "col suo titolo");
  eq(cfg.data().count, 1, "e legge i dati veri");
  ok(A.availableViewerLists().indexOf("notelist") > -1 || A.availableViewerLists().some(function (x) { return x === "notelist" || x.key === "notelist"; }),
    "e compare fra le liste del link condiviso");
});

// ── I QUATTRO MODI DI COLLEGARE IL COMPUTER (31/07) ────────────────────────────────────────────
// Simone: «dal computer si può andare alla DI con l'uscita cuffie; oppure USB a una scheda audio,
// che ha i suoi I/O analogici o digitali; oppure USB diretto al mixer; oppure Dante».
// Prima la via scelta era solo un'etichetta sul cavo: analogico, USB o Dante, la lista scriveva
// sempre «Playback L / DI» — un rider che chiede una DI che non c'è.
console.log("\n— Le quattro vie del computer —");

const nDI = () => A.state.items.filter((x) => x.type === "dimono").length;

t("1) cuffie → DI → mixer: la DI c'è davvero, ed è il caso di partenza", () => {
  reset();
  const mac = add("laptop", 300, 400);
  eq(A.compViaOf(mac), "an", "si parte in analogico");
  eq(nDI(), 1, "la DI stereo nasce col computer");
  eq(chans(mac).map((c) => c.mic).join(","), "DI,DI", "e la lista chiede una DI");
});

t("3) USB e 4) Dante: niente DI, e la lista lo scrive", () => {
  reset();
  const mac = add("laptop", 300, 400); add("dm3", 900, 300);
  A.cabSetVia(mac, "usb");
  eq(nDI(), 0, "in USB la DI sparisce dal palco");
  eq(chans(mac)[0].mic, "USB", "e la colonna dice USB");
  A.cabSetVia(mac, "dante");
  eq(chans(mac)[0].mic, "Dante", "in Dante dice Dante");
  A.cabSetVia(mac, "an");
  eq(nDI(), 1, "tornando all'analogico la DI ricompare");
});

t("il numero di tracce non è più fisso a due", () => {
  reset();
  const mac = add("laptop", 300, 400); add("dm3", 900, 300);
  A.cabSetVia(mac, "usb");
  eq(chans(mac).length, 2, "di partenza è un playback stereo");
  mac.plCh = 8;
  eq(chans(mac).length, 8, "otto tracce = otto righe");
});

t("2) computer → scheda audio → mixer: è la scheda a uscire", () => {
  reset();
  const mac = add("laptop", 300, 400); mac.label = "MacBook";
  const ifc = add("audiointerface", 620, 400); ifc.label = "Scheda";
  eq(chans(ifc).length, 0, "senza modello e senza computer la scheda è muta");
  ifc.hw = "ultralitemk5";
  eq(chans(ifc).length, 0, "col modello ma senza computer, ancora muta");
  mac.ifaceId = ifc.id; mac.plCh = 8;
  eq(chans(mac).length, 0, "il computer non dichiara più canali suoi: li dichiara lei");
  eq(chans(ifc).length, 8, "otto tracce escono dalla scheda");
  eq(chans(ifc)[0].mic, "Line bal.", "in analogico sono uscite di linea");
});

t("la scheda non promette più canali di quanti la sua uscita ne porti", () => {
  reset();
  const mac = add("laptop", 300, 400);
  const ifc = add("audiointerface", 620, 400); ifc.hw = "ultralitemk5";
  mac.ifaceId = ifc.id; mac.plCh = 32;                 // ne chiede 32
  ifc.oVia = "ADAT";
  eq(chans(ifc).length, 8, "l'ADAT ne porta 8, e otto sono: " + chans(ifc).length);
  ifc.oVia = "S/PDIF coax";
  eq(chans(ifc).length, 2, "lo S/PDIF ne porta 2");
});

t("con la scheda in mezzo la DI sparisce, togliendola torna", () => {
  reset();
  const mac = add("laptop", 300, 400);
  const ifc = add("audiointerface", 620, 400); ifc.hw = "ucx2";
  eq(nDI(), 1, "prima c'è");
  mac.ifaceId = ifc.id; A.diApply(mac);
  eq(nDI(), 0, "con la scheda non serve");
  delete mac.ifaceId; A.diApply(mac);
  eq(nDI(), 1, "senza scheda torna");
});

t("le schede dichiarano solo le uscite che hanno davvero", () => {
  reset();
  const ifc = add("audiointerface", 500, 400);
  eq(A.ifaceOutOpts(ifc).length, 0, "senza modello nessuna opzione inventata");
  ifc.hw = "sc2i2g4";
  eq(A.ifaceOutOpts(ifc).map((o) => o.id).join(","), "an", "la 2i2 non ha uscite digitali");
  ifc.hw = "apollotwinx";
  ok(A.ifaceOutOpts(ifc).every((o) => o.id !== "ADAT"),
    "sull'Apollo Twin X la porta ottica è SOLO ingresso: non è una via d'uscita");
  ifc.hw = "ufx3";
  ok(A.ifaceOutOpts(ifc).some((o) => o.id === "MADI"), "la UFX III esce anche in MADI");
});

t("ogni scheda del registro porta la sua fonte", () => {
  const ids = Object.keys(A.IFACE_DB);
  ok(ids.length >= 20, "il registro è popolato: " + ids.length + " modelli");
  ids.forEach(function (id) {
    const m = A.IFACE_DB[id];
    ok(m.src && m.src.length > 10, id + ": manca la fonte del dato");
    ok(m.brand && m.model, id + ": manca marca o modello");
    ok(typeof m.out === "number", id + ": le uscite analogiche vanno dichiarate (0 se non ne ha)");
  });
});

// ── DISTANZA DEL NOME DALL'ELEMENTO (31/07) ────────────────────────────────────────────────────
// Simone: «stessa interfaccia della dimensione etichetta, ma per la distanza dallo strumento».
// Misurata in cm reali dal bordo. Era 9, e a 9 il disegno di quel che sta sotto (la DI generata da
// uno strumento) spuntava in mezzo alle parole del nome: dal 07/08 il default è 22.
console.log("\n— Distanza del nome —");

t("il default stacca il nome dal disegno e non si scrive nel documento", () => {
  reset();
  const it = add("wedge", 400, 300);
  eq(A.lblDistOf(it), 22, "22 cm dal bordo");
  eq(it.lblDist, undefined, "e la chiave non c'è: chi ha scelto la sua distanza se la tiene");
});

t("la distanza si legge, si limita e regge i valori sballati", () => {
  reset();
  const it = add("wedge", 400, 300);
  it.lblDist = 40; eq(A.lblDistOf(it), 40, "40 cm");
  it.lblDist = 999; eq(A.lblDistOf(it), 80, "il massimo è 80");
  it.lblDist = -5; eq(A.lblDistOf(it), 0, "sotto zero non si va");
  it.lblDist = "boh"; eq(A.lblDistOf(it), 22, "un valore non numerico torna al default");
});

// ── DOVE NASCE UN ELEMENTO POSATO DAL CATALOGO (11/08) ─────────────────────────────────────────
// Un elemento occupa il suo disegno E la striscia dove sta scritto il suo nome. Fino all'11/08 la
// ricerca del posto libero guardava solo il footprint: sette voci posate dal catalogo su un palco
// vuoto davano zero corpi sovrapposti e però due nomi su sette illeggibili, coperti dal disegno del
// vicino — anche su un palco 16×12, quindi non era mancanza di spazio.
console.log("\n— Dove nasce un elemento posato —");

t("la striscia del nome è ingombro: sotto per un wedge, sopra per chi ha la sedia", () => {
  reset();
  const w = add("wedge", 400, 300);
  const bw = A.lblBandOf(w);
  ok(bw.sotto >= A.lblDistOf(w), "sotto il wedge si tiene almeno la distanza del nome: " + bw.sotto);
  eq(bw.sopra, 0, "e niente sopra");
  const g = add("vlnpost", 900, 300);   /* postazione d'orchestra: nasce con la sedia */
  const bg = A.lblBandOf(g);
  ok(bg.sopra > 0 && bg.sotto === 0, "la postazione con sedia porta il nome sopra lo schienale: " + JSON.stringify(bg));
  const muto = add("wedge", 700, 600);
  muto.labelMode = "hidden";
  eq(A.lblBandOf(muto).sotto, 0, "un nome nascosto non occupa niente");
});

t("su un palco stretto il posto si cerca oltre la striscia del nome, non a ridosso del disegno", () => {
  reset();
  /* Palco a corridoio: destra e sinistra non offrono niente, quindi la scelta si legge sull'asse dove
     il nome vive davvero. Col criterio vecchio (solo footprint + 15 cm) il secondo wedge nasceva
     dentro la striscia del nome del primo. */
  A.state.stage = { w: 260, d: 1400, blocks: [{ x: 0, y: 0, w: 260, d: 1400 }] };
  const a = add("wedge", 130, 300);
  const banda = A.lblBandOf(a).sotto;
  ok(banda > 20, "il wedge porta il nome sotto di sé: " + banda);
  const p = A.findFreeSpotFor({ type: "wedge", w: a.w, d: a.d }, 130, 300);
  const dy = Math.abs(p.y - a.y);
  ok(dy >= a.d + banda, "il secondo sta oltre la striscia del nome del primo (" + Math.round(dy) + " cm ≥ " + Math.round(a.d + banda) + ")");
  ok(p.y - a.d / 2 >= 0 && p.y + a.d / 2 <= 1400, "e dentro il palco: y=" + p.y);
});

/* Questo protegge il rimedio, non un difetto storico: cercare più lontano per fare posto al nome
   faceva nascere la voce mezza sotto il boccascena (visto a schermo l'11/08). Il vincolo di perimetro
   è nato lì, e senza questo test sparirebbe alla prima riscrittura della spirale. */
t("la posa automatica non manda nessuno fuori dal palco", () => {
  reset();
  A.state.stage = { w: 800, d: 600, blocks: [{ x: 0, y: 0, w: 800, d: 600 }] };   /* il palco del primo avvio è 8×6 */
  ["batteria", "bassamp", "gtstand", "stagepiano", "cantante", "wedge", "mixer"].forEach((t2) => A.addItem(t2));
  const fuori = A.state.items.filter((o) => o.x - o.w / 2 < 0 || o.x + o.w / 2 > A.state.stage.w
    || o.y - o.d / 2 < 0 || o.y + o.d / 2 > A.state.stage.d);
  eq(fuori.length, 0, "nessuno nasce fuori dal palco: " + fuori.map((o) => o.label || o.type).join(", "));
});

t("una nota altrui con distanza fuori scala viene riportata nei limiti", () => {
  const s = A.normalizeState({ _v: 5, items: [
    { id: "d1", type: "wedge", x: 100, y: 100, lblDist: 5000 },
    { id: "d2", type: "wedge", x: 200, y: 100, lblDist: "x" },
  ], stage: { w: 1200, d: 800 } });
  eq(s.items[0].lblDist, 80, "tagliata a 80");
  eq(s.items[1].lblDist, undefined, "il non-numero viene buttato");
});

t("«applica a tutti» vede solo gli elementi dello stesso tipo con distanza diversa", () => {
  reset();
  const a = add("wedge", 200, 300), b = add("wedge", 400, 300), c = add("wedge", 600, 300);
  add("sedia", 800, 300);                                  // altro tipo: non c'entra
  eq(A.lblDistSiblings(a).length, 0, "all'inizio sono tutti uguali: niente da chiedere");
  a.lblDist = 30;
  eq(A.lblDistSiblings(a).length, 2, "ora gli altri due sono diversi");
  b.lblDist = 30; c.lblDist = 30;
  eq(A.lblDistSiblings(a).length, 0, "allineati, la domanda decade");
});

t("la distanza segue l'elemento quando lo si duplica", () => {
  reset();
  const it = add("quinta", 300, 300); it.lblDist = 35; it.label = "Quinta";
  A.selectOne(it.id); A.duplicateSel();
  const copia = A.state.items.filter((x) => x.type === "quinta" && x.id !== it.id)[0];
  ok(copia, "la copia c'è");
  eq(A.lblDistOf(copia), 35, "e porta con sé la distanza");
});

// ── CIABATTE ELETTRICHE (31/07) ────────────────────────────────────────────────────────────────
// Verifica a schermo su richiesta di Simone: i capi dei cavi cadevano FUORI dalla ciabatta, e la
// lista diceva «✓ tutti i carichi collegati» con metà catena elettrica aperta.
console.log("\n— Ciabatte elettriche —");

function scenaElec() {
  reset();
  A.state.elec.on = true; A.state.elec.mode = "manual"; A.state.elec.manual = {}; A.state.elec.uplinks = {};
  const q = add("quadro", 1000, 150);
  const c = add("ciabatta", 400, 300);
  const carichi = [add("comboamp", 250, 200), add("comboamp", 560, 200), add("stagepiano", 300, 430)];
  carichi.forEach((l) => { A.state.elec.manual[l.id] = { distro: c.id }; });
  A.__elecRes = null;
  return { q, c, carichi };
}

t("i capi dei cavi stanno DENTRO la ciabatta, non nel vuoto accanto", () => {
  const { c } = scenaElec();
  const R = A.elecResult(true);
  eq(R.loadLinks.length, 3, "tre cavi");
  const meta = { x: c.w / 2, y: c.d / 2 };
  R.loadLinks.forEach(function (l) {
    const p = l.pts[0];
    ok(Math.abs(p[0] - c.x) <= meta.x, "capo dentro in larghezza: " + p[0] + " vs " + c.x + "±" + meta.x);
    ok(Math.abs(p[1] - c.y) <= meta.y, "capo dentro in profondità: " + p[1] + " vs " + c.y + "±" + meta.y);
  });
});

t("e convergono tutti nello stesso punto, come i cavi audio", () => {
  const { c } = scenaElec();
  const R = A.elecResult(true);
  const partenze = R.loadLinks.map((l) => l.pts[0][0] + "," + l.pts[0][1]);
  eq(new Set(partenze).size, 1, "un solo punto d'arrivo: " + partenze.join(" · "));
  eq(partenze[0], c.x + "," + c.y, "ed è il centro della ciabatta");
});

t("una ciabatta senza linea al quadro viene contata: la lista non può dire «tutto a posto»", () => {
  const { c } = scenaElec();
  const R = A.elecResult(true);
  eq(R.upPend, 1, "una ciabatta da alimentare");
  ok(R.issues.some((i) => /da collegare al quadro/.test(i.msg)), "e il motore lo dice");
});

t("collegata al quadro, il conto torna a zero", () => {
  const { q, c } = scenaElec();
  A.state.elec.uplinks[c.id] = { to: q.id };
  A.__elecRes = null;
  const R = A.elecResult(true);
  eq(R.upPend, 0, "niente più ciabatte scoperte");
  eq(R.uplinks.length, 1, "e la linea verso il quadro esiste");
});

t("il carico della ciabatta risale davvero sul quadro", () => {
  const { q, c } = scenaElec();
  A.state.elec.uplinks[c.id] = { to: q.id };
  A.__elecRes = null;
  const R = A.elecResult(true);
  const quadro = R.distros.filter((d) => d.it && d.it.id === q.id)[0];
  ok(quadro.loadW > 0, "il quadro vede i watt delle ciabatte a valle: " + quadro.loadW + " W");
});

// ── DANTE VIRTUAL SOUNDCARD (31/07) ────────────────────────────────────────────────────────────
// I numeri sono quelli del Dante Virtual Soundcard User Guide 4.5.x (Audinate): quanti canali porta
// non è una scelta libera, lo decidono licenza, velocità di rete e frequenza.
console.log("\n— Dante Virtual Soundcard —");

function macDante() {
  reset();
  const mac = add("laptop", 400, 400); mac.label = "MacBook";
  const mix = add("dm7", 900, 300);
  A.state.cab.on = true; A.state.cab.mode = "manual";
  const m = A.cabManual(A.cabItemRouteKey(mac)); m.box = mix.id; m.via = "dante";
  A.__cabRes = null;
  return { mac, mix };
}

t("i canali sono quelli del manuale, per rete e frequenza", () => {
  const { mac } = macDante();
  eq(A.dvsCfg(mac).ch, 64, "Gigabit a 48 kHz: 64×64");
  mac.dvsSr = 96;  eq(A.dvsCfg(mac).ch, 32, "a 96 kHz scende a 32");
  mac.dvsSr = 192; eq(A.dvsCfg(mac).ch, 8,  "a 192 kHz restano 8");
  mac.dvsSr = 48; mac.dvsNet = "100";
  eq(A.dvsCfg(mac).ch, 32, "su 100 Mbps la metà: 32");
  mac.dvsNet = "gb"; mac.dvsPro = true;
  eq(A.dvsCfg(mac).ch, 128, "con la licenza Pro si arriva a 128");
  mac.dvsSr = 192; eq(A.dvsCfg(mac).ch, 16, "Pro a 192 kHz: 16");
});

t("le latenze in più esistono solo con la licenza Pro", () => {
  const { mac } = macDante();
  eq(A.dvsCfg(mac).lats.join(","), "4,6,10", "standard");
  mac.dvsPro = true;
  eq(A.dvsCfg(mac).lats.join(","), "4,6,10,20,40", "Pro aggiunge 20 e 40 ms");
});

t("il DVS esiste solo in Dante, non nelle altre vie", () => {
  const { mac } = macDante();
  ok(A.dvsOn(mac), "in Dante c'è");
  A.cabSetVia(mac, "usb");
  eq(A.dvsOn(mac), false, "in USB no");
  A.cabSetVia(mac, "an");
  eq(A.dvsOn(mac), false, "in analogico nemmeno");
});

t("la nota per il rider dice il vincolo che conta: rete cablata", () => {
  const { mac } = macDante();
  const n = A.dvsNote(mac);
  ok(/64 canali/.test(n), "i canali: " + n);
  ok(/Gigabit/.test(n), "la rete");
  ok(/Wi-Fi non è supportato/.test(n), "e che il Wi-Fi non basta — è il dato che salva un soundcheck");
  mac.dvsNet = "100";
  ok(/100 Mbps/.test(A.dvsNote(mac)), "segue la rete dichiarata");
});

t("i default non si scrivono nel documento", () => {
  const { mac } = macDante();
  const c = A.dvsCfg(mac);
  eq(c.net, "gb", "Gigabit");
  eq(c.sr, 48, "48 kHz");
  eq(c.lat, 10, "10 ms");
  eq(c.pro, false, "licenza standard");
  eq(mac.dvsNet, undefined, "e nessuna chiave scritta");
  eq(mac.dvsSr, undefined, "");
  eq(mac.dvsLat, undefined, "");
});

// ── LE TRATTE DANTE DEL COMPUTER NELLA LISTA RETE (31/07) ──────────────────────────────────────
// Un portatile col Virtual Soundcard è un nodo di rete come una stage box: vuole il suo cavo e una
// porta dello switch. Nella lista Rete non compariva, e la tratta più delicata — quella che pretende
// una porta Gigabit cablata — restava fuori dal rider.
console.log("\n— Rete: tratte Dante del computer —");

function scenaRete(opts) {
  opts = opts || {};
  reset();
  const mac = add("laptop", 300, 620); mac.label = "MacBook";
  const mix = add("dm7", 1200, 200); mix.label = "DM7";
  A.state.cab.on = true; A.state.cab.mode = "manual"; A.state.cab.mixer = "dm7";
  const m = A.cabManual(A.cabItemRouteKey(mac)); m.box = mix.id; m.via = "dante";
  let sw = null;
  if (opts.switch) { sw = add("netswitch", 900, 400); sw.label = "Switch"; }
  A.__cabRes = null;
  return { mac, mix, sw };
}

t("il computer in Dante genera la sua tratta di rete", () => {
  const { mac } = scenaRete();
  const N = A.netEngine();
  const dvs = N.runs.filter((r) => r.kind === "dvs");
  eq(dvs.length, 1, "una tratta per il computer");
  eq(dvs[0].proto, "dante", "protocollo Dante");
  eq(dvs[0].comp.id, mac.id, "ed è la sua");
  ok(dvs[0].lenM > 0, "con una lunghezza vera: " + dvs[0].lenM.toFixed(1) + " m");
  ok(/Cat/.test(dvs[0].medium), "su rame entro il limite: " + dvs[0].medium);
});

t("col switch in scena il computer ci va, e occupa una porta", () => {
  const { sw } = scenaRete({ switch: true });
  const N = A.netEngine();
  const dvs = N.runs.filter((r) => r.kind === "dvs")[0];
  eq(dvs.sw && dvs.sw.id, sw.id, "va allo switch, non alla console");
  ok(N.swUsed >= 1, "e una porta se la prende: " + N.swUsed + "/" + N.swPorts);
});

t("la lista Rete dice il vincolo della porta cablata", () => {
  scenaRete();
  const N = A.netEngine();
  ok(N.issues.some((i) => /Wi-Fi non è supportato/.test(i.msg)),
    "l'avviso c'è: " + N.issues.map((i) => i.msg).join(" | "));
});

t("in USB o analogico nessuna tratta di rete: non è un nodo Dante", () => {
  const { mac } = scenaRete();
  A.cabSetVia(mac, "usb"); A.__cabRes = null;
  eq(A.netEngine().runs.filter((r) => r.kind === "dvs").length, 0, "USB non fa rete");
  A.cabSetVia(mac, "an"); A.__cabRes = null;
  eq(A.netEngine().runs.filter((r) => r.kind === "dvs").length, 0, "analogico nemmeno");
});

t("un computer in Dante senza console né switch non inventa una tratta", () => {
  reset();
  const mac = add("laptop", 300, 620);
  A.state.cab.on = true; A.state.cab.mode = "manual";
  A.cabManual(A.cabItemRouteKey(mac)).via = "dante";
  A.__cabRes = null;
  eq(A.netEngine().runs.filter((r) => r.kind === "dvs").length, 0, "niente destinazione, niente cavo");
});

t("la lista Rete non va in ricorsione (cabResult chiama netEngine)", () => {
  const { mac } = scenaRete({ switch: true });
  // se netEngine rientrasse in cabResult qui si bloccherebbe: il test esiste per questo
  const N = A.netEngine();
  const R = A.cabResult(true);
  ok(N && R, "entrambi i motori rispondono");
  eq(A.netEngine().runs.filter((r) => r.kind === "dvs").length, 1, "e il risultato è stabile");
});

// ── I MODELLI IN VETRINA (31/07) ───────────────────────────────────────────────────────────────
// Simone: «lasciare le formazioni più professionali, tipo dj o matrimonio vanno tolti — devono
// essere professionali, coerenti e facili da capire». Più «Orchestra pop», dal suo modello.
console.log("\n— Modelli in vetrina —");

t("in vetrina ci sono solo organici, non occasioni", () => {
  const chiavi = A.START_MODELS.map((m) => m[0]);
  ok(chiavi.indexOf("matrimonio") < 0, "niente Matrimonio: è un'occasione, non una formazione");
  ok(chiavi.indexOf("dj") < 0, "niente DJ set");
  ok(chiavi.indexOf("orchpop") > -1, "c'è Orchestra pop");
});

t("i vecchi link non si rompono: matrimonio e DJ esistono ancora", () => {
  ["matrimonio", "dj"].forEach((k) => {
    const fd = A.formationData(k);
    ok(fd && fd.out && fd.out.length >= 8, k + ": si apre ancora da /stage-plot/?model=" + k);
  });
});

t("OGNI modello in vetrina arriva completo: elementi, canali e uscite", () => {
  A.START_MODELS.forEach(function (m) {
    const fd = A.formationData(m[0]);
    ok(fd, m[1] + ": la formazione esiste");
    ok(fd.out.length >= 10, m[1] + ": ha un palco vero (" + fd.out.length + " elementi)");
    ok(fd.inp.length > 0, m[1] + ": ha la sua channel list (era il buco del Tributo)");
    ok(fd.outp.length > 0, m[1] + ": e le sue uscite");
    ok(fd.out.every((it) => A.TYPES[it.type]), m[1] + ": nessun tipo inventato");
    ok(A.FORM_TITLES[m[0]], m[1] + ": ha un titolo");
  });
});

t("Orchestra pop: l'organico è quello del modello, senza nomi di persona", () => {
  const fd = A.formationData("orchpop");
  eq(fd.out.length, 35, "35 elementi");
  const conta = (t) => fd.out.filter((i) => i.type === t).length;
  eq(conta("vlnpost"), 6, "sei postazioni violini");
  eq(conta("trombone"), 3, "tre tromboni");
  eq(conta("pedana"), 2, "le due pedane digradanti");
  ok(conta("batteria") === 1 && conta("gtstand") === 1 && conta("stagepiano") === 1, "la ritmica pop c'è");
  ok(conta("direttore") === 1, "e il direttore");
  const etichette = fd.out.map((i) => i.label || "").join(" ");
  ok(!/cozza|valerio/i.test(etichette), "nessun nome di persona finito nel repo pubblico");
});

t("Orchestra da camera: il layout curato, non il ventaglio generato", () => {
  const fd = A.formationData("camera");
  const conta = (t) => fd.out.filter((i) => i.type === t).length;
  eq(fd.out.length, 21, "21 elementi");
  eq(conta("vlnpost"), 8, "otto violini, quattro per sezione");
  eq(conta("podio"), 1, "il podio del direttore");
  ok(fd.out.every((i) => !i.doppia), "postazioni singole: in un organico da camera ogni leggio è un musicista");
  ok(fd.out.filter((i) => i.type === "vlnpost").every((i) => i.rot !== undefined || i.x === 0),
    "le rotazioni sono quelle curate a mano");
});

t("le formazioni possono dichiarare il loro palco, e non viene riadattato", () => {
  const band = A.formationData("band"), cam = A.formationData("camera");
  eq(band.stage.w, 1600, "la band nasce larga 16 m, non sul quadrato 12×8");
  eq(band.stage.d, 650, "e profonda 6,5");
  // girato il 31/07 su conferma di Simone: nei teatri l'orchestra sta su palchi LARGHI, e questa era
  // l'unica formazione della serie a nascere in verticale.
  ok(cam.stage && cam.stage.w > cam.stage.d, "anche l'orchestra da camera nasce più larga che profonda");
  ok(A.START_MODELS.every(function (m) {
    const st = A.formationData(m[0]).stage;
    return !st || st.w >= st.d;
  }), "nessun modello nasce su un palco più profondo che largo");
  // chi non lo dichiara continua ad adattarsi al contenuto, come prima
  ok(!A.formationData("acoustic").stage, "l'acustica non dichiara nulla: si adatta");
});

t("Orchestra pop non calpesta Orchestra e band: sono due cose diverse", () => {
  const pop = A.formationData("orchpop"), ob = A.formationData("orchband");
  ok(pop.out.length !== ob.out.length, "organici diversi");
  const popH = pop.out.filter((i) => i.type === "pedana").length;
  ok(popH >= 2, "la pop ha le pedane digradanti per legni e ottoni: " + popH);
});

/* --- SEO: la guida «scheda tecnica della band» (03/08) ---
   Perché esiste: in italiano le band cercano «scheda tecnica», i service dicono «rider tecnico».
   Su 21 pagine il sito aveva 687 occorrenze di «stage plot» e 15 di «scheda tecnica», nessun title
   che la nominasse, e nessuna delle 24 query GSC la conteneva: non eravamo in gara. Questi test
   presidiano l'aggancio (una pagina orfana non si indicizza — era il difetto dell'Ondata 1) e la
   separazione d'intento da /guida/rider-tecnico/, per non cannibalizzarci da soli. */
const schedaHtml = readFileSync(join(root, "guida/scheda-tecnica-band/index.html"), "utf8");

t("scheda tecnica: la pagina è agganciata, non orfana", () => {
  ok(readFileSync(join(root, "sitemap.xml"), "utf8").indexOf("https://stageplot.it/guida/scheda-tecnica-band/") > -1, "è in sitemap");
  const hub = readFileSync(join(root, "guida/index.html"), "utf8");
  ok(hub.indexOf('href="/guida/scheda-tecnica-band/"') > -1, "l'hub della guida la linka");
  ok(hub.indexOf('"url":"https://stageplot.it/guida/scheda-tecnica-band/"') > -1, "ed è nell'ItemList del CollectionPage");
  /* almeno tre link entranti da pagine diverse: è il segnale che ha risolto le orfane dell'Ondata 1 */
  const entranti = ["guida/rider-tecnico/index.html", "guida/channel-list-input-list/index.html", "stage-plot/band/index.html"]
    .filter((p) => readFileSync(join(root, p), "utf8").indexOf('href="/guida/scheda-tecnica-band/"') > -1);
  eq(entranti.length, 3, "link entranti dalle pagine sorelle: " + entranti.join(", "));
  ok(schedaHtml.indexOf('<link rel="canonical" href="https://stageplot.it/guida/scheda-tecnica-band/">') > -1, "canonical su sé stessa");
  ok(schedaHtml.indexOf('name="robots" content="index,follow') > -1, "indicizzabile");
});

t("scheda tecnica: non cannibalizza il rider tecnico", () => {
  const rider = readFileSync(join(root, "guida/rider-tecnico/index.html"), "utf8");
  const title = (s) => (s.match(/<title>([^<]*)<\/title>/) || ["", ""])[1];
  const h1 = (s) => (s.match(/<h1>([^<]*)<\/h1>/) || ["", ""])[1];
  ok(title(schedaHtml) !== title(rider), "title distinti");
  ok(h1(schedaHtml) !== h1(rider), "H1 distinti");
  /* l'intento è la differenza: qui «come compilare» (procedura), là «cos'è» (definizione) */
  ok(/come compilare/i.test(title(schedaHtml)), "la nuova punta alla procedura: " + title(schedaHtml));
  ok(/cos'è|cosa contiene/i.test(title(rider)), "il rider resta la definizione: " + title(rider));
  ok(rider.indexOf('href="/guida/scheda-tecnica-band/"') > -1, "e il rider manda esplicitamente alla procedura");
});

t("scheda tecnica: le FAQ visibili e quelle in JSON-LD dicono la stessa cosa", () => {
  /* convenzione del sito dall'Ondata 3: se divergono, Google vede un rich result che la pagina non ha */
  const ld = JSON.parse((schedaHtml.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/) || [])[1]);
  const faq = ld["@graph"].find((n) => n["@type"] === "FAQPage");
  ok(faq, "c'è il blocco FAQPage");
  const inLd = faq.mainEntity.map((q) => q.name);
  const visibili = [...schedaHtml.matchAll(/<summary>([\s\S]*?)<\/summary>/g)].map((m) => m[1]);
  eq(inLd.length, visibili.length, "stesso numero di domande (" + inLd.length + " vs " + visibili.length + ")");
  const mancanti = inLd.filter((q) => !visibili.includes(q));
  eq(mancanti.length, 0, "ogni domanda dello schema è anche visibile in pagina: " + mancanti.join(" | "));
  const article = ld["@graph"].find((n) => n["@type"] === "Article");
  ok(article && article.author && article.author["@id"] === "https://simonecastellan.com/#person",
    "l'autore riusa lo stesso @id delle altre guide (anello E-E-A-T)");
});

/* --- La radice è la landing, l'editor sta su /app/ (08/08) ---
   Perché esistono: lo spostamento tocca sette file scollegati fra loro (build, service worker, manifest,
   workflow, landing, link interni, sitemap) e ognuno rompe in silenzio. I due modi tipici: un link
   «Apri il tool» che finisce sulla landing invece che sull'editor (l'utente gira a vuoto), e un link
   già distribuito — ?view= al service, #p= in chat, la PWA installata — che atterra su una pagina di
   marketing invece che sul suo progetto. */
const landing = readFileSync(join(root, "index.html"), "utf8");
const shell = readFileSync(join(root, "app/index.html"), "utf8");

t("radice e editor sono due pagine diverse, e ognuna dice di esserlo", () => {
  ok(landing.indexOf("__BUILD_SHA_PLACEHOLDER__") === -1 && landing.indexOf('src="/app.js"') === -1,
    "la radice NON è la shell dell'app");
  ok(shell.indexOf("__BUILD_SHA_PLACEHOLDER__") > -1 && shell.indexOf('src="/app.js"') > -1,
    "la shell dell'app è quella generata dal build");
  ok(landing.indexOf('<link rel="canonical" href="https://stageplot.it/">') > -1, "landing: canonical sulla radice");
  ok(/name="robots" content="index,follow/.test(landing), "landing: indicizzabile");
  ok(shell.indexOf('<link rel="canonical" href="https://stageplot.it/app/">') > -1, "editor: canonical su /app/");
  ok(/name="robots" content="noindex,follow"/.test(shell), "editor: noindex (niente doppione in SERP)");
  /* i dati strutturati vivono dove c'è la pagina indicizzata, e in un posto solo */
  ok(landing.indexOf('"@type": "FAQPage"') > -1, "landing: FAQ in JSON-LD");
  ok(shell.indexOf("application/ld+json") === -1, "editor: nessun JSON-LD duplicato");
});

t("i link già distribuiti sopravvivono allo spostamento", () => {
  /* GitHub Pages non ha redirect lato server: il rimbalzo è lo script sincrono in testa alla landing */
  const boot = (landing.match(/<script>\(function\(\)\{function go\(\)\{[\s\S]*?<\/script>/) || [])[0] || "";
  ok(boot, "c'è lo script di rimando in testa alla landing");
  ok(boot.indexOf('addEventListener("hashchange", go)') > -1, "e riscatta anche su un hash incollato a pagina aperta");
  ok(boot.indexOf('location.replace("/app/"+s+h)') > -1, "rimanda a /app/ conservando query E hash");
  for (const p of ["view", "model", "export"]) ok(new RegExp("\\b" + p + "\\b").test(boot), "copre ?" + p + "=");
  ok(/\[#&\]\[pd\]=/.test(boot), "copre i progetti dentro l'hash (#p= / #d=)");
  ok(boot.indexOf("utm_source=pwa") > -1, "copre la PWA già installata (start_url vecchia)");
  ok(boot.indexOf("access_token") > -1, "copre il ritorno dal login Google (sessione nell'hash)");
  /* e la landing non può rimandare a sé stessa: sarebbe un ciclo infinito */
  ok(shell.indexOf('location.replace("/app/"') === -1, "l'editor non rimbalza a sua volta");
});

t("chi cerca il tool arriva al tool, chi cerca il sito arriva alla landing", () => {
  const pagine = readdirSync(root, { recursive: true, withFileTypes: true })
    .filter((d) => d.isFile() && d.name.endsWith(".html"))
    .map((d) => join(d.parentPath || d.path, d.name))
    /* Solo ciò che viene PUBBLICATO. `.claude/worktrees/` contiene copie di lavoro del sito, anche
       abbandonate e vecchie di settimane: leggerle rendeva questo test rosso per pagine che nessuno
       vedrà mai (l'11/08 accusava 220 CTA sbagliate, tutte dentro tre worktree dimenticati, mentre le
       52 pagine vere erano a posto). Un test che dipende da cosa c'è nelle cartelle di lavoro non
       protegge niente: il suo verde smette di voler dire qualcosa. */
    .filter((p) => pubblicata(p.slice(root.length)))
    .filter((p) => !/index\.template\.html$|[\\/]app[\\/]index\.html$|[\\/]index\.html$/.test(p) || /guida|stage-plot|consulenza|privacy|termini|richiesta/.test(p));
  ok(pagine.length >= 20, "trovate le pagine di contenuto: " + pagine.length);
  const sbagliati = [];
  for (const p of pagine) {
    const s = readFileSync(p, "utf8");
    for (const m of s.matchAll(/<a\b[^>]*href="\/"[^>]*>([\s\S]*?)<\/a>/g)) {
      const testo = m[1].replace(/<[^>]+>/g, "").trim();
      if (/tool|editor/i.test(testo)) sbagliati.push(p.replace(root, "") + " → «" + testo + "»");
    }
    for (const m of s.matchAll(/href="\/\?[^"]*"/g)) sbagliati.push(p.replace(root, "") + " → " + m[0]);
  }
  eq(sbagliati.length, 0, "nessuna CTA verso il tool punta ancora alla radice: " + sbagliati.slice(0, 5).join(" | "));
});

t("service worker, manifest e deploy sanno dov'è finito l'editor", () => {
  const sw = readFileSync(join(root, "sw.js"), "utf8");
  ok(sw.indexOf('"/app/"') > -1, "il SW precacha la shell in /app/");
  ok(!/PRECACHE = \[\s*"\/",/.test(sw), "e non precacha più la radice come se fosse l'app");
  ok(/CACHE_PREFIX \+ "v[3-9]"/.test(sw), "cache bumpata: la v2 conteneva la vecchia app sotto la chiave /");
  const man = JSON.parse(readFileSync(join(root, "manifest.webmanifest"), "utf8"));
  ok(man.start_url.indexOf("/app/") === 0, "la PWA parte dall'editor, non dalla landing: " + man.start_url);
  const wf = readFileSync(join(root, ".github/workflows/pages.yml"), "utf8");
  ok(/\bindex\.html app\b/.test(wf), "il deploy pubblica anche la cartella app/");
  ok(wf.indexOf("_site/app/index.html") > -1, "e timbra il build ID nella shell, non nella landing");
  /* /app/ è noindex: in sitemap non ci va, la radice sì */
  const sm = readFileSync(join(root, "sitemap.xml"), "utf8");
  ok(sm.indexOf("<loc>https://stageplot.it/</loc>") > -1, "la radice è in sitemap");
  ok(sm.indexOf("stageplot.it/app/") === -1, "una pagina noindex non va in sitemap");
});

t("la landing mostra il prodotto vero, e il prodotto vero arriva in produzione", () => {
  /* Perché esiste: l'hero è una schermata reale dell'editor servita da /img/. Il modo silenzioso in cui
     si rompe è il deploy: il workflow pubblica una ALLOWLIST di cartelle, e una cartella dimenticata
     non dà errore da nessuna parte — la landing va online con i buchi al posto delle immagini. */
  const wf = readFileSync(join(root, ".github/workflows/pages.yml"), "utf8");
  const srcs = [...landing.matchAll(/<img[^>]+src="(\/[^"]+)"/g)].map((m) => m[1]);
  ok(srcs.length >= 2, "la landing usa immagini vere: " + srcs.join(", "));
  for (const s of srcs) {
    const dir = s.split("/")[1];
    ok(new RegExp("\\b" + dir.replace(/\..*$/, "") + "\\b").test(wf), s + " sta in una cartella che il deploy pubblica");
    ok(readFileSync(join(root, s.slice(1))).length > 1000, s + " esiste ed è un file vero");
  }
  /* width+height espliciti: senza, l'immagine più grande della pagina fa saltare il layout mentre carica */
  for (const tag of landing.match(/<img[^>]*>/g) || []) {
    ok(/width="\d+"/.test(tag) && /height="\d+"/.test(tag), "ogni immagine dichiara le sue dimensioni: " + tag.slice(0, 70));
  }
  ok(!/<img[^>]+fetchpriority="high"[^>]+loading="lazy"/.test(landing), "l'immagine dell'hero non è lazy (è l'LCP)");
});

t("la dimostrazione «una modifica, tutto aggiornato» è completa", () => {
  /* È la sezione che porta il messaggio della pagina: se un pezzo si scollega, resta un bottone che
     non fa niente — e nessun test di layout se ne accorgerebbe. */
  for (const k of ["mic", "mon", "par"]) {
    ok(landing.indexOf('data-add="' + k + '"') > -1, "c'è il bottone " + k);
    ok(landing.indexOf('id="add-' + k + '"') > -1, "c'è l'elemento che compare sul palco per " + k);
    ok(landing.indexOf('id="row-' + k + '"') > -1, "c'è la riga di documento che ne discende per " + k);
    ok(landing.indexOf("'" + k + "'") > -1 || landing.indexOf('add-' + k) > -1, "il JS collega " + k);
  }
  ok(landing.indexOf('id="syReset"') > -1, "si può ricominciare");
  /* Il claim dell'hero e la promessa di questa sezione devono dire la stessa cosa. Dal 22/08 l'H1
     porta il differenziatore — «in scala», parola che compariva dodici volte in pagina e mai nel
     titolo — e la promessa del rider è scesa nel sottotitolo. Vanno presidiati SEPARATAMENTE: un
     test sull'intera pagina resterebbe verde anche se il sottotitolo perdesse la promessa, perché
     la frase ricorre altrove. */
  const h1 = (landing.match(/<h1[^>]*>([\s\S]*?)<\/h1>/) || [])[1] || "";
  ok(/in scala/i.test(h1), "l'H1 porta il differenziatore: " + h1.replace(/<[^>]*>/g, " ").trim());
  const subHero = (landing.match(/<p class="sub">([\s\S]*?)<\/p>/) || [])[1] || "";
  ok(/il rider si costruisce da solo/i.test(subHero), "e il sottotitolo dell'hero porta la promessa");
});

t("i numeri elettrici della landing tornano, e il quadro dice di che tipo è", () => {
  /* Trovato il 22/08 leggendo la pagina come la leggerebbe un fonico. Due difetti veri:

     1. lo schema elettrico dichiarava LUCI 4,6 kW, ma la lista sotto — 8 PAR LED 0,8 + 2 Fresnel
        1,3 + 2 sagomatori 1,3 — somma 3,4 kW. Due numeri diversi per la stessa cosa, nella stessa
        sezione. È esattamente il difetto che la pagina promette di NON fare («non allegati composti
        a mano: sono lo stesso dato del disegno»).

     2. «8,6 kW su 32A ✓ dentro i margini» non diceva se il quadro è mono o trifase. A 230V
        monofase un 32A porta 7,36 kW (IEC 60309), quindi 8,6 kW era OLTRE il limite e il ✓ una
        bugia; a 400V trifase porta ~22 kW e il ✓ è giusto. L'editor usa il trifase —
        `distro32:{a:32, ph:3}` in app.js — ma la landing non lo scriveva.

     Il test rifà i conti invece di controllare le stringhe: così vale anche per i numeri di domani. */
  const num = (t) => parseFloat(String(t).replace(",", "."));

  /* la somma della lista luci */
  const righeLuci = [...landing.matchAll(/<tr>\s*<td[^>]*>(\d+)<\/td>[\s\S]{0,220}?<td[^>]*>([\d,]+) kW<\/td>\s*<\/tr>/g)]
    .map((m) => num(m[2]));
  ok(righeLuci.length >= 3, "la lista luci ha le sue righe: " + righeLuci.length);
  const sommaLuci = Math.round(righeLuci.reduce((a, b) => a + b, 0) * 10) / 10;

  /* le tre voci dello schema elettrico e il totale dichiarato */
  const voci = {};
  for (const m of landing.matchAll(/<span class="kw-lab">([^<]+)<\/span>[\s\S]{0,120}?<span class="kw-val">([\d,]+) kW<\/span>/g))
    voci[m[1].trim()] = num(m[2]);
  const tot = num((landing.match(/<b>([\d,]+) kW ✓ dentro i margini<\/b>/) || [])[1]);

  eq(voci["LUCI"], sommaLuci, "la voce LUCI dello schema è la somma della lista luci");
  const sommaVoci = Math.round(Object.values(voci).reduce((a, b) => a + b, 0) * 10) / 10;
  eq(tot, sommaVoci, "e il totale sul quadro è la somma delle tre voci");

  /* il ✓ regge solo se il quadro e' quello giusto: 32A monofase a 230V porta 7,36 kW */
  const quadro = (landing.match(/TOTALE SU QUADRO (\d+)A( trifase)?/) || []);
  const ampere = +quadro[1], trifase = !!quadro[2];
  const monofaseMax = ampere * 230 / 1000;
  ok(trifase || tot <= monofaseMax,
    `${tot} kW su ${ampere}A: oltre i ${monofaseMax.toFixed(2)} kW del monofase, quindi va detto «trifase»`);
  ok(!trifase || tot <= ampere * 400 * Math.sqrt(3) / 1000, "e sta dentro il trifase");

  /* la stessa potenza va scritta uguale ovunque: compariva in cinque punti */
  const scritti = [...landing.matchAll(/([\d,]+) kW/g)].map((m) => m[1]);
  ok(scritti.filter((x) => num(x) === tot).length >= 4,
    "il totale è ripetuto identico nei punti in cui la pagina lo cita: " + scritti.join(" "));
});

t("la channel list dice quali canali vogliono il phantom, e lo dice giusto", () => {
  /* Aggiunta il 22/08. Fra gli essenziali di un input list secondo ProSoundWeb («Simple Yet Vital:
     Best Practices In Developing Input Lists And Stage Plots») e SoundGirls («How to Make an
     Awesome Audio Rider») c'è dire QUALI canali richiedono l'alimentazione phantom: chi riceve il
     rider deve saperlo prima di arrivare. L'editor la colonna ce l'ha dal 28/07, la landing no.

     Il test non si fida di quello che ho scritto a mano: confronta riga per riga con MIC_DB, che è
     il database del programma, compilato sulle schede dei costruttori. Un dinamico che risultasse
     col 48V acceso è un errore che sul palco costa — su un nastro passivo costa il microfono. */
  const dentro = (h) => h.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  const tab = (landing.match(/<table id="chlist">([\s\S]*?)<\/table>/) || [])[1] || "";
  ok(tab, "la channel list c'è");
  ok(/<th class="p48h">48V<\/th>/.test(tab), "e ha la colonna 48V");

  const righe = [...tab.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].slice(1)
    .map((m) => [...m[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((c) => dentro(c[1])));
  eq(righe.length, 10, "dieci canali");

  let conPhantom = 0;
  for (const [ch, sorgente, mic, p48] of righe) {
    const acceso = /48V/.test(p48);
    if (acceso) conPhantom++;
    const info = A.MIC_DB[mic] || Object.values(A.MIC_DB).find((m) => m.model === mic);
    if (info) {
      eq(acceso, !!info.p48,
        `CH${ch} ${sorgente} (${mic}): il 48V dichiarato deve essere quello di MIC_DB`);
    } else {
      /* Non è un microfono del catalogo: l'unico caso qui è la DI. Una DI ATTIVA richiede
         alimentazione per definizione — phantom o batteria (Radial Engineering «DI Questions»;
         Countryman Type 85: col phantom presente stacca da sola la batteria). Una PASSIVA no:
         è un trasformatore. */
      if (/DI attiva/i.test(mic)) ok(acceso, `CH${ch}: una DI attiva va alimentata, il 48V va acceso`);
      else if (/^DI$/i.test(mic)) ok(!acceso, `CH${ch}: una DI passiva non vuole il phantom`);
    }
  }
  ok(conPhantom > 0 && conPhantom < righe.length,
    "l'esempio mostra sia canali col phantom sia senza: " + conPhantom + "/10");

  /* «Timpano» era il nome dato al tom: ma nel catalogo dell'editor «Timpani» sono lo strumento
     ORCHESTRALE (Ø81/74/66, categoria Percussioni) e MIC_DB dichiara per l'e604 uso:"tom,
     rullante". Su un editor che supporta le orchestre quella parola è già presa. */
  ok(!/Timpan[oi]/.test(landing), "nella batteria si chiama «Tom», non «Timpano»");
});

t("le due channel list della pagina raccontano lo stesso palco", () => {
  /* Il 22/08 ho corretto «Timpano» → «Tom» nella channel list della sezione «L'output» e l'ho dato
     per fatto: le liste erano DUE. L'altra è il mini-rider del prima/dopo, che mostra lo stesso
     progetto esempio in forma di documento, e lì «Timpano» è rimasto — pubblicato. Il test di
     allora non se n'è accorto perché guardava dentro <table id="chlist"> e basta.

     La lezione è la stessa che avevo scritto nel commit e che non ho applicato a me stesso: il
     difetto è il dato ripetuto in due posti che nessuno tiene insieme. Quindi qui non si cerca una
     parola: si confrontano le DUE liste riga per riga. Sono lo stesso quartetto d'esempio, devono
     dire le stesse cose — o il prima/dopo mostra un palco e la sezione dopo un altro. */
  const pulisci = (h) => h.replace(/<[^>]*>/g, "\u0000").split("\u0000").filter((x) => x.trim()).map((x) => x.trim());

  const tab = (landing.match(/<table id="chlist">([\s\S]*?)<\/table>/) || [])[1] || "";
  const grande = [...tab.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].slice(1).map((m) => {
    const c = [...m[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((x) => x[1].replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim());
    return { n: c[0], sorgente: c[1], mic: c[2] };
  });

  const mini = [...landing.matchAll(/<div class="mr-row"><i>(\d+)<\/i><b>([^<]*)<\/b>([^<]*)<\/div>/g)]
    .map((m) => ({ n: m[1], sorgente: m[2].trim(), mic: m[3].trim() }));

  ok(grande.length >= 10, "la channel list grande ha le sue righe: " + grande.length);
  ok(mini.length >= 10, "il mini-rider ha le sue righe: " + mini.length);
  eq(mini.length, grande.length, "e sono lo stesso numero di canali");

  for (let i = 0; i < mini.length; i++) {
    eq(mini[i].n, grande[i].n, `riga ${i + 1}: stesso numero di canale`);
    eq(mini[i].sorgente, grande[i].sorgente,
      `CH${mini[i].n}: la sorgente è la stessa nelle due liste`);
    eq(mini[i].mic, grande[i].mic, `CH${mini[i].n}: il microfono è lo stesso nelle due liste`);
  }
});

t("la dimostrazione non tiene i suoi numeri da nessuna parte: li conta", () => {
  /* STORIA. I totali della sezione «Cambi il palco» stavano scritti in TRE posti: l'HTML che si
     vede al primo sguardo, un oggetto `syTot` nel JS che li faceva salire al clic, e la tabella di
     testi del pulsante «rimetti com'era». Tre copie che nessuno teneva insieme — e su una pagina
     che promette «il rider si aggiorna da solo», due numeri che non tornano smentiscono il
     prodotto proprio mentre lo si sta dimostrando. Segnalato da Simone il 31/08.

     Fino ad allora questo test verificava che le tre copie COINCIDESSERO. Ora le copie non ci sono
     più: i totali si contano dalle righe che si vedono, e i kW si sommano da quello che ogni riga
     dichiara. Quindi qui si presidia che non tornino. */
  const num = (t) => parseFloat(String(t).replace(",", "."));

  ok(!/var syTot/.test(landing), "nessun totale tenuto a parte nel JS");
  ok(!/docChN: *'6 CH'/.test(landing), "nessuna tabella di testi fissi nel «rimetti com'era»");
  ok(/function syAggiorna/.test(landing), "c'è una sola funzione che decide i numeri");
  ok(/syRighe\('doc-mic'\)\.length/.test(landing), "i canali si contano dalle righe");
  ok(/syRighe\('doc-mon'\)\.length/.test(landing), "e così i mix");

  /* Le righe si contano dalla CLASSE, non dall'altezza: in una scheda in secondo piano le
     transizioni CSS non avanzano e l'altezza resta 0 — misurarla darebbe totali sbagliati proprio
     mentre l'utente non sta guardando. */
  const fn = landing.slice(landing.indexOf("function syRighe"), landing.indexOf("function syNum"));
  ok(/classList\.contains\('new'\)/.test(fn) && !/getBoundingClientRect/.test(fn),
    "si guarda la classe della riga, non quanto è alta");

  /* Lo stato di partenza scritto nell'HTML deve comunque essere quello giusto: senza JS è l'unico
     che si vede, e con JS è il primo fotogramma. */
  const righe = (docId) => {
    /* Il blocco finisce dove comincia il documento successivo: una fetta a lunghezza fissa
       sconfinava e contava anche le righe del vicino (visto: 10 canali invece di 7). */
    const i = landing.indexOf('id="' + docId + '"');
    const dopo = landing.indexOf('class="sy-doc"', i + 10);
    const blocco = landing.slice(i, dopo > 0 ? dopo : landing.indexOf("Nell'editor vero"));
    const tutte = (blocco.match(/<div[^>]*>\s*<i>/g) || []).length;
    const nuove = (blocco.match(/<div class="new"/g) || []).length;
    return { tutte, iniziali: tutte - nuove };
  };
  const ch = righe("doc-mic"), mon = righe("doc-mon");
  eq(+((landing.match(/<b id="syCh">(\d+)<\/b>/) || [])[1]), ch.iniziali, "canali dichiarati = righe iniziali");
  eq(+((landing.match(/<b id="syMix">(\d+)<\/b>/) || [])[1]), mon.iniziali, "mix dichiarati = righe iniziali");
  eq(+((landing.match(/id="docChN">(\d+) CH/) || [])[1]), ch.iniziali, "e lo dice anche l'intestazione");
  eq(+((landing.match(/id="docMonN">(\d+) mix/) || [])[1]), mon.iniziali);
  eq(ch.tutte, ch.iniziali + 1, "col clic si aggiunge una riga sola");
  eq(mon.tutte, mon.iniziali + 1);

  /* I carichi: ogni riga dichiara il suo valore in data-kw (centesimi), e il totale è la somma.
     È il difetto trovato il 22/08 nello schema elettrico, dove LUCI diceva 4,6 e la lista 3,4. */
  const blocco = landing.slice(landing.indexOf('id="doc-par"'), landing.indexOf("Nell'editor vero"));
  const dichiarati = [...blocco.matchAll(/data-kw="(\d+)"/g)].map((m) => +m[1]);
  const scritti = [...blocco.matchAll(/<span>[^<·]+· ([\d,]+) kW<\/span>/g)].map((m) => Math.round(num(m[1]) * 100));
  eq(dichiarati.length, scritti.length, "ogni riga dei carichi dichiara il suo valore");
  ok(dichiarati.length >= 3, "le voci dei carichi ci sono: " + dichiarati.length);
  for (let i = 0; i < dichiarati.length; i++)
    eq(dichiarati[i], scritti[i], "riga " + (i + 1) + ": data-kw e testo devono dire la stessa cosa");
  const kwHtml = num((landing.match(/<b id="syKw">([\d,]+)<\/b>/) || [])[1]);
  const visibili = dichiarati.slice(0, -1).reduce((a, b) => a + b, 0);   /* l'ultima compare al clic */
  eq(visibili / 100, kwHtml, "le voci visibili sommano al totale di partenza");
  eq(dichiarati.reduce((a, b) => a + b, 0) / 100, kwHtml + 1,
    "e col faro acceso fanno il kW in più che il bottone promette");
});

t("le cifre che la landing rivendica sono quelle che il programma ha davvero", () => {
  /* Il precedente è del 12/08: la home dichiarava 155 microfoni e il programma ne aveva 223, perché
     erano due cose separate. I microfoni da allora sono presidiati; i FARI no, e sono l'altra cifra
     che la pagina mette in vetrina nella tabella «Elementi nel catalogo / Microfoni / Modelli di
     faro». Una cifra sbagliata lì è una promessa che l'editor non mantiene. */
  const fari = Object.keys(A.LIGHT_MODEL_DB || {}).length;
  ok(fari > 0, "il catalogo dei fari si legge: " + fari);
  const dichiarati = +((landing.match(/Modelli di faro<\/span><b>(\d+)<\/b>/) || [])[1] || 0);
  eq(dichiarati, fari, "i modelli di faro dichiarati sono quelli di LIGHT_MODEL_DB");

  /* i microfoni: stessa verifica, nello stesso posto, così le due cifre non si separano di nuovo */
  const mic = Object.keys(A.MIC_DB || {}).length;
  eq(+((landing.match(/Microfoni riconosciuti<\/span><b>(\d+)<\/b>/) || [])[1] || 0), mic,
    "e i microfoni sono quelli di MIC_DB");
});

t("l'anteprima social ha la forma che i social pretendono", () => {
  /* Perché esiste: fino all'08/08 preview.png mostrava il dominio simonecastellan.com/stageplot,
     morto da mesi — e nessuno se n'era accorto, perché l'immagine la vede solo chi riceve il link.
     Il contenuto non è verificabile da qui: GUARDALA se la cambi. Le dimensioni sì: fuori dal
     1200×630 i social ritagliano o scartano l'anteprima. */
  const png = readFileSync(join(root, "preview.png"));
  eq(png.readUInt32BE(16), 1200, "larghezza");
  eq(png.readUInt32BE(20), 630, "altezza");
  /* i social cachano per URL: senza bump della versione, chi ha già condiviso il link continua
     a mostrare l'immagine vecchia per sempre */
  const og = (landing.match(/<meta property="og:image" content="([^"]+)"/) || [])[1] || "";
  ok(/preview\.png\?v=\d+/.test(og), "l'og:image è versionato: " + og);
  const guida = readFileSync(join(root, "guida/rider-tecnico/index.html"), "utf8");
  ok(/preview\.png\?v=\d+/.test((guida.match(/<meta property="og:image" content="([^"]+)"/) || [])[1] || ""),
    "e lo sono anche le pagine di contenuto, che condividono la stessa immagine");
});

/* --- La landing letta da un telefono (11/08) -------------------------------------------------
   Il redesign era stato verificato a 390px guardando lo scrollWidth: nessun overflow, verde. Ma
   `body{overflow-x:hidden}` rende quella misura sempre verde per costruzione, e intanto quattro
   blocchi erano tagliati dentro il loro contenitore. Si vedeva solo guardando lo screenshot.
   Questi test presidiano le cause, che sono tutte nel CSS. */
const giornoLocale = (d = new Date()) =>
  d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");

const mq = (maxpx) => {          /* TUTTI i blocchi @media(max-width:Npx): nel file sono più d'uno */
  const tag = "@media(max-width:" + maxpx + "px)";
  let out = "", i = landing.indexOf(tag);
  while (i > -1) {
    const s = landing.indexOf("{", i);
    let d = 1, j = s + 1;
    while (j < landing.length && d) { if (landing[j] === "{") d++; else if (landing[j] === "}") d--; j++; }
    out += landing.slice(s + 1, j - 1) + "\n";
    i = landing.indexOf(tag, j);
  }
  return out;
};

t("su un telefono il rider a otto pagine si legge fino in fondo", () => {
  /* Le righe erano 523px dentro 336 con white-space:nowrap: si leggeva «PAG 2 · Input list 10 CH —
     mic, 48V, patch de» e il resto viveva in uno scroll orizzontale invisibile. */
  ok(/\.tl\{[^}]*white-space:\s*normal/.test(mq(760)), "sotto i 760px le righe del terminale vanno a capo");
  ok(/\.tl\{[^}]*text-indent:\s*-/.test(mq(760)), "e la seconda riga rientra sotto il «PAG n ·»");
});

t("la colonna «Monitor» della channel list entra nello schermo di un telefono", () => {
  /* 385px in 336: MIX 1 / MIX 3 restavano oltre il bordo. Il difetto vero però era l'ORDINE: la
     media query stava PRIMA di th{padding:11px 16px}, che la sovrascriveva senza dire niente. */
  const stretta = landing.search(/@media\(max-width:760px\)\{[^@]*th,td\{padding-left:/);
  const larga = landing.search(/\n\s*th\{[^}]*padding:\s*11px 16px/);
  ok(stretta > -1, "esiste la regola che stringe le celle su telefono");
  ok(larga > -1 && stretta > larga, "e viene DOPO quella base, altrimenti perde la cascata");
});

t("le immagini della landing sono ritagliate ognuna per quello che deve mostrare", () => {
  /* Un solo `.shot img{object-position:52% 78%}` valeva per tutte e tre: buono per l'editor,
     tagliava l'intestazione della pagina del rider e riduceva la finestra di export a 3px. */
  ok(/\.shot-hero img\{[^}]*object-position/.test(landing), "il ritaglio sul palco è agganciato all'hero");
  ok(!/[^-]\.shot img\{[^}]*object-fit/.test(landing), "e non alla classe generica .shot");
  ok(/<figure class="shot shot-hero">/.test(landing), "l'hero porta davvero quella classe");
  ok(/\.shot-exp img\{display:none\}/.test(mq(700)), "su telefono la finestra di export non si mostra illeggibile");
  ok(/class="exp-m"/.test(landing) && /Scala<\/span><b>1:100/.test(landing),
    "al suo posto ci sono le stesse scelte scritte in chiaro");
});

t("chi ha un dito e non un mouse riceve un invito che può accettare", () => {
  ok(/<span class="mouse">Passa il mouse sulla channel list<\/span><span class="touch">Tocca/.test(landing),
    "l'invito ha le sue due versioni");
  ok(/\n\s*\.touch\{display:none\}/.test(landing), "la variante per il dito è nascosta di default");
  ok(/\.mouse\{display:none\}[^}]*\.touch\{display:inline\}/.test(mq(700)), "e si scambiano sotto i 700px");
  /* e soprattutto: toccare deve fare qualcosa, altrimenti è una promessa vuota */
  ok(/tr\.addEventListener\('click'/.test(landing), "toccare una riga accende il legame");
  ok(/el\.addEventListener\('click'/.test(landing), "e vale anche toccando l'elemento sul palco");
});

t("un layer spento resta leggibile: si spegne il disegno, non il suo nome", () => {
  /* opacity .1 sull'intero gruppo rendeva «CABLAGGIO» e «RF & RETE» invisibili: sembrava un
     errore di rendering. L'opacità di un gruppo SVG è un tetto, non si recupera dai figli. */
  ok(!/\.plane\.ghost \.fader\{opacity:\.1\}/.test(landing), "l'opacità non è più sul gruppo intero");
  const et = (landing.match(/\.plane\.ghost \.fader>text\{opacity:([\d.]+)\}/) || [])[1];
  ok(et && parseFloat(et) >= 0.3, "l'etichetta di un layer spento resta leggibile (opacity " + et + ")");
});

t("dalla home si arriva a ogni pagina per formazione", () => {
  /* Le pagine esistono da giugno; la home linkava solo l'indice nel footer, e le otto formazioni
     citate nelle domande erano testo morto. Se ne nasce una nuova, questo test la reclama. */
  const cartelle = readdirSync(join(root, "stage-plot"), { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name !== "previews")
    .map((d) => d.name);
  ok(cartelle.length >= 10, "ci sono le pagine per formazione: " + cartelle.length);
  for (const c of cartelle) {
    ok(landing.indexOf('href="/stage-plot/' + c + '/"') > -1, "la home linka /stage-plot/" + c + "/");
  }
});

t("la description sta dentro quello che Google mostra", () => {
  const d = (landing.match(/<meta name="description" content="([^"]+)"/) || [])[1] || "";
  ok(d.length > 110 && d.length <= 160, "description di " + d.length + " caratteri (tetto 160)");
  ok(/stage plot/i.test(d) && /gratis/i.test(d), "e dice ancora cos'è e quanto costa");
});

/* --- Leggibile da un motore generativo (11/08) ------------------------------------------------
   ChatGPT, Perplexity e le risposte AI di Google citano blocchi autocontenuti, e li pescano quasi
   sempre dall'inizio della pagina. Fino all'11/08 la home non conteneva UNA frase che dicesse cos'è
   StagePlot: c'erano il claim e le funzioni, mai la definizione. Questi test presidiano i segnali
   che rendono la pagina citabile — e la coerenza fra i documenti che le AI leggono. */
const ldLanding = JSON.parse((landing.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/) || [])[1]);
const nodo = (tipo) => ldLanding["@graph"].find((n) => n["@type"] === tipo);

t("la home dice cos'è StagePlot, in chiaro e all'inizio", () => {
  const testo = landing.replace(/<(script|style|svg)[\s\S]*?<\/\1>/g, " ").replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  const def = testo.match(/StagePlot è [^.]{40,400}\./);
  ok(def, "esiste una frase «StagePlot è …»");
  const dove = testo.indexOf(def[0]) / testo.length;
  ok(dove < 0.25, "e sta nel primo quarto della pagina (sta al " + Math.round(dove * 100) + "%)");
  const parole = def[0].split(/\s+/).length;
  ok(parole >= 25 && parole <= 90, "lunga " + parole + " parole: si cita intera senza contesto");
  for (const k of ["channel list", "rider", "gratuito", "browser"])
    ok(def[0].toLowerCase().indexOf(k) > -1, "la definizione contiene «" + k + "»");
});

t("la home dichiara quando è stata aggiornata, e lo dice una volta sola", () => {
  /* La freschezza pesa parecchio nelle citazioni AI. Due punti la dichiarano — schema e sitemap —
     e se divergono uno dei due mente: il test li tiene legati. */
  const wp = nodo("WebPage");
  ok(wp && /^\d{4}-\d{2}-\d{2}$/.test(wp.dateModified || ""), "il WebPage ha dateModified");
  const sm = readFileSync(join(root, "sitemap.xml"), "utf8");
  const lastmod = (sm.match(/<loc>https:\/\/stageplot\.it\/<\/loc>\s*<lastmod>([^<]+)</) || [])[1];
  eq(lastmod, wp.dateModified, "sitemap e schema dicono la stessa data");
  ok(wp.datePublished <= wp.dateModified, "e la pubblicazione non è successiva all'ultima modifica");
});

t("l'autore è un'entità collegabile, non un nome scritto", () => {
  /* «Lo scrive un fonico, non un'agenzia» è il differenziatore del progetto: per una AI vale solo
     se la persona è agganciata a profili verificabili. */
  const f = nodo("Organization").founder;
  ok(Array.isArray(f.sameAs) && f.sameAs.length >= 2, "il fondatore ha almeno due profili in sameAs");
  for (const u of f.sameAs) ok(/^https:\/\//.test(u), "profilo con URL assoluto: " + u);
  ok(f["@id"].indexOf("simonecastellan.com/#person") > -1, "e punta all'entità canonica sul suo sito");
});

t("llms.txt racconta il prodotto di oggi, non quello di due versioni fa", () => {
  /* Il file è la versione che le AI leggono per prima. Diceva ancora che il rider completo si
     ottiene «su consulenza», mentre l'editor lo genera da solo: un LLM avrebbe riferito quello. */
  const l = readFileSync(join(root, "llms.txt"), "utf8");
  ok(!/rider completo disponibil\w* su consulenza/i.test(l), "non dice più che il rider completo è solo su consulenza");
  ok(/le genera l'app dal disegno/i.test(l), "dice chi genera i documenti");
  const cartelle = readdirSync(join(root, "stage-plot"), { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name !== "previews").map((d) => d.name);
  for (const c of cartelle) ok(l.indexOf("/stage-plot/" + c + "/") > -1, "llms.txt elenca " + c);
});

/* --- Title e description dentro quello che Google mostra (11/08) ------------------------------
   Otto title su ventiquattro superavano i 60 caratteri e venivano troncati nei risultati, quattro
   description superavano i 160. Nessuno se ne accorge guardando il sito: si vede solo in SERP, e
   il pezzo che sparisce è sempre la coda — dove sta il marchio. Il suffisso « | StagePlot» da solo
   pesa 12 caratteri, quindi la parte descrittiva deve stare in 48. */
t("nessuna pagina ha un title o una description che Google taglierebbe", () => {
  const pagine = readdirSync(root, { recursive: true, withFileTypes: true })
    .filter((d) => d.isFile() && d.name === "index.html")
    .map((d) => join(d.parentPath || d.path, d.name))
    .filter((p) => pubblicata(p.slice(root.length)) && !/[\\/]app[\\/]|landing-concepts/.test(p.slice(root.length)));
  ok(pagine.length >= 20, "pagine esaminate: " + pagine.length);

  const titoli = new Map(), descr = new Map();
  const lunghi = [];
  for (const p of pagine) {
    const h = readFileSync(p, "utf8");
    if (/name="robots" content="noindex/.test(h)) continue;      /* le noindex non finiscono in SERP */
    const nome = p.slice(root.length);
    const t_ = (h.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || "";
    const d_ = (h.match(/<meta name="description" content="([^"]*)"/) || [])[1] || "";
    if (t_.length > 60) lunghi.push(nome + " title " + t_.length);
    if (d_.length > 160) lunghi.push(nome + " description " + d_.length);
    ok(t_.length > 0 && d_.length > 0, nome + ": ha title e description");
    titoli.set(t_, (titoli.get(t_) || 0) + 1);
    descr.set(d_, (descr.get(d_) || 0) + 1);
  }
  eq(lunghi.length, 0, "fuori misura: " + lunghi.join(", "));
  /* due pagine con lo stesso title si fanno concorrenza da sole */
  eq([...titoli].filter(([, n]) => n > 1).map(([t_]) => t_).join(" | "), "", "nessun title duplicato");
  eq([...descr].filter(([, n]) => n > 1).map(([d_]) => d_.slice(0, 40)).join(" | "), "", "nessuna description duplicata");
});

t("una pagina dice lo stesso titolo a Google, ai social e ai dati strutturati", () => {
  /* Il titolo di una pagina è scritto in quattro punti: <title>, og:title, twitter:title e la
     headline dell'Article. Venti pagine su ventiquattro li tenevano già allineati — era una
     convenzione, non una regola, e le quattro che la violavano l'avevano fatto in silenzio:
     una di queste l'ho disallineata io accorciando i title, perché il twitter:title conteneva
     la variante col marchio e la sostituzione non l'ha intercettata.
     La headline è quella che pesa: è il titolo che Google legge nei dati strutturati. */
  const pagine = readdirSync(root, { recursive: true, withFileTypes: true })
    .filter((d) => d.isFile() && d.name === "index.html")
    .map((d) => join(d.parentPath || d.path, d.name))
    .filter((p) => !/[\\/]\.claude[\\/]|[\\/]node_modules[\\/]|[\\/]app[\\/]|landing-concepts/.test(p.slice(root.length)));
  const disallineate = [];
  for (const p of pagine) {
    const h = readFileSync(p, "utf8");
    if (/name="robots" content="noindex/.test(h)) continue;
    const nome = p.slice(root.length);
    const t_ = ((h.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || "").trim();
    const base = t_.replace(" | StagePlot", "");
    for (const [dove, patt] of [["og:title", /og:title" content="([^"]*)"/],
                                ["twitter:title", /twitter:title" content="([^"]*)"/],
                                ["headline", /"headline":"([^"]*)"/]]) {
      const m = h.match(patt);
      if (m && m[1] !== base) disallineate.push(`${nome} ${dove}=«${m[1]}» ≠ «${base}»`);
    }
    /* un anno nel title invecchia da solo: a gennaio la pagina dichiara la data sbagliata */
    ok(!/\((19|20)\d\d\)/.test(t_), nome + ": nessun anno fisso nel title (" + t_ + ")");
  }
  eq(disallineate.length, 0, "titoli che non coincidono: " + disallineate.slice(0, 4).join(" || "));
});

/* --- Contatore della landing (11/08) ----------------------------------------------------------
   Fino a oggi dei visitatori non si sapeva niente: gli eventi dell'app partono solo per gli utenti
   loggati, e chi arriva dalla landing quasi mai lo è. Il contatore risponde a due domande — quanti
   arrivano e da dove, quanti aprono l'editor e da quale bottone — senza cookie, senza terze parti
   e senza riaprire l'INSERT anonimo che la migration 0026 aveva chiuso.
   Qui si presidiano le tre cose che si romperebbero in silenzio: la CSP che blocca la chiamata,
   la porta del database lasciata aperta, e il documento che promette agli utenti altro. */
const migCounters = readFileSync(join(root, "supabase/migrations/0036_landing_counters.sql"), "utf8");

t("il contatore non riapre la porta che la 0026 aveva chiuso", () => {
  /* Il repo è pubblico e la anon key con lui: se la tabella avesse una policy di insert per anon,
     chiunque potrebbe scrivere righe a volontà. Deve scrivere SOLO la funzione con service_role. */
  ok(/alter table public\.landing_counters\s+enable row level security/.test(migCounters), "RLS attiva sui contatori");
  ok(!/create policy[^;]*landing_counters[^;]*to (anon|authenticated|public)/is.test(migCounters),
    "nessuna policy di scrittura dal browser sui contatori");
  for (const fn of ["landing_counter_hit", "landing_throttle_hit"]) {
    ok(new RegExp("revoke execute on function public\\." + fn + "[^;]*from public, anon, authenticated", "s").test(migCounters),
      fn + ": revocata a tutti");
    /* «to service_role» da solo non basta: matcherebbe anche «to service_role, anon», che
       rimetterebbe la RPC in mano a chiunque abbia la anon key — cioè a chiunque legga il repo */
    const grant = (migCounters.match(new RegExp("grant execute on function public\\." + fn + "[^;]*;", "s")) || [])[0] || "";
    const beneficiari = (grant.match(/to ([^;]+);/s) || [])[1] || "";
    eq(beneficiari.trim(), "service_role", fn + ": concessa a service_role e a nessun altro");
  }
  /* current_date compare anche nelle query di lettura in fondo al file: qui serve sapere che è
     l'INSERT a usarlo, cioè che la data la decide il server e non arriva dal browser */
  ok(/values \(current_date, p_event, p_source, p_ref, 1\)/.test(migCounters),
    "il giorno dell'incremento lo mette il server, non il client");
  ok(/check \(\s*event in \('view', 'app_click'\)/.test(migCounters), "il database ricontrolla l'allowlist degli eventi");
});

t("la CSP della landing lascia passare il contatore, e niente altro", () => {
  /* Senza connect-src la chiamata viene rifiutata dal browser e il contatore resta a zero per
     sempre, senza che nessuno se ne accorga: la pagina funziona lo stesso. */
  const csp = (landing.match(/Content-Security-Policy" content="([^"]+)"/) || [])[1] || "";
  const connect = (csp.match(/connect-src ([^;]+)/) || [])[1] || "";
  ok(connect.indexOf("'self'") > -1, "connect-src dichiarato");
  ok(/https:\/\/\w+\.supabase\.co/.test(connect), "e include il progetto Supabase: " + connect);
  ok(csp.indexOf("default-src 'self'") > -1, "il resto della CSP resta chiuso");
  ok(!/connect-src[^;]*\*/.test(csp), "nessun jolly in connect-src");
});

t("il beacon parte davvero: text/plain, non application/json", () => {
  /* Con application/json il browser pretende una preflight, che sendBeacon non sa fare: la
     chiamata fallisce in silenzio. È il modo tipico in cui questi contatori non contano niente. */
  const blocco = landing.slice(landing.indexOf("CONTATORE DELLA LANDING"));
  ok(/type:\s*"text\/plain/.test(blocco), "il Blob del beacon è text/plain");
  /* cerca l'USO, non la parola: il commento qui sopra spiega proprio perché application/json
     sarebbe sbagliato, e un test che grepasse la stringa nuda diventerebbe rosso per quello */
  ok(!/(?:type|"Content-Type")\s*:\s*"application\/json/.test(blocco),
    "application/json non è usato come tipo del corpo");
  ok(/navigator\.sendBeacon\(API, blob\)/.test(blocco) && /fetch\(API/.test(blocco),
    "c'è il beacon e il ripiego con fetch");
  ok(/doNotTrack/.test(blocco), "chi ha Do Not Track non viene contato");
  ok(/location\.hostname !== "stageplot\.it"/.test(blocco), "in locale non si conta nulla");
  ok(/sessionStorage/.test(blocco), "una visita per sessione, non una per ricarica");
});

t("gli ingressi verso l'editor sono gli stessi in pagina, nel codice e nel database", () => {
  /* Tre elenchi che devono coincidere. Se in pagina nasce un from= che il database non conosce,
     il CHECK rifiuta la riga e quel clic sparisce senza un errore visibile da nessuna parte:
     il contatore continuerebbe a funzionare, contando meno del vero. */
  const inPagina = new Set([...landing.matchAll(/href="\/app\/[^"]*?from=([\w-]{1,24})/g)].map((m) => m[1]));
  ok(inPagina.size >= 4, "la landing marca i suoi ingressi: " + [...inPagina].join(", "));

  const ts = readFileSync(join(root, "supabase/functions/_shared/landing-metrics.ts"), "utf8");
  const blocco = (ts.match(/export const SORGENTI = \[([\s\S]*?)\] as const/) || [])[1] || "";
  const nelCodice = new Set([...blocco.matchAll(/"([\w-]*)"/g)].map((m) => m[1]).filter(Boolean));

  const check = (migCounters.match(/and source in \(([^)]*)\)/s) || [])[1] || "";
  const nelDb = new Set([...check.matchAll(/'([\w-]*)'/g)].map((m) => m[1]).filter(Boolean));

  for (const s of inPagina) {
    ok(nelCodice.has(s), "«" + s + "» è previsto dalla validazione");
    ok(nelDb.has(s), "«" + s + "» è accettato dal database");
  }
  eq([...nelCodice].sort().join(","), [...nelDb].sort().join(","), "codice e database elencano gli stessi ingressi");
  /* i link verso l'editor che NON portano un from= sono clic che non vedremo mai */
  const versoApp = [...landing.matchAll(/href="(\/app\/[^"]*)"/g)].map((m) => m[1]);
  const senzaMarca = versoApp.filter((h) => !/from=/.test(h));
  eq(senzaMarca.length, 0, "nessun ingresso all'editor resta senza marca: " + senzaMarca.join(" "));
});

t("la funzione è raggiungibile da una pagina senza login", () => {
  const cfg = readFileSync(join(root, "supabase/config.toml"), "utf8");
  ok(/\[functions\.track-landing\]\s*\nverify_jwt = false/.test(cfg),
    "track-landing accetta chiamate senza token: la landing non ne ha uno");
});

t("la privacy racconta i conteggi, e la data lo dice", () => {
  /* Il sito prometteva «senza accesso non si attivano statistiche d'uso»: da oggi non è più
     vero alla lettera, e il documento deve dirlo prima che lo scopra qualcun altro. */
  const p = readFileSync(join(root, "privacy/index.html"), "utf8");
  ok(/Conteggi della pagina iniziale/.test(p), "c'è la sezione sui conteggi");
  ok(/aggregat/i.test(p) && /nessun cookie/i.test(p), "dice che sono aggregati e senza cookie");
  ok(/Do Not Track/.test(p), "dichiara il rispetto del Do Not Track");
  ok(/impronta anonima \(hash\) dell'indirizzo IP/.test(p), "dichiara l'impronta dell'IP per il rate limit");
  ok(/Ultimo aggiornamento: 11 agosto 2026/.test(p), "la data dell'ultimo aggiornamento è quella giusta");
  ok(!/senza accesso non si attivano autenticazione, salvataggio cloud o statistiche d'uso/.test(p),
    "la frase che ora sarebbe falsa non c'è più");
});

// ── IL TESTO DEL DISEGNO SUL FOGLIO (11/08) ────────────────────────────────────────────────────
// Trovato APRENDO un PDF esportato, non leggendolo: `pdftotext` mostrava le scritte giuste, ma
// sull'immagine erano puntini. Le scritte stanno nelle unità dell'SVG, che sono centimetri reali:
// un corpo 14 vale 140/N mm sulla carta — 2,8 mm a 1:50, 0,7 mm a 1:200. Un palco da festival
// usciva con nomi, FONDO PALCO e quote illeggibili. E ogni quota era scritta due volte.
t("le scritte del disegno restano leggibili a ogni scala", () => {
  /* Il fattore compensa esattamente il rimpicciolimento del disegno. Non si controlla il VALORE del
     fattore — è una manopola (CORPO_RIF) e può cambiare — ma la proprietà che deve valere sempre:
     raddoppiando la scala raddoppia il fattore, così sulla carta il corpo resta lo stesso. */
  eq(A.pdfTextK(200) / A.pdfTextK(100), 2, "da 1:100 a 1:200 il fattore deve raddoppiare");
  eq(A.pdfTextK(100) / A.pdfTextK(50), 2, "e da 1:50 a 1:100 pure");
  eq(A.pdfTextK(500), A.pdfTextK(250), "oltre 1:250 si ferma: sarebbe più grande di ciò che nomina");
  ok(A.pdfTextK(250) >= A.pdfTextK(100), "il fattore non può calare al crescere della scala");
  [0, -3, NaN, null, undefined, "boh"].forEach((v) => eq(A.pdfTextK(v), 1, "valore inutilizzabile: " + v));
  /* il corpo sulla CARTA, che è ciò che conta davvero */
  const mmSulFoglio = (corpo, N) => corpo * A.pdfTextK(N) * 10 / N;
  const misure = [50, 100, 200, 250].map((N) => +mmSulFoglio(14, N).toFixed(3));
  eq(new Set(misure).size, 1, "il corpo sulla carta deve essere lo STESSO a ogni scala: " + misure);
  /* e deve stare nella fascia in cui un nome si legge davvero su un foglio stampato: sotto 1,2 mm
     si perde, sopra 2,5 mm i nomi si scansano tanto da non dire più di chi sono */
  misure.forEach((mm) => ok(mm >= 1.2 && mm <= 2.5, "corpo sul foglio: " + mm + " mm"));
  eq(+(14 * 10 / 200).toFixed(2), 0.7, "senza compensazione a 1:200 sarebbero 0,70 mm: la misura che rendeva illeggibile il PDF");
});
t("il fattore ingrandisce i corpi, non i tratti del disegno", () => {
  const css = ".lbl{font-size:14px;stroke-width:3.5px}.cavo{stroke-width:2px}.griglia{stroke-width:0.5px}";
  const out = A.scaleSvgTextHalos(A.scaleSvgFonts(css, 2), 2);
  ok(/\.lbl\{font-size:28\.00px/.test(out), "il corpo raddoppia: " + out);
  ok(/\.lbl\{[^}]*stroke-width:7\.00px/.test(out), "e con lui l'alone che lo stacca dallo sfondo");
  ok(/\.cavo\{stroke-width:2px\}/.test(out), "ma il tratto dei cavi NON si tocca: " + out);
  ok(/\.griglia\{stroke-width:0\.5px\}/.test(out), "né quello della griglia");
  /* i corpi scritti come attributo (FONDO PALCO, PUBBLICO, i nomi col corpo scelto a mano) */
  const mk = '<text font-size="16" letter-spacing="2">FONDO PALCO</text>';
  ok(/font-size="32\.00"/.test(A.scaleSvgFonts(mk, 2)), "anche quelli inline");
  ok(/letter-spacing="4\.00"/.test(A.scaleSvgFonts(mk, 2)), "spaziatura compresa, o le lettere si accavallano");
  /* e senza fattore non deve cambiare NIENTE: è il caso del canvas e dell'export SVG */
  [1, 0, undefined, null, NaN].forEach((k) => eq(A.scaleSvgFonts(css, k), css, "k=" + k));
});
t("nel PDF ogni quota è scritta una volta sola", () => {
  reset();
  A.state.stage = { w: 1200, d: 800, blocks: [{ x: 0, y: 0, w: 1200, d: 800 }] };
  const conQuote = A.stageSceneSvg(null, { focus: "clean" });
  const senza = A.stageSceneSvg(null, { focus: "clean", noBlockDims: true });
  ok(/dim-edge/.test(conQuote), "di suo la scena quota i blocchi");
  ok(!/dim-edge/.test(senza), "e le toglie quando chi esporta le disegna già");
  /* il PDF le spegne SOLO sul palco di un pezzo solo: su un palco composto dicono qualcosa in più —
     l'ingombro totale non racconta com'è fatta una L, i singoli blocchi sì */
  A.state.stage = { w: 1600, d: 1000, blocks: [{ x: 0, y: 0, w: 1600, d: 600 }, { x: 0, y: 600, w: 800, d: 400 }] };
  eq(A.stageBlocks().length, 2, "il palco a L deve avere due blocchi");
  const aElle = (A.stageSceneSvg(null, { focus: "clean" }).match(/dim-edge/g) || []).length;
  eq(aElle, 4, "due quote per blocco: larghezza e profondità");
  const src = readFileSync(join(root, "app.js"), "utf8");
  ok(/noBlockDims:!A\.custom && !box\.cropped && stageBlocks\(\)\.length<2/.test(src),
    "la condizione del doppione non è quella attesa");
  /* e l'anteprima deve dire le stesse cose del file che uscirà */
  const prev = src.slice(src.indexOf("function pdfPreviewSvg"), src.indexOf("function pdfPreviewSvg") + 2000);
  ok(/textK:pdfTextK\(Ng\)/.test(prev), "l'anteprima non compensa il testo come il PDF");
  ok(/noBlockDims:/.test(prev), "l'anteprima non toglie il doppione come il PDF");
});

t("due nomi vicini non si scrivono addosso", () => {
  reset();
  A.state.stage = { w: 1200, d: 800, blocks: [{ x: 0, y: 0, w: 1200, d: 800 }] };
  A.state.items = [];
  /* il caso vero: un corista e la DI che genera stanno a mezzo metro l-uno dall-altra, e i loro
     nomi finivano sulla stessa riga — «Voce 1» con «DI 1» dentro */
  A.addItem("corista"); A.addItem("tastiera"); A.addItem("bassstand");
  ok(A.state.items.length >= 3, "scena costruita: " + A.state.items.length + " elementi");
  /* La posa automatica li tiene già distanti (findFreeSpotFor): il nodo lo rifà chi li avvicina a
     MANO, ed è il caso da riprodurre — sul foglio non si può zoomare per districare due nomi. */
  A.state.items.forEach((it, i) => { it.x = 600 + i * 45; it.y = 400 + i * 30; });

  const sovrapposte = (K, conNudge) => {
    const nud = conNudge ? A.lblNudges(K) : {};
    const rs = A.state.items.map((it) => A.lblRectOf(it, K)).filter(Boolean)
      .map((r) => ({ ...r, y0: r.y0 + (nud[r.id] || 0), y1: r.y1 + (nud[r.id] || 0) }));
    const coppie = [];
    for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) {
      const a = rs[i], b = rs[j];
      if (a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1) coppie.push(a.id + "/" + b.id);
    }
    return coppie;
  };

  /* per accorgersi che serve, bisogna prima vedere il difetto: gli elementi nascono vicini e
     senza la passata i riquadri si toccano davvero */
  const prima = sovrapposte(1, false);
  ok(prima.length > 0, "la scena di prova non ha nomi che si toccano: non prova niente");
  eq(sovrapposte(1, true).length, 0, "restano sovrapposte anche con la passata: " + sovrapposte(1, true));
  /* e vale anche col testo ingrandito per la stampa, dove i nomi occupano più spazio */
  [1.5, 2, 2.5].forEach((K) => eq(sovrapposte(K, true).length, 0, "a K=" + K + ": " + sovrapposte(K, true)));

  /* chi non entra nella passata non viene spostato: nomi dentro la sagoma, elementi ruotati */
  const uno = A.state.items[0];
  const rot = { ...uno, id: "x1", rot: 90 };
  eq(A.lblRectOf(rot, 1), null, "un elemento ruotato porta il nome con sé: fuori dalla passata");
  eq(A.lblRectOf({ ...uno, id: "x2", labelMode: "hidden" }, 1), null, "senza nome non c-è niente da spostare");

  /* lo spostamento è stabile: due esecuzioni danno lo stesso disegno */
  eq(JSON.stringify(A.lblNudges(2)), JSON.stringify(A.lblNudges(2)), "la passata non è deterministica");
  /* e non sposta all-infinito: un nome troppo lontano non direbbe più di chi è */
  const tutti = Object.values(A.lblNudges(2));
  tutti.forEach((d) => ok(d <= 14 * 2 * 3 + 1, "spostamento fuori misura: " + d));
});
t("lo sbraccio del nome cresce col corpo con cui verrà stampato", () => {
  reset();
  A.state.items = [];
  A.addItem("tastiera");
  const it = A.state.items[A.state.items.length - 1];
  /* si misura il bordo BASSO: la baseline si allontana dall-elemento, mentre il bordo alto scende
     appena perché il testo cresce anche verso l-alto */
  const y = (K) => A.lblRectOf(it, K).y1;
  /* il nome sta staccato dall-elemento di una quantità che dipende dall-altezza delle lettere:
     ingrandire il testo a coordinata già scritta lo faceva scendere SOPRA l-elemento */
  ok(y(2) > y(1), "col testo doppio il nome deve stare più in basso, non nello stesso posto");
  /* ma la distanza scelta dall-utente è in centimetri reali di palco e non si tocca */
  const d0 = A.lblDistOf(it), prima = y(1);
  it.lblDist = d0 + 20;
  eq(Math.round(y(1) - prima), 20, "i cm scelti a mano valgono tali e quali");
  it.lblDist = d0;
});

t("il disegno vero usa il corpo stampato e lo spostamento, non solo il calcolo di prova", () => {
  /* I due controlli qui sopra interrogano lblRectOf, che RIPETE la formula del disegno: da soli
     restavano verdi anche rimettendo il difetto nel disegno. Questo legge il markup che esce. */
  reset();
  A.state.stage = { w: 1200, d: 800, blocks: [{ x: 0, y: 0, w: 1200, d: 800 }] };
  A.state.items = [];
  A.addItem("tastiera");
  /* nel sandbox la posa automatica non ha un SVG da misurare e lascia x indefinita: le posizioni
     vanno messe a mano, o i riquadri non si intersecano mai e il controllo non prova niente */
  A.state.items.forEach((it) => { it.x = 600; it.y = 400; });
  const yDi = (svg) => {
    const m = svg.match(/<text class="lbl" x="[\d.-]+" y="([\d.-]+)" text-anchor="start"/);
    return m ? +m[1] : null;
  };
  const yLbl = (svg) => (svg.match(/<text class="lbl" y="([\d.-]+)"/g) || []).map((x) => +x.match(/y="([\d.-]+)"/)[1]);

  const a = yLbl(A.stageSceneSvg(null, { focus: "clean", textK: 1 }));
  const b = yLbl(A.stageSceneSvg(null, { focus: "clean", textK: 2.5 }));
  ok(a.length > 0 && b.length === a.length, "stesse etichette nei due disegni: " + a.length + "/" + b.length);
  ok(b.some((y, i) => y > a[i] + 1), "col testo ingrandito nessun nome si è staccato di più: " + a + " → " + b);

  /* e lo spostamento deve arrivare anche alla DI, che scrive di lato su un ramo suo */
  const strum = A.state.items[0];
  A.state.items.push({ id: "di-prova", type: "dimono", diFor: strum.id, x: strum.x + 20, y: strum.y + 70, w: 30, d: 24, label: "DI 1" });
  /* la DI va messa PIÙ IN BASSO dello strumento: chi sta più in alto viene sistemato per primo e
     resta fermo, quindi con la DI in cima si sarebbe spostata la tastiera e non lei */
  const vicina = yDi(A.stageSceneSvg(null, { focus: "clean", textK: 2.5 }));
  A.state.items[A.state.items.length - 1].y = strum.y + 600;   /* lontano: nessuno da schivare */
  const lontana = yDi(A.stageSceneSvg(null, { focus: "clean", textK: 2.5 }));
  ok(vicina !== null && lontana !== null, "l-etichetta della DI non è nel disegno");
  ok(vicina > lontana, "la DI addosso allo strumento non scende: " + vicina + " contro " + lontana);

  /* e lo stesso deve valere per i nomi scritti SOTTO l-elemento, che sono la maggioranza */
  A.state.items = [];
  A.addItem("tastiera"); A.addItem("tastiera");
  const due = A.state.items;
  /* affiancati alla STESSA altezza: è così che due nomi finiscono sulla stessa riga. Sfalsandoli
     in verticale di 40 cm non si toccavano nemmeno, perché lo sbraccio ne vale già una quarantina
     — e il controllo restava verde senza provare niente. */
  due[0].x = 600; due[0].y = 400;
  due[1].x = 650; due[1].y = 400;
  const insieme = Math.max.apply(null, yLbl(A.stageSceneSvg(null, { focus: "clean", textK: 1 })));
  due[1].y = 1400;                            /* lontanissimo: nessuno da schivare */
  const separati = Math.max.apply(null, yLbl(A.stageSceneSvg(null, { focus: "clean", textK: 1 })));
  ok(insieme > separati, "due nomi addosso non si scansano nel disegno: " + insieme + " contro " + separati);
});

/* --- Il lato venue, e i numeri che non devono mentire (12/08) ---------------------------------
   Una squadra di agenti ha guardato la landing da fuori. Due cose sono venute fuori con la prova in
   mano: la sezione che parla a chi i rider LI RICEVE era la più corta della pagina (59 parole) benché
   sia il fronte dichiarato, e il sito dichiarava 155 microfoni mentre il catalogo ne conteneva 223. */

t("il numero di microfoni in pagina è quello del catalogo vero", () => {
  /* Il difetto non era il numero: era che NESSUNO legava la pagina al catalogo, così l'ampliamento
     del 12/08 (155 → 223) ha lasciato indietro home, llms.txt e la sezione «Disegni il palco».
     Qui il legame c'è: se domani il catalogo cresce ancora, questo test lo reclama. */
  const veri = Object.keys(A.MIC_DB).length;
  ok(veri > 100, "il catalogo è caricato: " + veri + " microfoni");
  /* Solo i numeri che dichiarano il TOTALE, in tutti i modi in cui la pagina lo scrive: «223
     microfoni», «Microfoni riconosciuti | 223», «ne riconosce 223». Escluso «68 microfoni in più»
     del registro, che è una differenza e non un totale. */
  const inPagina = [
    ...[...landing.matchAll(/(\d{2,4})\s*microfoni(?!\s+in\s+più)/gi)].map((m) => +m[1]),
    ...[...landing.matchAll(/Microfoni riconosciuti<\/span><b>(\d+)<\/b>/g)].map((m) => +m[1]),
    ...[...landing.matchAll(/ne riconosce (\d{2,4})/g)].map((m) => +m[1]),
  ];
  ok(inPagina.length >= 2, "la home cita il numero di microfoni: " + inPagina.join(", "));
  for (const n of inPagina) eq(n, veri, "un numero in pagina non coincide col catalogo");
  const dichiarato = +((landing.match(/Microfoni riconosciuti<\/span><b>(\d+)<\/b>/) || [])[1] || 0);
  eq(dichiarato, veri, "la scheda numeri dice quanti ne ha davvero");
  const l = readFileSync(join(root, "llms.txt"), "utf8");
  const inLlms = [...l.matchAll(/(\d{2,4}) microfoni/gi)].map((m) => +m[1]);
  for (const n of inLlms) eq(n, veri, "llms.txt racconta lo stesso numero alle AI");
});

t("la pagina promette un tempo solo", () => {
  /* Diceva «parte in dieci minuti», «la scheda tecnica in una sera» e «domani il rider è già fatto»:
     per una band «una sera» e «domani» sono un costo, non una promessa, e tre numeri diversi non
     sono una promessa affatto. */
  const testo = landing.replace(/<(script|style|svg)[\s\S]*?<\/\1>/g, " ").replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  ok(/dieci minuti/.test(testo), "il tempo promesso c'è");
  ok(!/scheda tecnica in una sera/i.test(testo), "non convive con «in una sera»");
  ok(!/Domani il rider è già fatto/i.test(testo), "né con «domani»");
});

t("chi i rider li riceve trova qualcosa da usare, non da leggere", () => {
  /* La sezione era 59 parole e trattava il service come destinatario. Ora ha un testo pronto da
     mandare alle band: è l'unico pezzo della pagina che può portare visite invece di convertirle. */
  const sez = landing.slice(landing.indexOf('id="condivisione"'), landing.indexOf('id="layers"'));
  ok(sez.length > 1500, "la sezione non è più un francobollo");
  ok(/Se i rider li ricevi tu/i.test(sez), "parla a chi li riceve");
  const msg = (sez.match(/<blockquote class="venue-msg" id="venueMsg">([\s\S]*?)<\/blockquote>/) || [])[1] || "";
  ok(msg.length > 150, "c'è il messaggio da copiare (" + msg.length + " caratteri)");
  ok(msg.indexOf("stageplot.it") > -1, "il messaggio contiene il link");
  ok(/gratis/.test(msg) && /non serve registrarsi/.test(msg), "dice le due cose che convincono una band");
  /* i due bottoni devono esistere E avere il codice che li raccoglie: un bottone che non copia
     è peggio di nessun bottone */
  ok((sez.match(/class="btn2 copia"/g) || []).length === 2, "ci sono i due bottoni");
  ok(/data-copia="venueMsg"/.test(sez), "il primo copia il testo del messaggio");
  ok(/data-copia-testo="https:\/\/stageplot\.it\/"/.test(sez), "il secondo copia il link");
  ok(/querySelectorAll\('\.copia'\)/.test(landing), "il JS aggancia i bottoni");
  ok(/execCommand\('copy'\)/.test(landing), "c'è il ripiego per quando la clipboard è negata");
  ok(/copia a mano/.test(landing), "e se fallisce anche quello lo dice, invece di fingere");
});

t("dalla prima schermata si parte da un palco pieno, non da un foglio bianco", () => {
  const cta = landing.slice(landing.indexOf('<div class="cta-row">'), landing.indexOf('</div>', landing.indexOf('<div class="cta-row">')));
  const primo = (cta.match(/<a class="btn"[^>]*>([^<]+)</) || [])[1] || "";
  ok(/palco già pronto/i.test(primo), "il bottone primario apre un modello: «" + primo + "»");
  ok(/model=band/.test(cta.split("</a>")[0]), "e porta davvero a un modello");
  /* Il testo del secondo bottone e' passato da «Palco vuoto» a «Parti da un palco vuoto» il 31/08:
     le due CTA ora dicono la stessa cosa in tutta la pagina, hero e finale, con lo stesso verbo.
     Il test guarda la SOSTANZA — che il foglio bianco resti disponibile in seconda battuta — e non
     la formulazione esatta, che e' materia di prodotto e puo' cambiare. */
  ok(/palco vuoto/i.test(cta), "il foglio bianco resta, in seconda battuta");
  ok(/class="btn2"/.test(cta), "ed e' un bottone secondario, non il primario");
  ok(/rider finito/i.test(cta), "e c'è la porta per chi vuole solo vedere il documento");
});

t("il prezzo è dichiarato nella pagina, non solo nel piede", () => {
  /* Tutti i concorrenti dichiarano il prezzo in home. Il gratis non spiegato, su un professionista,
     genera sospetto invece che gratitudine. */
  const corpo = landing.slice(landing.indexOf('id="chi"'), landing.indexOf('id="domande"'));
  ok(/resta gratis/.test(corpo), "dice che l'editor resta gratis");
  ok(/29 €/.test(corpo), "e dove sta il pagamento");
  ok(/href="\/consulenza\/"/.test(corpo), "con il link alla consulenza fuori dal piede");
  ok(/È nuovo, e te lo dico/.test(landing), "e c'è la dichiarazione di novità al posto della prova che non c'è");
});

/* ===== MENU FILE ESSENZIALE (13/08) — da 17 voci a 5 ===================================== */
t("la finestra Esporta rilegge il nome del progetto quando si apre", () => {
  /* Visto da utente nuovo (23/08): il modello «Band» scrive state.titolo, l'header lo mostra, ma il
     campo «Nome del progetto» dell'export restava vuoto e la riga sotto prometteva «stage-plot.pdf».
     Due verità nella stessa schermata. La sincronia si fa all'APERTURA, così vale per ogni strada
     che imposta un titolo — modello, cloud, copia, import — senza che ognuna debba ricordarsene. */
  const core = appjs.slice(appjs.indexOf("function _pdfExportModalCore"), appjs.indexOf("function _pdfExportModalCore") + 1600);
  ok(/setEventInputs\(\)/.test(core), "l'apertura dell'export chiama setEventInputs()");
  ok(core.indexOf("setEventInputs()") < core.indexOf("pdfRenderPills"), "prima di disegnare il resto della finestra");
  /* e setEventInputs deve davvero riempire pdfTitolo e la riga del nome file */
  const sei = appjs.slice(appjs.indexOf("function setEventInputs"), appjs.indexOf("function setEventInputs") + 600);
  ok(/TITLE_INPUTS\.forEach/.test(sei) && /"pdfTitolo"/.test(appjs.slice(appjs.indexOf("var TITLE_INPUTS"), appjs.indexOf("var TITLE_INPUTS")+90)),
     "e pdfTitolo è fra i campi che riempie");
  ok(/Il file uscirà come "\+fileName\(\)/.test(sei), "con la riga del nome file presa da fileName()");
});

t("il wordmark dell'header non va a capo", () => {
  /* A palco pieno compare lo stato del salvataggio (306 px) e l'header è al limite: i figli flessibili
     si stringono PRIMA che il contenitore scorra, e «STAGE PLOT» — che ha uno spazio in mezzo —
     finiva su due righe. L'header è fatto per scorrere in orizzontale, non per schiacciare il brand. */
  ok(/header \.brand\{[^}]*white-space:nowrap/.test(stylesCss), "white-space:nowrap sul brand");
  ok(/header \.brand\{[^}]*flex:0 0 auto/.test(stylesCss), "e non si stringe: a scorrere sono i controlli centrali");
});

/* ============ il rider letto da chi lo riceve (23/08) ============ */
t("il rider di una band non parla del Direttore, quello di un'orchestra sì", () => {
  /* Il testo del rider era una costante scritta per la prima orchestra, e usciva uguale per ogni
     palco: una band da 14 canali chiedeva «basse attenuate presso la postazione del Direttore» e
     sei persone di personale. Chi riceve un rider così smette di fidarsi anche delle righe giuste. */
  reset();
  const band = A.formationData("band");
  A.state.items = band.out.map((it, i) => Object.assign({ id: "b" + i }, it));
  let D = A.riderDefaults();
  ok(!D.orchestrale, "la band non è orchestrale");
  ok(!/Direttore/.test(D.sistema), "e il sistema audio non nomina il Direttore");
  ok(!/orchestra/i.test(D.luci), "né le luci parlano di orchestra");
  ok(!/2 tecnici microfonisti/.test(D.personale), "niente due microfonisti per 14 canali");
  ok(!/responsabile impianto/.test(D.personale), "né un responsabile impianto");
  ok(/1 fonico di sala/.test(D.personale), "ma il fonico di sala c'è sempre");
  ok(!/responsabile luci/.test(D.personale), "e senza luci sul palco non si chiede un responsabile luci");
  /* e riderData usa DAVVERO questi default: si controlla sulla band, dove il testo derivato e la
     vecchia costante orchestrale differiscono (sull'orchestra coincidono e il test non vedrebbe) */
  let d = A.riderData();
  ok(!/Direttore/.test(d.sistema), "riderData prende il sistema derivato dal palco, non la costante");
  ok(!/2 tecnici microfonisti/.test(d.personale), "e il personale derivato");

  reset();
  const orch = A.formationData("orchpop");
  A.state.items = orch.out.map((it, i) => Object.assign({ id: "o" + i }, it));
  D = A.riderDefaults();
  ok(D.orchestrale, "l'orchestra pop è orchestrale (ha il direttore)");
  ok(/Direttore/.test(D.sistema), "e il sistema audio lo nomina");
  ok(/2 tecnici microfonisti/.test(D.personale) && /responsabile impianto/.test(D.personale), "con il personale pieno");
  d = A.riderData();
  ok(d.sistemaAuto && d.personaleAuto, "riderData li marca come «dai dati»");
  A.state.rider = { personale: "testo mio" };
  ok(!A.riderData().personaleAuto && A.riderData().personale === "testo mio", "quello scritto dall'utente vince e non è più «dai dati»");
  reset();
});

t("nella Lista carichi si capisce cos'è ogni carico, non solo di chi è", () => {
  /* «Basso 400 W» due volte: la spia del bassista e il suo ampli. Chi prepara le prese deve
     distinguerle. L'etichetta resta, il tipo va accanto. */
  const wedge = { type: "wedge", label: "Basso" }, amp = { type: "bassamp", label: "Basso" };
  ok(A.loadName(wedge) !== A.loadName(amp), "spia e ampli del basso non hanno lo stesso nome");
  ok(/Wedge monitor/.test(A.loadName(wedge)), "la spia dice che è una spia");
  ok(/Ampli basso/.test(A.loadName(amp)), "l'ampli dice che è un ampli");
  eq(A.loadName({ type: "wedge", label: "" }), "Wedge monitor", "senza etichetta resta il tipo");
  eq(A.loadName({ type: "wedge", label: "Wedge monitor batterista" }), "Wedge monitor batterista", "e se l'etichetta contiene già il tipo non lo ripete");
});

t("nelle liste PDF il buco colora la sua cella, non la riga", () => {
  /* Un canale senza stage box dipingeva di rosso l'intera riga: su una band appena creata TUTTA la
     input list usciva rossa. Il dato (mic, 48V, asta) è giusto; il buco è solo il patch. */
  const inp = appjs.slice(appjs.indexOf("function patchListPdf"), appjs.indexOf("function patchListPdf") + 3400);
  ok(/function trow\(a,b,c,d,e,f,bold,color,lastColor\)/.test(inp), "la riga della input list ha un colore per l'ultima cella");
  ok(!/r\.box\?"#111827":"#dc2626"/.test(inp), "e non dipinge più la riga di rosso");
  ok(/\(r\.spare\|\|r\.reserved\|\|r\.box\)\?null:"#b45309"/.test(inp), "il patch mancante è ambra, nella sua cella");
  const mon = appjs.slice(appjs.indexOf("function monitorListPdf"), appjs.indexOf("function monitorListPdf") + 3000);
  ok(!/r\.box\?"#111827":"#dc2626"/.test(mon), "stessa cosa nella monitor list");
  ok(/Uscite usate: "\+R\.mixChTot\+\(R\.capOutTot\?/.test(mon), "e «5 / 0» non si scrive più quando la capacità è zero");
});

/* ============ dai manuali (23/08): Shure wireless, Radial DI ============ */
t("RF: l'intermodulazione del 3° ordine si vede prima del soundcheck", () => {
  /* Shure, «Selection and Operation of Wireless Microphone Systems», cap. Intermodulation: con f1 e
     f2 nascono 2·f1−f2 e 2·f2−f1; i costruttori chiedono ≥250 kHz fra ogni prodotto e ogni portante.
     L'esempio del manuale: f1=180, f2=190 → prodotti a 170 e 200 MHz. */
  const T = (rf, label) => ({ rf, label, type: "hhwireless" });
  let iss = A.rfIntermod([T("180", "Voce"), T("190", "Cori"), T("200", "Sax")]);
  ok(iss.some(i => i.kind === "rf-im3" && /200/.test(i.msg) && /Sax/.test(i.msg)), "il terzo a 200 MHz cade esattamente sul prodotto 2×190−180: errore");
  iss = A.rfIntermod([T("180", "Voce"), T("190", "Cori"), T("170.2", "Sax")]);
  ok(iss.some(i => i.kind === "rf-im3"), "a 200 kHz dal prodotto (sotto i 250) è ancora errore");
  iss = A.rfIntermod([T("180", "Voce"), T("190", "Cori"), T("170.3", "Sax")]);
  ok(!iss.some(i => i.kind === "rf-im3"), "a 300 kHz dal prodotto è accettato");
  /* coppie troppo vicine */
  iss = A.rfIntermod([T("606.250", "A"), T("606.450", "B")]);
  ok(iss.some(i => i.kind === "rf-vicine" && /200 kHz/.test(i.msg)), "due portanti a 200 kHz si segnalano: i ricevitori non le separano");
  iss = A.rfIntermod([T("606.250", "A"), T("606.650", "B")]);
  ok(!iss.length, "a 400 kHz, due portanti sole, niente da dire");
  /* robustezza: virgole, vuoti, uno solo */
  ok(!A.rfIntermod([T("606,250", "A")]).length, "una portante sola non può intermodulare");
  ok(!A.rfIntermod([T("", "A"), T("", "B"), T("", "C")]).length, "senza frequenze niente falsi allarmi");
  /* e i TX in-ear entrano nel controllo insieme ai radiomic (manuale PSM: si coordinano insieme) */
  ok(/x\.type==="iemant"/.test(appjs.slice(appjs.indexOf("function rfIssues"), appjs.indexOf("function rfIssues") + 2600)),
     "rfIssues passa a rfIntermod anche i TX in-ear, non solo i radiomic");
  /* e il set coordinato di un kit vero a 4 canali non deve gridare */
  iss = A.rfIntermod([T("606.500", "1"), T("607.500", "2"), T("609.000", "3"), T("611.750", "4")]);
  ok(!iss.some(i => i.kind === "rf-im3"), "un set coordinato (prodotti a 605.5, 608.5, 604, 610, …) passa");
});

t("DI: attiva per i pickup passivi, passiva per gli strumenti alimentati (Radial)", () => {
  /* Radial, guide JDI/J48: «passive direct boxes are preferred for electrically powered devices such
     as keyboards and electronic drums»; l'attiva per pickup passivi/piezo, che vogliono un'impedenza
     d'ingresso altissima. Prima ogni DI nasceva passiva, anche per la chitarra acustica. */
  eq(A.diTipoConsigliato({ type: "gtacustica" }), "attiva", "chitarra acustica (piezo) → attiva");
  /* gli archi del catalogo sono postazioni d'ORCHESTRA: niente pickup, si microfonano con archetto o
     panoramici, e MIKING non offre loro l'opzione «di». Consigliare una DI che non si può mettere era
     una promessa a vuoto (25/08). */
  eq(A.diTipoConsigliato({ type: "contrabbasso" }), "passiva", "contrabbasso d'orchestra: non va in DI");
  eq(A.diTipoConsigliato({ type: "vlnpost" }), "passiva", "violino d'orchestra: idem");
  ok(!A.diApply({ type: "contrabbasso", x: 0, y: 0, w: 150, d: 195 }, {}), "e infatti nessuna DI si può applicare");
  ok(A.diApply({ type: "gtacustica", x: 0, y: 0, w: 46, d: 110 }, {}), "mentre sulla chitarra acustica sì");
  eq(A.diTipoConsigliato({ type: "stagepiano" }), "passiva", "stage piano → passiva");
  eq(A.diTipoConsigliato({ type: "laptop" }), "passiva", "computer → passiva");
  eq(A.diTipoConsigliato(null), "passiva", "senza sorgente: il default di sempre");
  /* la scelta dell'utente vince sull'adozione */
  reset();
  const src = { id: "s1", type: "gtacustica", x: 100, y: 100 };
  const di = { id: "d1", type: "dimono", x: 140, y: 100, diType: "passiva", diTypeUtente: true };
  A.state.items = [src, di];
  ok(A.diAdopt(di, src), "la DI si lascia adottare dall'acustica (diUsesBox)");
  eq(di.diType, "passiva", "l'utente ha scelto passiva: resta passiva");
  const di2 = { id: "d2", type: "dimono", x: 140, y: 100 };
  A.state.items = [src, di2];
  ok(A.diAdopt(di2, src), "anche la seconda");
  eq(di2.diType, "attiva", "senza scelta esplicita, l'acustica prende l'attiva");
  reset();
});

t("il rider riassume la dotazione per modello: microfoni, DI, 48V, aste", () => {
  /* I rider professionali e le schede dei locali si parlano per CONTEGGI — «(6) SM58, (5) aste
     dritte», «15 DI boxes, 12 boom stands» — non per righe. Il nostro diceva solo «14 canali». */
  const righe = [
    { name: "Kick", mic: "D6", stand: "asta bassa", p48: false },
    { name: "Rullante", mic: "SM57", stand: "asta bassa", p48: false },
    { name: "Hi-Hat", mic: "SM81", stand: "asta giraffa", p48: true },
    { name: "OH L", mic: "KM184", stand: "asta giraffa", p48: true },
    { name: "OH R", mic: "KM184", stand: "asta giraffa", p48: true },
    { name: "Tom 1", mic: "e904", stand: "clip strumento", p48: false },
    { name: "Basso", mic: "DI", stand: "", p48: false },
    { name: "Tastiere L", mic: "DI", stand: "", p48: false },
    { name: "Voce", mic: "SM58", stand: "asta dritta", p48: false },
    { name: "Cori", mic: "SM58", stand: "asta dritta", p48: false, standShared: false },
    { name: "Spare", mic: "SM58", stand: "asta dritta", spare: true },
    { name: "RIS", mic: "", reserved: true },
  ];
  const D = A.riderDotazione(righe);
  eq(D.nMic, 8, "otto microfoni veri (DI, spare e riservate escluse)");
  eq(D.nDI, 2, "due DI");
  eq(D.n48, 3, "tre con 48V");
  eq(D.mics["SM58"], 2, "due SM58 (lo spare non conta: non si porta se non serve)");
  eq(D.mics["KM184"], 2, "due KM184");
  ok(/2× SM58/.test(D.testo) && /2× KM184/.test(D.testo) && /2 DI/.test(D.testo) && /3 con 48V/.test(D.testo), "il testo li elenca: " + D.testo);
  ok(D.testo.indexOf("2× SM58") < D.testo.indexOf("1× D6"), "i più numerosi prima");
  eq(D.asteMap["asta giraffa"], 3, "tre giraffe");
  eq(D.asteMap["asta dritta"], 2, "due dritte (lo spare no)");
  ok(!D.asteMap["clip strumento"], "le clip non sono aste da portare");
  ok(/Aste: 3× asta giraffa/.test("Aste: " + D.aste), "e le aste si leggono: " + D.aste);
  /* e il rider HTML e PDF la scrivono davvero */
  ok(/riderDotazione\(\)/.test(appjs.slice(appjs.indexOf("function riderHtml"), appjs.indexOf("function riderHtml") + 3000)), "nel rider HTML");
  ok(/riderDotazione\(\)/.test(appjs.slice(appjs.indexOf("function riderPdf"), appjs.indexOf("function riderPdf") + 3000)), "e nel rider PDF");
});

t("la dotazione unisce lo stesso microfono scritto in modi diversi", () => {
  /* Il campo mic è testo libero: la stessa capsula entra come «SM58», «sm58», «Sm 58» a seconda di chi
     compila. Contandole separate il rider chiedeva al service tre modelli invece di tre pezzi dello
     stesso (25/08). La grafia mostrata è quella più frequente — la sua, non una forma inventata. */
  const D = A.riderDotazione([{ mic: "SM58" }, { mic: "sm58" }, { mic: "Sm 58" }]);
  eq(D.nMic, 3, "tre microfoni");
  eq(D.mics["SM58"], 3, "tutti e tre sotto la stessa voce");
  ok(/3× SM58/.test(D.testo), "e il testo dice 3× SM58: " + D.testo);
  ok(!/1×/.test(D.testo), "nessuna riga da uno");
  /* la grafia più usata vince, anche quando non è la maiuscola */
  const E = A.riderDotazione([{ mic: "beta 58" }, { mic: "beta 58" }, { mic: "BETA 58" }]);
  ok(/3× beta 58/.test(E.testo), "vince la grafia più frequente: " + E.testo);
  /* stessa cosa per le aste, che nel rider sono la riga che il service deve caricare sul furgone */
  const F = A.riderDotazione([{ mic: "SM57", stand: "Asta giraffa" }, { mic: "SM57", stand: "asta giraffa" }]);
  eq(F.asteMap["asta giraffa"] || F.asteMap["Asta giraffa"], 2, "due giraffe, non una e una");
});

t("nel file X32 un canale ha SEMPRE un nome, anche se il suo è tutto non-ASCII", () => {
  /* Un nome cinese o di sole emoji è una stringa non vuota, quindi vinceva il fallback «CH n», ma la
     pulizia ASCII lo riduceva a niente: in console arrivava un canale senza nome (25/08). */
  const cinese = A.x32Snippet([{ n: 1, name: "陈明", short: "" }], "Show").snp;
  ok(/\/ch\/01\/config "CH 1"/.test(cinese), "ripiego «CH 1» invece del nome vuoto: " + cinese.split("\n").find(l => /ch\/01/.test(l)));
  ok(!/config ""/.test(cinese), "nessun nome vuoto nel file");
  const emoji = A.x32Snippet([{ n: 2, name: "🎤🎸", short: "" }], "Show").snp;
  ok(!/config ""/.test(emoji), "vale anche per le sole emoji");
  /* e un nome misto tiene la parte leggibile, non il ripiego */
  const misto = A.x32Snippet([{ n: 3, name: "Voce 陈", short: "" }], "Show").snp;
  ok(/config "Voce"/.test(misto), "la parte ASCII resta: " + misto.split("\n").find(l => /ch\/03/.test(l)));
});

t("il rider dice quanta corrente serve, e sotto quale protezione — in HTML e in PDF", () => {
  /* La sezione Alimentazione c'era solo nell'anteprima HTML: il PDF che si consegna non diceva
     quanta corrente serve. E nessuno dei due nominava il differenziale 30 mA, la prima riga di ogni
     richiesta elettrica seria (HSE GS50, 2017). Una frase sola per entrambi: non possono divergere. */
  const t = A.riderAlimentazioneText({ w: 2600, a: 11.3, distro: ["A 32A"], fasi: false });
  ok(/2,6 kW/.test(t) && /12 A/.test(t), "kW e ampere (arrotondati per eccesso)");
  ok(/quadri: A 32A/.test(t), "i quadri dichiarati");
  ok(/differenziale 30 mA/.test(t), "il differenziale 30 mA");
  ok(/prolunghe completamente svolte/.test(t) && /ciabatte multipresa/.test(t), "prolunghe svolte e ciabatte, non adattatori");
  eq(A.riderAlimentazioneText(null), "", "senza carichi niente sezione");
  const pdf = appjs.slice(appjs.indexOf("function riderPdf"), appjs.indexOf("function riderPdf") + 4000);
  ok(/heading\("ALIMENTAZIONE"\)/.test(pdf) && /riderAlimentazioneText\(d\.elettrico\)/.test(pdf), "il PDF ha la sezione, dalla stessa frase");
  const html = appjs.slice(appjs.indexOf("function riderHtml"), appjs.indexOf("function riderHtml") + 4000);
  ok(/riderAlimentazioneText\(d\.elettrico\)/.test(html), "e l'HTML la prende dalla stessa funzione");
});

/* ============ audit esterno del 23/08 (Manuale operativo): i due P0, riprodotti e corretti ============ */
t("ORC-01: dal picker «Nuovo stage plot», il configuratore dell'organico resta solo in primo piano", () => {
  /* Riprodotto con click veri: «Quanti in orchestra?» si apriva DIETRO «Nuovo stage plot», e bisognava
     premere Annulla su quella sopra per raggiungere quella sotto. Un dialogo modale alla volta. */
  const i = appjs.indexOf("function fillMods(host, after)");
  const f = appjs.slice(i, i + 1400);
  const chiudi = f.indexOf("if(after) after();"), apri = f.indexOf("chiediOrganico(m[0]");
  ok(chiudi > -1 && apri > -1 && chiudi < apri, "il picker si chiude PRIMA di aprire il configuratore");
});

t("ORC-02: il parametro ?model= si consuma dopo l'uso", () => {
  /* Riprodotto: /app/?model=band → poi Orchestra da camera → ricarica → «Creare il modello Band
     pop/rock?» sul lavoro che hai davanti. Il link fa il suo lavoro una volta; poi l'URL è del progetto. */
  const i = appjs.indexOf('var qModel=');
  const f = appjs.slice(i, i + 1500);
  ok(/history\.replaceState/.test(f), "dopo l'uso, history.replaceState");
  ok(/searchParams\.delete\("model"\)/.test(f) && /searchParams\.delete\("form"\)/.test(f), "toglie model e form");
  ok(/_u\.pathname\+\(_u\.search\|\|""\)\+_u\.hash/.test(f), "e conserva gli altri parametri e l'hash");
  ok(f.indexOf("startFromTemplate(mkResolved)") < f.indexOf("history.replaceState"), "solo DOPO aver usato il parametro");
});

/* ============ export console: snippet X32/M32 (23/08) ============ */
t("lo snippet X32/M32 ha il formato dei file veri: intestazione, config per canale, headamp per il 48V", () => {
  /* Formato letto da scene pubbliche (GitHub) e dalla doc OSC di Maillot: «#4.0# "nome" 1 1 1 1 1»,
     «/ch/NN/config "Nome" icona COLORE sorgente», «/headamp/NNN +0.0 ON|OFF» con /headamp/000 =
     ingresso locale 1. Snippet, non scena: applica SOLO questi parametri. */
  const righe = [
    { n: 1, name: "Kick", short: "Kick", mic: "D6", p48: false },
    { n: 2, name: "Batteria 1 - Rullante top", short: "Sn top", mic: "SM57", p48: false },
    { n: 3, name: "Overhead L", mic: "KM184", p48: true },
    { n: 4, name: "Basso", mic: "DI", p48: false },
    { n: 5, name: "Chitarra elettrica «lead» ÀÈÌ", mic: "SM57", p48: false },
    { n: 6, name: "Tastiere L", mic: "DI", p48: false },
    { n: 7, name: "Voce", mic: "SM58", p48: false },
    { n: 8, name: "Cori", mic: "SM58", p48: false, reserved: true },
  ];
  const r = A.x32Snippet(righe, "Band pop/rock");
  const L = r.snp.split("\n");
  eq(L[0], '#4.0# "Band pop/rock" 1 1 1 1 1', "intestazione dello snippet");
  eq(L[1], '/ch/01/config "Kick" 1 RD 1', "canale 1: nome, icona 1, rosso per la batteria, sorgente locale 1");
  eq(L[2], '/headamp/000 +0.0 OFF', "headamp 000 = ingresso 1, phantom OFF");
  eq(L[3], '/ch/02/config "Sn top" 1 RD 2', "il nome breve (la sigla FOH) vince sul nome lungo");
  ok(/\/ch\/03\/config "Overhead L" 1 RD 3/.test(r.snp) && /\/headamp\/002 \+0\.0 ON/.test(r.snp), "overhead: rosso e 48V ON su headamp 002");
  ok(/\/ch\/04\/config "Basso" 1 BL 4/.test(r.snp), "basso blu");
  ok(/\/ch\/05\/config "Chitarra ele" 1 GN 5/.test(r.snp), "chitarra: verde, accenti e virgolette tolti, 12 caratteri");
  ok(/\/ch\/06\/config "Tastiere L" 1 YE 6/.test(r.snp), "tastiere gialle");
  ok(/\/ch\/07\/config "Voce" 1 CY 7/.test(r.snp), "voce ciano");
  ok(/\/ch\/08\/config "SPARE" 1 WHi 8/.test(r.snp), "una riservata esce SPARE in bianco invertito");
  eq(r.count, 8, "otto canali");
  ok(r.snp.endsWith("\n"), "file terminato da newline");
  ok(!/[^\x00-\x7f]/.test(r.snp), "solo ASCII: la console non legge altro");
  /* i non-ASCII DENTRO i 12 caratteri: «» e ♪ spariscono, gli accenti perdono il segno */
  const r3 = A.x32Snippet([{ n: 1, name: "Sax «solo» ♪ più", mic: "SM57" }], "x");
  ok(/\/ch\/01\/config "Sax solo piu" 1 MG 1/.test(r3.snp), "«» e ♪ tolti (e gli spazi doppi che lasciano), ù → u, sax magenta: " + r3.snp.split("\n")[1]);
});

t("lo snippet X32 rispetta i 32 canali e usa il numero FOH quando c'è", () => {
  const molte = []; for (let i = 1; i <= 40; i++) molte.push({ n: i, name: "Ch " + i, mic: "SM57" });
  const r = A.x32Snippet(molte, "x");
  eq(r.count, 32, "al massimo 32 canali");
  eq(r.skipped.length, 8, "e dice quanti sono rimasti fuori");
  const foh = [{ n: 1, foh: 17, name: "Kick", mic: "D6" }, { n: 2, foh: 18, name: "Rullante", mic: "SM57" }];
  const r2 = A.x32Snippet(foh, "x");
  ok(/\/ch\/17\/config "Kick" 1 RD 17/.test(r2.snp) && /\/headamp\/016 /.test(r2.snp), "con più box vale il canale FOH (17), headamp 016");
  ok(!/\/ch\/01\//.test(r2.snp), "e non il progressivo di riga");
  /* e la voce sta nel selettore dei formati */
  const html = readFileSync(join(root, "app/index.html"), "utf8");
  ok(/data-fmt="x32snp"/.test(html), "la voce «Behringer X32 / Midas M32» è nel selettore");
  ok(/fmt==="x32snp" \? exportX32Snippet\(\)/.test(appjs), "e il click la chiama");
});

t("l'email personale non finisce nella LOGICA del codice", () => {
  /* Distinzione che conta. Nella landing l'indirizzo è pubblicato APPOSTA — «dietro c'è una persona
     sola, con nome, cognome e indirizzo, non un modulo di contatto»: è l'argomento della sezione, e
     un `mailto:` è lì per essere usato. Nel codice no: serviva a marcare gli eventi del fondatore
     nelle metriche, dove un id fa lo stesso lavoro. Un indirizzo dentro la logica non lo legge
     nessun umano, solo gli scraper.
     Quindi: vietato ovunque TRANNE che in un mailto o in un link a un profilo pubblico. */
  const html = readFileSync(join(root, "app/index.html"), "utf8");
  const landing = readFileSync(join(root, "index.html"), "utf8");
  const mail = /[a-zA-Z0-9._%+-]+@(?!stageplot\.it|esempio\.it|x\.it|example\.)[a-zA-Z0-9.-]+\.[a-z]{2,}/g;
  const dichiarata = (testo, e, i) => {
    const intorno = testo.slice(Math.max(0, i - 120), i + e.length + 40);
    return /mailto:/.test(intorno) || />\s*$/.test(testo.slice(Math.max(0, i - 2), i));
  };
  for (const [nome, testo] of [["app.js", appjs], ["app/index.html", html], ["index.html", landing]]) {
    const nascoste = [...testo.matchAll(mail)]
      .filter(m => !/schema\.org|@type|@id|@context|w3\.org|noreply|sentry|googleapis/.test(m[0]))
      .filter(m => !dichiarata(testo, m[0], m.index))
      .map(m => m[0]);
    eq(nascoste.join(", "), "", `email dentro la logica di ${nome}`);
  }
  ok(/cloudUser\.id === FOUNDER_ID/.test(appjs), "il fondatore si riconosce dall'id dell'account");
  ok(/var FOUNDER_ID = "[0-9a-f-]{36}"/.test(appjs), "e l'id è un uuid, non un indirizzo");
  ok(!/toLowerCase\(\)==="[a-z.]+@/.test(appjs), "nessun confronto con un indirizzo scritto a mano");
});

t("l'audit non è una card del catalogo, ma si trova cercandolo", () => {
  /* Segnalazione 6458fdd9: il catalogo di sinistra è quello che si POSA sul palco; l'audit è un
     controllo, e stava fra le card solo perché la categoria che lo ospitava era stata rimossa.
     Toglierlo è facile: il costo sarebbe una funzione che nessuno raggiunge più, quindi qui si
     pretende che resti nell'indice della ricerca, con le parole con cui uno lo cerca davvero. */
  const i = appjs.indexOf('makeActionBtn("Pedana"');
  const zona = appjs.slice(i, appjs.indexOf('["metro","testo"]', i));
  ok(!/pin\.appendChild\(makeActionBtn\("Audit progetto"/.test(zona),
     "l'audit non è più una card fissa del catalogo");
  ok(/pin\.appendChild\(makeActionBtn\("Planimetria"/.test(zona),
     "ma le altre card ci sono ancora: non ho svuotato la sezione");
  const voce = appjs.slice(appjs.indexOf('entries.push({nome:"Audit progetto"'), appjs.indexOf('entries.push({nome:"Audit progetto"') + 320);
  ok(/action:toggleAuditView/.test(voce), "la voce cercabile porta ancora all'audit");
  ["audit", "verifica", "controlla", "manca"].forEach(k =>
    ok(voce.includes(k), `e si trova cercando «${k}»`));
});

t("il menu File resta essenziale, e ogni voce ha la sua azione", () => {
  const html = readFileSync(join(root, "app/index.html"), "utf8");
  const menu = html.slice(html.indexOf('id="fileMenu"'), html.indexOf('id="helpMenu"'));
  const voci = [...menu.matchAll(/data-file="([^"]+)"/g)].map(m => m[1]);
  /* Il 13/08 questo menu è passato da 17 voci a 5, e il numero era il punto. Il 18/08 Simone ha
     chiesto Produzione qui dentro: sono sei, e la sesta si giustifica da sola — l'app diceva GIÀ
     «assegnalo in File → Produzione» mentre il comando stava nell'header. Il numero resta bloccato
     perché è quello che tiene lontane le altre sedici. */
  eq(voci.length, 6, "sei voci, non una di più: " + voci.join(", "));
  ["new", "projects", "produzione", "rubrica", "save", "variant-new"].forEach(v =>
    ok(voci.indexOf(v) > -1, "c'è la voce «" + v + "»"));
  /* Il difetto storico di questo menu è la voce che resta scritta e perde il suo comando
     (stageplot_menu_file_comandi_persi): qui si pretende che ogni data-file compaia nella mappa
     `acts`, e che la mappa non contenga chiavi senza voce — codice morto in agguato. */
  const acts = appjs.slice(appjs.indexOf("var acts={"), appjs.indexOf("#fileMenu .mi"));
  const chiavi = [...acts.matchAll(/"([a-z-]+)":/g)].map(m => m[1]);
  voci.forEach(v => ok(chiavi.indexOf(v) > -1, "la voce «" + v + "» ha un'azione"));
  chiavi.forEach(k => ok(voci.indexOf(k) > -1, "l'azione «" + k + "» ha la sua voce"));
});

t("niente di quello che è uscito dal menu è diventato irraggiungibile", () => {
  const html = readFileSync(join(root, "app/index.html"), "utf8");
  /* Ogni riga: cosa è uscito → dove si trova adesso. È il test che discrimina davvero — cancellare
     una voce è facile, il costo è la funzione che nessuno raggiunge più. */
  /* Produzione è tornata nel menu File (segnalazione 570478a6): il pulsante nell'header non c'è
     più, e quello che conta è che l'hub resti raggiungibile — la voce del menu deve chiamarlo. */
  ok(!/id="bProdHdr"/.test(html), "Produzione: il pulsante nell'header è sparito");
  ok(/data-file="produzione"/.test(html), "ed è una voce del menu File");
  ok(/"produzione":function\(\)\{[^}]*openProdHub/.test(appjs), "che apre davvero l'hub");
  ok(/id="cloudVersioni"/.test(appjs), "Punti di ripristino: link in «I miei progetti»");
  ok(/cloudVersioni[\s\S]{0,300}toggleVersionEdit/.test(appjs), "e apre davvero il pannello versioni");
  eq(appjs.split('id="cloudVersioni"').length - 1, 2, "in ENTRAMBI i rami: le versioni sono locali, servono anche senza account");
  ok(/id="pReqActs"/.test(html), "Risposte dei musicisti: azioni sull'elemento");
  ok(/openRequestAnswer\(r\.id\)/.test(appjs), "e «Vedi risposta» la apre davvero");
  ok(/id="mpEmpty"/.test(html), "Palco vuoto: scelta dentro la finestra «Nuovo…»");
  ok(/mpEmpty[\s\S]{0,300}proxyClick\("bNew"\)/.test(appjs), "e azzera davvero");
  ok(/data-j="imp"/.test(appjs) && /data-j="exp"/.test(appjs), "Apri/Scarica progetto: restano dietro «json» nella ricerca");
  ok(/class="cloudDup"/.test(appjs), "Crea una copia: Duplica in «I miei progetti»");
  /* le sole ETICHETTE del menu: il commento che spiega il taglio nomina le voci tolte, e cercarle
     nel blocco intero farebbe fallire il test sulla propria motivazione */
  const menu = html.slice(html.indexOf('id="fileMenu"'), html.indexOf('id="helpMenu"'));
  const etichette = [...menu.matchAll(/<button class="mi"[^>]*>([\s\S]*?)<\/button>/g)]
    .map(m => m[1].replace(/<[^>]*>/g, " ")).join(" | ");   /* via i tag: una voce senza icona non deve sfuggire */
  ["Esporta PDF", "Esporta PNG", "Condividi", "Rinomina", "Crea una copia"].forEach(x =>
    eq(etichette.indexOf(x), -1, "«" + x + "» non è più nel menu: era già a un clic nell'header"));
});

t("«Nuovo…» apre la scelta, e non avvisa di un lavoro che non c'è", () => {
  const html = readFileSync(join(root, "app/index.html"), "utf8");
  const picker = html.slice(html.indexOf('id="modelPicker"'), html.indexOf('id="csvPicker"'));
  ok(/Nuovo stage plot/.test(picker), "la finestra si chiama come il comando che la apre");
  ok(/Palco vuoto/.test(picker) && /id="mpMods"/.test(picker), "le due strade stanno una accanto all'altra");
  /* Prima la conferma di azzeramento partiva SEMPRE: su un palco ancora vuoto annunciava la perdita
     di un lavoro inesistente, e con la nuova finestra sarebbero state due finestre di fila. */
  const nuovo = appjs.slice(appjs.indexOf('getElementById("bNew").addEventListener'), appjs.indexOf('getElementById("bNew").addEventListener') + 1200);
  ok(/hasMeaningfulDocument\(\)/.test(nuovo), "la conferma è condizionata al documento");
  ok(/Promise\.resolve\(true\)/.test(nuovo), "e su un palco vuoto si prosegue diritti");
  ok(/Azzera e ricomincia/.test(nuovo), "quando invece c'è del lavoro, l'avviso resta");
});

/* --- Entità e markup delle guide (13/08) ------------------------------------------------------
   L'analisi GEO diceva: per un modello «StagePlot» non è un'entità, collide con StagePlot Guru e
   Stageplot Pro. Il markup da solo non crea un marchio, ma è il prerequisito perché le menzioni
   che arriveranno abbiano dove attaccarsi. */

t("il sito si àncora a entità vere, non a identificativi inventati", () => {
  /* L'analisi proponeva Q1754117 per «stage plot»: verificato, è il campionato mondiale di hockey
     su ghiaccio junior. Un sameAs sbagliato è peggio di nessun sameAs — questi tre sono stati
     controllati uno per uno sull'API di Wikidata. */
  const ld = JSON.parse((landing.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/) || [])[1]);
  const nodo = (t_) => ld["@graph"].find((n) => n["@type"] === t_);
  const wikidata = JSON.stringify(ld).match(/wikidata\.org\/wiki\/(Q\d+)/g) || [];
  ok(wikidata.length >= 2, "ci sono ancoraggi a Wikidata: " + wikidata.join(", "));
  ok(!/Q1754117/.test(JSON.stringify(ld)), "e non c'è l'ID sbagliato del torneo di hockey");
  const app = nodo("SoftwareApplication");
  ok(Array.isArray(app.about) && app.about.length >= 2, "l'app dichiara di cosa parla");
  /* TUTTI gli ancoraggi del documento, non solo quelli di `about`: gli stessi riferimenti vivono
     anche in `knowsAbout` dell'autore, e un URL storto lì passerebbe inosservato. */
  const ancoraggi = [];
  JSON.stringify(ld, (k, v) => {
    if (k === "sameAs") (Array.isArray(v) ? v : [v]).forEach((u) => { if (/wikidata/i.test(u)) ancoraggi.push(u); });
    return v;
  });
  ok(ancoraggi.length >= 4, "gli ancoraggi sono " + ancoraggi.length + " in tutto il grafo");
  for (const u of ancoraggi) ok(/^https:\/\/www\.wikidata\.org\/wiki\/Q\d+$/.test(u), "ancoraggio ben formato: " + u);
  ok(Array.isArray(app.alternateName) && app.alternateName.length >= 1, "l'app ha nomi alternativi");
  const org = nodo("Organization");
  ok(org.sameAs.length >= 2, "l'organizzazione ha più di un profilo: " + org.sameAs.length);
  ok(org.sameAs.some((u) => /github\.com/.test(u)), "fra cui il repository pubblico");
  ok(Array.isArray(org.alternateName), "e un nome alternativo");
});

t("l'HowTo racconta i passi che stanno davvero nella guida", () => {
  /* Il modo in cui questo markup mente: qualcuno riscrive i passi in pagina e il JSON-LD resta
     indietro, continuando a dichiarare a Google una procedura che il testo non contiene più. */
  const guida = readFileSync(join(root, "guida/come-fare-uno-stage-plot/index.html"), "utf8");
  const ld = JSON.parse((guida.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/) || [])[1]);
  const howto = ld["@graph"].find((n) => n["@type"] === "HowTo");
  ok(howto, "la guida procedurale dichiara un HowTo");

  const blocco = guida.slice(guida.indexOf('id="passi"'), guida.indexOf('id="channel"'));
  const inPagina = [...blocco.matchAll(/<li[^>]*>\s*<strong>([\s\S]*?)<\/strong>/g)]
    .map((m) => m[1].replace(/<[^>]+>/g, "").trim());
  eq(howto.step.length, inPagina.length, "stesso numero di passi in pagina e nel markup");
  howto.step.forEach((s, i) => {
    eq(s.name, inPagina[i], "il passo " + (i + 1) + " ha lo stesso nome");
    ok(s.text && s.text.length > 40, "e un testo che spiega cosa fare");
    eq(s.position, i + 1, "le posizioni sono in ordine");
  });
  ok(howto.estimatedCost && howto.estimatedCost.value === "0", "dichiara che è gratis");
});

t("la differenza fra i quattro documenti è in una tabella, non solo in prosa", () => {
  /* «Che differenza c'è fra rider tecnico e hospitality rider» è una domanda che si fa chiunque
     organizzi una serata: i modelli citano volentieri le tabelle, la prosa molto meno. */
  const g = readFileSync(join(root, "guida/rider-tecnico/index.html"), "utf8");
  const tab = (g.match(/<table class="ch-table">[\s\S]*?<\/table>/) || [""])[0];
  ok(/Chi lo legge/.test(tab), "la tabella dice anche chi legge ciascun documento");
  ok(/Serve sempre\?/.test(tab), "e se serve sempre");
  for (const doc of ["Rider tecnico", "Stage plot", "Channel list", "Hospitality rider"])
    ok(tab.indexOf(doc) > -1, "la tabella confronta anche: " + doc);
  const righe = (tab.match(/<tr>/g) || []).length - 1;      /* meno l'intestazione */
  eq(righe, 4, "quattro documenti a confronto");
});

t("il registro delle modifiche dice il vero, ed è ancora fresco", () => {
  /* Una sezione «cosa è cambiato» è prova che il prodotto è vivo — ma solo finché è aggiornata.
     Ferma da mesi dimostra l'opposto di quello per cui esiste, ed è il modo tipico in cui questa
     idea si ritorce contro: nessuno se ne accorge, perché la pagina continua a funzionare.
     Qui il test fa da promemoria: oltre i 120 giorni o si aggiorna o si toglie. */
  /* Le date del sito sono GIORNI LOCALI: `allinea-date.mjs` le prende da `git log --format=%cs`,
     che stampa la data del committer nel suo fuso. Confrontarle con un istante UTC — com'era
     fatto qui, `new Date(iso + "T12:00:00Z") > new Date()` — rende «futura» qualunque pagina
     toccata oggi fino alle 12:00 UTC: la suite diventava rossa ogni mattina, per un difetto suo.
     Si confrontano giorni con giorni, come stringhe ISO, che sono ordinabili così come sono. */
  const sez = landing.slice(landing.indexOf('class="registro"'));
  const voci = [...sez.matchAll(/<time datetime="(\d{4}-\d{2}-\d{2})">([^<]+)<\/time>\s*<p>([\s\S]*?)<\/p>/g)]
    .map((m) => ({ iso: m[1], mostrata: m[2], testo: m[3].replace(/<[^>]+>/g, "").trim() }));
  ok(voci.length >= 4, "il registro ha almeno quattro voci: " + voci.length);

  const oggi = new Date();
  for (const v of voci) {
    const d = new Date(v.iso + "T12:00:00Z");
    ok(!isNaN(d), "data leggibile dalla macchina: " + v.iso);
    ok(v.iso <= giornoLocale(oggi), "nessuna voce datata nel futuro: " + v.iso);
    ok(v.testo.length > 30, "ogni voce dice cosa è cambiato, non solo che è cambiato: «" + v.testo.slice(0, 40) + "…»");
    /* la data mostrata deve corrispondere a quella leggibile dalla macchina: due date diverse
       nello stesso elemento sono una bugia che nessuno noterebbe */
    const mese = ["gen","feb","mar","apr","mag","giu","lug","ago","set","ott","nov","dic"][d.getUTCMonth()];
    eq(v.mostrata.trim(), d.getUTCDate() + " " + mese, "la data scritta è quella del datetime");
  }
  const piuRecente = voci.map((v) => new Date(v.iso + "T12:00:00Z")).sort((a, b) => b - a)[0];
  const giorni = Math.floor((oggi - piuRecente) / 86400000);
  ok(giorni <= 120,
    "il registro è fermo da " + giorni + " giorni: aggiornalo con le ultime modifiche, o togli la sezione " +
    "(una pagina che si vanta di essere viva e non lo è dimostra il contrario)");
});

t("quello che il riquadro «È nuovo» promette di far verificare, si può verificare", () => {
  /* Nella prima stesura (mia, del 12/08) diceva «il rider che scarichi», «il catalogo che apri» e
     «una persona con nome, cognome e mail» — e nella sezione non c'era UN link, in tutta la pagina
     zero PDF e zero indirizzi. Chi va a cliccare capisce che era retorica, e il riquadro ottiene
     l'opposto di quello per cui esiste. */
  const sez = landing.slice(landing.indexOf('id="novita"'), landing.indexOf('id="domande"'));
  const link = [...sez.matchAll(/<a[^>]+href="([^"]+)"/g)].map((m) => m[1]);
  ok(link.length >= 3, "le verifiche promesse sono raggiungibili: " + link.join(", "));
  ok(link.some((h) => h.startsWith("mailto:")), "l'indirizzo c'è davvero, non è solo nominato");
  for (const a of link.filter((h) => h.startsWith("#"))) {
    ok(landing.indexOf('id="' + a.slice(1) + '"') > -1, "l'ancora «" + a + "» punta a qualcosa che esiste");
  }
  ok(!/che\s+scarichi/.test(sez) || /\.pdf/.test(landing),
    "non si promette un file da scaricare se in pagina non c'è");
});

t("gli alt descrivono l'immagine che c'è, non quella che vorremmo", () => {
  /* Due anteprime per formazione sono lo stesso file byte per byte (band=festival, chiesa=coro):
     finché non saranno disegnate a parte, l'alt non può promettere contenuti che nel file non ci
     sono — è il testo su cui Google indicizza l'immagine. */
  const casi = [
    ["stage-plot/festival/index.html", /cambi rapidi/],
    ["stage-plot/chiesa/index.html", /worship band/],
  ];
  for (const [f, vietato] of casi) {
    const h = readFileSync(join(root, f), "utf8");
    const alt = (h.match(/<img[^>]+previews[^>]+alt="([^"]*)"/) || h.match(/alt="([^"]*Anteprima[^"]*)"/) || [])[1] || "";
    ok(alt.length > 20, f + ": l'anteprima ha un alt descrittivo");
    ok(!vietato.test(alt), f + ": l'alt non promette quello che nel file non c'è — «" + alt + "»");
  }
});

t("nel prima/dopo il disegno regge il paragone con lo scarabocchio", () => {
  /* Il foglietto di sinistra ha nove annotazioni a mano; il disegno di destra ne aveva UNA, e per
     giunta stava nella metà coperta dal cursore. Chi non trascinava vedeva una colonna di testo, e
     il confronto su cui poggia la pagina argomentava contro il prodotto. */
  const ba = landing.slice(landing.indexOf('id="ba"'), landing.indexOf('class="ba-caption"'));
  const prima = ba.slice(0, ba.indexOf("ba-after"));
  const dopo = ba.slice(ba.indexOf("ba-after"));
  const conta = (s) => (s.match(/<text[^>]*>[^<]{2,}<\/text>/g) || []).length;
  ok(conta(dopo) >= conta(prima) - 2,
    "il «dopo» ha etichette quanto il «prima» (" + conta(dopo) + " contro " + conta(prima) + ")");

  /* i numeri sul disegno devono essere quelli della lista accanto: è il punto del prodotto */
  const canaliDisegno = [...dopo.matchAll(/<text[^>]*>[^<]*?·\s*(?:CH\s*)?(\d+)(?:–(\d+))?<\/text>/g)]
    .flatMap((m) => (m[2] ? [+m[1], +m[2]] : [+m[1]]));
  ok(canaliDisegno.length >= 4, "il disegno porta i numeri di canale: " + canaliDisegno.join(", "));
  const inLista = [...dopo.matchAll(/<div class="mr-row"><i>(\d+)<\/i>/g)].map((m) => +m[1]);
  ok(inLista.length >= 8, "la lista accanto ha i suoi canali: " + inLista.length);
  for (const c of canaliDisegno)
    ok(inLista.includes(c), "il canale " + c + " scritto sul disegno esiste anche nella lista");

  /* e il disegno deve stare nella metà che si vede senza trascinare */
  ok(/\.mini-rider \.mr-l\{order:2/.test(landing), "il disegno è nella colonna di destra");
  ok(/\.mini-rider \.mr-r\{order:1\}/.test(landing), "la lista in quella di sinistra");
});

t("le due date di ogni pagina dicono la stessa cosa", () => {
  /* La data di modifica è scritta in due posti — <lastmod> nella sitemap e dateModified nel JSON-LD —
     e due fonti separate divergono sempre: al 13/08 erano sbagliate su TUTTE e 24 le pagine, con il
     sitemap fermo a luglio mentre i file erano cambiati ad agosto, e in un caso il sitemap più
     NUOVO del contenuto. Google usa lastmod per decidere quando ripassare, e quando lo trova
     inaffidabile smette di fidarsene per l'intero sito. Le riallinea `ops/allinea-date.mjs`. */
  const sm = readFileSync(join(root, "sitemap.xml"), "utf8");
  const oggi = new Date();
  const coppie = [...sm.matchAll(/<loc>([^<]+)<\/loc>\s*<lastmod>([^<]+)<\/lastmod>/g)];
  ok(coppie.length >= 20, "il sitemap elenca le pagine con la loro data: " + coppie.length);

  const divergenti = [], future = [];
  for (const [, url, lastmod] of coppie) {
    const rel = url.replace("https://stageplot.it/", "");
    const file = join(root, rel === "" ? "index.html" : rel.replace(/\/$/, "") + "/index.html");
    ok(/^\d{4}-\d{2}-\d{2}$/.test(lastmod), url + ": data in formato ISO");
    if (lastmod > giornoLocale(oggi)) future.push(url + " " + lastmod);
    const html = readFileSync(file, "utf8");
    const dm = (html.match(/"dateModified"\s*:\s*"([^"]+)"/) || [])[1];
    if (dm && dm !== lastmod) divergenti.push(`${rel || "/"} sitemap=${lastmod} schema=${dm}`);
  }
  eq(divergenti.join(" | "), "", "sitemap e schema concordano su ogni pagina");
  eq(future.join(" | "), "", "nessuna data nel futuro");
});

t("lo strumento che allinea le date esiste e sa dire cosa farebbe", () => {
  /* Senza uno strumento, la prossima volta le date verranno riscritte a mano e ridivergeranno.
     Deve anche essere innocuo per difetto: si esegue e dice, scrive solo se glielo chiedi. */
  const s = readFileSync(join(root, "ops/allinea-date.mjs"), "utf8");
  ok(/"log".*"--format=%cs"|"--format=%H %cs"/s.test(s), "prende la data da git, non da un'opinione");
  /* deve saltare i propri commit di manutenzione, o a ogni esecuzione le date si sposterebbero
     a «oggi» per colpa dell'esecuzione precedente: una rincorsa senza fine */
  ok(/soloDate|dateModified\|<lastmod>/.test(s), "ignora i commit che hanno cambiato solo le date");
  /* cercare la stringa «--scrivi» non basta: resta nei commenti anche se qualcuno mette
     `const scrivi = true`. Va verificato che la scrittura dipenda DAVVERO dagli argomenti. */
  ok(/const scrivi\s*=\s*process\.argv\.includes\("--scrivi"\)/.test(s),
    "la scrittura è condizionata all'argomento, non attiva per difetto");
  ok(/dateModified/.test(s) && /lastmod/.test(s), "aggiorna entrambe le fonti");
});

t("il catalogo pubblico dei microfoni coincide con quello del programma", () => {
  /* Il numero dei microfoni è già stato dichiarato sbagliato una volta (155 in pagina, 223 nel
     programma) perché pagina e catalogo erano due cose separate. Questa pagina è GENERATA da
     MIC_DB con ops/genera-catalogo-mic.mjs: qui si verifica che nessuno l'abbia poi modificata a
     mano, e che i dati mostrati siano quelli veri. */
  const cat = readFileSync(join(root, "guida/microfoni/index.html"), "utf8");
  const veri = Object.keys(A.MIC_DB);
  const righe = [...cat.matchAll(/<tr data-cerca="[^"]*" data-p48="(\d)" data-tipo="([^"]*)">\s*<td><strong>([^<]+)<\/strong>/g)]
    .map((m) => ({ p48: m[1] === "1", tipo: m[2], model: m[3] }));
  eq(righe.length, veri.length, "una riga per microfono");

  /* i dati di ogni riga devono essere quelli del catalogo, non una copia invecchiata */
  const perModello = new Map(veri.map((k) => [A.MIC_DB[k].model, A.MIC_DB[k]]));
  let controllati = 0;
  for (const r of righe) {
    const v = perModello.get(r.model);
    if (!v) continue;                       /* modelli con lo stesso nome: saltati, non è il punto */
    eq(r.p48, !!v.p48, r.model + ": il phantom in pagina è quello del catalogo");
    eq(r.tipo, v.type, r.model + ": il tipo in pagina è quello del catalogo");
    controllati++;
  }
  ok(controllati > veri.length * 0.9, "controllati " + controllati + " microfoni su " + veri.length);

  /* i numeri scritti in prosa devono tornare con la tabella */
  const conPhantom = veri.filter((k) => A.MIC_DB[k].p48).length;
  ok(cat.indexOf(`${conPhantom} dei ${veri.length} modelli richiedono`) > -1,
    `la pagina dice quanti vogliono il phantom (${conPhantom} su ${veri.length})`);
  ok(cat.indexOf(`I ${veri.length} microfoni riconosciuti`) > -1, "il titolo dichiara il numero giusto");
});

t("il catalogo è raggiungibile, e chi non ha JavaScript lo vede comunque", () => {
  const cat = readFileSync(join(root, "guida/microfoni/index.html"), "utf8");
  /* le righe stanno nell'HTML servito: se fossero caricate da JS, per un crawler la pagina
     sarebbe una tabella vuota — ed è il contenuto l'unica ragione per cui esiste */
  ok(cat.indexOf("SM58") > -1 && cat.indexOf("Beta 52A") > -1, "i microfoni sono nell'HTML, non caricati dopo");
  ok(/id="micQ"/.test(cat) && /aria-pressed/.test(cat), "ricerca e filtri hanno gli attributi di accessibilità");
  for (const [dove, file] of [["hub delle guide", "guida/index.html"], ["home", "index.html"]]) {
    const h = readFileSync(join(root, file), "utf8");
    ok(h.indexOf('href="/guida/microfoni/"') > -1, dove + ": linka il catalogo");
  }
  const sm = readFileSync(join(root, "sitemap.xml"), "utf8");
  ok(sm.indexOf("<loc>https://stageplot.it/guida/microfoni/</loc>") > -1, "sitemap: la pagina c'è");
  const l = readFileSync(join(root, "llms.txt"), "utf8");
  ok(l.indexOf("/guida/microfoni/") > -1, "llms.txt: la pagina c'è");
});

/* ===== UNA DATA SOLA PER PAGINA, IN TUTTI E TRE I POSTI (13/08) ========================== */
t("sitemap, schema e byline dicono la stessa data, e la byline la dice in italiano", () => {
  /* Le date stanno in tre posti scritti a mano e finora `allinea-date.mjs` ne guardava due: la terza
     — la riga «aggiornato il …» sotto il titolo, l'unica che legge il visitatore — era ferma a
     luglio su 11 pagine su 26. Qui si pretende che i tre coincidano, pagina per pagina. */
  const sitemap = readFileSync(join(root, "sitemap.xml"), "utf8");
  const blocchi = [...sitemap.matchAll(/<url>\s*<loc>([^<]+)<\/loc>\s*<lastmod>([^<]+)<\/lastmod>/g)];
  ok(blocchi.length >= 26, "la sitemap ha i suoi URL con lastmod: " + blocchi.length);
  for (const [, url, lastmod] of blocchi) {
    const p = url.replace("https://stageplot.it/", "");
    const rel = p === "" ? "index.html" : p.replace(/\/$/, "") + "/index.html";
    const html = readFileSync(join(root, rel), "utf8");
    const dm = (html.match(/"dateModified"\s*:\s*"([^"]+)"/) || [])[1];
    if (dm) eq(dm, lastmod, rel + ": lo schema e la sitemap devono dire la stessa data");
    const by = html.match(/<p class="byline">[\s\S]{0,400}?aggiornat[oa] (il |l')(\d{2})\/(\d{2})\/(\d{4})/);
    if (!by) continue;
    const [, art, g, m, a] = by;
    eq([a, m, g].join("-"), lastmod, rel + ": la byline visibile deve dire la data del sitemap");
    /* «il 16/07» ma «l'8» e «l'11»: la data la legge un umano, e va letta come si parla. */
    eq(art, g === "08" || g === "11" ? "l'" : "il ", rel + ": l'articolo davanti al " + g);
  }
});

/* ===== QUELLO CHE IL PRODOTTO DICHIARA DEV'ESSERE VERO (14/08) ============================ */

t("il feedback non si porta dietro il progetto nascosto nell'indirizzo", () => {
  /* `#p=` contiene il PROGETTO INTERO compresso e `?view=`/`?t=` il token che lo apre: mandare
     `location.href` significava allegarli a ogni segnalazione, anche a chi aveva lasciato vuota la
     casella «Allega il mio progetto», mentre la riga sotto il bottone promette «dati anonimi». */
  const corpo = appjs.slice(appjs.indexOf("function collectAndSend("), appjs.indexOf("function collectAndSend(") + 900);
  ok(/page_url:\s*pageUrlSicuro\(\)/.test(corpo), "l'URL passa dalla ripulitura");
  eq(/page_url:\s*location\.href/.test(corpo), false, "e non è più l'indirizzo grezzo");

  /* Non basta che la funzione esista: qui viene ESEGUITA su un indirizzo che porta un token e un
     progetto, e si pretende che di quei valori non resti niente. */
  const src = appjs.slice(appjs.indexOf("function pageUrlSicuro()"));
  const fn = src.slice(0, src.indexOf("\n  }") + 4);
  ok(fn.length > 80 && fn.includes("searchParams"), "la funzione è stata ritagliata intera");
  const finto = { href: "https://stageplot.it/app/?view=TOKEN_SEGRETO&t=ALTRO#p=PROGETTOCOMPRESSO",
                  origin: "https://stageplot.it", pathname: "/app/" };
  const out = new Function("location", "URL", fn + "; return pageUrlSicuro();")(finto, URL);
  eq(out.indexOf("TOKEN_SEGRETO"), -1, "il token di condivisione non esce: " + out);
  eq(out.indexOf("ALTRO"), -1, "nessun valore di query esce: " + out);
  eq(out.indexOf("PROGETTOCOMPRESSO"), -1, "e nemmeno il progetto nel fragment: " + out);
  ok(out.indexOf("https://stageplot.it/app/") === 0, "resta la pagina, che è l'unica cosa utile");
  ok(/view/.test(out) && /#p/.test(out), "restano i NOMI, per sapere da dove scriveva: " + out);
});

t("gli ampere del pannello dicono da dove viene il numero", () => {
  /* Lo stesso dato era «reale» nel pannello e «stimato» nel PDF. Chi dimensiona un quadro su un
     numero che si dichiara reale sta credendo a una misura che nessuno ha fatto. */
  eq(appjs.indexOf('title="Assorbimento reale'), -1, "nessuno chiama «reale» un valore di catalogo");
  ok(/function wattFonte\(it\)/.test(appjs), "la provenienza si calcola");
  const f = appjs.slice(appjs.indexOf("function wattFonte(it)"), appjs.indexOf("function wattFonte(it)") + 420);
  ok(/it\.watt[\s\S]{0,60}"dichiarato"/.test(f), "quello che scrive l'utente è dichiarato");
  ok(/lightModelWatt[\s\S]{0,120}"targa"/.test(f) && /equipWatt[\s\S]{0,80}"targa"/.test(f), "i modelli hanno il dato di targa");
  ok(/return "stima"/.test(f), "il resto è una stima, e va detto");
  ok(/wattFonteTxt\(r\.fonte\)/.test(appjs), "e il pannello lo dice davvero");
  ok(/fonte:wattFonte\(/.test(appjs), "la riga porta con sé la provenienza");
});

t("il link senza account non promette la sincronia che non ha", () => {
  /* Due meccanismi diversi con la stessa promessa: quello cloud (?view=) è vivo e in sola lettura,
     quello locale (#p=) è una copia che il destinatario può modificare e che non si aggiorna. */
  const s = appjs.slice(appjs.indexOf("var SHARE_INTRO="), appjs.indexOf("var SHARE_INTRO=") + 700);
  ok(/istantanea:/.test(s) && /vivo:/.test(s), "due testi, uno per meccanismo");
  const ist = (s.match(/istantanea:\s*'([^']*(?:\\'[^']*)*)'/) || [])[1] || "";
  ok(ist.length > 40, "il testo dell'istantanea esiste: " + ist);
  eq(/sempre aggiornat/.test(ist), false, "l'istantanea non promette aggiornamenti");
  eq(/sola lettura/.test(ist), false, "né la sola lettura, visto che la copia è modificabile");
  ok(/copia/.test(ist), "dice che è una copia");
  ok(/shareIntroTxt/.test(appjs) && /mode==="istantanea"\s*\)\s*\?\s*SHARE_INTRO\.istantanea/.test(appjs),
     "ed è il badge a scegliere quale testo mostrare");
});

/* ===== IL PANNELLO PERMESSI SEGUE IL LINK CHE DESCRIVE (14/08) ============================= */
t("il pannello dei permessi non contraddice l'intro due righe sopra", () => {
  /* Correggere il solo testo dell'intro non era bastato: restava il badge verde «Sola lettura ·
     sempre», e nella stessa finestra si leggeva «chi lo riceve può modificarla» accanto a «nessuno
     può modificare il tuo progetto». Il badge, che pesa di più, era quello falso. */
  ok(/function sharePermsPerModo\(mode\)/.test(appjs), "i permessi hanno un testo per modo");
  ok(/sharePermsPerModo\(mode\)/.test(appjs.slice(appjs.indexOf("function shareBadge("), appjs.indexOf("function shareBadge(") + 400)),
     "e il badge lo aggiorna insieme all'intro");
  const f = appjs.slice(appjs.indexOf("function sharePermsPerModo("), appjs.indexOf("function sharePermsPerModo(") + 1400);
  ok(/Copia modificabile/.test(f), "sull'istantanea dice che è una copia modificabile");
  ok(/il tuo progetto non cambia/.test(f), "e che il progetto di chi condivide resta intatto");
  /* la casella «Crea una copia» sul link locale non tocca niente: quel link apre l'editor, non un
     viewer con un pulsante da nascondere. Se resta lì senza dirlo, promette un controllo che non c'è. */
  ok(/Vale per i link con account/.test(f), "e dichiara che la casella «Crea una copia» lì non agisce");
  const html = readFileSync(join(root, "app/index.html"), "utf8");
  ok(/id="sharePermRead"/.test(html) && /id="sharePermCopyHint"/.test(html), "le due righe hanno l'aggancio nel markup");
});

/* ===== QUANDO LA PAGINA SE NE VA, LA CODA NON RESTA IN SOSPESO (14/08) ==================== */
t("chiudere la scheda non lascia l'ultima modifica in coda", () => {
  /* L'autosave cloud aspetta 10 secondi. Chi sposta un elemento e chiude subito il portatile, o
     passa a un'altra app dal telefono, lasciava quella modifica nella coda: il locale ce l'ha, il
     cloud no, e riaprendo il progetto dall'altro dispositivo manca l'ultima cosa fatta. */
  const vis = appjs.slice(appjs.indexOf('document.addEventListener("visibilitychange", function(){'),
                          appjs.indexOf('window.scheduleCloudAutosave=scheduleCloudAutosave'));
  ok(/document\.hidden/.test(vis), "il ramo «la pagina se ne va» esiste");
  ok(/__cloudNeedsFlush\(\)/.test(vis), "e chiede se c'è qualcosa in sospeso");
  ok(/clearTimeout\(_cloudAsT\)[\s\S]{0,60}cloudAutosaveNow\(\)/.test(vis),
     "salta il debounce e salva subito, invece di sperare nei 10 secondi");
  /* Deliberatamente NON si aggiunge __cloudNeedsFlush al beforeunload: il lavoro è comunque nel
     locale, e un «vuoi davvero uscire?» dopo ogni modifica sarebbe un dazio continuo. L'avviso
     resta per i tre casi in cui il locale NON c'è. */
  /* la CONDIZIONE, non una finestra di caratteri dopo l'inizio della funzione: il commento sopra la
     riga è lungo, e misurare a caratteri faceva leggere al test il commento invece del codice —
     scoperto sabotando, perché il controllo restava verde col difetto rimesso. */
  const cond = (appjs.match(/if\(!window\.__localConflict[^\n]*return;/) || [""])[0];
  ok(cond.length > 40, "la guardia di uscita è stata trovata: " + cond);
  eq(/__cloudNeedsFlush/.test(cond), false, "e l'avviso di uscita non si allarga a chi ha il locale sano");
});

/* ===== L'ILLUSTRAZIONE SI DEFINISCE UNA VOLTA, MA SOLO A VIDEO (14/08) ==================== */
t("sul palco le illustrazioni si richiamano, nell'export si scrivono per intero", () => {
  /* Misurato: su 132 elementi le illustrazioni erano il 67% dei nodi ma i disegni distinti dodici.
     A video una copia sola in <defs> + <use>: markup da 3,2 MB a 933 KB, nodi da 10.009 a 5.703.
     Nell'export NO: il PNG appiattisce il CSS camminando il DOM, e i nodi dentro un <use> stanno in
     uno shadow tree che querySelectorAll non attraversa. Misurato anche quello, rimettendo il
     difetto: col <use> nell'export si perde il 59% dei pixel colorati. */
  ok(/function libIconScene\(key\)/.test(appjs), "esiste il richiamo di scena");
  const f = appjs.slice(appjs.indexOf("function libIconScene(key)"), appjs.indexOf("function sceneArtDefs"));
  ok(/if\(!_sceneArt\) return libIcon\(key\);/.test(f), "fuori dalla scena si comporta come prima");
  ok(/<use href="#sa_/.test(f), "dentro la scena richiama la definizione");
  ok(/libIconCon\(key, "SA_"\+key\+"_"\)/.test(f), "con un prefisso STABILE per chiave, non il contatore del catalogo");

  /* il pezzo che regge tutto: l'export deve chiedere il markup espanso. Se qualcuno «semplifica»
     togliendo questo argomento, il PNG esce scolorito e nessuno se ne accorge finché non lo apre. */
  ok(/sceneMarkup\(\{espandi:true\}\)/.test(appjs), "l'export chiede esplicitamente il markup autonomo");
  const sm = appjs.slice(appjs.indexOf("function sceneMarkup(opts)"), appjs.indexOf("function sceneMarkup(opts)") + 600);
  ok(/_sceneArt = \(opts && opts\.espandi\) \? null : \{\}/.test(sm), "ed è l'argomento a spegnere la raccolta");

  /* i due centralizzatori: 156 usi passano di qui, e devono passare dal richiamo */
  const fit = appjs.slice(appjs.indexOf("function drawLibFit(key,it,bw,bd)"), appjs.indexOf("function drawLibFit(key,it,bw,bd)") + 320);
  eq(/libIcon\(key\)/.test(fit.replace(/libIconScene\(key\)/g, "")), false, "drawLibFit non chiama più la copia piena");
  ok(/libIconScene\(key\)/.test(fit), "ma il richiamo");
  /* la scala resta FUORI dal richiamo: è la regola della scala reale, il disegno non si tocca */
  ok(/transform="scale\('\+k\+'\)">'\+libIconScene\(key\)/.test(fit), "e il fattore di scala resta sul gruppo che avvolge");
});

/* ===== L'AIUTO DICE LA VERITÀ SULLO SCHERMO CHE HAI DAVANTI (14/08) ======================= */
t("l'aiuto non manda a cercare un pannello che su quello schermo non c'è", () => {
  /* Le proprietà stanno a destra sul computer e in basso sul telefono: un solo testo per due layout
     mandava metà degli utenti a cercare una colonna che non esiste.
     Dal 02/09 sul telefono non si nomina NESSUN pannello: il testo lungo diventava CINQUE righe e
     copriva il palco — visto sul simulatore iPhone, la prima volta che ho potuto guardarlo davvero.
     Là si dice la cosa che serve subito; il resto si scopre toccando. */
  const h = appjs.slice(appjs.indexOf('t.id="dragHint"'), appjs.indexOf('t.id="dragHint"') + 900);
  ok(/isMobile\(\)/.test(h), "l'aiuto guarda che schermo è");
  ok(/pannello a destra/.test(h), "col mouse dice dov'e' il pannello");
  ok(/Toccalo per il nome/.test(h), "col dito dice cosa fare, senza nominare pannelli");
  /* E il testo del telefono dev'essere corto, o torna a coprire il palco. */
  const mob = (h.match(/\? "([^"]+)"/) || ["", ""])[1];
  ok(mob.length > 0 && mob.length < 70, "e sta in due righe: " + mob.length + " caratteri — «" + mob + "»");
  ok(!/pannello in basso/.test(h), "su telefono non si manda a cercare un pannello");
});

t("se la schermata non si prepara, il box torna lo stesso: mai lasciare l'utente senza finestra", () => {
  /* Riprodotto in produzione il 27/08: premuto «Screenshot», il box si chiudeva, il ritaglio non si
     apriva e il pulsante restava per sempre su «Preparo la schermata…». `play()` può non risolversi
     MAI — traccia che non consegna fotogrammi, politica di autoplay, scheda in background — e il
     `finally` rimetteva a posto il pulsante dimenticandosi del box: finestra sparita e nessun modo
     di riaverla. */
  const h = appjs.slice(appjs.indexOf("shotBtn.addEventListener"), appjs.indexOf("shotBtn.addEventListener") + 3000);
  /* l'attesa ha un limite */
  ok(/Promise\.race/.test(h), "play() non si aspetta all'infinito");
  ok(/setTimeout\(r, 4000\)/.test(h), "il limite è esplicito: 4 secondi");
  /* senza fotogramma non si finge che sia andata bene */
  ok(/videoWidth > 0 && v\.videoHeight > 0/.test(h), "si controlla che un fotogramma ci sia davvero");
  ok(/throw new Error\("nessun fotogramma"\)/.test(h), "e altrimenti si esce dall'errore");
  /* qualunque cosa vada storta, la finestra torna */
  ok(/catch\(_e\)\{[\s\S]{0,300}__toast/.test(h), "l'utente viene avvisato, non lasciato al buio");
  const fin = h.slice(h.indexOf("} finally {"));
  ok(/if\(crop\.hidden\) boxTorna\(\);/.test(fin), "e il box torna sempre, tranne se il ritaglio è aperto");
  /* il pulsante non resta bloccato */
  ok(/shotBtn\.disabled = false/.test(fin), "il pulsante si sblocca in ogni caso");
});

t("la via senza finestra di consenso è scritta con la scorciatoia del sistema", () => {
  /* Il consenso di Chrome alla cattura non si può togliere: lo impone il browser a ogni chiamata di
     getDisplayMedia, e non esiste impostazione che lo salti — se un sito potesse fotografare la
     scheda senza chiedere, qualunque pagina potrebbe spiare quelle accanto. Chi vuole evitarlo fa lo
     screenshot col sistema e lo incolla: quella strada c'era già, ma la riga non diceva COME (27/08). */
  const html = readFileSync(join(root, "app/index.html"), "utf8");
  ok(/id="fbShotHow"/.test(html), "la riga ha un id, così il testo si adatta al sistema");
  const blocco = appjs.slice(appjs.indexOf('getElementById("fbShotHow")'), appjs.indexOf('getElementById("fbShotHow")') + 700);
  ok(/⌘⇧4/.test(blocco) && /⌘V/.test(blocco), "su Mac dice la scorciatoia e come incollare");
  ok(/Win\+Maiusc\+S/.test(blocco) && /Ctrl\+V/.test(blocco), "su Windows la sua");
  ok(/iPhone\|iPad/.test(blocco), "su iPhone e iPad NON si scrive una scorciatoia: lì è un gesto fisico");
  /* e la cattura resta quella che chiede il consenso: non stiamo promettendo di averlo tolto */
  ok(/preferCurrentTab:true/.test(appjs), "la cattura propone «Questa scheda», che è quanto si può fare");
});

t("lo screenshot si fa a schermo libero: il box si toglie e torna com'era", () => {
  /* Il box restava aperto durante la cattura e finiva dentro la foto — che serve proprio a mostrare
     quello che il box copriva. Ora si chiude prima di chiedere la condivisione e torna da solo
     quando il ritaglio è finito o annullato (27/08, segnalazione con schermata). */
  const html = readFileSync(join(root, "app/index.html"), "utf8");
  const btn = html.slice(html.indexOf('id="fbShotBtn"') - 90, html.indexOf('id="fbShotBtn"') + 90);
  ok(/>⛶ Screenshot</.test(btn), "il pulsante si chiama «Screenshot»: " + btn.slice(btn.indexOf(">") + 1, btn.indexOf("</")));
  /* si chiude PRIMA di chiedere la condivisione, o la foto la contiene lo stesso */
  const h = appjs.slice(appjs.indexOf("shotBtn.addEventListener"), appjs.indexOf("shotBtn.addEventListener") + 700);
  const iVia = h.indexOf("boxViaPerLoScatto()"), iCattura = h.indexOf("getDisplayMedia");
  ok(iVia > -1 && iVia < iCattura, "il box si toglie prima della cattura");
  ok(/catch\(_e\)\{ boxTorna\(\); return; \}/.test(h), "e se annulli il permesso torna subito");
  /* torna quando il ritaglio si chiude, in ENTRAMBI i casi: allegato o annullato */
  ok(/function cropChiudi\(\)\{[^}]*boxTorna\(\);/.test(appjs), "cropChiudi lo fa tornare");
  ok(/cropAnn\.addEventListener\("click", cropChiudi\)/.test(appjs), "«Annulla» passa da lì");
  ok(/cropChiudi\(\);\s*await shotMetti/.test(appjs), "e «Allega la selezione» pure");
  /* e torna SENZA azzerare: chi ha già scritto categoria e testo non li perde */
  const torna = appjs.slice(appjs.indexOf("function boxTorna()"), appjs.indexOf("function boxTorna()") + 200);
  ok(/mostraBox\(\)/.test(torna), "riapre con mostraBox");
  eq(/openFeedbackBox\(\)/.test(torna), false, "NON con openFeedbackBox, che azzera i chip e la spunta");
  /* mostraBox non deve contenere gli azzeramenti */
  const mostra = appjs.slice(appjs.indexOf("function mostraBox()"), appjs.indexOf("function mostraBox()") + 500);
  eq(/attach\.checked=false/.test(mostra), false, "mostraBox non tocca la spunta del progetto");
  eq(/classList\.remove\("on"\)/.test(mostra), false, "né le categorie scelte");
});

t("Specchia/Duplica/Elimina restano l'ultima riga del pannello", () => {
  /* Il riordino finale era `querySelector(".btns")` al SINGOLARE: prendeva la prima barra e spostava
     solo quella. Aggiungendo «Primo piano / In fondo» con la stessa classe, in fondo finiva la nuova
     e le azioni restavano appese in cima — segnalato con una schermata il 26/08. */
  const coda = appjs.slice(appjs.indexOf('dv.className="pdiv"'), appjs.indexOf('dv.className="pdiv"') + 700);
  ok(/querySelectorAll\("\.btns"\)/.test(coda), "si spostano TUTTE le barre, non solo la prima");
  ok(/pActRow/.test(coda), "e pActRow ha una regola sua per restare ultima");
  /* la CHIAMATA singolare non c'è più — il commento che la cita non conta, per questo cerco `sp.` */
  eq(/sp\.querySelector\("\.btns"\)/.test(coda), false, "niente più querySelector singolare");
});

t("nessun comando cerca un elemento che non esiste più: il boot non deve fermarsi a metà", () => {
  /* Togliendo tre sezioni dal pannello (26/08) è rimasta indietro una riga che faceva
     getElementById("pBy").addEventListener(...) SENZA guardia: nel browser il boot moriva lì, in
     silenzio — niente errore in console, ma MIKING e NUMBERED_HW restavano undefined e l'app era
     inservibile. La suite era tutta verde, perché il sandbox non ha un DOM vero da cui sparire.
     Questo test guarda gli id usati senza `if(el)` e chiede che esistano nell'HTML generato. */
  const html = readFileSync(join(root, "app/index.html"), "utf8");
  const usatiSenzaGuardia = [...appjs.matchAll(/getElementById\("([A-Za-z][\w-]*)"\)\s*\.(addEventListener|value|checked|textContent|style)/g)]
    .map((m) => m[1]);
  /* Un id vale se sta nell'HTML generato OPPURE se il codice stesso lo crea a runtime, scrivendolo
     dentro una stringa di markup (`h+='<input id="ppShort" …'`). Quello che non sta né di qua né di
     là è un comando che punta al vuoto. */
  const mancanti = [...new Set(usatiSenzaGuardia)]
    .filter((id) => !new RegExp(`id="${id}"`).test(html))
    .filter((id) => !new RegExp(`id=\\\\?["']${id}["']`).test(appjs));
  eq(mancanti.length, 0, "id cercati senza guardia e assenti dall'HTML: " + mancanti.join(", "));
});

t("«Primo piano» porta davvero sopra, anche premuto due volte su elementi diversi", () => {
  /* Il comando c'era solo per le forme libere, e prometteva più di quello che faceva: «Sopra»
     scriveva un 3 fisso — due elementi «sopra» restavano nell'ordine d'inserimento — e «Sotto»
     cancellava il valore, cioè tornava al default del tipo invece di andare sotto (26/08). */
  const a = { id: "a", type: "wedge", z: 2 };
  const b = { id: "b", type: "wedge", z: 2 };
  const c = { id: "c", type: "wedge", z: 5 };
  const items = [a, b, c];
  /* portare A davanti lo mette sopra al più alto, non a un numero fisso */
  a.z = A.zDavantiA(items, a);
  ok(a.z > A.effZ(c), `A davanti a tutti: ${a.z} > ${A.effZ(c)}`);
  /* e ora B davanti deve superare A: è il caso che il vecchio comando sbagliava */
  b.z = A.zDavantiA(items, b);
  ok(b.z > a.z, `poi B supera A: ${b.z} > ${a.z}`);
  /* in fondo, allo stesso modo */
  c.z = A.zDietroA(items, c);
  ok(c.z < A.effZ(a) && c.z < A.effZ(b), `C sotto tutti: ${c.z}`);
  /* e l'ordine di disegno lo rispetta davvero */
  A.state.items = [a, b, c];
  const ordine = A.sortedItems().map((x) => x.id);
  eq(ordine.join(""), "cab", "si disegna dal fondo al davanti: " + ordine.join(" → "));
  /* lista vuota: nessun crash, si torna al default */
  eq(A.zDavantiA([], null), 2, "senza altri elementi resta il default");
  eq(A.zDietroA([], null), 2, "idem in fondo");
});

t("il microfono voce sta DAVANTI alla bocca, cioè verso il pubblico", () => {
  /* Stava a -(d/2+16): sedici centimetri oltre il bordo di FONDO, quindi dietro la nuca. In pianta
     il pallino sopra la testa si legge come un archetto indossato — segnalato il 26/08, «questo
     dovrebbe essere il microfono con giraffa davanti alla bocca, non si capisce». Il campo non si
     imposta più dal pannello, ma i progetti che l'hanno usato continuano a disegnarlo: per loro
     dev'essere giusto. */
  const blocco = appjs.slice(appjs.indexOf("var _hm=headMicOf(it);"), appjs.indexOf("var _hm=headMicOf(it);") + 1500);
  const asta = blocco.slice(blocco.indexOf("else s +="), blocco.indexOf("else s +=") + 320);
  ok(!/translate\(0,'\+\(-\(/.test(asta), "la y non è più negativa: " + asta.slice(0, 90));
  ok(/\(it\.d\|\|60\)\/2\+16/.test(asta), "sta oltre il bordo verso il pubblico");
  /* e l'asta punta all'indietro, verso chi canta, non in avanti nel vuoto */
  ok(/y1="-4\.6" x2="0" y2="-16"/.test(asta), "il braccio torna verso il musicista: " + asta.slice(-110));
  /* l'archetto invece resta dov'era: si indossa, non sta davanti */
  ok(/archetto"\) s \+= '<g transform="translate\(0,'\+\(-\(/.test(blocco), "l'archetto resta sulla testa");
});

t("«Fornito da» vive nella channel list, non nel pannello dell'elemento", () => {
  /* Tolto dal pannello il 26/08 (segnalazione): chi porta cosa si scrive fra le note, e chi lo
     vuole strutturato ha la colonna «forn.» riga per riga — che è dove i rider veri lo mettono.
     Il campo it.by resta LETTO dalla backline list, quindi i progetti che ce l'hanno non perdono
     niente: è la differenza fra togliere un controllo e cancellare un dato. */
  const html = readFileSync(join(root, "app/index.html"), "utf8");
  eq(/id="pByWrap"/.test(html), false, "la sezione non è più nel pannello dell'elemento");
  eq(/id="pBalWrap"/.test(html), false, "né il selettore Jack/XLR");
  eq(/id="pHeadMicWrap"/.test(html), false, "né «Canta?»");
  /* e nessun codice rimasto a cercare quegli id: un `if(el)` su un id sparito non fallisce, tace */
  ["pByWrap", "pBalWrap", "pHeadMicWrap", "pOutJack", "pOutXlr"].forEach((id) => {
    eq(new RegExp(`getElementById\\("${id}"\\)`).test(appjs), false, `codice orfano che cerca ${id}`);
  });
  /* la funzione resta dove serve */
  ok(/Fornito da: chi porta l'attrezzatura/.test(appjs), "la colonna «forn.» è ancora nella channel list");
  ok(/\{h:"Fornito da"/.test(appjs), "e la backline list del rider la stampa ancora");
  /* i dati dei progetti già salvati continuano a essere letti */
  ok(/function headMicOf/.test(appjs), "headMic resta letto: i progetti che l'hanno usato tengono il canale voce");
});

/* ===== IL MODELLO DICHIARA COSA HA DECISO AL POSTO TUO (14/08) ============================ */
t("dopo un modello il riepilogo delle ipotesi si calcola dal palco, non è un testo fisso", () => {
  /* Un modello posa ventuno oggetti e decide quante voci ci sono, chi ha l'in-ear, quanti cori.
     Erano decisioni invisibili che finivano nel PDF con l'aria di essere requisiti verificati. */
  const html = readFileSync(join(root, "app/index.html"), "utf8");
  ok(/id="assunzioni"/.test(html) && /id="asRows"/.test(html), "il riepilogo esiste nel markup");
  ok(/function ipotesiDelPalco\(gia\)/.test(appjs), "e le righe hanno un motore");
  const f = appjs.slice(appjs.indexOf("function ipotesiDelPalco(gia)"), appjs.indexOf("function aggiungiCorista"));
  ok(/state\.items/.test(f) && /patchList\(\)/.test(f), "che legge il palco e la channel list veri");
  /* se le frasi fossero scritte a mano, il riepilogo potrebbe dire una cosa mentre il palco ne dice
     un'altra: è il difetto che stiamo correggendo, non uno da introdurre */
  ok(/corista/.test(f) && /canHeadMic/.test(f) && /iem/.test(f), "e copre voci, chi può cantare e l'ascolto");
  ok(/mostraAssunzioni\(false, _gia\)/.test(appjs.slice(appjs.indexOf("function startFromTemplate"), appjs.indexOf("function startFromTemplate") + 2400)),
     "il riepilogo si apre dopo aver posato un modello");
  ok(/sp_noAssunzioni/.test(appjs), "e «non mostrarlo più» viene ricordato");
});

t("il corista aggiunto dal riepilogo non diventa una voce solista", () => {
  /* Trovato provandolo: `addItem("corista")` etichetta in automatico «Voce 1», e il nuovo arrivato
     compariva in channel list come VOCE SOLISTA — il riepilogo che deve chiarire le ipotesi ne
     creava una falsa, e il conteggio saliva a «2 voci soliste» dopo aver aggiunto UN CORISTA. */
  const f = appjs.slice(appjs.indexOf("function aggiungiCorista()"), appjs.indexOf("function togliCorista"));
  ok(/nuovo\.label/.test(f), "il nuovo corista riceve la sua etichetta");
  ok(/replace\(\/\\s\*\\d\+\$\/,""\)/.test(f) || /\\s\*\\d\+\$/.test(f), "presa da quella dei cori già presenti, senza il numero");
  ok(/"Cori"/.test(f), "con «Cori» come ripiego");
  /* e il conteggio non si fida dei soli nomi dei canali */
  const c = appjs.slice(appjs.indexOf("function ipotesiDelPalco(gia)"), appjs.indexOf("function aggiungiCorista"));
  ok(/etichetteCori/.test(c) && /indexOf\(String\(n\)\.toLowerCase\(\)\)<0/.test(c),
     "le voci soliste escludono le etichette dei coristi");
});

/* ===== IL MODELLO CHIEDE COM'È FATTA LA BAND, E POSIZIONA (14/08) ======================== */
t("il modello è una base di partenza: chi suona, i suoi strumenti, il suo ascolto", () => {
  /* Decisione del 16/08: il modello posava ventuno elementi, e una decina erano allestimento deciso
     al posto dell'utente. Pedana, side fill, TX in-ear, stage box e prese dipendono dal locale e dal
     service, non dalla band: chi ne ha bisogno li aggiunge, chi no non deve cancellarli. */
  const std = A.buildBandOut();
  ["pedana", "sidefill", "iemant", "stagebox", "corrente"].forEach(t =>
    eq(std.filter(e => e.type === t).length, 0, "«" + t + "» non fa parte della base di partenza"));
  /* ci sono le PERSONE, non solo la loro attrezzatura: era il rilievo dell'audit — chitarra e basso
     esistevano come ampli e asta, e il conto di chi sale sul palco non tornava mai */
  eq(std.filter(e => e.type === "cantante").length, 1, "il cantante c'è come persona");
  eq(std.filter(e => e.type === "gtstand").length, 1, "e il chitarrista");
  eq(std.filter(e => e.type === "bassstand").length, 1, "e il bassista");
  eq(std.filter(e => e.type === "corista").length, 1, "un corista");
  eq(std.filter(e => e.type === "batteria").length, 1, "una batteria");
  ok(std.filter(e => e.type === "wedge").length >= 5, "e ognuno ha il suo ascolto");
  /* l'ampli è un flag dello strumentista, non un oggetto a parte: così la catena
     strumento → ampli → microfono genera i canali da sola */
  ok(std.filter(e => e.type === "gtstand")[0].ampli === true, "il chitarrista ha il suo ampli");
  ok(std.filter(e => e.type === "bassstand")[0].ampli === true, "e il bassista pure");
});

t("la formazione dichiarata cambia palco, canali e mix insieme", () => {
  const g2 = A.buildBandOut({ cori: 3, chitarra: 2, fiati: 2 });
  eq(g2.filter(e => e.type === "corista").length, 3, "tre coristi sul palco");
  eq(g2.filter(e => e.type === "gtstand").length, 2, "due chitarristi");
  ok(g2.filter(e => ["saxalto","tromba","saxtenore","trombone","saxbaritono"].indexOf(e.type) > -1).length === 2,
    "e i due fiati, con strumenti diversi come in una sezione vera");
  /* un ruolo a zero non lascia tracce: chi non ha tastiere non deve cancellarle */
  const senza = A.buildBandOut({ tastiere: 0, cori: 0, basso: 0 });
  eq(senza.filter(e => e.type === "stagepiano").length, 0, "niente tastiere se non ci sono");
  eq(senza.filter(e => e.type === "corista").length, 0, "niente cori");
  eq(senza.filter(e => e.type === "bassstand").length, 0, "niente basso");
  /* in-ear per tutti: al posto delle spie */
  const iem = A.buildBandOut({ cori: 2, ascolto: "iem" });
  eq(iem.filter(e => e.type === "wedge").length, 0, "con tutti in-ear non restano spie");
  ok(iem.filter(e => e.type === "iem").length >= 4, "ma i pacchetti ci sono");
});

t("il programma posiziona senza far salire due persone sullo stesso metro quadro", () => {
  /* È la promessa della finestra: «li metto io al posto giusto». Provato sul caso peggiore —
     quattro cori e due chitarre — perché con la fila fissa il terzo corista finiva ADDOSSO al
     cantante, a 35 cm (misurato nel browser prima di correggere). */
  const NONOSTACOLI = { wedge: 1, iem: 1, corrente: 1, sidefill: 1, iemant: 1, pedana: 1 };   /* la pedana sta SOTTO la batteria: è il suo mestiere */
  [[4, 2], [3, 2], [3, 1], [2, 2], [1, 1], [0, 1]].forEach(([cori, chitarra]) => {
    const out = A.buildBandOut({ cori, chitarra }).filter(e => !NONOSTACOLI[e.type]);
    for (let i = 0; i < out.length; i++) for (let j = i + 1; j < out.length; j++) {
      const a = out[i], b = out[j];
      const aw = a.w || 90, ad = a.d || 90, bw = b.w || 90, bd = b.d || 90;
      const addosso = Math.abs(a.x - b.x) < (aw + bw) / 2 && Math.abs((a.y || 0) - (b.y || 0)) < (ad + bd) / 2;
      ok(!addosso, cori + " cori/" + chitarra + " chit: «" + (a.label || a.type) + "» e «" + (b.label || b.type) + "» si sovrappongono");
    }
  });
});

t("ogni modello chiede il suo organico, con la stessa finestra", () => {
  const html = readFileSync(join(root, "app/index.html"), "utf8");
  ok(/id="bsRuoli"/.test(html) && /id="bsTitolo"/.test(html) && /id="bsNota"/.test(html),
     "la finestra c'è, con titolo e nota che cambiano col modello");
  /* una tabella sola: aggiungere un modello è aggiungere una riga, non scrivere un'altra finestra */
  const t = appjs.slice(appjs.indexOf("var ORGANICI = {"), appjs.indexOf("function chiediOrganico"));
  ["voce","cori","chitarra","basso","batteria","tastiere","fiati"].forEach(k =>
    ok(new RegExp('"' + k + '"').test(t), "la band chiede «" + k + "»"));
  ["sop","con","ten","bas"].forEach(k =>
    ok(new RegExp('"' + k + '"').test(t), "il coro chiede «" + k + "»"));
  ok(/buildVoiceOrganicoOut\(o, \{mics:true, director:true, riser:true\}\)/.test(t),
     "e il coro riusa il generatore per sezioni che era rimasto senza ingresso");
  ok(/max: 40/.test(t), "con il suo tetto: quaranta voci in una sezione, non sei");
  /* si apre SOLO per i modelli che hanno un organico: sugli altri il palco parte com'era */
  ok(/ORGANICI\[m\[0\]\] && typeof chiediOrganico==="function"/.test(appjs), "si apre dalla vetrina");
  ok(/formazione:scelte/.test(appjs), "e le risposte arrivano al modello");
  const f = appjs.slice(appjs.indexOf("function chiediOrganico"), appjs.indexOf("function startFromTemplate"));
  ok(/wlEraAperto/.test(f) && /wl\.hidden=false/.test(f), "il benvenuto si sposta e torna se annulli");
  /* con quaranta soprani, quaranta clic sarebbero una punizione */
  ok(/setInterval\(function\(\)\{ cambia\(d\); \}/.test(f), "tenendo premuto il numero scorre");
});
/* ===== IL RIEPILOGO SI SPOSTA (16/08) ==================================================== */
t("il riepilogo si trascina, e la ✕ resta un pulsante", () => {
  /* Sta sul palco appena creato, e proprio le righe che parlano dei cori coprono i cori di cui
     parlano: va potuto spostare per guardarci sotto. */
  ok(/head\.addEventListener\("pointerdown"/.test(appjs), "si prende dall'intestazione");
  const d = appjs.slice(appjs.indexOf('head.addEventListener("pointerdown"'), appjs.indexOf('head.addEventListener("pointerup"'));
  ok(/e\.target\.closest\("button"\)\) return;/.test(d), "ma non quando il dito è su un bottone: la ✕ deve chiudere, non trascinare");
  ok(/setPointerCapture/.test(d), "il puntatore resta agganciato anche uscendo dal pannello");
  ok(/e\.preventDefault\(\)/.test(d), "e il testo non si seleziona mentre trascini");
  /* mouse e dito con lo stesso codice: pointer events, e touch-action none o il dito scrolla la pagina */
  ok(/#assunzioni \.as-head\{cursor:move;touch-action:none/.test(stylesCss), "l'intestazione si vede che è una maniglia");
});

t("la posizione scelta si ricorda, e non porta il pannello fuori dallo schermo", () => {
  ok(/sp_assPos/.test(appjs), "la posizione viene salvata");
  ok(/window\.__assRipristinaPos/.test(appjs) && /box\.hidden=false;\s*\n\s*if\(window\.__assRipristinaPos\)/.test(appjs),
     "e riapplicata quando il riepilogo torna");
  /* il clamp non è un vezzo: la finestra può rimpicciolirsi fra una sessione e l'altra, e un
     pannello ricordato in basso a destra sparirebbe senza modo di riprenderlo */
  const c = appjs.slice(appjs.indexOf("function dentro(x, y)"), appjs.indexOf("function metti(x, y)"));
  ok(/Math\.max\(6, Math\.min\(innerWidth-w-6, x\)\)/.test(c) && /Math\.max\(6, Math\.min\(innerHeight-h-6, y\)\)/.test(c),
     "resta sempre dentro la finestra");
  ok(/addEventListener\("resize"/.test(appjs.slice(appjs.indexOf("function su(e)"), appjs.indexOf("function su(e)") + 900)),
     "e si ricontrolla quando la finestra cambia misura");
});

/* ===== ORCHESTRA E TRIBUTO ENTRANO NELLA STESSA TABELLA (16/08) ========================== */
t("un modello in più costa una riga, non un'altra finestra", () => {
  const t = appjs.slice(appjs.indexOf("var ORGANICI = {"), appjs.indexOf("function chiediOrganico"));
  ["band","tributo","camera","coro"].forEach(k => ok(new RegExp("^\\s*" + k + ": \\{", "m").test(t), "c'è il modello «" + k + "»"));
  /* il tributo È una band a due chitarre: stesso generatore, altri numeri di partenza */
  ok(/\["chitarra","Chitarra",2\]/.test(t), "il tributo parte da due chitarre");
  /* l'orchestra non duplica l'elenco delle sezioni: se lo generasse a mano, aggiungere uno
     strumento a ORCH_DEF lascerebbe la finestra indietro senza che nessuno se ne accorga */
  ok(/ORCH_DEF\.map\(function\(sec\)\{ return \[sec\.id, sec\.nome/.test(t),
     "le sezioni dell'orchestra vengono da ORCH_DEF, non riscritte");
  ok(/presetCounts\("camera"\)/.test(t), "e i numeri di partenza dal preset del modello");
  ok(/typeof cfg\.ruoli==="function"/.test(appjs), "i ruoli possono essere calcolati all'apertura");
});

t("il generatore orchestrale non lascia nessuno fuori dal palco", () => {
  /* Con un quartetto e il pianoforte, il piano finiva 99 cm OLTRE il bordo sinistro: il raggio su
     cui è posato si calcola dagli archi, e con un organico insolito cade fuori. Visto nello
     screenshot, poi misurato. Un elemento accostato al bordo si sposta in due secondi, uno fuori no. */
  ok(/function dentroIlPalco\(out, w, d\)/.test(appjs), "esiste il rientro");
  ok(/dentroIlPalco\(buildOrchestraOut\(opz\), 1450, 1200\)/.test(appjs), "e l'orchestra ci passa");
  const out = A.dentroIlPalco([
    { type: "grancoda", x: -740, y: 0, w: 156, d: 274 },   /* il caso vero: piano oltre il bordo */
    { type: "podio", x: 0, y: 0, w: 100, d: 100 }
  ], 1450, 1200);
  ok(out[0].x - 78 >= -725, "il piano rientra: " + Math.round(out[0].x));
  eq(out[1].x, 0, "e chi era già dentro non si muove");
});

/* ===== IL PDF PARTE A UNA PAGINA (16/08) ================================================== */
t("l'export parte dal solo palco: le pagine tecniche si suggeriscono, non si aggiungono da sole", () => {
  /* Decisione di Simone: chi preme Esporta di fretta non deve ritrovarsi un PDF di cinque pagine
     che non ha chiesto — il costo di quell'errore lo paga chi lo riceve. Il suggerimento resta
     (bordo verde), la scelta no. */
  const ap = appjs.slice(appjs.indexOf("_pdfPillSel={};"), appjs.indexOf("_pdfPillSel={};") + 400);
  ok(/state\.pdfPages\)\) state\.pdfPages\.forEach/.test(ap), "se l'utente ha già scelto, si rispetta la sua scelta");
  eq(/pdfSuggestedKeys\(_pdfTechPages\)\.forEach\(function\(k\)\{ _pdfPillSel\[k\]=true/.test(ap), false,
     "ma alla prima apertura NON si preseleziona niente");
  /* il suggerimento dev'essere ancora visibile, o si perde l'informazione utile */
  ok(/pdfSuggestedKeys/.test(appjs.slice(appjs.indexOf("function pdfRenderPills"), appjs.indexOf("function pdfRenderPills") + 900)),
     "le pillole sanno ancora quali pagine sono suggerite");
  ok(/pill ghost"\+\(isSugg\?" sugg":""\)/.test(appjs), "e le marcano col bordo verde");
  ok(/Suggerita dagli elementi sul palco/.test(appjs), "spiegando perché lo sono");
});

/* ===== LA SCHERMATA ALLEGATA ALLA SEGNALAZIONE (17/08) =================================== */
t("chi segnala può allegare il ritaglio del punto che non va", () => {
  const html = readFileSync(join(root, "app/index.html"), "utf8");
  ok(/id="fbShotBtn"/.test(html), "c'è il pulsante del ritaglio");
  ok(/id="fbShot"/.test(html) && /id="fbShotFile"/.test(html), "e la zona per incollare, trascinare o scegliere");
  ok(/id="fbCrop"/.test(html) && /id="fbCropCv"/.test(html), "con l'overlay di ritaglio");
  /* le tre strade servono tutte: su iPhone la cattura non esiste, e resterebbe fuori chi segnala dal telefono */
  ok(/getDisplayMedia/.test(appjs), "la cattura passa dall'API dello schermo");
  ok(/preferCurrentTab:true/.test(appjs), "e propone già «Questa scheda», per non far scegliere");
  ok(/Il ritaglio non è disponibile qui/.test(appjs), "dove l'API manca, il pulsante lo dice invece di fallire");
  ok(/addEventListener\("paste"/.test(appjs) && /dataTransfer/.test(appjs), "restano incolla e trascina");
});

t("quello che parte è ridotto e compresso, e l'utente vede quanto pesa", () => {
  /* Una schermata da 800 KB in base64 diventa più di un mega dentro il JSON: si riduce prima. */
  const f = appjs.slice(appjs.indexOf("async function shotPrepara"), appjs.indexOf("async function shotMetti"));
  ok(/max = 1600/.test(f), "si riduce a 1600 px");
  ok(/toDataURL\("image\/jpeg", 0\.75\)/.test(f), "e si comprime in JPEG");
  ok(/kb: Math\.round/.test(f), "il peso si calcola");
  ok(/r\.w \+ "×" \+ r\.h \+ " · " \+ r\.kb \+ " KB"/.test(appjs), "e si mostra accanto all'anteprima");
  /* la promessa in fondo al box deve seguire quello che parte davvero */
  ok(/la schermata allegata<\/b>/.test(appjs), "con un'immagine dentro la nota lo dichiara");
  ok(/Controlla che la schermata non contenga cose tue/.test(appjs), "e avverte chi segnala");
  ok(/screenshot: _fbShotData \|\| null/.test(appjs), "l'immagine entra nel payload");
  /* il box che riapre con dentro l'immagine di ieri è una trappola */
  ok(/count\.textContent="0";\s*\n\s*shotVuoto\(\)/.test(appjs), "dopo l'invio la schermata si svuota");
});

/* ===== «COSA MANCA?» VIVE NELLA COLONNA (17/08) =========================================== */
t("il box del feedback sta dentro la colonna, e la testata è il suo interruttore", () => {
  /* Prima galleggiava sopra il contenuto: 326 px di larghezza contro i 310 della colonna, cioè per
     forza fuori. Ora è una card in fondo alle Liste (variante scelta da Simone). */
  const html = readFileSync(join(root, "app/index.html"), "utf8");
  const props = html.slice(html.indexOf('<aside id="props"'), html.indexOf("</aside>", html.indexOf('<aside id="props"')));
  ok(/id="fbBox"/.test(props), "il box è dentro la colonna di destra");
  ok(/Cosa manca\? Bug\? Idea\?/.test(props), "e la testata fa le tre domande");
  ok(/id="fbHead"/.test(props) && /aria-expanded/.test(props), "la testata è un comando dichiarato");
  eq(/id="fbTrigger"/.test(html), false, "il pulsante galleggiante non serve più");
  ok(/testa\.addEventListener\("click"/.test(appjs), "e apre e chiude");
});

/* ============ il ritaglio della schermata: geometria ============
   Provata coi numeri, non col DOM: le coordinate sono pixel della SCHERMATA catturata (l'immagine
   che si vede è la stessa scalata da object-fit:contain, e quella conversione è a parte). */
t("a invio riuscito la conferma è una finestra, non una riga che sparisce", () => {
  /* Prima: «Ricevuto, grazie!» dentro il box, e il box si chiudeva da solo dopo 1,4 s. Chi
     guardava altrove non vedeva niente e restava col dubbio di aver inviato (Simone, 18/08). */
  const i = appjs.indexOf("res.status===200 && res.j.ok");
  const blocco = appjs.slice(i, i + 900);   // «ok» avrebbe oscurato la funzione ok() del file
  ok(/guideDialog\(\{/.test(blocco), "la conferma passa dalla finestra del progetto, non da un avviso nuovo");
  ok(/title:"Segnalazione inviata"/.test(blocco), "e dice che è inviata");
  ok(!/setTimeout\(closeBox,\s*1400\)/.test(blocco), "il box non si chiude più da solo dopo 1,4 s: chiude subito e resta la finestra");
  ok(/conSchermata\s*\?/.test(blocco), "e nomina la schermata solo se davvero ne è partita una");
  ok(/okLabel:"Chiudi"/.test(blocco), "il pulsante è un congedo, non «Ho capito»");
  /* guideDialog deve davvero saper leggere okLabel, o l'etichetta resterebbe quella di default */
  ok(/cancel\.textContent=o\.okLabel \|\|/.test(appjs), "e guideDialog onora okLabel");
});

t("il ritaglio si apre con un rettangolo già disegnato, al centro", () => {
  const C = A.CROP;
  const r = C.iniziale(1600, 900);
  eq(Math.round(r.x + r.w/2), 800, "centrato in orizzontale");
  eq(Math.round(r.y + r.h/2), 450, "e in verticale");
  ok(r.w < 1600 && r.h < 900, "e più piccolo della schermata: si deve vedere che è un rettangolo dentro qualcosa");
  ok(r.w > 1600*0.3 && r.h > 900*0.3, "ma non un francobollo");
  /* schermate strette (un telefono in verticale) e larghissime (due monitor): resta dentro comunque */
  for(const [W,H] of [[390,844],[3840,1080],[100,100]]){
    const q = C.iniziale(W,H);
    ok(q.x>=0 && q.y>=0 && q.x+q.w<=W && q.y+q.h<=H, `dentro anche su ${W}×${H}`);
  }
});

t("il rettangolo si sposta prendendolo dentro, e non esce dalla schermata", () => {
  const C = A.CROP, W = 1000, H = 800;
  const R0 = {x:100, y:100, w:400, h:300};
  const a = C.sposta(R0, 50, -40, W, H);
  eq(a.x, 150, "segue il dito in orizzontale");
  eq(a.y, 60,  "e in verticale");
  eq(a.w, 400, "senza cambiare misura");
  const fuga = C.sposta(R0, 9999, 9999, W, H);
  eq(fuga.x, W - R0.w, "spinto oltre il bordo destro si ferma lì");
  eq(fuga.y, H - R0.h, "e sul bordo basso");
  eq(fuga.w + fuga.x, W, "restando largo uguale");
  const fuga2 = C.sposta(R0, -9999, -9999, W, H);
  eq(fuga2.x, 0, "e a sinistra"); eq(fuga2.y, 0, "e in alto");
});

t("ogni maniglia muove SOLO il suo lato", () => {
  const C = A.CROP, W = 1000, H = 800;
  const R0 = {x:200, y:200, w:400, h:300};
  const se = C.ridimensiona(R0, "se", 60, 40, W, H);
  eq(se.x, 200, "l'angolo in basso a destra non sposta l'origine");
  eq(se.w, 460, "allarga"); eq(se.h, 340, "e allunga");
  const nw = C.ridimensiona(R0, "nw", 60, 40, W, H);
  eq(nw.x, 260, "quello in alto a sinistra sposta l'origine");
  eq(nw.w, 340, "e stringe"); eq(nw.y, 240, ""); eq(nw.h, 260, "");
  const e = C.ridimensiona(R0, "e", 60, 999, W, H);
  eq(e.h, 300, "il lato destro non tocca l'altezza");
  eq(e.w, 460, "solo la larghezza");
  const n = C.ridimensiona(R0, "n", 999, -50, W, H);
  eq(n.w, 400, "il lato alto non tocca la larghezza");
  eq(n.y, 150, "alza il bordo"); eq(n.h, 350, "e allunga di conseguenza");
});

t("tirando una maniglia oltre il lato opposto il rettangolo non si rovescia", () => {
  const C = A.CROP, W = 1000, H = 800;
  const R0 = {x:200, y:200, w:400, h:300};
  const q = C.ridimensiona(R0, "nw", 9999, 9999, W, H);
  ok(q.w >= C.MIN && q.h >= C.MIN, "resta almeno grande quanto il minimo");
  eq(q.x + q.w, R0.x + R0.w, "ancorato al lato che non stai toccando (destro)");
  eq(q.y + q.h, R0.y + R0.h, "e a quello basso");
  const z = C.ridimensiona(R0, "se", -9999, -9999, W, H);
  eq(z.x, R0.x, "dall'altra parte è l'origine a restare ferma");
  eq(z.w, C.MIN, "e la larghezza si ferma al minimo");
});

t("trascinando fuori dal rettangolo se ne disegna uno nuovo, in qualunque verso", () => {
  const C = A.CROP, W = 1000, H = 800;
  const giu = C.nuovo(100, 100, 300, 250, W, H);
  eq(giu.x, 100, ""); eq(giu.w, 200, ""); eq(giu.h, 150, "");
  const su = C.nuovo(300, 250, 100, 100, W, H);   /* trascinato all'indietro: stesso rettangolo */
  eq(su.x, giu.x, "partendo dall'angolo opposto viene lo stesso rettangolo");
  eq(su.y, giu.y, ""); eq(su.w, giu.w, ""); eq(su.h, giu.h, "");
  const oltre = C.nuovo(900, 700, 5000, 5000, W, H);
  ok(oltre.x + oltre.w <= W && oltre.y + oltre.h <= H, "e non sfonda i bordi della schermata");
});

t("il ritaglio ha maniglie vere, e sul telefono sono larghe un dito", () => {
  const html = readFileSync(join(root, "app/index.html"), "utf8");
  const sel = html.slice(html.indexOf('id="fbCropSel"'), html.indexOf('id="fbCropSel"') + 700);
  for(const p of ["nw","ne","sw","se","n","s","w","e"])
    ok(new RegExp('data-p="'+p+'"').test(sel), `c'è la maniglia ${p}`);
  ok(/#fbCrop \.sel\{[^}]*box-shadow:0 0 0 9999px/.test(stylesCss),
     "il fuori è oscurato dall'ombra del rettangolo, così il dentro resta pulito");
  ok(!/#fbCrop[^{]*\.terzi/.test(stylesCss), "niente griglia dei terzi (scelta di Simone: serve alla fotografia, non a un ritaglio)");
  const tocco = stylesCss.slice(stylesCss.indexOf("@media (max-width:880px), (pointer:coarse)"));
  /* `[data-p]` e non `.m`: le regole per singola maniglia portano un attributo e vincerebbero.
     Il primo tentativo passava questo test e nel browser il bersaglio restava di 13 px — un test
     sul testo del CSS non vede la specificità, e va letto sapendolo. */
  ok(/#fbCrop \.sel \.m\[data-p\]\{[^}]*width:44px;height:44px/.test(tocco),
     "dove si tocca la maniglia misura 44 px, con la specificità giusta per vincere");
  ok(/#fbCrop \.sel \.m::before\{[^}]*width:13px/.test(tocco), "ma il quadratino disegnato resta piccolo: cresce l'area, non il disegno");
  ok(/data-p=n\],#fbCrop \.sel \.m\[data-p=s\][\s\S]{0,90}display:none/.test(tocco),
     "e sul telefono restano i 4 angoli: otto bersagli da 44 px si toccherebbero fra loro");
});

t("su telefono il box esce dalla colonna, che lì è nascosta", () => {
  const html = readFileSync(join(root, "app/index.html"), "utf8");
  /* `#props` sotto gli 880 px è un drawer con display:none: lasciandoci dentro il box, chi segnala
     dal telefono non lo vedrebbe mai. Esce, e chiudendosi torna al suo posto — o al giro dopo su
     desktop si troverebbe fuori dalla colonna. */
  const f = appjs.slice(appjs.indexOf("function fuoriSeMobile"), appjs.indexOf("function fuoriSeMobile") + 420);
  ok(/document\.body\.appendChild\(box\)/.test(f), "su mobile va nel body");
  ok(/casaSua\.appendChild\(box\)/.test(f), "e torna nella colonna quando lo schermo è largo");
  ok(/max-width:880px/.test(appjs.slice(appjs.indexOf("function mobile()"), appjs.indexOf("function mobile()") + 140)),
     "la soglia è la stessa del CSS che nasconde la colonna");
  /* «Allega il mio progetto» è un interruttore, e nel pannello destro gli interruttori si vestono
     con `.chk`. Il tampone `width:auto` che avevo messo prima era un difetto peggiore del difetto:
     su un `appearance:none` la larghezza andava a ZERO e restava solo il pallino sospeso. */
  ok(/class="fb-attach chk"/.test(html),
     "la casella «Allega il mio progetto» porta la classe chk del pannello destro");
  ok(!/#fbBox input\[type="checkbox"\]\{width:auto/.test(stylesCss),
     "e nessuno le rimette width:auto: su appearance:none vuol dire larghezza zero");
  ok(/#props \.chk input\{[^}]*width:36px/.test(stylesCss),
     "perché è `.chk input` a dare la misura dell'interruttore");
  /* Su telefono il box esce da #props, dove `.chk` non lo raggiunge più: senza questa ripetizione
     l'interruttore starebbe a sinistra sul telefono e a destra sul computer. */
  ok(/#fbBox \.fb-attach\{display:flex;flex-direction:row-reverse/.test(stylesCss),
     "e l'interruttore sta a destra anche fuori dalla colonna, come ogni opzione del pannello");
  ok(/#props #fbBox \.fb-attach\{[^}]*margin-bottom:12px/.test(stylesCss),
     "e «Invia» non resta incollato alla riga: `.chk` porta margin:0 e vince");
  /* In fondo alla colonna vuol dire appoggiato al bordo basso, non appena sotto l'ultima sezione. */
  ok(/#props\{display:flex;flex-direction:column\}/.test(stylesCss) &&
     /#props #fbBox\{margin-top:auto\}/.test(stylesCss),
     "e la card sta IN FONDO alla colonna, non a metà quando le Liste sono corte");
  /* Sul telefono il box resta quello di sempre (richiesta di Simone): pannello in basso, si apre dal
     menu «?» e si chiude con la ✕. Non è una fisarmonica — toccare l'intestazione mentre si scrive
     non deve farlo sparire. */
  const t = appjs.slice(appjs.indexOf('testa.addEventListener("click"'), appjs.indexOf('testa.addEventListener("click"') + 260);
  ok(/if\(mobile\(\)\) return;/.test(t), "su telefono la testata non apre e non chiude");
  ok(/chiudi\.addEventListener\("click", closeBox\)/.test(appjs), "e la ✕ chiude");
  ok(/#fbBox \.fb-close\{display:none\}/.test(stylesCss), "sul desktop la ✕ è nascosta: chiude la testata");
  ok(/#fbBox \.fb-freccia\{display:none\}/.test(stylesCss.slice(stylesCss.indexOf("@media (max-width:880px)"))),
     "e sul telefono sparisce la freccia della fisarmonica");
});

/* ═══ DATI DI TARGA DELLE CONSOLE (29/08) ═════════════════════════════════════════════════════════
   Consumi e pesi venivano da una ricerca su fonti secondarie (blog, forum) e per meta' delle voci
   la fonte era «—». Aprendo i documenti ufficiali: 12 consumi su 14 sbagliati, 13 pesi su 14, i pesi
   sempre in DIFETTO e alcuni di piu' del doppio — e il peso totale finisce nel rider e nel PDF che
   vanno al locale. Questi test cadono se qualcuno rimette un numero senza aprire un datasheet.
   Citazioni: CONOSCENZA/DATI_ATTREZZATURA.md · PDF: CONOSCENZA/pdf/datasheet/ */
t("console: i consumi sono quelli di targa del costruttore", () => {
  eq(A.WATT.dm3, 43, "Yamaha DM3: «Power consumption: 43 W»");
  eq(A.WATT.dm7, 240, "Yamaha DM7: «Power Consumption 240 W»");
  eq(A.WATT.csr3, 200, "CS-R3: «Power consumption 200 W»");
  eq(A.WATT.csr5, 300, "CS-R5: «Power consumption 300 W»");
  eq(A.WATT.csr10, 380, "CS-R10: «Power Consumption 380 W»");
  eq(A.WATT.sq5, 75, "SQ-5: «Max Power Consumption SQ-5/SQ-6/SQ-7 75W / 90W / 110W»");
  eq(A.WATT.sq6, 90);
  eq(A.WATT.sq7, 110);
  eq(A.WATT.avantis, 150, "Avantis: «100-240V AC, 50-60Hz, 150W max»");
  eq(A.WATT.q338, 295, "Quantum 338: «295VA» (VA≈W con PFC, ed e' il numero prudente)");
  /* Il costruttore dichiara UN SOLO consumo per le due taglie di DM7. Averne due diversi era il
     segno che il numero veniva dedotto dalla dimensione della console, non letto da un documento. */
  eq(A.WATT.dm7c, A.WATT.dm7, "DM7 e DM7 Compact: stesso consumo dichiarato, e infatti stesso numero");
  /* dLive S7000: il datasheet da' 300 W con l'alimentatore V1 e 250 con il V2. Chi dimensiona un
     quadro non sa quale gli arriva, quindi vale il caso peggiore. */
  eq(A.WATT.dlives7, 300, "dLive S7000: il caso peggiore fra i due alimentatori");
});

t("console: i pesi sono quelli di targa, e crescono con la taglia", () => {
  eq(A.WEIGHT.dm3, 6.5, "DM3: «Net weight: 6.5 kg» (dichiaravamo 5)");
  eq(A.WEIGHT.dm7c, 16.5, "DM7 COMPACT: 16.5 kg (dichiaravamo 10)");
  eq(A.WEIGHT.dm7, 23.5, "DM7: 23.5 kg (dichiaravamo 13)");
  eq(A.WEIGHT.csr10, 85, "CS-R10: 85kg (dichiaravamo 30: meno di un terzo)");
  eq(A.WEIGHT.q338, 70, "Quantum 338: 70Kg senza flightcase (dichiaravamo 25)");
  eq(A.WEIGHT.sq5, 10.5); eq(A.WEIGHT.sq6, 14.5); eq(A.WEIGHT.sq7, 17.8);
  eq(A.WEIGHT.avantis, 26); eq(A.WEIGHT.dlives5, 35); eq(A.WEIGHT.dlives7, 41);
  /* Dentro una stessa famiglia il peso deve salire con la taglia: e' la prova che i numeri vengono
     da un documento e non da un'interpolazione a occhio. */
  ok(A.WEIGHT.dm7c < A.WEIGHT.dm7, "la DM7 Compact pesa meno della DM7");
  ok(A.WEIGHT.sq5 < A.WEIGHT.sq6 && A.WEIGHT.sq6 < A.WEIGHT.sq7, "SQ: 5 < 6 < 7");
  ok(A.WEIGHT.csr3 < A.WEIGHT.csr5 && A.WEIGHT.csr5 < A.WEIGHT.csr10, "RIVAGE: R3 < R5 < R10");
  ok(A.WEIGHT.dlives5 < A.WEIGHT.dlives7, "dLive: S5000 < S7000");
  /* Il flightcase della Quantum 338 pesa 198 kg: se qualcuno lo confondesse col peso della console,
     il totale del rider triplicherebbe. */
  ok(A.WEIGHT.q338 < 100, "e' il peso della console, non quello col flightcase (198 kg)");
});

t("una console non e' una «stima tipica»: il pannello dice targa", () => {
  /* Prima wattFonte guardava solo it.watt, il modello di luce e il modello reale: una DM7 posata
     sul palco finiva in «Stima tipica per questo tipo di attrezzatura», che di un numero letto sul
     manuale del costruttore e' falso in difetto. */
  eq(A.wattFonte({ type: "dm7" }), "targa");
  eq(A.wattFonte({ type: "csr10" }), "targa");
  eq(A.wattFonte({ type: "q338" }), "targa");
  /* Ma una FAMIGLIA resta una stima, e deve continuare a dirlo: nessuno pubblica l'assorbimento
     «di un combo per chitarra». */
  eq(A.wattFonte({ type: "comboamp" }), "stima", "le famiglie restano stime dichiarate");
  eq(A.wattFonte({ type: "wedge" }), "stima");
  /* E il valore scritto a mano dall'utente vince comunque su tutto. */
  eq(A.wattFonte({ type: "dm7", watt: 500 }), "dichiarato");
});

t("ogni tipo dichiarato «di targa» ha davvero un consumo E un peso", () => {
  /* Guardia contro il buco silenzioso: aggiungere una console a SPEC_TARGA senza darle i numeri
     la farebbe apparire come dato certo mentre vale zero. */
  const mancanti = Object.keys(A.SPEC_TARGA).filter(k => !(A.WATT[k] > 0) || !(A.WEIGHT[k] > 0));
  eq(mancanti.length, 0, "senza numeri: " + mancanti.join(", "));
  /* E nessun tipo di targa puo' pesare quanto un valore inventato tondo tondo: i pesi veri hanno
     i decimali dove il costruttore li ha (6.5, 10.5, 17.8, 43.2). */
  ok([A.WEIGHT.dm3, A.WEIGHT.sq5, A.WEIGHT.sq7, A.WEIGHT.hd96].some(v => v % 1 !== 0),
     "almeno un peso porta il decimale del documento");
});

t("il modello reale scelto porta il SUO peso, non la stima di famiglia", () => {
  /* Difetto trovato nel browser il 29/08: wattOf guardava il modello reale, weightOf no. Chi
     sceglieva «L-Acoustics K2» vedeva il nome nel pannello e nel rider, e intanto il totale contava
     i 34 kg della stima. Il DB conosceva i 56 kg ufficiali e nessuno li leggeva. */
  const k2 = { type: "arraylarge", modelId: "lacoustics-k2",
    modelData: { brand: "L-Acoustics", model: "K2", weight_kg: { value: 56, reliability: "official" } } };
  eq(A.weightOf(k2), 56, "vince il peso del modello");
  eq(A.weightOf({ type: "arraylarge" }), A.WEIGHT.arraylarge, "senza modello resta la stima di famiglia");
  /* Il peso scritto a mano dall'utente vince su tutto, come gia' faceva. */
  eq(A.weightOf({ ...k2, kg: 70 }), 70, "il valore dichiarato a mano vince anche sul modello");
  /* Una modifica per-progetto (modelOverride) non tocca il DB globale ma deve valere qui. */
  eq(A.weightOf({ ...k2, modelOverride: { weight_kg: { value: 58 } } }), 58);
  /* Un modello che NON dichiara il peso non deve azzerare il conteggio: si torna alla stima. */
  eq(A.weightOf({ type: "arraylarge", modelData: { brand: "X", model: "Y" } }), A.WEIGHT.arraylarge);
  eq(A.weightOf({ type: "arraylarge", modelData: { weight_kg: { value: null } } }), A.WEIGHT.arraylarge,
     "peso non disponibile nel DB = si torna alla stima, non zero");
  /* I microfoni restano fuori dal peso di trasporto: il DB li tiene in grammi (weight_g) e sommare
     solo quelli a cui l'utente ha dato un modello farebbe un totale che dipende da quanto ha
     compilato, non da cosa c'e' sul palco. */
  eq(A.weightOf({ type: "micvoce", modelData: { weight_g: { value: 284 } } }), A.WEIGHT.micvoce || 0,
     "il peso in grammi dei microfoni non entra nel totale");
});

t("PA: un elemento e' un modulo, e pesa quanto un modulo vero", () => {
  /* La larghezza in pianta dice quale famiglia e': 134 cm e' la misura di un K2 (1340 mm), di un
     GSL8 (1300) e di un KS28 (1340). I 34 kg di prima erano il peso di un modulo MEDIO messo su
     quello grande. */
  eq(A.TYPES.arraylarge.w, 134, "l'array grande resta largo un modulo vero");
  ok(A.WEIGHT.arraylarge >= 56 && A.WEIGHT.arraylarge <= 80,
     "fra K2 (56) e GSL8 (80), i due estremi verificati");
  ok(A.WEIGHT.arraymid >= 26 && A.WEIGHT.arraymid < A.WEIGHT.arraylarge,
     "il modulo medio pesa almeno quanto un Kara II (26) e meno del grande");
  ok(A.WEIGHT.sub218 >= 79 && A.WEIGHT.sub218 <= 106,
     "il doppio 18 sta fra KS28 (79) e B22-SUB (106)");
  /* Un modulo di array non puo' pesare meno di un wedge: se succede, qualcuno ha confuso il modulo
     con la cassa da monitor. */
  ok(A.WEIGHT.arraylarge > A.WEIGHT.wedge, "un modulo d'array pesa piu' di una spia");
});

/* ═══ BACKLINE REALE (AMP_DB, 29/08) ══════════════════════════════════════════════════════════════
   Era l'ultima lacuna dichiarata in CONOSCENZA/FONTI.md: combo, testate, ampli basso, tastiere e
   organi avevano SOLO la stima di famiglia. Ora si sceglie il modello e porta i suoi numeri. */
t("il backline reale porta assorbimento e peso del costruttore", () => {
  const combo = { type: "comboamp", bm: "roland_jc120" };
  eq(A.wattOf(combo), 130, "JC-120: «Power Consumption: 130 W»");
  eq(A.weightOf(combo), 28.7, "«Weight: 28.7 kg»");
  eq(A.wattFonte(combo), "targa", "e non e' piu' una stima");
  /* senza modello si torna alla stima di categoria, che resta dichiarata come tale */
  eq(A.wattOf({ type: "comboamp" }), A.WATT.comboamp);
  eq(A.wattFonte({ type: "comboamp" }), "stima");
});

t("la potenza d'USCITA non diventa mai un carico elettrico", () => {
  /* E' l'errore che stava nella ricerca del 04/07: «circa 2x la potenza d'uscita». Vale per i
     valvolari e non per la classe D — il KC-600 da' 200 W di uscita audio e ne assorbe 50, quattro
     volte meno. Se qualcuno facesse ripiegare wattOf su `out` (come fa lightModelWatt su wattRated
     per le luci), quel combo diventerebbe un carico da 200 W che non esiste. */
  eq(A.AMP_DB.roland_kc600.out, 200, "l'uscita audio resta scritta, per il pannello");
  eq(A.wattOf({ type: "keysamp", bm: "roland_kc600" }), 50, "ma il carico e' l'assorbimento: 50 W");
  /* Un modello che non dichiara l'assorbimento NON si fa dedurre dall'uscita: torna alla stima. */
  eq(A.AMP_DB.nord_stage4_88.watt, null, "Nord non pubblica l'assorbimento");
  eq(A.wattOf({ type: "stagepiano", bm: "nord_stage4_88" }), A.WATT.stagepiano,
     "quindi vale la stima del tipo, non un numero inventato");
  /* Nessuna riga del catalogo ha oggi «assorbimento assente + uscita dichiarata», quindi il divieto
     va provato su un caso costruito apposta: senza questo, uno che aggiungesse il ripiego su `out`
     passerebbe la suite indisturbato (mutazione provata: non la vedeva nessuno). */
  A.AMP_DB.__prova_ripiego = { brand: "Prova", model: "Solo uscita", per: ["comboamp"], watt: null, out: 999, kg: 9 };
  try {
    eq(A.wattOf({ type: "comboamp", bm: "__prova_ripiego" }), A.WATT.comboamp,
       "999 W di uscita NON diventano un carico: si torna alla stima");
    eq(A.weightOf({ type: "comboamp", bm: "__prova_ripiego" }), 9, "il peso dichiarato invece vale");
  } finally { delete A.AMP_DB.__prova_ripiego; }
  eq(A.weightOf({ type: "stagepiano", bm: "nord_stage4_88" }), 19.6, "ma il peso, che e' dichiarato, vale");
  /* Il valvolare invece assorbe piu' di quanto esce: e' il caso opposto, ed e' letto dal manuale. */
  const svt = A.AMP_DB.ampeg_svtcl;
  ok(svt.watt > svt.out, "SVT-CL: 460 W assorbiti per 300 di uscita");
});

t("una cassa passiva assorbe zero, e lo dice", () => {
  /* watt:0 non e' «dato mancante»: e' un fatto, e va distinto. Se lo trattassimo come assente,
     l'8x10 tornerebbe a portare i 400 W della stima di categoria — che pero' li assorbe la
     TESTATA, e verrebbero contati due volte. */
  const cassa = { type: "bassamp", bm: "ampeg_svt810e" };
  eq(A.wattOf(cassa), 0, "la cassa non prende corrente");
  eq(A.weightOf(cassa), 62, "ma pesa 62 kg, ed e' il punto");
  eq(A.wattFonte(cassa), "targa", "e lo zero e' un dato, non una stima");
});

t("un modello appiccicato al tipo sbagliato non conta", () => {
  /* Cambiando il tipo di un elemento (o incollando da un altro progetto) it.bm puo' restare li'.
     Un piano da 23 W su un ampli basso falserebbe il quadro in silenzio. */
  eq(A.wattOf({ type: "bassamp", bm: "roland_rd2000" }), A.WATT.bassamp, "torna alla stima del tipo");
  eq(A.weightOf({ type: "bassamp", bm: "roland_rd2000" }), A.WEIGHT.bassamp);
  eq(A.ampModelOf({ type: "bassamp", bm: "roland_rd2000" }), null);
  eq(A.ampModelOf({ type: "comboamp", bm: "non_esiste" }), null, "e una chiave inventata non esplode");
});

t("ogni riga del catalogo backline e' completa e attaccata a tipi veri", () => {
  const rotte = [];
  Object.keys(A.AMP_DB).forEach(k => {
    const d = A.AMP_DB[k];
    if (!d.brand || !d.model) rotte.push(k + ": senza marca o modello");
    if (!Array.isArray(d.per) || !d.per.length) rotte.push(k + ": non dice su quali elementi vale");
    else d.per.forEach(t => { if (!A.TYPES[t]) rotte.push(k + ": tipo inesistente " + t); });
    /* una riga che non porta ne' watt ne' kg non aggiunge niente a una stima: e' solo un nome */
    if (d.watt == null && d.kg == null) rotte.push(k + ": nessun dato, solo il nome");
  });
  eq(rotte.length, 0, rotte.join(" | "));
  /* e il campo si offre esattamente dove il catalogo copre qualcosa */
  ok(A.ampModelApplies({ type: "comboamp" }) && A.ampModelApplies({ type: "bassamp" }));
  ok(!A.ampModelApplies({ type: "wedge" }), "su una spia non si sceglie un backline");
  ok(!A.ampModelApplies({ type: "musicista" }));
});

t("nella tendina il ruolo sta davanti al nome", () => {
  /* La tendina dei modelli e' larga 134 px: «Little Mark IV (testata)» ci arrivava troncato a
     «Little Mark IV (te…», perdendo proprio la parola che distingue la testata dalla cassa — che su
     un rig di basso e' l'unica che conta. Misurato nel browser il 29/08: tutti e due i Markbass
     venivano tagliati. Davanti, sopravvive al taglio. */
  const conRuolo = Object.keys(A.AMP_DB).filter(k => A.AMP_DB[k].ruolo);
  ok(conRuolo.length >= 4, "testate, casse e moduli dichiarano il ruolo a parte");
  conRuolo.forEach(k => {
    ok(!/\(/.test(A.AMP_DB[k].model),
       k + ": il ruolo non deve stare fra parentesi dentro il nome, ma nel suo campo");
  });
  /* E la riga sotto la tendina dice il nome per esteso, perche' li' spazio ce n'e'. */
  const t = A.ampModelSpecText(A.AMP_DB.markbass_ny122);
  ok(/Markbass New York 122/.test(t) && /cassa/.test(t), "riga di specifiche: " + t);
  ok(/18,8 kg/.test(t), "e i numeri restano");
});

t("il catalogo copre i due estremi, non solo la media", () => {
  /* Il senso di un catalogo, contro una stima di famiglia unica: sul basso il rig SVT (testata 36,3
     + cassa 62 = 98,3 kg) e quello leggero moderno (Little Mark IV 2,45 + New York 122 = 21,25 kg)
     stanno a QUATTRO VOLTE E MEZZA di distanza. Nessun numero solo puo' rappresentarli entrambi:
     se il catalogo si restringesse alla sola fascia media, tornerebbe a essere una stima. */
  const svt = A.weightOf({ type: "bassamp", bm: "ampeg_svtcl" }) + A.weightOf({ type: "bassamp", bm: "ampeg_svt810e" });
  const leggero = A.weightOf({ type: "bassamp", bm: "markbass_lm4" }) + A.weightOf({ type: "bassamp", bm: "markbass_ny122" });
  ok(svt > leggero * 4, "i due rig di basso restano a piu' di quattro volte di distanza");
  /* E la stima di famiglia deve stare IN MEZZO ai due, non fuori: se cadesse oltre un estremo,
     sarebbe una stima che sbaglia sempre, in un verso solo. */
  const stima = A.WEIGHT.bassamp;
  ok(stima > leggero / 2 && stima < svt, "la stima dell'ampli basso sta fra i due estremi veri");
});

t("il modello scelto sopravvive al salvataggio", () => {
  /* Un campo che il save filtra si perde riaprendo il progetto, e il difetto e' invisibile:
     l'utente rivede la stima senza che nessuno gli dica che la sua scelta e' sparita. */
  eq(A.stateReplacer("bm", "ampeg_svtcl"), "ampeg_svtcl");
  /* e il giro completo: serializzato e riletto, il modello e' ancora li' */
  A.state.items = [{ id: "x1", type: "bassamp", x: 0, y: 0, bm: "ampeg_svtcl" }];
  const json = A.stateToJSON();
  ok(json.includes('"bm":"ampeg_svtcl"'), "il modello finisce nel file salvato");
  const riletti = A.normalizeLoadedItems(JSON.parse(json).items);
  eq(riletti[0].bm, "ampeg_svtcl", "e sopravvive al caricamento");
  eq(A.wattOf(riletti[0]), 460, "coi suoi numeri, non con la stima");
  A.state.items = [];
});

t("le citazioni stanno scritte, e nominano i modelli che coprono", () => {
  /* Un numero senza la sua citazione fra un mese non e' piu' verificabile: e' tornato a essere una
     stima, solo con l'aria di un dato certo. */
  const doc = readFileSync(join(root, "DATI_TARGA.md"), "utf8");
  for (const m of ["DM7", "CS-R10", "SQ-5", "Avantis", "Quantum 338", "HD96-24"])
    ok(doc.includes(m), "il documento non cita " + m);
  ok(/240 W/.test(doc) && /85kg|85 kg/.test(doc), "e riporta le righe lette, non solo i titoli");
  /* La riserva aperta va detta: dell'HD96 abbiamo il peso ma NON l'assorbimento ufficiale. */
  ok(/2 x 650 W/.test(doc) && /stima dichiarata/.test(doc),
     "la riserva sul Midas HD96 resta scritta finche' non si trova il dato");
});

/* ═══ HOMEPAGE — i numeri che si vedono ═══════════════════════════════════════════════════════════
   La suite finora guardava solo l'app: la homepage, che e' quello che legge chi non ci e' ancora
   entrato, non la controllava nessuno. E li' i numeri stavano scritti a mano in piu' copie.
   Segnalato da Simone il 31/08: «viene dichiarato 6 canali, ma la channel list arriva a 7». */
console.log("\nHomepage (index.html):");
const home = readFileSync(join(root, "index.html"), "utf8");

/* Conta le righe di uno dei tre documenti della demo. Una riga «new» e' quella che compare al
   clic: nello stato iniziale non va contata. */
function righeDemo(docId, soloIniziali) {
  const i = home.indexOf('id="' + docId + '"');
  if (i < 0) return null;
  const fine = home.indexOf("</div>\n      </div>", i);
  const blocco = home.slice(i, fine > 0 ? fine : i + 2000);
  const righe = blocco.match(/<div[^>]*>\s*<i>/g) || [];
  const nuove = blocco.match(/<div class="new"/g) || [];
  return soloIniziali ? righe.length - nuove.length : righe.length;
}

t("il PDF d'esempio dichiara tante pagine quante ne elenca", () => {
  const i = home.indexOf('id="term"');
  const blocco = home.slice(i, home.indexOf("</section>", i));
  const dichiarate = (blocco.match(/id="termPag">(\d+) pagine/) || [])[1];
  const elencate = (blocco.match(/<b>PAG \d+<\/b>/g) || []).length;
  eq(+dichiarate, elencate, "«" + dichiarate + " pagine» ma ne elenca " + elencate);
  /* E deve dire che e' un progetto DIVERSO da quello della demo: ha altri numeri (10 CH, 3 mix)
     e chi scorre la pagina li confrontava con quelli della demo trovandoli incoerenti. */
  ok(/non quello della demo/.test(blocco), "il testo distingue i due progetti");
});

t("niente promette a pagamento quello che e' gratis", () => {
  /* «rider completo su consulenza» stava in uno sr-only dell'editor: lo leggono gli screen reader e
     i motori di ricerca, cioe' proprio chi non puo' verificare. Il rider PDF e' gratis; a pagamento
     c'e' solo la revisione, facoltativa. */
  const app = readFileSync(join(root, "app/index.html"), "utf8");
  for (const [dove, testo] of [["editor", app], ["homepage", home]]) {
    ok(!/rider completo su consulenza/i.test(testo), dove + ": promette il rider a pagamento");
    ok(!/consulenza[^.<]{0,40}rider completo/i.test(testo), dove + ": lega il rider completo alla consulenza");
  }
  /* La channel list non e' riservata a nessuno: verificato nel browser il 31/08, si apre a chiunque. */
  ok(!/Channel list \(input patch \/ monitor\) — consulenza/.test(app),
     "il tooltip diceva che la channel list e' «consulenza»");
  /* E la homepage deve continuare a dirlo chiaro. */
  ok(/L'editor è gratis e resta gratis/.test(home), "la homepage dichiara il gratis");
  ok(/29 €, facoltativa/.test(home), "e dichiara il prezzo della revisione, dicendo che e' facoltativa");
});

t("su uno schermo stretto le colonne cedono spazio al palco", () => {
  /* Le due colonne restavano a 220 + 310 = 530 px FISSI da 881 px in su, cioè fino al passaggio a
     mobile. Su un laptop 1366 sono il 39% dello schermo mangiato prima ancora di disegnare: il
     palco da 16 m del modello band ci finiva dentro a 753 px, e un musicista era alto 28 pixel.
     Misurato nel browser il 31/08, non stimato. */
  const largh = (query, nome) => {
    const i = stylesCss.indexOf(query);
    ok(i > 0, "manca la regola per " + nome);
    const blocco = stylesCss.slice(i, i + 220);
    ok(/body\{/.test(blocco), nome + ": la regola deve stare su body, che è il contenitore della griglia");
    return {
      cat: +((blocco.match(/--cat: *(\d+)px/) || [])[1] || 0),
      rail: +((blocco.match(/--rail: *(\d+)px/) || [])[1] || 0),
    };
  };
  const stretto = largh("@media (min-width:881px) and (max-width:1180px)", "schermi molto stretti");
  const medio = largh("@media (min-width:1181px) and (max-width:1440px)", "laptop");
  ok(stretto.cat > 0 && stretto.rail > 0 && medio.cat > 0 && medio.rail > 0, "i valori ci sono");
  /* Più stretto lo schermo, più strette le colonne: se si invertisse, il rimedio peggiorerebbe
     proprio il caso che deve curare. */
  ok(stretto.cat < medio.cat, "catalogo: più stretto sullo schermo più piccolo");
  ok(stretto.rail < medio.rail, "colonna liste: idem");
  ok(medio.cat < 220 && medio.rail < 310, "e su laptop restano sotto i valori pieni del desktop");
  /* La griglia deve leggere le variabili, altrimenti le media query non toccano niente. */
  ok(/grid-template-columns:var\(--cat,220px\) 1fr var\(--rail,310px\)/.test(stylesCss),
     "la griglia legge --cat e --rail");
  /* La maniglia di ridimensionamento scrive --rail inline: deve continuare a vincere sulla media
     query, o l'utente non potrebbe più allargare la colonna su un laptop. */
  ok(/#railHandle\{[^}]*right:calc\(var\(--rail,310px\)/.test(stylesCss),
     "la maniglia segue la stessa variabile");
});

/* ═══ IL RIEPILOGO NON DEVE COPRIRE IL PALCO (31/08) ══════════════════════════════════════════════
   All'apertura di un modello il riepilogo «Abbiamo ipotizzato questo» stava sopra il fronte del
   palco appena creato — cioè proprio sulle voci, sui cori e sulle spie di cui parla. Misurato nel
   browser: 380 px di altezza, il 12% del palco coperto. Il rimedio che c'era («trascinalo tu») è
   lavoro scaricato sull'utente nel minuto in cui non sa ancora cosa sta guardando. */
t("il riepilogo del modello fa una riga sola per la stessa domanda", () => {
  /* Faceva «Batteria: non canta», «Basso: non canta», «Tastiere: non canta»: la stessa domanda
     scritta tre volte, una sessantina di pixel che spingevano il pannello sul palco. È la stessa
     lezione già scritta nel codice per le voci — «due righe separate facevano crescere il pannello
     fin sopra il palco appena creato» — e non applicata qui. */
  const fn = appjs.slice(appjs.indexOf("function ipotesiDelPalco"), appjs.indexOf("function ipotesiDelPalco") + 4200);
  ok(/var muti=items\.filter/.test(fn), "gli strumentisti muti si raccolgono in un elenco solo");
  ok(/righe\.push\(\{[\s\S]{0,400}azioni: muti\.map/.test(fn),
     "e diventano UNA riga con un bottone per ciascuno");
  ok(!/\.slice\(0,3\)\.forEach\(function\(it\)\{[\s\S]{0,200}righe\.push/.test(fn),
     "non c'è più il ciclo che spingeva una riga per strumentista");
});

t("una constatazione non occupa quanto una decisione", () => {
  /* «Ascolto: 5 spie» non è una scelta da fare qui (si cambia dal pannello del musicista, e il
     testo stesso lo diceva): da riga piena a nota compatta. */
  ok(/azioni\.length \? "as-row" : "as-row as-nota"/.test(appjs),
     "le righe senza bottoni prendono la classe della nota");
  ok(/if\(r\.sub && azioni\.length\)/.test(appjs),
     "e non portano il sottotitolo, che raddoppierebbe l'altezza");
  ok(/#assunzioni \.as-row\.as-nota\{[^}]*padding:4px/.test(stylesCss), "la nota ha un respiro suo, più stretto");
  ok(/#assunzioni \.as-row\.as-nota \.as-txt\{[^}]*font-size:11\.5px/.test(stylesCss), "e un corpo più piccolo");
});

t("il riepilogo si mette dove non copre, se ci sta", () => {
  ok(/function sottoIlPalco\(\)/.test(appjs), "c'è il calcolo dello spazio libero sotto il palco");
  /* La fetta va presa DOPO l'inizio della funzione: «window.__assRipristinaPos» compare anche
     prima nel file (dove viene chiamata), e cercarlo dall'inizio dava una fetta vuota. */
  const iSotto = appjs.indexOf("function sottoIlPalco");
  const fn = appjs.slice(iSotto, appjs.indexOf("window.__assRipristinaPos", iSotto));
  ok(/giuDelPalco \+ margine \+ h \+ 6 > area\.bottom/.test(fn),
     "se sotto non ci sta, non ci si mette: meglio coprire un po' che finire fuori schermo");
  ok(/return null/.test(fn), "e in quel caso lascia la posizione di prima");
  /* Una posizione scelta a mano è una decisione dell'utente e deve vincere sempre. */
  const iRip = appjs.indexOf("window.__assRipristinaPos", iSotto);
  const rip = appjs.slice(iRip, appjs.indexOf("head.addEventListener", iRip));
  ok(/if\(salvata && isFinite\(salvata\.x\)[\s\S]{0,80}return;/.test(rip),
     "la posizione salvata dall'utente vince e si esce subito");
  ok(rip.indexOf("sottoIlPalco()") > rip.indexOf("salvata"),
     "il calcolo automatico viene DOPO, solo se l'utente non ha scelto");
});

t("il pulsante principale dice dove porta", () => {
  const app = readFileSync(join(root, "app/index.html"), "utf8");
  ok(/id="asOk">Inizia da questo palco</.test(app), "«Va bene così» diceva cosa pensi, non cosa succede");
  /* E la scelta «Non mostrarlo più» deve essere ricordata: provata nel browser il 31/08. */
  ok(/localStorage\.setItem\("sp_noAssunzioni","1"\)/.test(appjs), "la scelta si scrive");
  ok(/localStorage\.getItem\("sp_noAssunzioni"\)/.test(appjs), "e si rilegge all'apertura");
});

t("la CTA finale porta dove porta quella iniziale", () => {
  /* Fino al 31/08 l'ultima spinta della pagina diceva «Apri l'editor» e portava a un palco VUOTO:
     chi era arrivato in fondo senza sapere da dove cominciare veniva mandato esattamente dove ci si
     blocca, dopo che tutta la pagina gli aveva detto di partire da un modello. */
  const finale = landing.slice(landing.indexOf('<section class="final'));
  const primario = (finale.match(/<a class="btn"[^>]*href="([^"]+)"[^>]*>([^<]+)</) || []);
  ok(/model=band/.test(primario[1] || ""), "il bottone primario del finale apre un modello: " + primario[1]);
  ok(/palco già pronto/i.test(primario[2] || ""), "e lo dice: «" + primario[2] + "»");
  /* Stesse parole all'inizio e alla fine: una CTA che cambia nome a metà pagina sembra un'altra cosa. */
  const hero = landing.slice(landing.indexOf('<div class="cta-row">'), landing.indexOf('</div>', landing.indexOf('<div class="cta-row">')));
  const testoHero = (hero.match(/<a class="btn"[^>]*>([^<]+)</) || [])[1] || "";
  eq((primario[2] || "").trim(), testoHero.trim(), "la CTA principale è la stessa in cima e in fondo");
  /* E il palco vuoto resta raggiungibile anche dal finale, come seconda scelta. */
  ok(/class="btn2"[^>]*>[^<]*palco vuoto/i.test(finale), "il foglio bianco resta, in seconda battuta");
});

t("il registro non si contraddice: dice «ultimi giorni» e lo è", () => {
  /* C'era già un presidio, ma la soglia è 120 giorni: il registro poteva restare fermo quattro mesi
     mentre la sezione prometteva «le ultime cose sistemate… degli ultimi giorni». Il 31/08 era
     fermo da 19 giorni, con tre PR importanti nel mezzo che nessuno raccontava. Trenta giorni è il
     punto in cui quella frase comincia a essere una bugia. */
  const sez = landing.slice(landing.indexOf('class="registro"'));
  const date = [...sez.matchAll(/<time datetime="(\d{4}-\d{2}-\d{2})">/g)].map((m) => m[1]).sort();
  ok(date.length >= 4, "il registro ha le sue voci: " + date.length);
  const ultima = date[date.length - 1];
  const giorni = Math.floor((Date.now() - new Date(ultima + "T12:00:00Z")) / 86400000);
  ok(giorni <= 30,
    "il registro è fermo da " + giorni + " giorni ma la sezione promette «gli ultimi giorni»: " +
    "aggiungi le ultime cose fatte, o cambia quella promessa");
});

/* ═══ ACCESSIBILITÀ MISURATA (31/08) ══════════════════════════════════════════════════════════════
   Non «sembra leggibile»: i contrasti si calcolano con la formula WCAG, come si fa per i dati di
   targa. Due difetti trovati così, che a occhio non si vedevano. */
console.log("\nAccessibilità:");

/* La formula ufficiale. Gli sfondi semitrasparenti vanno COMPOSTI su quello sotto: trattandoli come
   opachi avevo dato per rosso un contrasto che era buono (il primo giro sulla homepage diceva
   1,34:1 su un'etichetta perfettamente leggibile). */
function _lum(c) {
  const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
}
function _hex(h) {
  h = h.replace("#", "").trim();
  if (h.length === 3) h = h.split("").map((x) => x + x).join("");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
function _sopra(f, a, s) { return [f[0]*a + s[0]*(1-a), f[1]*a + s[1]*(1-a), f[2]*a + s[2]*(1-a)]; }
function _contrasto(a, b) {
  const l1 = _lum(a), l2 = _lum(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

t("l'anello di focus si vede: 3:1 in tutti e due i temi", () => {
  /* Era rgba(13,148,136,.32): composto sul bianco diventa rgb(178,221,217), che contro il bianco fa
     1,48:1 — meno della metà del 3:1 che WCAG 1.4.11 chiede a un indicatore di focus. Chi naviga da
     tastiera non vedeva dove si trovava, e la cosa non si nota mai perché chi disegna usa il mouse. */
  const m = stylesCss.match(/--focus-ring:rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)/);
  ok(m, "l'anello di focus è dichiarato una volta sola, come variabile");
  const teal = [+m[1], +m[2], +m[3]], alpha = +m[4];
  for (const [tema, sfondo] of [["chiaro", "#ffffff"], ["scuro", "#1a1a1a"]]) {
    const sf = _hex(sfondo);
    const cr = _contrasto(_sopra(teal, alpha, sf), sf);
    ok(cr >= 3, "tema " + tema + ": l'anello fa " + cr.toFixed(2) + ":1, serve 3:1");
  }
  /* E deve essere davvero usato dai controlli, non solo dichiarato. */
  ok(/:focus-visible\{outline:none;box-shadow:0 0 0 3px var\(--focus-ring\)\}/.test(stylesCss),
     "i controlli lo usano");
});

t("un testo piccolo non porta l'accent tenue", () => {
  /* --accent (#0d9488) su bianco fa 3,74:1: va bene per una superficie, non per un testo di 10 px,
     che ne chiede 4,5. Il conto era già stato fatto per il bottone primario e la risposta era
     --accent-strong; l'etichetta dei gruppi di liste era rimasta indietro. */
  const accent = _hex((stylesCss.match(/--accent:(#[0-9a-f]{6})/i) || [])[1] || "#0d9488");
  const strong = _hex((stylesCss.match(/--accent-strong:(#[0-9a-f]{6})/i) || [])[1] || "#0b7a70");
  const bianco = [255, 255, 255];
  ok(_contrasto(accent, bianco) < 4.5, "l'accent tenue NON basta per un testo piccolo: " + _contrasto(accent, bianco).toFixed(2));
  ok(_contrasto(strong, bianco) >= 4.5, "quello forte sì: " + _contrasto(strong, bianco).toFixed(2));
  /* La regola dell'etichetta deve usare il secondo. */
  const riga = (stylesCss.match(/\.layer-group-label\{[^}]*\}/) || [""])[0];
  ok(/font-size:10px/.test(riga), "l'etichetta è davvero piccola: " + riga.slice(0, 40));
  ok(/color:var\(--accent-strong\)/.test(riga), "e usa l'accent forte");
});

t("la homepage ha il salto al contenuto e il suo landmark", () => {
  /* Senza <main> chi usa uno screen reader riattraversa la navigazione a ogni pagina. */
  ok(/<main id="contenuto">/.test(landing), "c'è il landmark principale");
  ok(landing.indexOf("<main") < landing.indexOf("<footer"), "e il piede sta fuori");
  ok(/<a class="skip" href="#contenuto">/.test(landing), "c'è il salto al contenuto");
  /* Deve essere nascosto finché non prende il fuoco, e allora vedersi: se restasse fuori schermo
     anche col fuoco sarebbe peggio di non averlo — un bersaglio invisibile nel giro dei tab. */
  ok(/\.skip\{[^}]*left:-9999px/.test(landing), "sta fuori schermo di suo");
  ok(/\.skip:focus\{left:0\}/.test(landing), "e col fuoco rientra");
  /* Ed è il PRIMO elemento raggiungibile: dopo la nav non servirebbe a niente. */
  const corpo = landing.slice(landing.indexOf("<body>"));
  ok(corpo.indexOf('class="skip"') < corpo.indexOf("<nav"), "viene prima della navigazione");
});

/* ═══ COMPLESSITÀ PROGRESSIVA (31/08) ═════════════════════════════════════════════════════════════
   «Power» e «Luci» erano le uniche due liste con active:true fisso: comparivano sempre, anche a una
   band che non ha né quadri né fari. Sono le prime due parole che dicono a un chitarrista «questo
   non è roba per te». Ora stanno sotto un'intestazione che si apre e si chiude. */
t("le liste avanzate non si presentano da sole alla prima apertura", () => {
  const fn = appjs.slice(appjs.indexOf("function renderLayerManager"), appjs.indexOf("function lightsRows"));
  ok(/var AVANZATE=\{elec:1, luci:1, mond:1, miczone:1, cover:1\}/.test(fn),
     "l'elenco di cosa è avanzato è scritto in un posto solo");
  ok(/base\.forEach\(function\(L\)\{ renderLayerRow/.test(fn), "le liste di base si disegnano sempre");
  ok(/if\(aperto\) avanz\.forEach/.test(fn), "le avanzate solo a gruppo aperto");
  /* Palco, Musicisti, Input e Output NON sono avanzate: sono il mestiere di chi fa un rider. */
  for (const id of ["stage", "mus", "cabin", "cabout"])
    ok(!new RegExp(id + ":1").test((fn.match(/var AVANZATE=\{[^}]*\}/) || [""])[0]),
       id + " deve restare fra le liste di base");
});

t("non si nasconde mai qualcosa che è già in uso", () => {
  /* È la regola che rende accettabile nascondere: se il motore è acceso o la lista è aperta, il
     gruppo si apre da solo. Nascondere il lavoro di qualcuno è peggio che mostrargli una parola in
     più — e sarebbe il modo tipico in cui una «modalità semplice» fa danno. */
  const fn = appjs.slice(appjs.indexOf("function renderLayerManager"), appjs.indexOf("function lightsRows"));
  ok(/var inUso=avanz\.some\(function\(L\)\{ return L\.engineOn \|\| layerAccOpen===L\.id; \}\)/.test(fn),
     "in uso = motore acceso oppure lista aperta");
  ok(/var aperto=inUso \|\| advAperta\(\)/.test(fn),
     "e «in uso» vince sulla preferenza: il gruppo si apre da solo");
  /* Chiuso, deve comunque dire quante liste ci sono: un gruppo che non dice cosa contiene è una
     porta chiusa senza targa. */
  ok(/adv-quante/.test(fn) && /liste"/.test(fn), "e dice quante liste nasconde");
});

t("la scelta resta sul dispositivo, non nel progetto", () => {
  /* È una preferenza di come si guarda, non un dato del rider: un progetto aperto su un altro
     computer non deve ereditare le abitudini di chi l'ha disegnato. */
  const fn = appjs.slice(appjs.indexOf("function advAperta"), appjs.indexOf("function renderLayerManager"));
  ok(/localStorage\.getItem\("sp_advListe"\)/.test(fn), "si rilegge da localStorage");
  ok(/localStorage\.setItem\("sp_advListe"/.test(fn), "e ci si scrive");
  ok(/catch\(_e\)\{ return false; \}/.test(fn),
     "se localStorage non risponde (finestra anonima) si parte chiusi, senza esplodere");
  ok(!/state\.advListe/.test(appjs), "e non finisce nello stato del progetto");
});

t("«Produzione avanzata» è un bottone vero, raggiungibile da tastiera", () => {
  const fn = appjs.slice(appjs.indexOf("function renderLayerManager"), appjs.indexOf("function lightsRows"));
  ok(/createElement\("button"\)/.test(fn), "è un <button>, non un div cliccabile");
  ok(/setAttribute\("aria-expanded"/.test(fn), "e dichiara se è aperto");
  ok(/\.adv-head:focus-visible\{[^}]*box-shadow:0 0 0 3px var\(--focus-ring\)/.test(stylesCss),
     "col fuoco da tastiera si vede");
});

/* ═══ A CHE PUNTO È IL RIDER (31/08) ══════════════════════════════════════════════════════════════
   Il programma sapeva già dire se il documento sta in piedi — auditEngine calcola punteggio, errori
   e avvisi in un millesimo e mezzo — e non lo diceva a nessuno: la sezione «Audit progetto» nasce
   display:none e si trova SOLO cercando «audit» nel catalogo. Su un modello band appena creato erano
   88/100 con due avvisi veri (14 ingressi senza stage box, 2,6 kW senza quadro) che l'utente non
   vedeva mai — e in export non lo ferma nessuno, perché gli avvisi giustamente non bloccano. */
t("la colonna dice a che punto è il rider, e apre il controllo", () => {
  ok(/function renderStatoRider\(rows\)/.test(appjs), "c'è la riga di stato");
  const fn = appjs.slice(appjs.indexOf("function renderStatoRider"), appjs.indexOf("function renderStatoRider") + 1800);
  ok(/auditEngine\(\)/.test(fn), "usa il calcolo che già esiste, non ne inventa un altro");
  ok(/renderStatoRider\(rows\);/.test(appjs), "ed è chiamata dal render delle liste");
  /* Il click porta dove si può agire. */
  ok(/toggleAuditView/.test(fn), "il click apre l'audit");
  /* Su un palco vuoto non c'è niente da controllare: la riga non deve comparire. */
  ok(/if\(!rows \|\| !\(state\.items\|\|\[\]\)\.length\) return;/.test(fn),
     "sul palco vuoto sparisce");
  /* Se l'audit esplode, la colonna delle liste non deve sparire con lui. */
  ok(/try\{ A=auditEngine\(\); \}catch\(_e\)\{ return; \}/.test(fn),
     "un errore nell'audit non porta giù le liste");
});

t("lo stato del rider si legge senza distinguere i colori", () => {
  /* Il pallino porta il colore, ma il testo dice la stessa cosa da solo: chi non distingue l'ambra
     dal verde legge «2 cose da guardare» e capisce lo stesso. È la regola che vale per ogni segnale
     di stato — il colore aggiunge, non sostituisce. */
  const fn = appjs.slice(appjs.indexOf("function renderStatoRider"), appjs.indexOf("function renderStatoRider") + 1800);
  ok(/errori da sistemare/.test(fn) && /cose da guardare/.test(fn) && /Rider pronto/.test(fn),
     "i tre stati hanno tre testi diversi");
  ok(/A\.errs===1 \? "1 errore da sistemare"/.test(fn), "e il singolare è al singolare");
  ok(/\.sr-ok \.sr-pallino\{background/.test(stylesCss) && /\.sr-warn \.sr-pallino\{background/.test(stylesCss),
     "il colore c'è, ma è in aggiunta al testo");
  /* Ed è un bottone vero, raggiungibile da tastiera come tutto il resto. */
  ok(/createElement\("button"\)/.test(fn), "è un <button>");
  ok(/\.stato-rider:focus-visible\{[^}]*box-shadow:0 0 0 3px var\(--focus-ring\)/.test(stylesCss),
     "col fuoco da tastiera si vede");
});

/* ═══ TELEFONO: I BERSAGLI DA DITO (31/08) ════════════════════════════════════════════════════════
   Misurato con le media query del telefono forzate attive (la finestra di Chrome non si lascia
   ridimensionare e l'app esce dagli iframe per anti-clickjacking): 49 bersagli sotto i 44 px, e fra
   quelli le undici intestazioni del catalogo — le porte da cui si prende OGNI elemento — a 28 px, le
   righe delle liste a 28-32, il bottone «Solo» a 17×17, e le due cose aggiunte oggi: «Produzione
   avanzata» a 11 px e la riga di stato a 30. 44 px è la misura di un polpastrello: sotto, si apre
   la categoria sbagliata. */
/* Tutti i blocchi @media (pointer:coarse), delimitati contando le graffe: una fetta a occhio
   prenderebbe mezzo foglio di stile e il test smetterebbe di discriminare. */
function bloccoCoarse(css) {
  const out = [];
  let i = 0;
  while ((i = css.indexOf("@media (pointer:coarse)", i)) >= 0) {
    const apre = css.indexOf("{", i);
    let d = 0, j = apre;
    for (; j < css.length; j++) {
      if (css[j] === "{") d++;
      else if (css[j] === "}") { d--; if (d === 0) { j++; break; } }
    }
    out.push(css.slice(apre, j));
    i = j;
  }
  return out.join("\n");
}

t("sul telefono si toccano bersagli da dito, in tutta la catena", () => {
  /* La regola c'era già ma copriva solo una manciata di classi. Questi sono i bersagli del percorso
     principale: catalogo → sottocategoria → elemento → liste → esporta. */
  /* Il blocco va estratto contando le graffe: `split(...).slice(1).join()` prendeva TUTTO il resto
     del file (54 mila caratteri) e il test trovava i selettori ovunque, anche fuori dalla media
     query — cioè non guardava niente. Scoperto rimettendo il difetto: la mutazione passava. */
  const coarse = bloccoCoarse(stylesCss);
  ok(coarse.length > 200 && coarse.length < 6000, "il blocco è quello vero: " + coarse.length + " caratteri");
  for (const sel of [".cat-head", ".sub-head", ".cat-more", ".layer-row", ".adv-head",
                     ".stato-rider", ".cat-sheet-close", ".chips button", ".pdf-navbtn"])
    ok(coarse.includes(sel), "manca dai bersagli da dito: " + sel);
  /* I campi di testo si toccano una volta e poi si scrive, ma 24 px per le misure del palco sono
     pochi anche solo per centrarli. */
  for (const sel of ["#catSearch", "#mW", "#mD", "#pdfTitolo"])
    ok(coarse.includes(sel), "campo troppo basso su telefono: " + sel);
  /* E l'avviso «c'è una versione nuova»: è quello che dice di ricaricare, l'ultimo posto dove si
     vuole sbagliare tocco. */
  ok(coarse.includes("#updGo") && coarse.includes("#updX"), "l'avviso di aggiornamento");
});

t("il bottone «Solo» resta piccolo da vedere e diventa grande da toccare", () => {
  /* 17×17 px, e non porta la classe .layer-ico: restava fuori da ogni regola. Ingrandirlo
     sposterebbe il nome della lista, quindi l'area cresce SOTTO, invisibile — la tecnica che si usa
     per le X e i segni di spunta piccoli. Provato nel browser: al centro e a 18 px in ogni
     direzione il tocco arriva, a 25 px no (non ruba i tocchi ai vicini). */
  const coarse = bloccoCoarse(stylesCss);
  ok(/\.layer-solo\{position:relative\}/.test(coarse), "l'ancora per l'area estesa");
  ok(/\.layer-solo::after\{[^}]*width:44px;height:44px/.test(coarse), "l'area è 44×44");
  ok(/\.layer-solo::after\{[^}]*transform:translate\(-50%,-50%\)/.test(coarse), "ed è centrata sul bottone");
  /* Non deve cambiare l'aspetto: niente sfondo, niente bordo. */
  const regola = (coarse.match(/\.layer-solo::after\{[^}]*\}/) || [""])[0];
  ok(!/background:(?!none)/.test(regola) && !/border:/.test(regola), "resta invisibile: " + regola.slice(0, 60));
});

t("sul telefono il pannello mostra quello che si vede, e il resto sta dietro un bottone", () => {
  /* 02/09, Simone: «da telefono dev'essere possibile inserire icone ed esportare in modo semplice,
     senza tutte le opzioni della versione pro». Su uno schermo da telefono il pannello e' un
     cassetto alto 46vh con dentro 288 controlli.
     Restano in vista i gruppi che descrivono quello che si VEDE sul palco; vanno dietro il bottone
     quelli che alimentano i motori. «Microfono» resta perche' li' dentro c'e' anche come si tiene
     il microfono (asta, palmare, archetto): e' il primo errore che si nota in un plot, non una
     questione da fonico. */
  const html = readFileSync(join(root, "app/index.html"), "utf8");
  /* L'aggancio: il .pgrp nasceva senza id ne' attributi, quindi da CSS non lo si raggiungeva. */
  ok(/g\.setAttribute\("data-grp"/.test(appjs), "i gruppi portano un aggancio per il CSS");
  const coarse880 = stylesCss.slice(stylesCss.indexOf("@media(max-width:880px)"));
  ok(/body:not\(\.props-pro\) #selProps \.pgrp\[data-grp="ascolto"\]/.test(stylesCss),
     "«Ascolto» sta dietro il bottone");
  ok(/body:not\(\.props-pro\) #selProps \.pgrp\[data-grp="dettagli-tecnici"\]/.test(stylesCss),
     "e «Dettagli tecnici» pure");
  /* Ma NON i gruppi che descrivono il disegno. */
  ["etichetta", "accessori", "nota", "disegno", "microfono"].forEach((g) => {
    ok(!new RegExp('props-pro\\) #selProps \\.pgrp\\[data-grp="' + g + '"\\]').test(stylesCss),
       "«" + g + "» resta in vista: descrive quello che si vede");
  });
  /* Via CSS e non inline: syncPanelGroups riscrive lo style a ogni render (13191). */
  const regola = (stylesCss.match(/body:not\(\.props-pro\) #selProps[^}]*\}/) || [""])[0];
  ok(/!important/.test(regola), "con !important, o syncPanelGroups lo riapre");
  /* La regola dev'essere ALMENO specifica quanto `#props .btn{display:flex}`, che gia' esiste:
     con la sola classe il bottone compariva anche col mouse. Misurato nel browser il 02/09 — ed e'
     la stessa trappola di `.guide-actions .btn`, la terza in un giorno. */
  /* Non basta la specificita' UGUALE: a parita' vince l'ultima scritta, e `#props .btn{display:flex}`
     stava piu' in basso. La regola dev'essere DOPO di quella. Misurato nel browser il 02/09 — ed e'
     la terza volta in un giorno che questo pannello vince su una regola nuova. */
  ok(/#props \.adv-mob\{display:none\}/.test(stylesCss), "col mouse il bottone non c'e'");
  const iBtn = stylesCss.indexOf("#props .btn,#grpProps .btn{width:100%;display:flex");
  const iAdv = stylesCss.indexOf("#props .adv-mob{display:none}");
  ok(iBtn > 0 && iAdv > iBtn, "e la regola viene DOPO «#props .btn», o quella la sovrascrive");
});

t("su telefono il pannello delle liste e' DAVVERO nascosto", () => {
  /* 02/09 — il difetto che teneva le Liste in mezzo allo schermo, e che nessuna prova aveva visto.
     `#props{display:none}` sta nel blocco mobile, ma piu' in basso nel file c'e'
     `#props{display:flex}` SENZA media query e con la stessa specificita': a parita' vince l'ultima
     scritta. Su telefono il pannello non si e' mai nascosto — restava lì con dentro Palco,
     Musicisti, Input, Output e Produzione avanzata, 384 px su 834, col palco tagliato a meta'.
     Il commento accanto alla regola globale diceva «su telefono #props torna block»: un'assunzione,
     non quello che il CSS faceva.
     E la simulazione via CSS iniettato lo MASCHERAVA, perche' copiava le regole mobile in fondo e
     quindi le faceva vincere. Visto solo misurando a 767 px veri, con la finestra ridimensionata. */
  const iMob = stylesCss.indexOf("body #props{display:none;position:fixed");
  ok(iMob > 0, "la regola mobile esiste ed e' scritta `body #props`, non `#props`");
  const iGlob = stylesCss.indexOf("#props{display:flex;flex-direction:column}");
  ok(iGlob > 0, "e quella globale c'e' ancora");
  /* Il punto: `body #props` (1,0,1) batte `#props` (1,0,0) a prescindere dall'ordine. */
  ok(iGlob > iMob, "la globale sta DOPO: senza il peso in piu' vincerebbe lei");
  /* E gli stati che aprono il cassetto restano piu' specifici di `body #props`. */
  ok(/body\.stage-edit #props[^{]*\{display:block\}/.test(stylesCss),
     "gli stati che lo aprono lo battono ancora");
});

t("ogni voce del menu mobile apre davvero il suo pannello", () => {
  /* 02/09 — «Area stampa» e «Punti di ripristino» erano nel menu mobile e NON FACEVANO NIENTE.
     Su telefono `#props` è un cassetto `display:none` che si apre solo per gli stati elencati in
     una riga del CSS, e i loro due non c'erano: si premeva la voce, il palco sbiadiva
     (`body.area-edit .item{opacity:.4}`) e non compariva nulla. Provato rimettendo il difetto nel
     browser: il cassetto resta chiuso in entrambi i casi.
     Questo test è la guardia per chi aggiunge la terza voce. */
  const porta = (stylesCss.match(/body\.stage-edit #props[^{]*\{display:block\}/) || [""])[0];
  ok(porta, "la riga che apre il cassetto esiste");
  ["stage-edit", "evento-edit", "chan-edit", "tech-open", "area-edit", "vers-edit"].forEach((st) => {
    ok(porta.indexOf("body." + st + " #props") >= 0, "«" + st + "» apre il cassetto: " + porta.slice(0, 90));
  });
  /* E il canvas si accorcia, o il pannello ci finisce sopra. */
  const main = (stylesCss.match(/body\.stage-edit main[^{]*\{bottom:calc\(46vh[^}]*\}/) || [""])[0];
  ["area-edit", "vers-edit"].forEach((st) => {
    ok(main.indexOf("body." + st + " main") >= 0, "«" + st + "» accorcia anche il canvas");
  });
  /* La classe `vers-edit` non esisteva proprio: `toggleVersionEdit` non la metteva. */
  ok(/classList\.toggle\("vers-edit", versEdit\)/.test(appjs), "e «Punti di ripristino» mette la sua classe");
  /* Come «Area stampa», mostra solo il suo pannello. */
  ok(/body\.vers-edit #selProps[^{]*\{display:none !important\}/.test(stylesCss),
     "con solo la lista delle versioni in vista");
});

t("i fogli che salgono dal basso si chiudono trascinandoli giu'", () => {
  /* Simone dal telefono, 02/09: «se premo aggiungi e trascino verso il basso la finestra deve
     chiudersi», e poi «anche la finestra menu». È il gesto che ci si aspetta da un foglio che sale
     dal basso, e su un telefono la X sta lontana dal pollice. */
  ok(/function chiudiTrascinando\(foglio, maniglia, chiudi, escludi, fascia\)/.test(appjs),
     "il gesto e' una funzione sola, non copiata due volte");
  ok(/chiudiTrascinando\(document\.getElementById\("catalog"\)/.test(appjs), "il catalogo lo usa");
  /* Il menu si prende da QUALUNQUE punto (Simone, 02/09: «anche se lo scroll inizia in un punto a
     caso della finestra»): le sue voci non scorrono, quindi non c'e' niente da confondere. */
  ok(/chiudiTrascinando\(ms, ms, closeAll\);/.test(appjs), "il menu si prende da ovunque");
  /* Quello che evita di rubare i clic non e' piu' la fascia, ma la SOGLIA: il gesto si sveglia solo
     dopo 12 px di dito. Sotto, un tocco resta un tocco e il bottone funziona. */
  ok(/var SVEGLIA=12, attivo=false;/.test(appjs), "il gesto si sveglia dopo 12 px");
  ok(/if\(dy < SVEGLIA\) return;/.test(appjs), "prima di quelli non si muove niente");
  ok(/if\(attivo && dy>70\) chiudi\(\);/.test(appjs), "e si chiude solo se il gesto era davvero partito");
  /* La fascia resta per i fogli il cui contenuto SCORRE, dove prendere in mezzo vuol dire scorrere. */
  ok(/if\(fascia && \(e\.clientY - maniglia\.getBoundingClientRect\(\)\.top\) > fascia\) return;/.test(appjs),
     "e per chi scorre resta la presa in cima");
  /* Solo dalla maniglia: dal corpo, scorrere l'elenco degli strumenti chiuderebbe il foglio. */
  ok(/if\(attivo && dy>70\) chiudi\(\)/.test(appjs), "sotto i 70 px torna su: uno scatto, non un tocco storto");
  ok(/dy=Math\.max\(0, e\.clientY-y0\)/.test(appjs), "e si trascina solo verso il basso");
  /* La barretta del menu esisteva GIA' come pseudo-elemento: il div che avevo aggiunto era un
     doppione, ed e' stato tolto. */
  ok(/#mActions::before\{content:""/.test(stylesCss), "la maniglia del menu e' quella che c'era gia'");
  const html = readFileSync(join(root, "app/index.html"), "utf8");
  ok(!/<div class="sheet-grab"/.test(html), "e non ce n'e' una seconda");
});

t("il messaggio dopo un'eliminazione ha due bottoni, non uno", () => {
  /* Simone, 02/09: «quando elimino un elemento esce un popup con scritto elemento eliminato
     annulla, secondo me dovrebbe esserci anche l'ok oltre che l'annulla e l'annulla dovrebbe essere
     in rosso». Prima c'era solo «Annulla»: chi voleva davvero eliminare non aveva niente da
     premere e restava a guardare il messaggio finché spariva da solo. */
  ok(/b\.className="toast-act toast-undo"/.test(appjs), "«Annulla» c'e' ancora");
  ok(/ok\.className="toast-act toast-ok"; ok\.textContent="OK"/.test(appjs), "e adesso c'e' anche «OK»");
  ok(/ok\.addEventListener\("click", function\(\)\{ toastEl\.hidden=true;[^}]*\}\)/.test(appjs),
     "che chiude e basta, senza disfare niente");
  /* Rosso chiaro: il toast ha lo sfondo scuro. */
  ok(/\.toast-act\.toast-undo\{border-color:rgba\(248,113,113/.test(stylesCss), "«Annulla» e' rosso");
  ok(/\.toast-act\.toast-ok\{border-color:rgba\(255,255,255/.test(stylesCss), "e «OK» resta neutro");
});

t("dal telefono spariscono le due voci che non si usano in piedi", () => {
  /* Simone dal telefono: «da mobile non ha senso il bottone planimetria, troppo difficile» e
     «neanche channel list». Caricare una pianta e allinearla in scala è lavoro da scrivania; una
     channel list a otto colonne su uno schermo stretto non si legge, e chi la guarda sta al banco
     con la console davanti. Restano nel menu File del desktop. */
  const html = readFileSync(join(root, "app/index.html"), "utf8");
  /* La fine del blocco si cerca DOPO il suo inizio: `mact-consul` compare anche nel CSS inline,
     molto piu' su, e la slice veniva vuota — un test che guardava il nulla e restava verde. */
  const iMenu = html.indexOf('<div id="mActions">');
  ok(iMenu > 0, "il menu mobile esiste nel markup");
  const menu = html.slice(iMenu, html.indexOf("mact-consul", iMenu));
  ok(menu.length > 100 && /data-act="new"/.test(menu), "e il blocco letto e' davvero il menu: " + menu.length + " caratteri");
  ok(!/data-act="venue"/.test(menu), "planimetria via dal menu mobile");
  ok(!/data-act="chan"/.test(menu), "e channel list pure");
  /* Ma i pannelli restano nel documento: toglierli ucciderebbe il boot (#venuePanel e #chanlist
     hanno listener nudi, 15704 e 15707). Nascosto non e' tolto. */
  ok(/id="venuePanel"/.test(html) && /id="chanlist"/.test(html), "i pannelli restano: servono al desktop");
  /* E sul desktop le due voci ci sono ancora. */
  ok(/id="bChanList"/.test(html), "la channel list resta raggiungibile col mouse");
});

t("ogni finestra si chiude buttandola giu', non solo il catalogo", () => {
  /* Simone, 02/09: «tutte le finestre devono chiudersi con trascinamento verso il basso». Sono 22
     modali: attaccare il gesto a mano su ognuno vuol dire dimenticarsene al 23°, quindi si aggancia
     a tutti in un giro solo. */
  ok(/function fogliChiudibiliColDito\(\)/.test(appjs), "il giro esiste");
  ok(/document\.querySelectorAll\("\.modal"\)\.forEach/.test(appjs), "e passa da tutti i modali");
  /* TUTTE E 22, non solo quelle con `.mcard`: il benvenuto, le misure del palco e l'invito ad
     accedere usano `.wl-card`, la conferma `.cfm-card`. Aprendole una per una nel browser ne
     restavano fuori QUATTRO. */
  ok(/querySelector\("\.mcard,\.pdf-export,\.wl-card,\.cfm-card"\)/.test(appjs),
     "comprese le quattro che non usano .mcard");
  ok(/if\(!isMobile\(\)\) return;/.test(appjs.slice(appjs.indexOf("function fogliChiudibiliColDito"), appjs.indexOf("function closeMobileDrawers"))),
     "solo col dito: col mouse le finestre si chiudono col bottone");
  /* Chiudere = premere il bottone che chiude DAVVERO: spesso fa altro oltre a nascondere. */
  ok(/\/\^\(annulla\|chiudi/.test(appjs), "cerca il bottone di chiusura vero");
  ok(/if\(b\) b\.click\(\); else m\.hidden=true;/.test(appjs), "e solo se non c'e' nasconde a mano");
  /* Non deve partire dai campi: trascinare dentro un input non chiude la finestra. */
  ok(/"input,select,textarea,button,a,label", 44/.test(appjs), "e non parte da un campo o da un bottone");
  /* LA PRESA E' UNA STRISCIA VERA, e il divieto di scorrere sta SOLO li' dentro.
     Il 02/09, misurato sull'iPhone: `touch-action:none` era su TUTTO il foglio, e siccome quel
     divieto vale anche per gli antenati che scorrono, nessuna delle 22 finestre si scorreva piu'.
     La `fascia` limitava dove PARTE il gesto, non il divieto. */
  ok(/\.sheet-hand\{display:block[^}]*touch-action:none/.test(stylesCss.replace(/\n\s*/g, "")),
     "il divieto di scorrere sta sulla maniglia");
  ok(/\.sheet-hand::before\{content:""/.test(stylesCss), "ed e' lei a portare la barretta");
  /* Il foglio NON deve avere il divieto: e' esattamente il difetto da cui si torna indietro. */
  const corpoChiudi = appjs.slice(appjs.indexOf("function chiudiTrascinando"),
                                  appjs.indexOf("function fogliChiudibiliColDito"));
  ok(/if\(fascia\)\{ *maniglia=manigliaDelFoglio\(foglio\); *fascia=0; *\}/.test(corpoChiudi),
     "con una fascia la maniglia diventa la striscia, non il foglio");
  ok(/foglio\.insertBefore\(m, foglio\.firstChild\)/.test(appjs), "la striscia sta in cima al foglio");
  ok(/\.card-grab\{position:relative;padding-top:26px !important\}/.test(stylesCss),
     "e il foglio le lascia lo spazio");
});

t("il menu mobile non ha buchi, e il bottone solo si allarga", () => {
  /* Togliendo Planimetria e Channel list erano rimaste due righe vuote e due bottoni orfani a
     mezza larghezza — «Area stampa» e «Tema» — con un buco accanto. (Simone, 02/09) */
  const html = readFileSync(join(root, "app/index.html"), "utf8");
  const iMenu = html.indexOf('<div id="mActions">');
  const menu = html.slice(iMenu, html.indexOf("mact-consul", iMenu));
  ok(!/<\/button>\s*\n\s*\n\s*<button/.test(menu), "niente righe vuote fra i bottoni");
  ok(/\.mact-grid button:last-child:nth-child\(odd\)\{grid-column:1 \/ -1\}/.test(stylesCss),
     "il bottone rimasto solo prende tutta la riga");
  ok(/\.mact-grid button\{min-height:48px\}/.test(stylesCss), "e sono alti come un bersaglio");
});

t("la riga che dice da che parte guarda il palco si legge", () => {
  /* «fondo palco in alto · pubblico in basso» e' l'UNICA riga che spiega l'orientamento della
     griglia 3x3, ed era il testo piu' piccolo del pannello — 10,5 px sotto una griglia di nove
     bersagli da 117. Chi non la legge mette la batteria dalla parte del pubblico. (02/09) */
  const m = /\.pg-hint\{font-size:([0-9.]+)px/.exec(stylesCss);
  ok(m, "la riga ha una misura dichiarata");
  ok(parseFloat(m[1]) >= 12, "e non e' il testo piu' piccolo del pannello: " + m[1] + "px");
});

t("la tipografia la decide il foglio di stile, non il browser", () => {
  /* Senza questa riga WebKit applica il suo «text autosizing» sui blocchi piu' larghi del telefono
     e riscrive le misure per conto suo: la gerarchia scelta qui non e' quella che l'utente vede.
     E' una riga che nessuno nota se sparisce — finche' su un telefono non torna tutto storto. */
  ok(/html\{-webkit-text-size-adjust:100%;text-size-adjust:100%\}/.test(stylesCss),
     "il browser non riscrive le misure dei testi");
  /* Su `html`, non su `body`: la proprieta' si eredita e va dichiarata sopra a tutto. */
  const i = stylesCss.indexOf("html{-webkit-text-size-adjust");
  const iRoot = stylesCss.indexOf(":root{");
  ok(i > 0 && i < iRoot, "dichiarata prima di tutto il resto");
  const prima = stylesCss.slice(0, i);
  eq((prima.match(/\{/g) || []).length - (prima.match(/\}/g) || []).length, 0,
     "e fuori da ogni @media: vale sempre");
});

t("prima di esportare, si viene avvisati se qualcosa è fuori dal palco", () => {
  /* L'audit lo dice da sempre, ma l'audit vive dentro `#noSel`, che sul telefono non si apre mai:
     chi disegna col dito esportava un PDF con mezzo gruppo fuori dal palco senza che nessuno
     glielo dicesse. Nel progetto di un utente vero, il 01/09: palco 50×50 cm e TUTTI e 30 gli
     elementi fuori, mai segnalato. Ora l'avviso sta nell'ultimo posto prima del file. */
  const html = readFileSync(join(root, "app/index.html"), "utf8");
  ok(/id="pdfFuoriPalco"/.test(html), "l'avviso ha il suo posto nella finestra Esporta");
  const iPn = html.indexOf('id="prodNudge"'), iFp = html.indexOf('id="pdfFuoriPalco"');
  ok(iPn > 0 && iFp > iPn && iFp - iPn < 900, "ed e' accanto all'invito del Controllo tecnico");
  ok(/function renderFuoriPalco\(\)/.test(appjs), "qualcuno lo riempie");
  ok(/renderFuoriPalco\(\);/.test(appjs.slice(appjs.indexOf("renderProdInline();\n    renderFuoriPalco"), appjs.indexOf("renderProdInline();\n    renderFuoriPalco") + 80)) ||
     /renderProdInline\(\);\s*renderFuoriPalco\(\);/.test(appjs), "e viene chiamato all'apertura della finestra");
  /* Se non c'e' niente fuori, non c'e' nemmeno l'avviso: un avviso sempre acceso non si legge piu'. */
  ok(/if\(!fuori\.length\)\{ box\.hidden=true; return; \}/.test(appjs), "e sparisce quando non serve");
  /* Il rimedio e' li' dentro, non altrove: «Adatta il palco» esiste gia' nell'audit. */
  ok(/auditFixAdattaPalco\(\);/.test(appjs.slice(appjs.indexOf("function renderFuoriPalco"), appjs.indexOf("function renderProdInline"))),
     "e porta il rimedio con se'");
  ok(/fuori\.length===1 \? "1 elemento è fuori dal palco"/.test(appjs), "al singolare quando e' uno solo");
  /* Colori del design system, non hex crudi. */
  ok(/\.nudge\.warn\{background:var\(--warning-bg\);border-color:var\(--warning-border\);color:var\(--warning\)/.test(stylesCss),
     "e usa i colori dell'avviso, non un arancione inventato");
});

t("la griglia 3x3 del palco sposta davvero, anche con un blocco largo", () => {
  /* Nove bersagli, e con un blocco piu' largo del palco base facevano tutti la stessa cosa:
     `Math.max(0, nx)` schiacciava le tre colonne sullo stesso numero. Ci si arriva senza sforzo —
     «+ Semicerchio» nasce largo 4 m e il palco puo' essere piu' stretto. (02/09) */
  const iStart = appjs.indexOf('(function(){ var g=document.getElementById("blkPosGrid")');
  ok(iStart > 0, "il gestore della griglia c'e'");
  const blocco = appjs.slice(iStart, iStart + 1400);
  ok(/e\.target\.closest\("button\[data-pos\]"\)/.test(blocco), "ed e' davvero lui che risponde al tocco");
  ok(blocco.length > 200, "e il blocco letto e' il suo: " + blocco.length + " caratteri");
  ok(!/r\.x=Math\.round\(Math\.max\(0,nx\)\)/.test(blocco),
     "niente clamp a zero: schiacciava le tre colonne su un solo risultato");
  ok(/r\.x=Math\.round\(nx\); r\.y=Math\.round\(ny\);/.test(blocco), "le tre posizioni restano tre");
  ok(/normalizeStageBBox\(\)/.test(blocco), "e le coordinate negative le rimette a posto la normalizzazione");

  /* IL CONTO, provato sui numeri: palco base 8 m, blocco da 12 m. Le tre colonne devono dare tre
     x diversi — prima ne davano uno solo. */
  const bx = 0, bw = 800, rw = 1200;
  const tre = [0, 1, 2].map((col) => Math.round(col === 0 ? bx : (col === 2 ? bx + bw - rw : bx + (bw - rw) / 2)));
  eq(new Set(tre).size, 3, "tre colonne, tre posizioni: " + tre.join(" / "));
  const vecchio = tre.map((x) => Math.max(0, x));
  eq(new Set(vecchio).size, 1, "col clamp di prima erano tutte uguali: " + vecchio.join(" / "));

  /* E la cella accesa deve seguire il blocco anche quando la corsa e' negativa, o resta inchiodata
     al centro e non dice piu' dove sia. */
  const cella = (pos, base, corsa) => { const t = corsa === 0 ? 0.5 : (pos - base) / corsa; return t <= 0.25 ? 0 : (t >= 0.75 ? 2 : 1); };
  eq(cella(0, 0, -400), 0, "a filo a sinistra accende la sinistra");
  eq(cella(-400, 0, -400), 2, "a filo a destra accende la destra");
  eq(cella(-200, 0, -400), 1, "in mezzo accende il centro");
  ok(/function cella\(pos, base, corsa\)/.test(appjs), "ed e' lo stesso conto che gira nell'app");
  /* E che sia USATO, non solo dichiarato: la prima mutazione ha lasciato la funzione al suo posto
     e cambiato solo la riga che la chiama — la suite e' rimasta verde. */
  ok(/var col = cella\(r\.x, bx0, bw0-r\.w\), row = cella\(r\.y, by0, bd0-r\.d\);/.test(appjs),
     "e che sia lui a decidere la cella accesa");
});

t("quando premi un bottone del palco, qualcosa si muove", () => {
  /* `ensureVisible()` era una funzione VUOTA, chiamata in 19 punti. Il blocco nuovo nasce al centro
     del palco: se eri zoomato su un angolo, premevi «+ Blocco» e non succedeva niente di visibile.
     E aprire il cassetto rimpicciolisce il disegno senza generare un resize, quindi nessuno rifa'
     l'inquadratura. (02/09) */
  ok(!/function ensureVisible\(\)\{\}/.test(appjs), "non e' piu' vuota");
  ok(/function ensureVisible\(\)\{ if\(isMobile\(\)\) fitStage\(\); \}/.test(appjs),
     "rifa' l'inquadratura, ma solo col dito");
  /* Col mouse l'inquadratura e' dell'utente: non gliela si sposta sotto. */
  const iAdd = appjs.indexOf("function addStageBlock");
  ok(/ensureVisible\(\);/.test(appjs.slice(iAdd, appjs.indexOf("function addSemicircle"))), "«+ Blocco» la chiama");
});

t("la planimetria si ridisegna anche senza un blocco selezionato", () => {
  /* `renderStagePanel` usciva prima di `renderVenuePanel()` ogni volta che nessun blocco era
     selezionato — cioe' dopo ogni tocco su un chip Pedana, che fa proprio `selBlock=null`. (02/09) */
  ok(/bp\.hidden=true; renderVenuePanel\(\); return;/.test(appjs),
     "prima di uscire ridisegna la planimetria");
  ok(/selBlock=null; selectOne\(pd\.id\)/.test(appjs), "ed e' il caso del chip Pedana");
});

t("l'area di stampa: la forma sta nel CSS, non negli attributi style", () => {
  /* Le regole per il telefono scritte il 02/09 non hanno mai avuto effetto: nel markup c'era
     `style="grid-template-columns:1fr 1fr 1fr 1fr"`, e un inline batte qualunque foglio di stile.
     I quattro campi restavano quattro per riga anche a 390 px. */
  const html = readFileSync(join(root, "app/index.html"), "utf8");
  const iPa = html.indexOf('class="pa-nums"');
  ok(iPa > 0, "la griglia dei campi c'e'");
  ok(!/class="pa-nums" style=/.test(html), "e non porta piu' uno style inline");
  ok(!/class="pa-pre" style=/.test(html), "nemmeno la riga dei tre bottoni");
  const iPre = html.indexOf('class="pa-pre"');
  ok(!/style="flex:1/.test(html.slice(iPre, iPre + 500)), "ne' i bottoni dentro");
  /* La forma di base e' passata al CSS, o col mouse la finestra si sfascia. */
  ok(/\.pa-nums\{display:grid;grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/.test(stylesCss), "col mouse restano quattro");
  /* `minmax(0,1fr)`, non `1fr`: un campo numerico ha una larghezza minima sua e la colonna non
     scende sotto — a 16px le due colonne uscivano dalla finestra di 28 px, misurati sull'iPhone. */
  ok(/#printAreaModal \.pa-nums\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)\}/.test(stylesCss),
     "e col dito due colonne che possono davvero rimpicciolire");
  ok(/\.pa-nums input\{width:100%;min-width:0/.test(stylesCss), "coi campi che stanno nella loro colonna");
  ok(/\.pa-pre \.btn\{flex:1;font-size:12px\}/.test(stylesCss), "e i tre bottoni in fila");
  /* E adesso la regola del telefono vince, perche' non ha piu' un inline davanti. */
});

t("i bottoni del menu del telefono sono alti quanto dice il commento", () => {
  /* `.mact-grid button{min-height:48px}` perdeva contro la riga generica dei 44 px scritta piu' in
     basso: stessa specificita' (0,1,1), vince l'ultima. Il commento diceva 48, il browser faceva
     44. Sesta volta in un giorno che una regola nuova perde per ordine. (02/09) */
  const i48 = stylesCss.indexOf("#mActions .mact-grid button{min-height:48px}");
  ok(i48 > 0, "i 48 px sono scritti con un id davanti");
  const i44 = stylesCss.indexOf(".mact-grid button,");
  const i44b = i44 > 0 ? i44 : stylesCss.indexOf(".mact-grid button{min-height:44px}");
  const genericaDopo = stylesCss.indexOf("min-height:44px}", i48);
  ok(genericaDopo > i48, "e la riga generica dei 44 viene DOPO: e' per questo che serve l'id");
  ok(!/\n\s*\.mact-grid button\{min-height:48px\}/.test(stylesCss),
     "nessuna copia senza id, che perderebbe di nuovo");
});

t("l'altezza del dock e' dichiarata, non indovinata", () => {
  /* `calc(var(--dock-h,64px) + 12px)` in due punti, e `--dock-h` non dichiarata da nessuna parte:
     valeva sempre il fallback 64 mentre il dock ne misura 52 piu' la safe-area. (02/09) */
  ok(/--dock-h:calc\(52px \+ env\(safe-area-inset-bottom, 0px\)\)/.test(stylesCss), "e' un token vero");
  const iRoot = stylesCss.indexOf(":root{");
  const iTok = stylesCss.indexOf("--dock-h:calc");
  ok(iRoot > 0 && iTok > iRoot && iTok < stylesCss.indexOf("}", iRoot), "dichiarata dentro :root");
  ok(/#mDock button\{[^}]*min-height:52px/.test(stylesCss.replace(/\n\s*/g, "")), "e i 52 sono quelli veri del dock");
});

t("anche i pannelli del cassetto si buttano giu'", () => {
  /* Simone: «anche la finestra evento stessa cosa». Non sono modali: vivono dentro #props, e ognuno
     ha il suo «Fatto» che oltre a chiudere spegne la modalita' — quindi si preme quello. */
  ok(/function pannelliChiudibiliColDito\(\)/.test(appjs), "il giro sui pannelli esiste");
  /* Dalla funzione in avanti, non «fino all'altra»: nel bundle `pannelli…` viene DOPO `fogli…`, e
     una slice al contrario e' vuota. E la si controlla, invece di fidarsi: oggi due test hanno
     guardato il nulla restando verdi. */
  const iPan = appjs.indexOf("function pannelliChiudibiliColDito");
  ok(iPan > 0, "la funzione e' nel bundle");
  const blocco = appjs.slice(iPan, iPan + 2200);   /* largo: i commenti dentro la funzione sono lunghi */
  ok(/eventoSec/.test(blocco), "e il blocco letto e' davvero il suo: " + blocco.length + " caratteri");
  ["eventoSec", "stageEditPanel", "areaEditPanel"].forEach((id) => {
    ok(new RegExp('\\["' + id + '"').test(blocco), id + " e' fra quelli agganciati");
  });
  /* MA NON la planimetria: `#venuePanel` vive DENTRO `#stageEditPanel`, e due maniglie annidate
     nella stessa striscia volevano dire due chiusure in fila — la seconda riapriva quello che la
     prima aveva chiuso, e il foglio scendeva del doppio del dito. (02/09) */
  ok(!/\["venuePanel"/.test(blocco), "la planimetria NON ha una maniglia sua: e' dentro il palco");
  ok(/stagePanelView==="planimetria" \? "venueBtnDone" : "bStageDone"/.test(blocco),
     "e la maniglia del palco preme il «Fatto» della vista aperta");
  /* I bottoni «Fatto» devono ESISTERE, o l'aggancio non fa niente in silenzio: al primo giro
     avevo scritto «stageDone», che non esiste. */
  const html = readFileSync(join(root, "app/index.html"), "utf8");
  ["bEventoDone", "bStageDone", "areaDone", "venueBtnDone"].forEach((id) => {
    ok(html.indexOf('id="' + id + '"') > 0, "il bottone " + id + " esiste davvero");
    ok(blocco.indexOf(id) > 0, "ed e' quello che il gesto preme");
  });
  /* Nel markup i pannelli lasciano lo spazio alla striscia, e la planimetria NO: la sua barretta
     sarebbe la seconda nello stesso punto. */
  ok(/#eventoSec, #stageEditPanel, #areaEditPanel\{position:relative;padding-top:26px\}/.test(stylesCss),
     "i tre pannelli fanno posto alla maniglia");
  ok(!/#venuePanel\{position:relative/.test(stylesCss), "la planimetria no");
  /* Escluso solo quello che si scrive: trascinare per selezionare del testo non deve chiudere. */
  /* PRESA IN CIMA (02/09): questi pannelli scorrono — la forma del palco ha 33 bottoni — e il
     gesto su tutto rubava lo scroll. La striscia dei primi 44 px basta per buttarli giù, e sotto
     il dito scorre come deve. È la differenza col menu, che non scorre e si prende da ovunque. */
  ok(/\}, "input,select,textarea", 44\)/.test(blocco), "si prendono dalla striscia in cima, non da tutto");
  ok(/#stageEditPanel::before\{|#stageEditPanel, #areaEditPanel/.test(stylesCss.replace(/\s+/g," ")) ||
     /#eventoSec::before, #stageEditPanel::before/.test(stylesCss),
     "e la barretta lo dice");
});

t("la forma del palco, sul telefono, chiede tre cose invece di trentatre", () => {
  /* «controlla la finestra palco su mobile, non funziona bene» (Simone, 02/09). Misurato: il
     pannello ha 33 bottoni, 10 campi e 11 etichette dentro un cassetto alto 46vh — denso quanto
     una schermata intera, mostrata un terzo alla volta.
     Su un telefono il palco è un rettangolo e le sue misure si cambiano dalla barra in alto: qui
     restano il totale, «+ Blocco», misura e posizione. Dietro «Opzioni tecniche» vanno semicerchio,
     lato curvo e ALTEZZA dei blocchi — che è rigging, si decide col service. */
  ["#bAddSemi", "#blkHWrap", "#blkFlatWrap"].forEach((sel) => {
    ok(new RegExp("body:not\\(\\.props-pro\\) #stageEditPanel " + sel.replace("#", "#")).test(stylesCss),
       sel + " sta dietro le opzioni tecniche");
  });
  /* Quello che resta NON si tocca. */
  ["bAddBlock", "blkW", "blkD", "blkPosGrid", "stageTotal"].forEach((id) => {
    ok(!new RegExp("props-pro\\) #stageEditPanel #" + id + "\\b").test(stylesCss),
       id + " resta sempre in vista: e' il minimo per fare un palco");
  });
  /* Col semicerchio nascosto «+ Blocco» resta solo: prende tutta la riga invece di mezza. */
  ok(/body:not\(\.props-pro\) #stageEditPanel \.row #bAddBlock\{flex:1 1 100%\}/.test(stylesCss),
     "e il bottone rimasto solo si allarga");
  /* L'altezza dei blocchi ha un id, o dal CSS non la si raggiunge. */
  const html = readFileSync(join(root, "app/index.html"), "utf8");
  ok(/id="blkHWrap"/.test(html), "l'altezza ha un aggancio");
  /* E l'aiuto non nomina l'altezza, che li' non c'e' piu': visto sul simulatore iPhone, diceva
     «regola misura e ALTEZZA con + / −» accanto a un pannello dove l'altezza era nascosta. */
  /* «Palco base» compariva DUE volte: chip verde selezionato nella lista, e titolo subito sotto.
     Visto sul simulatore iPhone il 02/09 — dal codice sembravano due cose diverse. */
  ok(/body:not\(\.props-pro\) #stageEditPanel #blkTitle\{display:none\}/.test(stylesCss),
     "il titolo del blocco non ripete il chip gia' selezionato");
  const html2 = readFileSync(join(root, "app/index.html"), "utf8");
  const mob = (html2.match(/class="hint mob-hint"[^>]*>([^<]*)</) || ["", ""])[1];
  ok(mob && !/altezza/i.test(mob), "l'aiuto non promette l'altezza: «" + mob + "»");
  /* Col mouse resta tutto: li' lo spazio c'e'. */
  const fuori = stylesCss.replace(/@media \(max-width:880px\)\{[\s\S]*?\n\}/g, "");
  ok(!/#stageEditPanel #bAddSemi/.test(fuori), "col mouse non si nasconde niente");
});

t("la finestra Evento si legge prima di compilarla", () => {
  /* «graficamente dev'essere sistemata» (Simone, 02/09). Prima: quattro etichette in fila senz'aria,
     data e orario appiccicati, e la spiegazione in grigio chiaro da 11px SOTTO a tutto — dove la
     leggi dopo aver compilato, cioe' mai. */
  const html = readFileSync(join(root, "app/index.html"), "utf8");
  const sec = html.slice(html.indexOf('id="eventoSec"'), html.indexOf('id="selProps"'));
  ok(/class="ev-intro"/.test(sec), "la frase che spiega a cosa servono i campi");
  ok(sec.indexOf("ev-intro") < sec.indexOf("titoloEv"), "e sta PRIMA dei campi, non dopo");
  ok(!/class="hint"[^>]*font-size:11px/.test(sec), "non c'e' piu' il grigio chiaro da 11px in fondo");
  ok(/class="ev-datetime"/.test(sec), "data e orario sono un blocco solo");
  /* Le etichette hanno un `for`: toccare l'etichetta porta nel campo, che su un telefono conta. */
  ok(/<label for="titoloEv">/.test(sec) && /<label for="evDateM">/.test(sec), "le etichette portano al campo");
  ok(/#eventoSec input\{min-height:44px\}/.test(bloccoCoarse(stylesCss)), "e i campi reggono il dito");
});

t("l'area di stampa si legge anche su un telefono", () => {
  /* «controllala perché è parecchio incasinata» (Simone, 02/09). C'erano QUATTRO campi numerici
     affiancati — Larghezza, Profondità, X origine, Y origine — in `1fr 1fr 1fr 1fr`: su un telefono
     quattro caselle da novanta pixel con dentro un decimale, e l'etichetta che non ci sta. */
  const html = readFileSync(join(root, "app/index.html"), "utf8");
  ok(/class="pa-nums"/.test(html), "la griglia dei campi ha un aggancio");
  ok(/class="pa-pre"/.test(html), "e la riga dei bottoni pure");
  ok(/#printAreaModal \.pa-nums\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)\}/.test(stylesCss),
     "col dito i campi vanno a due per riga, non quattro");
  ok(/#printAreaModal \.pa-pre \.btn\{flex:1 1 100%\}/.test(stylesCss), "e i bottoni a capo");
  ok(/#printAreaModal \.pa-nums input\{min-height:44px\}/.test(stylesCss), "coi campi che reggono il dito");
  /* Col mouse restano quattro affiancati: lì lo spazio c'e'. */
  const fuori = stylesCss.replace(/@media \(max-width:880px\)\{[\s\S]*?\n\}/g, "");
  ok(!/#printAreaModal \.pa-nums\{grid-template-columns:repeat\(2/.test(fuori), "col mouse non cambia niente");
});

t("toccare un campo non fa zoomare Safari", () => {
  /* IL DIFETTO PIU' SENTITO DEL TELEFONO. Un campo sotto i 16px fa zoomare Safari al focus, e il
     telefono resta ingrandito finche' non si fa pinch a mano. L'app ha 31 campi sotto quella
     soglia — quasi ogni modifica da telefono passa dal pannello proprieta', che sta a 13px.
     C'era UNA difesa, `.stpr input{font-size:16px}`, e la riga SUBITO DOPO la annullava
     rimettendo 15px: stesso selettore, stessa specificita', stesso blocco. Il commento dichiarava
     un'intenzione che il CSS non eseguiva. */
  const iReg = stylesCss.indexOf("input, select, textarea{font-size:16px !important}");
  ok(iReg > 0, "sul telefono i campi sono a 16px, tutti insieme");
  /* E DAVVERO: senza `!important` la riga ha specificita' (0,0,1) e perde contro QUALUNQUE regola
     con una classe o un id — 24 su 25, misurate il 02/09: `#props input` a 13px, `.qa-input` della
     ricerca a 14,5, `.mcard select` a 14, `.stpr input` a 13. Cioe' proprio i campi che si toccano
     da telefono. Qui si contano i colpevoli: se qualcuno togliesse l'`!important`, questo numero
     tornerebbe a essere quello vero e il test lo direbbe. */
  const piuForti = (stylesCss.match(/[#.][^\n{]*\b(?:input|select|textarea)[^\n{]*\{[^}]*font-size:(?:[0-9]|1[0-5])(?:[.,][0-9])?px/g) || []);
  ok(piuForti.length > 0 && /!important/.test(stylesCss.slice(iReg, iReg + 60)),
     "e vince sulle " + piuForti.length + " regole piu' forti che li rimpicciolirebbero");
  /* E nessuna regola DOPO, dentro lo stesso blocco, li riporta sotto: era esattamente il difetto —
     `.stpr input{font-size:16px}` seguita da `.stpr input{...font-size:15px}`. Si guarda solo il
     resto di quel blocco, non tutto il file: le misure del desktop stanno piu' su e sono giuste. */
  const dopo = stylesCss.slice(iReg + 40, iReg + 900);
  const colpevoli = (dopo.match(/[^\n]*\b(?:input|select|textarea)[^\n]*font-size:(?:[0-9]|1[0-5])(?:\.[0-9])?px[^\n]*/g) || []);
  eq(colpevoli.length, 0, "nessuna riga dopo rimette i campi sotto i 16: " + colpevoli.join(" | "));
  /* Col mouse restano le misure di sempre: 16px ovunque sul desktop sarebbe un altro font. */
  const desk = stylesCss.slice(0, stylesCss.indexOf("@media (max-width:880px){"));
  ok(!/input, select, textarea\{font-size:16px\}/.test(desk), "col mouse non cambia niente");
});

t("bottoni e campi hanno il font dell'app, non quello del browser", () => {
  /* In HTML button/input/select/textarea NON ereditano il font: prendono quello dello UA — Arial su
     Chrome e Android. Era rattoppato in una ventina di punti e dimenticato in 48 regole, fra cui
     `.btn` (OGNI bottone) e i campi del pannello proprieta'. Su Mac quasi non si vede; su Android
     e Windows sono due caratteri diversi nello stesso pannello. */
  ok(/button, input, select, textarea\{font-family:inherit\}/.test(stylesCss),
     "una riga sola, e vale per tutti");
  /* Dichiarata prima del body, cosi' ogni regola successiva puo' ancora sovrascriverla. */
  const iReset = stylesCss.indexOf("button, input, select, textarea{font-family:inherit}");
  const iBody = stylesCss.indexOf("body{font-family:var(--font-ui)");
  ok(iReset > 0 && iBody > iReset, "e sta prima del body");
});

t("i due dati che il fonico legge non sono i piu' piccoli dell'app", () => {
  /* `.p48b` (il badge +48V) e `.pamp` (l'assorbimento in ampere) stavano a 8,5px: erano i due
     testi piu' piccoli di tutta l'app, e sono i due che contano di piu' — il phantom su un
     microfono a nastro passivo lo rompe, gli ampere dicono se la linea regge. */
  ok(/\.patch-row \.p48b\{[^}]*font-size:11px/.test(stylesCss), "il +48V si legge");
  ok(/\.patch-row \.pamp,\.pload \.pamp\{[^}]*font-size:11px/.test(stylesCss), "e gli ampere pure");
  /* E la barra di navigazione del telefono, che era a 9,5px. */
  ok(/#mDock button\{[^}]*font:600 11px/.test(stylesCss), "e il dock del telefono");
});

t("le icone della barra mobile hanno tutte lo stesso spessore", () => {
  /* Nella stessa riga di quattro icone, «Aggiungi» era a stroke-width 2 e le altre a 1.8. E' la
     cosa piu' visibile fra le incoerenze: quattro icone affiancate, una piu' grassa. */
  const html = readFileSync(join(root, "app/index.html"), "utf8");
  const i = html.indexOf('<button data-dock="add"');
  ok(i > 0, "il dock esiste");
  const dock = html.slice(i, html.indexOf("</nav>", i));
  const sp = [...new Set((dock.match(/stroke-width="([0-9.]+)"/g) || []))];
  eq(sp.length, 1, "uno spessore solo in tutta la barra: " + sp.join(", "));
});

t("nelle finestre, le X e i contatori reggono il dito", () => {
  /* «su mobile guarda e ottimizza ogni finestra» (Simone, 02/09). Cercando nel CSS i controlli con
     un'altezza dichiarata sotto i 44 px che nessuna regola per il dito ingrandiva, restavano le X
     che chiudono e i +/− dei contatori — quelli che si premono più volte di fila, dove sbagliare
     tocco costa. */
  const coarse = bloccoCoarse(stylesCss);
  const attesi = {
    ".exp-close": "la X di Esporta",
    ".avatar-btn": "l'avatar",
    ".avatar-btn-m": "l'avatar su mobile",
    ".learn-card .learn-close": "la X delle card",
    ".lite-btn": "i bottoni leggeri",
    "#props .btn.cnt-b": "i +/− dei contatori",
  };
  Object.keys(attesi).forEach((sel) => {
    const re = new RegExp(sel.replace(/[.#*+?^${}()|[\]\\]/g, "\\$&") + "\\{[^}]*(?:min-)?(?:width|height):44px");
    ok(re.test(coarse), attesi[sel] + " arriva a 44 px col dito (" + sel + ")");
  });
  /* Col mouse restano le misure di sempre. */
  const fuori = stylesCss.replace(/@media \(pointer:coarse\)\{[^@]*/g, "");
  ok(/\.exp-close\{[^}]*width:30px/.test(fuori), "col mouse la X resta a 30 px");
  /* E la regola sta IN FONDO: dentro #props e .learn-card serve la stessa specificita' E l'ordine. */
  ok(stylesCss.lastIndexOf("#props .btn.cnt-b{width:44px") > stylesCss.indexOf("#props .btn.cnt-b{width:26px"),
     "e viene dopo quella che li dimensiona, o non vincerebbe");
});

t("i bottoni che chiudono senza fare niente sono rossi", () => {
  /* Simone dal telefono: «su esporta il pulsante annulla dev'esser in rosso», «anche su condividi
     il bottone chiudi», «la X in alto a destra di quella finestra dev'essere rossa». */
  const html = readFileSync(join(root, "app/index.html"), "utf8");
  ok(/class="btn danger" id="pdfCancel"/.test(html), "Esporta → Annulla");
  ok(/class="btn danger" id="shareClose"/.test(html), "Condividi → Chiudi");
  ok(/class="cat-sheet-close danger"/.test(appjs), "catalogo → la X");
  /* La X aveva gia' `#catalog .cat-sheet-close` che imposta background e color: la sola classe
     non basta, serve la stessa specificita' E venire dopo. */
  const iBase = stylesCss.indexOf("#catalog .cat-sheet-close{width:32px");
  const iRosso = stylesCss.indexOf("#catalog .cat-sheet-close.danger");
  ok(iBase > 0 && iRosso > iBase, "e la regola rossa viene dopo quella che la colora");
});

t("da telefono si possono scrivere data, ora e aggancio", () => {
  /* Tre controlli vivevano SOLO nell'header, che su mobile è display:none:
     · data e orario dell'evento — che finiscono nell'intestazione del rider;
     · l'aggancio alla griglia, inchiodato a 25 cm senza modo di cambiarlo.
     Ora ci sono due campi per lo stesso dato — header (mouse) e pannello (telefono) — che scrivono
     nello stesso posto e si riallineano a vicenda. Provato nel browser: scritti dal pannello
     mobile finiscono in `state.evDate`/`evTime` e nel chip dell'evento. */
  const html = readFileSync(join(root, "app/index.html"), "utf8");
  ok(/id="evDateM"/.test(html) && /id="evTimeM"/.test(html), "data e orario ci sono nel pannello Evento");
  ok(/id="snapSelM"/.test(html), "e l'aggancio nel pannello Palco");
  /* Lo stesso dato, non due copie che divergono. */
  ok(/function setData\(v\)\{ state\.evDate=v\|\|"";[\s\S]{0,120}edM\.value=state\.evDate/.test(appjs),
     "scrivono nello stesso stato e riallineano l'altro campo");
  /* I due select si allineavano solo l'uno all'altro, e solo su `change`: quello del telefono
     partiva sempre da «25 cm» del markup anche con `snapMode` diverso — apri un progetto salvato
     su «Libero» e il pannello ti diceva 25. Ora c'è un punto solo che li allinea allo STATO. */
  ok(/function syncSnapSelects\(\)\{/.test(appjs), "e l'aggancio pure");
  ok(/if\(a\) a\.value=snapMode; if\(b\) b\.value=snapMode;/.test(appjs), "e legge lo stato, non l'altro select");
  const iRs = appjs.indexOf("function renderStagePanel");
  ok(/syncSnapSelects\(\);/.test(appjs.slice(iRs, iRs + 900)),
     "e si riallinea ogni volta che il pannello palco si apre");
  /* E all'apertura mostrano quello che c'e' gia' salvato. */
  ok(/\["evDate","evDateM"\]\.forEach/.test(appjs), "all'apertura mostrano il valore salvato");
  /* Il campo dell'aggancio si vede solo col dito: col mouse c'e' gia' nell'header. */
  ok(/class="mob-hint" id="snapRowM"/.test(html), "e col mouse non si duplica");
});

t("sul telefono la finestra Esporta chiede tre cose, non trenta", () => {
  /* Trenta controlli, e su un telefono serve premere «Scarica». Restano l'anteprima, il nome, il
     formato e l'orientamento; il resto sta dietro la STESSA preferenza del pannello elemento —
     chi accende «tecnico» lo accende una volta, non due. */
  ["pdfTechBox", "pdfAreaRow", "pdfScaleRow", "pdfHdrRow", "pdfTechRow"].forEach((id) => {
    ok(new RegExp("body:not\\(\\.props-pro\\) #" + id).test(stylesCss), id + " sta dietro il bottone");
  });
  const html = readFileSync(join(root, "app/index.html"), "utf8");
  /* I due contenitori non avevano un id: senza, dal CSS non si potevano raggiungere. */
  ok(/id="pdfScaleRow"/.test(html), "la riga della scala ha un aggancio");
  ok(/id="pdfHdrRow"/.test(html), "e quella dell'intestazione pure");
  ok(/id="pdfProBtn"/.test(html), "e c'e' il bottone per rivelarle");
  /* E IL BOTTONE SI VEDE DAVVERO. `.exp-pro{display:none}` era scritta DOPO la regola che lo mostra,
     quindi vinceva sempre e il bottone non compariva mai — verificato sul simulatore iPhone il
     02/09, dove semplicemente non c'era. È la quinta volta in un giorno che una regola nuova perde
     per ordine o specificità: la dichiarazione base va PRIMA, e fuori da ogni media. */
  const iBase = stylesCss.indexOf("#pdfModal .exp-pro, .exp-pro{display:none}");
  const iMostra = stylesCss.indexOf("#pdfModal .exp-pro{display:block");
  ok(iBase > 0 && iMostra > iBase, "la regola che lo nasconde viene PRIMA di quella che lo mostra");
  /* Fuori da ogni media, o sul desktop non ci sarebbe niente a nasconderlo. */
  const primaDiBase = stylesCss.slice(0, iBase);
  const aperte = (primaDiBase.match(/\{/g) || []).length - (primaDiBase.match(/\}/g) || []).length;
  eq(aperte, 0, "ed e' dichiarata fuori da ogni @media");
  /* L'anteprima e il bottone che scarica NON si toccano mai. */
  ["pdfPreview", "pdfGo"].forEach((id) => {
    ok(!new RegExp("props-pro\\) #" + id).test(stylesCss), id + " resta sempre: e' il senso della finestra");
  });
  /* UNA preferenza, TRE bottoni: pannello elemento, finestra Esporta e — dal 02/09 — «Forma del
     palco», dove il CSS nasconde dietro `props-pro` altezza, semicerchio e lato curvo e non c'era
     niente da premere: quei blocchi si creavano su desktop e da telefono non si correggevano piu'. */
  ok(/function proRegistra\(/.test(appjs), "c'e' un solo posto che accende la preferenza");
  const registrati = (appjs.match(/proRegistra\(/g) || []).length - 1;   /* meno la dichiarazione */
  eq(registrati, 3, "e i bottoni registrati sono tre");
  ["pdfProBtn", "stageAdvMob"].forEach((id) => {
    ok(new RegExp('proRegistra\\(document\\.getElementById\\("' + id + '"\\)').test(appjs), id + " e' fra questi");
  });
  ok(/proRegistra\(adv, /.test(appjs), "e il terzo e' quello del pannello elemento");
  /* L'etichetta si leggeva PRIMA del ripristino da localStorage: chi aveva acceso la preferenza
     rientrava con le opzioni gia' aperte e il bottone che diceva «Altre opzioni». */
  const iRipristino = appjs.indexOf('localStorage.getItem("sp_props_pro")');
  const iPrimoUso = appjs.indexOf("proRegistra(document.getElementById");
  ok(iRipristino > 0 && iRipristino < iPrimoUso, "il ripristino viene prima di ogni etichetta");
});

t("i menu a tendina del pannello reggono il dito", () => {
  /* Misurati nel browser l'01/09: TUTTI E 40 i select di #props stavano a 28 px, sotto i 44 della
     regola. Non e' il campo «Ingressi» nuovo ad essere sbagliato: lo era la famiglia intera, e il
     campo nuovo l'ha solo fatta vedere. Da qui si dichiarano modello, taglia e numero di ingressi:
     e' il pannello con cui si rende vero un rider. */
  const coarse = bloccoCoarse(stylesCss);
  ok(/#props select\{[^}]*min-height:44px/.test(coarse), "i select del pannello arrivano a 44 px col dito");
  const fuori = stylesCss.replace(/@media \(pointer:coarse\)\{[^@]*/g, "");
  ok(!/#props select\{[^}]*min-height:44px/.test(fuori), "e col mouse restano quelli di sempre");
});

t("il desktop non cambia: le regole valgono solo per il dito", () => {
  /* Tutte le misure nuove stanno dentro @media (pointer:coarse): col mouse non si applicano.
     Verificato nel browser — col puntatore fine le altezze restano 28/32/11/30, quelle di sempre. */
  const fuori = stylesCss.replace(/@media \(pointer:coarse\)\{[^@]*/g, "");
  ok(!/\.cat-head[^{]*\{[^}]*min-height:44px/.test(fuori), "il catalogo non cresce col mouse");
  ok(!/\.layer-row[^{]*\{[^}]*min-height:44px/.test(fuori), "né le righe delle liste");
});

/* ═══ USATO DA BAND (31/08) ═══════════════════════════════════════════════════════════════════════
   Percorso completo come lo farebbe una band: benvenuto → modello Band → «Formazione tipica» →
   nome del progetto → liste → esporta. Due attriti trovati usandolo, non leggendo il codice. */
t("a chi non ha la stage box non si dice che ha sbagliato", () => {
  /* Il programma lo diceva TRE VOLTE a una band appena creato il palco: nell'audit, nella testata
     della lista ingressi, e col ⚡ su tutte e quattordici le righe. Ma il rider di una band non
     contiene la stage box: la porta il service. Il gemello sull'elettrico lo diceva già
     («Lo aggiunge il service»), questo no. */
  ok(!/nessuna stage box reale/.test(appjs), "sparita la formulazione che suonava come un errore");
  ok(/la porta il service, se non la disegni tu/.test(appjs), "ora dice di chi è il pezzo");
  /* E la testata della lista: con UNA box il conteggio serve a chi cabla e resta com'era; senza
     NESSUNA box parla a chi il cablaggio non lo fa. */
  const fn = appjs.slice(appjs.indexOf("txt.innerHTML = boxReali.length"), appjs.indexOf("txt.innerHTML = boxReali.length") + 600);
  ok(/canali da collegare/.test(fn), "con la box: quanti canali restano");
  ok(/li collega il service/.test(fn), "senza box: chi li collegherà");
  ok(/Aggiungi una stage box se vuoi disegnarlo tu/.test(fn), "e la porta resta aperta");
});

t("le pagine suggerite si prendono con un clic solo", () => {
  /* Le pagine del PDF partono tutte spente per scelta (16/08: «il bordo verde dice quali
     servirebbero, senza deciderlo»), e quella scelta resta. Ma per prendere le suggerite bisognava
     cliccarle una per una, o prendersi «Tutte le pagine» — che ne aggiunge anche di inutili.
     Usandolo da band: creato il modello e cliccato Esporta, il PDF era «solo palco», cioè senza la
     lista ingressi, che è la ragione per cui uno è venuto qui. */
  ok(/Aggiungi le "\+nSugg\+" suggerite/.test(appjs), "il bottone c'è e dice quante sono");
  const fn = appjs.slice(appjs.indexOf("if(nSugg>0){"), appjs.indexOf("var rest=_pdfTechPages.length-nSel;"));
  ok(/Object\.keys\(sugg\)\.forEach/.test(fn), "aggiunge SOLO quelle suggerite dal palco");
  ok(!/\_pdfTechPages\.forEach/.test(fn), "non tutte: «Tutte le pagine» è un altro bottone");
  ok(/pdfRememberPages\(\)/.test(fn), "e la scelta si ricorda, come per le altre");
  /* Compare solo se ci sono suggerimenti: un bottone «aggiungi le 0 suggerite» è rumore. */
  ok(/if\(nSugg>0\)\{/.test(appjs), "senza suggerimenti non compare");
  /* Resta un'azione secondaria: la decisione è di chi esporta. */
  ok(/\.pill\.ghost\.sugg-all\{[^}]*border:1px solid/.test(stylesCss), "si distingue dalle pillole");
  ok(!/\.pill\.ghost\.sugg-all\{[^}]*background:var\(--accent\)/.test(stylesCss), "ma non è un bottone primario");
});

/* ═══ IL PALCO VUOTO DICE COSA FARE (01/09) ═══════════════════════════════════════════════════════
   Provato da utente nuovo: chiuso il benvenuto senza scegliere un modello si resta davanti a un
   rettangolo con FONDO PALCO e PUBBLICO, e nient'altro. Il catalogo e' li' a sinistra ma niente
   dice di usarlo, e la spiegazione del benvenuto e' appena sparita per sempre. Zero indicazioni. */
t("il palco vuoto dice come si comincia", () => {
  ok(/function stageEmptyHintMarkup\(\)/.test(appjs), "c'è il suggerimento dello stato vuoto");
  const fn = appjs.slice(appjs.indexOf("function stageEmptyHintMarkup"), appjs.indexOf("function stageLayerMarkup"));
  /* Sparisce al primo elemento: da lì in poi sarebbe rumore sopra il lavoro di qualcuno. */
  ok(/if\(\(state\.items\|\|\[\]\)\.length\) return '';/.test(fn), "col primo elemento sparisce");
  /* Non entra MAI nei documenti: nel PDF e in sola lettura un palco vuoto è un palco vuoto, non
     un invito rivolto a chi sta solo guardando. */
  ok(/__cabStatic \|\| document\.body\.classList\.contains\("viewmode"\)/.test(fn),
     "fuori dal PDF e dalla vista condivisa");
  /* Dice il gesto giusto per il dispositivo: sul telefono il catalogo non è «a sinistra», è dietro
     il bottone «Aggiungi» del dock. */
  ok(/isMobile\(\)/.test(fn), "distingue telefono e desktop");
  ok(/Tocca «Aggiungi» qui sotto/.test(fn), "su telefono nomina il bottone del dock");
  ok(/catalogo a sinistra/.test(fn), "su desktop indica il catalogo");
  /* È scritto nel markup del palco, quindi segue lo zoom e resta al centro. */
  ok(/stageLayerMarkup[\s\S]{0,400}stageEmptyHintMarkup\(\)/.test(appjs), "vive nel layer del palco");
  /* Non deve rubare i clic: chi sa già cosa fare clicca il palco sotto. */
  ok(/\.stage-empty-hint\{[^}]*pointer-events:none/.test(stylesCss), "non intercetta i clic");
});

/* ═══ SBAGLIARE E TORNARE INDIETRO (01/09) ════════════════════════════════════════════════════════
   Provato da utente nuovo: selezionato un elemento e premuto «Elimina», a schermo non succedeva
   NIENTE — nessuna conferma di cosa fosse successo, e per rimediare bisognava indovinare che
   l'iconcina da 19×32 px in alto (solo tooltip «Annulla (⌘Z)») fosse l'annulla. In qualunque
   programma di oggi, dopo un'azione che toglie qualcosa compare la scritta con «Annulla» accanto:
   è lì che uno la cerca. È la categoria «rischio di perdere il lavoro». */
t("dopo un'eliminazione si vede cosa è successo, e come tornare indietro", () => {
  const fn = appjs.slice(appjs.indexOf("function deleteSel()"), appjs.indexOf("function applyStageWidth"));
  ok(/window\.__toast\(/.test(fn), "l'eliminazione lo dice");
  ok(/label:"Annulla"/.test(fn), "e offre la via d'uscita");
  ok(/typeof undo==="function"\) undo\(\)/.test(fn), "che è l'annulla vero, non un rimedio a parte");
  /* Singolare e plurale: «1 elementi eliminati» è il genere di sciatteria che fa sembrare rotto
     tutto il resto. */
  ok(/quanti===1 \? "Elemento eliminato" : quanti\+" elementi eliminati"/.test(fn), "conta bene");
});

t("il messaggio può portare un'azione, e le chiamate di prima non cambiano", () => {
  const fn = appjs.slice(appjs.indexOf("function toast(msg, isErr, azione)"), appjs.indexOf("try{ window.__toast=toast"));
  ok(fn.length > 100, "il toast accetta un'azione");
  /* Terzo parametro FACOLTATIVO: nel programma ci sono decine di toast semplici, e nessuno deve
     cambiare. */
  ok(/if\(azione && typeof azione\.run==="function"\)/.test(fn), "senza azione si comporta come prima");
  /* Un messaggio con un bottone da leggere e raggiungere vuole più dei 3,2 s di uno semplice. */
  ok(/azione \? 7000 : 3200/.test(fn), "e resta a schermo più a lungo");
  /* Cliccando l'azione il messaggio se ne va: lasciarlo lì farebbe credere che non sia successo nulla. */
  ok(/toastEl\.hidden=true; if\(toastT\) clearTimeout\(toastT\); azione\.run\(\)/.test(fn),
     "il clic chiude il messaggio ed esegue");
  /* È un bottone vero: raggiungibile da tastiera e da dito. */
  ok(/createElement\("button"\)/.test(fn), "è un <button>");
  ok(/\.toast-act:focus-visible\{outline:2px solid #fff/.test(stylesCss), "col fuoco si vede");
  ok(/@media \(pointer:coarse\)\{ \.toast-act\{min-height:44px/.test(stylesCss), "e su telefono è da dito");
  /* Su telefono il messaggio finiva SOPRA il dock, coprendo per 27 px i quattro bottoni (Aggiungi ·
     Esporta · Condividi · Menu) per tutti i sette secondi in cui resta. Il «bottom» stava inline
     nell'HTML, dove nessuna media query poteva toccarlo: ora è nel foglio di stile e sul telefono
     sale sopra la barra, con la stessa variabile che usa il riepilogo del modello. */
  ok(/#cloudToast\{bottom:26px\}/.test(stylesCss), "la posizione è nel CSS, non inline");
  ok(/@media \(max-width:880px\)\{ #cloudToast\{bottom:calc\(var\(--dock-h,64px\) \+ 12px\)\} \}/.test(stylesCss),
     "e su telefono sta sopra il dock");
  const app = readFileSync(join(root, "app/index.html"), "utf8");
  ok(!/id="cloudToast"[^>]*bottom:26px/.test(app), "niente più bottom inline che nessuna regola può battere");
});

/* ═══ LE MISURE DEL PALCO (01/09) ═════════════════════════════════════════════════════════════════
   Scenario 3, con la domanda più ovvia che si possa fare: «il mio palco è 8×5, come lo cambio?».
   Si clicca sulla riga che dice «12 × 8 m» e si apre il riepilogo di aste e leggii. Le misure stanno
   in «Forma del palco», che vive nel CATALOGO — dove si prendono gli elementi, non dove si configura
   il palco: nessuno ci arriva cercando un'impostazione. */
t("la misura del palco porta dove si cambia", () => {
  const fn = appjs.slice(appjs.indexOf('if(L.id==="stage"){\n    var cnt=row.querySelector(".layer-cnt")'),
                          appjs.indexOf("var _apriChiudi=function(e)"));
  ok(fn.length > 100, "la riga del palco tratta la sua misura in modo speciale");
  ok(/cnt\.classList\.add\("cnt-apri"\)/.test(fn), "la misura è marcata come bersaglio");
  ok(/toggleStageEdit/.test(fn), "e apre «Forma del palco», non una copia dei campi");
  ok(/e\.stopPropagation\(\)/.test(fn), "senza far scattare anche l'apri/chiudi della riga");
  /* Il resto della riga continua a fare quello che faceva: non si toglie niente. */
  ok(/closest\(".layer-cnt.cnt-apri"\)\) return;/.test(appjs), "il click sulla misura non cambia il fuoco");
  /* Si deve vedere che è toccabile, ma resta una didascalia, non un bottone in mezzo alla riga. */
  ok(/\.layer-cnt\.cnt-apri\{cursor:pointer/.test(stylesCss), "ha il cursore giusto");
  ok(/@media \(pointer:coarse\)\{ \.layer-cnt\.cnt-apri\{min-height:44px/.test(stylesCss),
     "e su telefono è da dito");
});

t("il palco misura lo stesso in tutti i posti dove è scritto", () => {
  /* «16 × 7 m» nella riga contro «16 m × 6,5 m» nel pannello, visibili INSIEME appena si clicca
     sulla misura: Math.round(650/100) faceva sparire mezzo metro di palco su uno strumento che si
     chiama «in scala». Ora la riga usa fmtM, la stessa funzione del pannello. */
  const fn = appjs.slice(appjs.indexOf("function layerSummary"), appjs.indexOf("function layerSummary") + 900);
  ok(/fmtM\(s\.w\|\|0\)/.test(fn) && /fmtM\(s\.d\|\|0\)/.test(fn), "usa fmtM, come il pannello");
  ok(!/Math\.round\(\(s\.[wd]\|\|0\)\/100\)/.test(fn), "niente più arrotondamento all'intero");
  /* fmtM tiene un decimale e non ne inventa: 6,5 resta 6,5 e 6 non diventa «6,0». */
  ok(/maximumFractionDigits:1/.test(appjs), "un decimale quando serve, nessuno quando non serve");
});

/* ═══ QUELLO CHE FALLIVA IN SILENZIO (02/09) ══════════════════════════════════════════════════════
   Sei punti in cui l'app faceva una cosa e ne raccontava un'altra — o non raccontava niente.
   Non sono bug di calcolo: sono bugie. Il metro di questi test e' il comportamento, non il sorgente:
   dove si puo', la funzione vera viene CHIAMATA e si guarda cosa fa. */

/* Sostituisce temporaneamente un pezzo del sandbox e lo rimette a posto: senza il ripristino un
   localStorage rotto resterebbe rotto per tutti i test successivi. */
function conSandbox(mod, fn) {
  const prima = {};
  Object.keys(mod).forEach((k) => { prima[k] = A[k]; A[k] = mod[k]; });
  try { return fn(); } finally { Object.keys(prima).forEach((k) => { A[k] = prima[k]; }); }
}
/* localStorage che rifiuta OGNI scrittura: e' quello di un archivio pieno, o di una pagina dove il
   browser ha disattivato lo storage. saveVersion in quel caso torna false. */
function storagePieno() {
  return { getItem: () => null, removeItem: () => {},
           setItem: () => { const e = new Error("quota"); e.name = "QuotaExceededError"; throw e; } };
}

t("cancellando una scena, il punto di ripristino promesso o c'è o non si elimina", () => {
  /* La finestra di conferma dice testualmente «Resta un punto di ripristino: File → Punti di
     ripristino…», ma deleteVariant chiamava saveVersion dentro un try/catch e ne BUTTAVA VIA il
     valore. saveVersion torna false per davvero: archivio pieno anche dopo aver potato lo storico,
     o planimetria non referenziabile. Quando succedeva, la scena spariva, resetHistory toglieva pure
     il ⌘Z, e la rete promessa non esisteva. Misurato chiamando deleteVariant con un localStorage che
     rifiuta ogni scrittura: prima la scena spariva lo stesso. */
  ok(/Resta un punto di ripristino/.test(appjs), "la promessa è ancora scritta nella conferma");
  const messaggi = [];
  conSandbox({ localStorage: storagePieno(), __toast: (m, err) => messaggi.push({ m, err }) }, () => {
    A.VARIANTS.push({ id: "__t_scena", name: "Scena B", state: { items: [] } });
    const quante = A.VARIANTS.length;
    const esito = A.deleteVariant("__t_scena");
    eq(esito, false, "deleteVariant dichiara di non aver fatto niente:");
    eq(A.VARIANTS.length, quante, "la scena è ancora lì:");
    ok(messaggi.length === 1, "e l'utente lo viene a sapere");
    ok(/non creato/.test(messaggi[0].m), "il messaggio dice qual è il problema");
    ok(messaggi[0].err === true, "ed è un messaggio d'errore, non una nota di colore");
  });
  /* La guardia non deve bloccare il caso normale: con lo spazio a posto la scena se ne va davvero. */
  conSandbox({ localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} }, __toast: () => {} }, () => {
    const quante = A.VARIANTS.length;
    eq(A.deleteVariant("__t_scena"), true, "con lo spazio a posto si elimina:");
    eq(A.VARIANTS.length, quante - 1, "e la scena sparisce davvero:");
  });
});

t("la versione salvata a mano dice quando non è stata salvata", () => {
  /* Il bottone «Salva» del pannello «Punti di ripristino» chiamava saveVersion e ne ignorava il
     ritorno: il campo del nome si svuotava comunque e nell'elenco non compariva nessuna riga nuova.
     Il campo che si svuota È la conferma, per chi guarda: si esce di lì convinti di avere una copia.
     Misurato chiamando saveNamedVersion con lo storage pieno. */
  const messaggi = [];
  conSandbox({ localStorage: storagePieno(), __toast: (m, err, az) => messaggi.push({ m, err, az }) }, () => {
    eq(A.saveVersion("prova"), false, "premessa: qui saveVersion fallisce davvero");
    eq(A.saveNamedVersion("prova"), false, "e saveNamedVersion lo riporta:");
    ok(messaggi.length === 1 && messaggi[0].err === true, "l'utente lo viene a sapere");
    /* Non basta dire che è andata male: il messaggio porta il gesto che salva il lavoro. */
    ok(messaggi[0].az && typeof messaggi[0].az.run === "function", "e offre di scaricare una copia");
  });
  /* Il nome NON si cancella dopo un fallimento: chi riprova non deve ridigitarlo. */
  const h = appjs.slice(appjs.indexOf('document.getElementById("versSave")'), appjs.indexOf('document.getElementById("versSave")') + 400);
  ok(/if\(!saveNamedVersion\(n\)\) return;/.test(h), "il fallimento interrompe il gestore");
  ok(h.indexOf("saveNamedVersion") < h.indexOf('.value=""'), "prima si controlla, poi si svuota il campo");
});

/* Carica l'app come la carica il browser di chi apre un link condiviso: `?view=TOKEN` e una rete che
   accetta la richiesta e non risponde MAI. Serve uno stub DOM un po' meno cieco di quello dei
   motori — le classi sul body e i figli aggiunti vanno osservati — e un setTimeout che REGISTRA
   invece di eseguire, così la scadenza si può far scattare a comando. */
function apriComeLinkCondiviso() {
  const mkU = () => { const f = function () { return U; }; const U = new Proxy(f, {
    get: (t, k) => { if (k === Symbol.toPrimitive) return () => 0; if (k === "length") return 0; return U; },
    apply: () => U, construct: () => U, set: () => true, has: () => true }); return U; };
  const U = mkU();
  const classi = new Set(), timers = [], figli = [];
  const body = {
    classList: { add: (...a) => a.forEach((c) => classi.add(c)), remove: (...a) => a.forEach((c) => classi.delete(c)),
                 contains: (c) => classi.has(c), toggle: () => {}, item: () => null },
    appendChild: (n) => { figli.push(n); }, style: {}, dataset: {},
    addEventListener: () => {}, removeEventListener: () => {},
    querySelector: () => U, querySelectorAll: () => [], getAttribute: () => null, setAttribute: () => {},
  };
  const ctx = {
    console: { log: () => {}, warn: () => {}, error: () => {} },
    navigator: { serviceWorker: { register: () => ({ then: () => ({ catch: () => {} }) }) }, userAgent: "node" },
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    matchMedia: () => ({ matches: false, addEventListener: () => {}, addListener: () => {} }),
    setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; }, clearTimeout: () => {},
    setInterval: () => 0, clearInterval: () => {}, requestAnimationFrame: () => 0,
    addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => true,
    Event: function () {}, CustomEvent: function () {},
    fetch: () => new Promise(function () {}),   /* accettata e mai risolta: il caso che non era coperto */
    location: { search: "?view=TOK", href: "http://localhost/app/?view=TOK", pathname: "/app/" },
    performance: { now: () => 0 }, atob: (s) => s, btoa: (s) => s,
    URL, URLSearchParams, XMLSerializer: function () { this.serializeToString = () => ""; },
  };
  ctx.document = new Proxy({ body }, { get: (t, k) => {
    if (k === "body") return body;
    if (k === "createElement") return () => {
      const base = { style: {}, classList: { add() {}, remove() {}, contains: () => false, toggle() {} },
        setAttribute(a, v) { base[a] = v; }, getAttribute() { return null; }, appendChild() {}, remove() {},
        addEventListener() {}, removeEventListener() {}, querySelector: () => U, querySelectorAll: () => [],
        attachShadow() { return { innerHTML: "", querySelector: () => U }; } };
      return new Proxy(base, { get: (t2, k2) => (k2 in t2 ? t2[k2] : U), set: (t2, k2, v2) => { t2[k2] = v2; return true; } });
    };
    /* Solo il cartello d'attesa risponde "non c'è ancora": tutto il resto resta lo stub cieco, o il
       boot muore molto prima di arrivare al ramo `?view=`. */
    if (k === "getElementById") return (id) => (id === "viewWait" ? (figli.filter((f) => f.id === "viewWait")[0] || null) : U);
    return U;
  } });
  ctx.window = new Proxy(ctx, { get: (t, k) => (k in t ? t[k] : U), set: (t, k, v) => { t[k] = v; return true; } });
  ctx.self = ctx.window; ctx.globalThis = ctx;
  vm.createContext(ctx);
  try { vm.runInContext(appjs, ctx, { timeout: 20000 }); } catch (e) { /* il boot tocca il DOM: come in loadApp */ }
  return { classi, timers, figli };
}

t("il link condiviso che non arriva non lascia un palco vuoto credibile", () => {
  /* Le strade coperte erano due — «il server dice no» e «la rete cade» — e mancava la terza, che è
     la peggiore: la richiesta accettata che non torna mai. Un fetch appeso non rifiuta e non
     risolve, quindi né viewerFailed né startSession scattavano: chi apriva il link restava davanti
     al palco di DEFAULT, 12×8 con FONDO PALCO e la legenda dei layer. Un fonico di sala lo legge
     come «questo gruppo non ha bisogno di niente» — un documento credibile e falso, che è peggio
     di un errore. Misurato caricando l'app con ?view= e una fetch che non risponde mai: prima
     NESSUN timer veniva armato e il body restava sul palco di default. */
  const { classi, timers, figli } = apriComeLinkCondiviso();
  ok(classi.has("consult-pending"), "premessa: il ramo del link condiviso è stato eseguito");
  /* L'attesa si VEDE: `consult-pending` da sola non aveva nessuna regola di stile, era una classe muta. */
  const cartello = figli.filter((f) => f.id === "viewWait")[0];
  ok(!!cartello, "c'è un cartello d'attesa a schermo");
  ok(/Sto aprendo il progetto/.test(String(cartello.innerHTML || "")), "e dice cosa sta succedendo");
  ok(cartello.role === "status", "annunciato anche a chi usa lo screen reader");
  /* E ha una fine dichiarata: senza scadenza l'attesa durerebbe quanto la sessione. */
  const scadenze = timers.filter((x) => x.ms >= 5000);
  eq(scadenze.length, 1, "una scadenza sola, non zero e non tre:");
  eq(scadenze[0].ms, 20000, "venti secondi:");
  /* Far scattare la scadenza deve DAVVERO portare alla schermata di fallimento. */
  scadenze[0].fn();
  ok(classi.has("view-failed"), "scaduto il tempo, si dichiara il fallimento");
  ok(!classi.has("consult-pending"), "e l'attesa finisce");
  ok(/togliAttesa\(\);/.test(appjs) && /function togliAttesa\(\)\{ var w=document\.getElementById\("viewWait"\); if\(w&&w\.remove\) w\.remove\(\); \}/.test(appjs),
     "e il cartello viene tolto di mezzo");
});

t("una risposta in ritardo non riscrive la schermata già letta", () => {
  /* Con una scadenza in gioco compaiono due finali possibili per la stessa apertura. Se arrivassero
     entrambi, il viewer passerebbe da «non caricato» a «in diretta» (o viceversa) sotto gli occhi di
     chi sta leggendo. Chi arriva secondo non fa niente. */
  const fn = appjs.slice(appjs.indexOf("var ATTESA_MAX=20000;"), appjs.indexOf("var ATTESA_MAX=20000;") + 900);
  ok(/function concludi\(\)\{ if\(esito\) return false; esito=true;/.test(fn), "c'è un solo esito per apertura");
  ok(/clearTimeout\(scadenza\)/.test(fn), "e chi conclude spegne la scadenza");
  /* Tutte e tre le uscite passano di lì: fallimento, sessione live, progetto condiviso statico. */
  ok(/function viewerFailed\(perche\)\{\s*if\(!concludi\(\)\) return;/.test(appjs), "il fallimento");
  ok(/function startSession\(sb, token, d, isEditor\)\{\s*if\(!concludi\(\)\) return;/.test(appjs), "la sessione live");
  ok(/function startSharedProject\(token, d\)\{\s*if\(!concludi\(\)\) return;/.test(appjs), "il link di sola lettura");
});

t("anche la richiesta al musicista ha un tempo massimo", () => {
  /* Stessa storia su /richiesta/?t=: le due strade erano «risposta» e «errore di rete», e il fetch
     appeso non è né l'una né l'altra. Si restava su «Un attimo…» per sempre, senza nemmeno il modo
     di capire che era finita male. */
  const rich = readFileSync(join(root, "richiesta/index.html"), "utf8");
  ok(/Un attimo…/.test(rich), "premessa: l'attesa a schermo c'era già");
  ok(/setTimeout\(function\(\)\{[\s\S]{0,200}denied\(/.test(rich), "ora scade e lo dice");
  ok(/\}, 20000\);/.test(rich), "venti secondi, come nel viewer");
  /* Un finale solo: la risposta in ritardo non deve ridipingere sopra il messaggio già letto. */
  ok(/function primo\(\)\{ if\(apertura\) return false; apertura=true; clearTimeout\(scadenza\); return true; \}/.test(rich),
     "chi arriva secondo non fa niente");
  ok(/api\("GET"\)\.then\(function\(res\)\{\s*if\(!primo\(\)\) return;/.test(rich), "vale per la risposta");
  ok(/\}\)\.catch\(function\(\)\{\s*if\(!primo\(\)\) return;/.test(rich), "e per l'errore di rete");
});

t("l'elenco dei progetti non dice «nessuno» mentre sta ancora cercando", () => {
  /* openModal dipinge PRIMA e chiede la lista DOPO (`renderModal(); … loadProjects();`): per tutto
     il tempo della query cloudProjects era [] e la finestra dichiarava «Nessun progetto salvato
     online» a chi ne ha venti. Su rete lenta quegli istanti bastano per chiudere la finestra
     convinti che il cloud abbia perso tutto. */
  ok(/function openModal\(\)\{[^}]*renderModal\(\); if\(cloudUser\) loadProjects\(\);/.test(appjs),
     "premessa: si dipinge prima di sapere");
  ok(/var cloudProjectsStato="attesa";/.test(appjs), "esiste lo stato «non lo so ancora»");
  /* Tre rami distinti, nell'ordine giusto: l'attesa e l'errore vengono PRIMA del verdetto «vuoto». */
  const iAttesa = appjs.indexOf('cloudProjectsStato==="attesa"');
  const iErrore = appjs.indexOf('cloudProjectsStato==="errore"');
  const iVuoto = appjs.indexOf("Nessun progetto salvato online");
  ok(iAttesa > 0 && iErrore > iAttesa && iVuoto > iErrore, "attesa ed errore vengono prima del «vuoto»");
  ok(/Sto cercando i tuoi progetti…/.test(appjs), "durante la ricerca lo dice");
  ok(/Elenco non disponibile: il server non ha risposto/.test(appjs), "e se non arriva, lo dice pure");
  /* Lo stato deve chiudersi su ENTRAMBE le uscite della query, o l'attesa non finisce mai. */
  const load = appjs.slice(appjs.indexOf("function loadProjects()"), appjs.indexOf("function openProject(id)"));
  ok(/cloudProjectsStato="errore"; if\(modalOpen\(\)\) renderModal\(\);/.test(load), "sull'errore si ridipinge");
  ok(/cloudProjectsStato="letta";/.test(load), "e sulla risposta buona si chiude l'attesa");
  /* Cambio account: la lista di prima non descrive più nessuno, e non deve valere come «letta». */
  ok(/cloudProjects=\[\]; cloudProjectsStato="attesa";/.test(appjs), "cambiando account si torna in attesa");
});

t("il bottone del PDF torna vivo alla fine dell'export, non a cronometro", () => {
  /* Si riaccendeva con setTimeout(…, 2500): un numero scelto a occhio, non la fine del lavoro. Su un
     progetto pesante svg2pdf è ancora sul main thread quando i 2,5 s scadono, il bottone torna
     cliccabile e due clic fanno due file e due passate. Ora exportPdf TORNA la promessa dell'export
     — misurato chiamandola: entrambi i rami rispondono con un thenable. */
  ok(!/setTimeout\(function\(\)\{ b\.disabled=false; b\.textContent=_t; \}, 2500\)/.test(appjs),
     "sparito il cronometro da 2500 ms");
  const h = appjs.slice(appjs.indexOf("function run(){\n      b.disabled=true;"), appjs.indexOf("function run(){\n      b.disabled=true;") + 700);
  ok(/p\.then\(fine, fine\)/.test(h), "il bottone si riaccende quando l'export ha finito");
  ok(/if\(b\.disabled\) return;/.test(appjs), "e finché è spento non riparte");
  /* Il ramo d'errore («non entra nemmeno a 1:500») esce presto: se tornasse undefined il bottone
     resterebbe spento per sempre. Deve rispondere un thenable anche lì. */
  conSandbox({ resolveScale: () => 0 }, () => {
    const p = A.exportPdf("a4", "auto", "landscape", "");
    ok(p && typeof p.then === "function", "anche il ramo «non ci sta nel foglio» torna un thenable");
  });
  conSandbox({ resolveScale: () => 100, buildPdfDoc: () => new Promise(function () {}) }, () => {
    const p = A.exportPdf("a4", "auto", "landscape", "");
    ok(p && typeof p.then === "function", "e il ramo normale torna la promessa dell'export vero");
  });
});

t("il PNG dichiara l'attesa e non parte due volte", () => {
  /* Si premeva «PNG» e non succedeva NIENTE di visibile per qualche secondo: flatten del disegno,
     decodifica dell'SVG e un canvas da 4000 px passano tutti dal main thread. Chi non vede una
     reazione ripreme, e due export sono due file. Misurato chiamando exportPng con una Image finta:
     il messaggio d'attesa parte subito, la callback di fine NO, e il secondo giro viene rifiutato
     finché il primo non ha chiuso. */
  const messaggi = []; let img = null; let finiti = 0;
  const FakeURL = function (u, b) { return new URL(u, b); };
  FakeURL.createObjectURL = () => "blob:finto"; FakeURL.revokeObjectURL = () => {};
  conSandbox({ __toast: (m) => messaggi.push(m), URL: FakeURL, Blob: function () {}, Image: function () { img = this; } }, () => {
    eq(A.exportPng(() => finiti++), true, "il primo scatto parte:");
    ok(messaggi.length === 1 && /Preparo il PNG/.test(messaggi[0]), "e si vede subito che sta lavorando");
    eq(finiti, 0, "ma il lavoro NON è finito: la callback non è ancora scattata");
    eq(A.exportPng(() => finiti++), false, "il secondo scatto viene rifiutato:");
    eq(finiti, 0, "e non chiude l'attesa del primo:");
    ok(!!img && typeof img.onerror === "function", "premessa: la Image finta è stata agganciata");
    img.onerror();   /* fine reale, ramo fallito */
    eq(finiti, 1, "finito il lavoro, il chiamante lo sa:");
    eq(A.exportPng(() => finiti++), true, "e da lì si può riprovare:");
    img.onerror();
  });
  /* Il bottone dentro la finestra Esporta usa quella callback per tornare vivo, come quello del PDF. */
  const h = appjs.slice(appjs.indexOf('var pg=document.getElementById("pdfAltPng");'), appjs.indexOf('var cs=document.getElementById("pdfAltCsv");'));
  ok(/b\.textContent="Genero…"/.test(h), "il bottone dice che sta generando");
  ok(/exportPng\(fine\)/.test(h), "e si riaccende alla fine vera, non a tempo");
});

console.log("\n" + (fail === 0 ? "✓ TUTTI VERDI" : "✗ " + fail + " FALLITI") + " — " + pass + " passati, " + fail + " falliti.");
process.exit(fail === 0 ? 0 : 1);
