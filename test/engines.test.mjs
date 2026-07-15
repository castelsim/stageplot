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
  reset(); eq(A.wattOf(add("pedaliera", 300, 300)), 30); reset(); eq(chans(add("pedaliera", 300, 300)).length, 0, "pedaliera non è sorgente audio");
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
  eq(A.COMP.batteria.reduced.join(","), "mus,stool"); /* pannello ridotto: solo questi due (il kit su misura è "Dividi") */
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

console.log("\n" + (fail === 0 ? "✓ TUTTI VERDI" : "✗ " + fail + " FALLITI") + " — " + pass + " passati, " + fail + " falliti.");
process.exit(fail === 0 ? 0 : 1);
