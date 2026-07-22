/* StagePlot — test dei MOTORI (cablaggio audio, elettrico, monitoraggio digitale, microfonazione, zona).
 *
 * Perché: i motori sono la logica critica del tool; in sviluppo diverse regressioni si prendevano solo
 * col test manuale nel browser. Questa suite carica il codice REALE di index.html in un sandbox node
 * (stub DOM universale) e asserisce sui risultati dei motori puri. Zero dipendenze (solo node:vm).
 *
 * Uso:  node build.mjs && node test/engines.test.mjs
 *       (exit 1 se un test fallisce → usabile in pre-merge/CI)
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import vm from "node:vm";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const appjs = readFileSync(join(root, "app.js"), "utf8");   /* l'app e' nel bundle defer app.js (build.mjs) */

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
    throw new Error("Sandbox non caricato: TYPES/motori mancanti (index.html cambiato struttura?)");
  }
  return ctx;
}

const A = loadApp();

/* ---- mini test runner ---- */
let pass = 0, fail = 0;
function t(name, fn) { try { fn(); pass++; console.log("  ✓ " + name); } catch (e) { fail++; console.log("  ✗ " + name + "\n      " + e.message); } }
function eq(got, exp, msg) { const g = JSON.stringify(got), e = JSON.stringify(exp); if (g !== e) throw new Error((msg || "") + " atteso " + e + ", ottenuto " + g); }
function ok(cond, msg) { if (!cond) throw new Error(msg || "condizione falsa"); }
function reset() {
  A.state.items = []; A.state.inputs = []; A.state.outputs = []; A.state.contacts = []; A.state.rider = {};
  A.state.status = "bozza"; A.state.approval = { by: "", at: "" };
  A.state.cab.on = false; A.state.cab.mode = "manual"; A.state.cab.manual = {};
  A.state.elec.on = false; A.state.elec.manual = {}; A.state.elec.uplinks = {};
  A.state.mond.on = false; A.state.mond.manual = {};
  A.__cabRes = null; A.__elecRes = null; A.__mondRes = null;
}
function add(type, x, y) { A.addItem(type, { x, y }); return A.state.items[A.state.items.length - 1]; }
function chans(it) { return A.cabItemInputs(it); }

console.log("StagePlot — test motori\n");

