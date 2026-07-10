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
  A.state.items = []; A.state.inputs = []; A.state.outputs = [];
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
t("corista default = 1 (SM58), panoramico = 0", () => { reset(); const c = add("corista", 200, 300); eq(chans(c).length, 1); eq(chans(c)[0].mic, "SM58"); c.miking = "pan"; eq(chans(c).length, 0); });
t("fiato (tromba) default = 1 (e906), panoramico = 0", () => { reset(); const tr = add("tromba", 200, 300); eq(chans(tr).length, 1); eq(chans(tr)[0].mic, "e906"); tr.miking = "pan"; eq(chans(tr).length, 0); });
t("archi singolo (violoncello) archetto = 1, panoramico = 0", () => { reset(); const vc = add("violoncello", 200, 300); eq(chans(vc).length, 1); vc.miking = "pan"; eq(chans(vc).length, 0); });
t("Overhead sezione (micover) = 2 canali KM184 stereo", () => { reset(); const o = add("micover", 300, 300); eq(chans(o).length, 2); eq(chans(o).map((c) => c.mic), ["KM184", "KM184"]); });
t("Mic coro (micchoir) = 1 canale KM184 (sorgente)", () => { reset(); const mc = add("micchoir", 300, 300); eq(chans(mc).length, 1); eq(chans(mc)[0].mic, "KM184"); });

console.log("\nZona microfono panoramico:");
t("elemento dentro una zona -> 0 canali; la zona -> 1 canale inferito", () => {
  reset(); const v = add("vlnpost", 300, 300); const z = add("miczone", 300, 300); z.w = 220; z.d = 150;
  eq(chans(v).length, 0, "violino coperto"); eq(chans(z).length, 1, "zona"); eq(chans(z)[0].mic, "KM184", "mic zona");
});
t("micZoneLabel archi uniforme = 'Zona archi'; zona vuota = KM184 / 'Zona panoramica'", () => {
  reset(); add("vlnpost", 300, 300); add("vlnpost", 340, 300); const z = add("miczone", 320, 300); z.w = 220; z.d = 150;
  eq(A.micZoneLabel(z), "Zona archi"); const z2 = add("miczone", 1500, 1500); z2.w = 100; z2.d = 100;
  eq(A.micZoneMic(z2), "KM184"); eq(A.micZoneLabel(z2), "Zona panoramica");
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

console.log("\nMonitoraggio digitale (monDigEngine):");
t("catena m2->m1->hub: 2 tratte, 0 pending, nessun errore", () => {
  reset(); const m1 = add("hearback", 200, 400); const m2 = add("hearback", 300, 400); const h = add("mixhub", 500, 200);
  A.mondManual(m1.id).to = h.id; A.mondManual(m2.id).to = m1.id; A.__mondRes = null;
  const R = A.monDigEngine(); eq(R.links.length, 2, "tratte"); eq(R.pending.length, 0, "pending");
  ok(!R.issues.some((i) => i.lvl === "err"), "nessun err");
});
t("mixerino senza .to = pending", () => {
  reset(); add("hearback", 200, 400); add("mixhub", 500, 200);
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
  reset(); const c = add("corista", 200, 300); eq(A.itemChannels(c), 1);
  reset(); const z = add("miczone", 300, 300); eq(A.itemChannels(z), 1);
});

console.log("\nLayer Manager (nomi/gruppi):");
t("nomi layer (Input / Monitor / P.M. / Power; Rete audio invariato)", () => {
  const by = {}; A.layerRegistry().forEach((L) => { by[L.id] = L; });
  eq(by.cabin.name, "Input"); eq(by.cabout.name, "Monitor"); eq(by.net.name, "Rete audio");
  eq(by.mond.name, "P.M."); eq(by.elec.name, "Power");
});
t("lucchetto+cestino su Input/Monitor/P.M./Power/Planimetria; Rete solo visibilità", () => {
  const by = {}; A.layerRegistry().forEach((L) => { by[L.id] = L; });
  ["cabin", "cabout", "mond", "elec", "venue"].forEach((k) => {
    ok(by[k] && by[k].lockable, k + " lockable"); ok(by[k] && by[k].removable, k + " removable");
  });
  ok(!by.net.lockable, "Rete audio: niente lucchetto (auto-derivata)"); ok(!by.net.removable, "Rete audio: niente cestino");
});
t("Input e Monitor: lock indipendenti (state.cab.lockIn / lockOut)", () => {
  reset();
  let by = {}; A.layerRegistry().forEach((L) => { by[L.id] = L; });
  by.cabin.setLocked(true);
  ok(A.state.cab.lockIn === true, "lockIn settato dall'Input");
  ok(!A.state.cab.lockOut, "il Monitor (lockOut) NON è toccato");
  by = {}; A.layerRegistry().forEach((L) => { by[L.id] = L; });
  ok(by.cabin.locked === true && by.cabout.locked === false, "Input bloccato, Monitor libero");
});
t("cestino Input azzera solo input; cestino Monitor solo i ritorni (ret:)", () => {
  reset();
  A.state.cab.manual = { "grp:x": { box: "b1" }, "id7#0": { box: "b2" }, "ret:m1:s1": { pts: [[0, 0]] } };
  let by = {}; A.layerRegistry().forEach((L) => { by[L.id] = L; });
  by.cabin.remove();
  eq(Object.keys(A.state.cab.manual), ["ret:m1:s1"], "cestino Input: restano solo i ret:");
  A.state.cab.manual = { "grp:x": { box: "b1" }, "ret:m1:s1": { pts: [[0, 0]] } };
  by = {}; A.layerRegistry().forEach((L) => { by[L.id] = L; });
  by.cabout.remove();
  eq(Object.keys(A.state.cab.manual), ["grp:x"], "cestino Monitor: restano solo gli input");
});
t("migrate v1→v2: cab.locked unico → lockIn + lockOut", () => {
  const s = A.migrate({ _v: 1, cab: { locked: true, on: true } });
  ok(s.cab.lockIn === true && s.cab.lockOut === true, "locked propagato ai due rami");
  ok(!("locked" in s.cab), "vecchio cab.locked rimosso");
});
t("gruppo Audio sui 4 layer di segnale; elec/venue singoli", () => {
  const by = {}; A.layerRegistry().forEach((L) => { by[L.id] = L; });
  eq(by.cabin.group, "Audio"); eq(by.cabout.group, "Audio"); eq(by.net.group, "Audio"); eq(by.mond.group, "Audio");
  ok(!by.elec.group, "elec senza gruppo"); ok(!by.venue.group, "venue senza gruppo");
});
t("ordine: gruppo Audio prima di Elettrico e Planimetria", () => {
  const ids = A.layerRegistry().map((L) => L.id);
  ok(ids.indexOf("mond") < ids.indexOf("elec"), "mond < elec"); ok(ids.indexOf("elec") < ids.indexOf("venue"), "elec < venue");
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
  ok(Math.abs(by.snare.x) < 30, "rullante quasi centrato tra le gambe");
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

console.log("\n" + (fail === 0 ? "✓ TUTTI VERDI" : "✗ " + fail + " FALLITI") + " — " + pass + " passati, " + fail + " falliti.");
process.exit(fail === 0 ? 0 : 1);