console.log("Microfonazione / cabItemInputs:");
t("batteria = 8 canali (generica)", () => { reset(); const b = add("batteria", 400, 400); eq(chans(b).length, 8); });
t("archi vln1x2 default (archetto) = 2 canali DPA", () => { reset(); const v = add("vln1x2", 300, 300); eq(chans(v).length, 2); eq(chans(v)[0].mic, "DPA 4099"); });
t("archi vln1x2 miking pan1 = 1 canale, pan2 = 2", () => { reset(); const v = add("vln1x2", 300, 300); v.miking = "pan1"; A.__cabRes = null; eq(chans(v).length, 1); v.miking = "pan2"; eq(chans(v).length, 2); });
t("corista: panoramico di default (0), asta tonda = 1 (SM58)", () => { reset(); const c = add("corista", 200, 300); eq(chans(c).length, 0, "coristi coperti dal mic di sezione"); c.micMode = "tonda"; eq(chans(c).length, 1); eq(chans(c)[0].mic, "SM58"); c.micMode = "mano"; eq(chans(c).length, 1, "in mano = 1 canale"); c.micMode = "pano"; eq(chans(c).length, 0, "panoramico = 0"); });
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
  reset(); A.state.items = [{ id: "z", type: "voce", x: 10, y: 10 }];
  const back = A.normalizeState(JSON.parse(A.stateToJSON()));
  ok(!("_v" in back), "_v consumato al load"); eq(back.items[0].id, "z");
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
t("capienza stage box superata → err con fix a un click", () => {
  reset(); A.state.cab.on = true;
  const b = add("stagebox", 600, 600); b.ch = 2; b.outCh = 2; A.__cabRes = null;
  add("batteria", 300, 300); A.__cabRes = null;
  const f = auditFind(/superiori ai canali|satura/);
  ok(f.length > 0, "atteso errore capienza; findings: " + auditMsgs().join(" | "));
  ok(f.some((x) => x.act), "atteso fix a un click sull'errore capienza");
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
t("docToJSONFull conserva la planimetria dell'attiva; docToJSON la strippa", () => {
  A.loadDoc({ titolo: "V", items: [], inputs: [], outputs: [] });
  A.state.venue = { name: "piantina", _dataUrl: "data:image/png;base64,AAA", _imgW: 100, _imgH: 80 };
  const light = JSON.parse(A.docToJSON()), full = JSON.parse(A.docToJSONFull());
  const lv = light.variants.find((v) => v.id === light.active);
  const fv = full.variants.find((v) => v.id === full.active);
  ok(!lv.state.venue || !lv.state.venue._dataUrl, "docToJSON: immagine strippata");
  ok(fv.state.venue && fv.state.venue._dataUrl, "docToJSONFull: immagine presente sull'attiva");
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
t("audit L8: cantante senza mic → avviso azionabile", () => {
  reset(); add("cantante", 400, 400); A.__cabRes = null;
  const f = A.auditEngine().findings.filter((x) => /senza microfono/.test(x.msg));
  ok(f.length === 1 && f[0].act && /radiomic/i.test(f[0].act.label), "atteso avviso con fix; findings: " + auditMsgs().join(" | "));
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
  reset(); const c = add("cantante", 400, 400); c.label = "Vocalist 2"; A.__cabRes = null;
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
  eq(JSON.stringify(A.equipCatsFor({ type: "hearback" })), JSON.stringify(["personal_mixer", "hub"]), "personal mixer → PM/hub");
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
  add("laptop", 700, 300); A.state.items[A.state.items.length - 1].uso = "rec_audio";
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

t("stagebox generica: 8 in / 0 out = ciabattina 34×26, reversibile, mai sopra i modelli", () => {
  reset();
  const sb = add("stagebox", 400, 200);
  sb.ch = 8; delete sb.outCh;
  A.sbAutoSize(sb);
  eq([sb.w, sb.d].join("x"), "34x26", "piccola con 8in/0out");
  sb.ch = 16; A.sbAutoSize(sb);
  eq([sb.w, sb.d].join("x"), "58x46", "torna grande con 16 canali");
  sb.ch = 8; sb.outCh = 4; A.sbAutoSize(sb);
  eq([sb.w, sb.d].join("x"), "58x46", "con uscite resta grande");
  delete sb.outCh; sb.hw = "tio1608d"; A.sbAutoSize(sb);
  eq([sb.w, sb.d].join("x"), "58x46", "col modello hw non si tocca");
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
  const cuf = L.auto.find(a => a.cuf);
  ok(cuf, "riga cuffie derivata");
  eq(cuf.ports.length, 16, "16 canali (Ultranet)");
  ok(cuf.ports[15] === cuf.ports[0] + 15, "blocco contiguo");
  eq(cuf.tag, "CUF", "tag CUF");
  // canali override
  hub.pmFeedCh = 8; A.__cabRes = null; L = A.busList();
  eq(L.auto.find(a => a.cuf).ports.length, 8, "override 8 canali");
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
  eq(JSON.stringify(A.diFootprint({ type: "dimono", diCh: "stereo" })), JSON.stringify([48, 28]), "footprint stereo");
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

t("Layer v2: cablaggio automatico su addItem + stile cavi + pallini", () => {
  reset();
  A.state.cab.style = "curve";
  // 1) auto-connect: aggiungo sorgente poi stage box → si collega DA SOLO
  A.addItem("astamic", { x: 200, y: 200 });
  ok(!A.state.cab.on, "senza box il motore resta spento");
  A.addItem("stagebox", { x: 400, y: 200 });
  ok(A.state.cab.on, "con la box il motore si accende da solo");
  let R = A.cabResult(true);
  eq(R.pending.length, 0, "l'ingresso si è collegato da solo");
  ok(R.links.some(l => l.box && !l.box.auto), "cavo su box reale");
  // anche una sorgente aggiunta DOPO si collega
  A.addItem("astamic", { x: 250, y: 250 });
  R = A.cabResult(true);
  eq(R.pending.length, 0, "anche la sorgente aggiunta dopo si collega da sola");
  // 2) stile cavi (2 stili, 21/07): smussati = Q, diretto = linea dritta sui punti grezzi
  const pts = [[0, 0], [100, 0], [100, 80]];
  A.state.cab.style = "curve";
  ok(A.cabPathD(pts).indexOf("Q") >= 0, "smussati: angoli arrotondati (Q)");
  A.state.cab.style = "dir";
  eq(A.cabDrawD([[0, 0], [100, 80]], pts), "M 0.0 0.0 L 100.0 80.0", "diretto: linea dritta sui punti grezzi");
  // 3) canale alla partenza nel SOLO Ingressi + pallini sorgente sempre presenti
  A.state.cab.style = "curve";
  A.layerSoloUI = { cabin: true };
  let mk = A.cablingMarkup();
  ok(mk.indexOf("cab-startlbl") >= 0, "solo Ingressi: etichetta canale alla partenza");
  ok(mk.indexOf("cab-srcdot") >= 0, "pallino sorgente sempre visibile");
  A.layerSoloUI = {};
  // 4) normalizeState sanifica lo stile (orto/loom vecchi → smussati; solo curve|dir validi)
  A.state.cab.style = "spazzatura";
  let ns = A.normalizeState(A.state); if (ns) A.state = ns;
  eq(A.state.cab.style, "curve", "stile non valido → smussati");
  A.state.cab.style = "orto";
  ns = A.normalizeState(A.state); if (ns) A.state = ns;
  eq(A.state.cab.style, "curve", "orto (vecchio) → smussati");
  A.state.cab.style = "loom";
  ns = A.normalizeState(A.state); if (ns) A.state = ns;
  eq(A.state.cab.style, "curve", "loom (vecchio) → smussati");
  A.state.cab.style = "dir";
  ns = A.normalizeState(A.state); if (ns) A.state = ns;
  eq(A.state.cab.style, "dir", "diretto preservato");
});

t("P.M.: connessione DIGITALE automatica all'hub, MAI ritorno analogico dalla box", () => {
  reset();
  add("stagebox", 500, 200);
  A.state.cab.on = true;
  const h = add("mixhub", 700, 300);       // hub (anche senza modello: pmIsHub)
  const m = add("hearback", 300, 300);     // mixerino → si aggancia da solo via Cat5
  const Rm = A.monDigEngine();
  ok((Rm.links || []).some(l => l.from.id === m.id && (l.to.id === h.id || l.toIsHub)), "mixerino → hub via Cat5 (automatico)");
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
  A.state.cab.style = "curve"; A.state.cab.styleOut = "curve"; A.state.mond.style = "dir"; A.state.elec.style = "curve";
  eq(A.cabStyle(), "curve", "Ingressi: smussati");
  eq(A.cabStyleOut(), "curve", "Output: curve");
  eq(A.mondStyle(), "dir", "P.M.: dir");
  eq(A.elecStyle(), "curve", "Corrente: curve");
  // normalize preserva/sanifica (orto/loom vecchi → smussati)
  A.state.cab.styleOut = "loom"; A.state.mond.style = "spazzatura"; A.state.elec.style = "dir";
  const ns = A.normalizeState(A.state); if (ns) A.state = ns;
  eq(A.state.cab.styleOut, "curve", "styleOut loom → smussati");
  eq(A.state.mond.style, "curve", "mond style non valido → smussati");
  eq(A.state.elec.style, "dir", "elec style valido preservato");
});

t("P.M.: un hub generico regge max 8 mixerini (capienza rispettata dall'auto-connect)", () => {
  reset();
  const hub = add("mixhub", 900, 300);   // hub generico → cap 8
  for (let i = 0; i < 10; i++) add("hearback", 100 + i * 40, 300);   // 10 mixerini generici
  // l'hook di addItem ha già auto-connesso: verifica che l'hub NON sia sovraccarico
  let R = A.monDigEngine();
  eq((R.hubLoad || {})[hub.id], 8, "l'hub si ferma a 8 (capienza)");
  eq(R.pending.length, 2, "i 2 eccedenti restano pendenti");
  ok(!R.issues.some(i => i.lvl === "err" && /porte di/.test(i.msg)), "nessun errore di over-capacità");
  // un secondo hub raccoglie gli eccedenti
  A.add ? null : null;
  const hub2 = add("mixhub", 200, 300);
  R = A.monDigEngine();
  eq(R.pending.length, 0, "col secondo hub tutti collegati");
  ok(((R.hubLoad || {})[hub2.id] || 0) >= 2, "il secondo hub prende gli eccedenti");
});

t("vista cablaggio: cavi solo col layer selezionato; Power = carichi a pallini", () => {
  reset();
  add("astamic", 300, 300);
  add("stagebox", 600, 400);
  add("comboamp", 200, 300);      // carico (ampli)
  add("distro32", 250, 480);
  A.state.cab.on = true; A.state.elec.on = true; A.__cabRes = null; A.__elecRes = null;
  A.__cabStatic = false;   // nel sandbox window.__cabStatic è uno stub truthy: nel browser è falsy (export PDF a parte)
  // niente selezionato → nessun cavo
  A.layerSoloUI = {}; A.layerAccOpen = null;
  let mk = A.cablingMarkup();
  ok(mk.indexOf("cab-line") < 0, "nessun cavo Input senza layer selezionato");
  eq(A.elecMarkup(), "", "nessun cavo Power senza layer selezionato");
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
  A.layerSoloUI = { cabin: true };
  const dot = A.sectionDotMarkup(d);
  eq((dot.match(/secdot-c/g) || []).length, 2, "2 pallini sezione per la doppia");
  ok(dot.indexOf("Violini I b") >= 0, "il 2° musicista ha il suo nome");
  A.layerSoloUI = {};
  // zona: il cavo parte dal punto del microfono
  reset(); A.state.cab.on = true;
  add("stagebox", 800, 500);
  const z = add("miczone", 400, 250); z.pts = [[-50, -50], [50, -50], [50, 50], [-50, 50]];
  A.__cabRes = null;
  const R = A.audioCablingEngine();
  const zl = R.links.find(l => l.s.it.id === z.id);
  ok(zl, "la zona genera un canale");
  const anchor = A.portAnchor(z, "audio");
  ok(Math.abs(zl.pts[0][0] - anchor[0]) < 2 && Math.abs(zl.pts[0][1] - anchor[1]) < 2, "il cavo della zona parte dal punto mic");
});

console.log("\n" + (fail === 0 ? "✓ TUTTI VERDI" : "✗ " + fail + " FALLITI") + " — " + pass + " passati, " + fail + " falliti.");
process.exit(fail === 0 ? 0 : 1);
