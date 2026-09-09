/* Collegamento a StagePlot: dal documento dell'editor alle postazioni da coprire. Puro, testato in Node.

   Il documento salvato in `stageplot_projects.data` è `{ _doc:1, active, variants:[{id,name,state}] }`
   (o, per i progetti vecchi, lo stato piatto). Ogni `state.items[]` ha `type` (chiave del catalogo
   dell'editor), `label`, e per le postazioni a due `doppia:true` o un `type` "x2". La mappa
   `type → strumento` viene dal catalogo `orc_instruments.stageplot_types`: qui non c'è nessuna lista
   cablata a mano, così un nuovo tipo si mappa aggiungendolo al catalogo. */

/* tipi che sono SEMPRE una postazione a due (creati dal modale Organico dell'editor) */
const DOUBLE_TYPES = new Set(["vln1x2", "vln2x2", "violax2", "cellix2", "cbx2", "archi2leggio"]);

export const FAMILY_ORDER = ["archi", "legni", "ottoni", "percussioni", "tastiere", "corde", "voci", "direzione"];
export const FAMILY_LABEL = { archi: "Archi", legni: "Legni", ottoni: "Ottoni", percussioni: "Percussioni", tastiere: "Tastiere", corde: "Corde", voci: "Voci", direzione: "Direzione" };

/* `{ vlnpost: "violino", … }` dal catalogo strumenti */
export function typeMapFrom(instruments) {
  const map = {};
  for (const i of instruments || []) for (const t of i.stageplot_types || []) if (t && !(t in map)) map[t] = i.code;
  return map;
}

/* le varianti (scene) di un documento; un documento piatto è una sola variante «legacy» */
export function docVariants(doc) {
  if (!doc || typeof doc !== "object") return [];
  if (Array.isArray(doc.variants)) {
    return doc.variants.filter((v) => v && typeof v === "object" && v.state && typeof v.state === "object")
      .map((v, n) => ({ id: String(v.id ?? n), name: String(v.name || "Scena " + (n + 1)), active: String(v.id ?? n) === String(doc.active ?? "") }));
  }
  return [{ id: "legacy", name: "Progetto", active: true }];
}

function variantState(doc, variantId) {
  if (!doc || typeof doc !== "object") return null;
  if (Array.isArray(doc.variants)) {
    const list = docVariants(doc);
    const want = variantId || (list.find((v) => v.active) || list[0] || {}).id;
    const idx = list.findIndex((v) => v.id === want);
    if (idx < 0) return null;
    const raw = doc.variants.filter((v) => v && typeof v === "object" && v.state && typeof v.state === "object")[idx];
    return raw ? raw.state : null;
  }
  return doc;
}

export function seatsOf(item) {
  if (!item) return 0;
  if (DOUBLE_TYPES.has(item.type) || item.doppia === true) return 2;
  return 1;
}

/* Le postazioni-persona di una variante. `positions` sono quelle mappate su uno strumento del catalogo,
   `unmapped` quelle di tipo sconosciuto al catalogo (restano fuori dall'organico, ma si dicono). */
export function extractPositions(doc, variantId, typeMap) {
  const st = variantState(doc, variantId);
  const items = st && Array.isArray(st.items) ? st.items : [];
  const positions = [], unmapped = [], seen = new Set();
  for (const it of items) {
    if (!it || typeof it !== "object" || !it.type) continue;
    const id = String(it.id || "");
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const label = String(it.label || "").trim();
    const code = typeMap[it.type];
    if (!code) { unmapped.push({ item_id: id, item_type: String(it.type), label }); continue }
    positions.push({ item_id: id, item_type: String(it.type), label, instrument_code: code, seats: seatsOf(it) });
  }
  return { positions, unmapped, empty: !st };
}

/* Un gruppo per strumento: quanti posti chiede il palco. */
export function proposeRoles(positions, instruments) {
  const byCode = new Map((instruments || []).map((i) => [i.code, i]));
  const groups = new Map();
  for (const p of positions) {
    const g = groups.get(p.instrument_code) || { instrument_code: p.instrument_code, seats: 0, items: [], labels: [] };
    g.seats += p.seats; g.items.push(p.item_id); if (p.label) g.labels.push(p.label);
    groups.set(p.instrument_code, g);
  }
  const out = [...groups.values()].map((g) => {
    const i = byCode.get(g.instrument_code) || {};
    return { ...g, name: i.name || g.instrument_code, family: i.family || "", sort: Number.isFinite(i.sort) ? i.sort : 0 };
  });
  out.sort((a, b) => famRank(a.family) - famRank(b.family) || a.sort - b.sort || a.name.localeCompare(b.name, "it"));
  return out;
}
function famRank(f) { const n = FAMILY_ORDER.indexOf(f); return n < 0 ? 99 : n; }

/* Cosa cambia nell'organico se importo: per ogni gruppo `new` (nessun ruolo con quello strumento),
   `grow` (il palco chiede più posti di quelli previsti: si aggiungono), `ok` (bastano già). I posti
   non si tolgono mai da qui: un ruolo con persone assegnate non si restringe da un disegno. */
export function diffProposal(proposal, roles) {
  const have = new Map();
  for (const r of roles || []) if (r.instrument_code) have.set(r.instrument_code, (have.get(r.instrument_code) || 0) + Number(r.seats || 0));
  return proposal.map((g) => {
    const cur = have.get(g.instrument_code) || 0;
    const action = !have.has(g.instrument_code) ? "new" : g.seats > cur ? "grow" : "ok";
    return { ...g, current: cur, add: action === "ok" ? 0 : g.seats - cur, action };
  });
}

export function importSummary(diff, unmapped) {
  const c = { new: 0, grow: 0, ok: 0, add: 0 };
  for (const d of diff) { c[d.action]++; c.add += d.add; }
  const parts = [];
  if (c.new) parts.push(c.new === 1 ? "1 ruolo nuovo" : c.new + " ruoli nuovi");
  if (c.grow) parts.push(c.grow === 1 ? "1 ruolo allargato" : c.grow + " ruoli allargati");
  if (c.add) parts.push(c.add === 1 ? "1 posto in più" : c.add + " posti in più");
  if (!parts.length) parts.push(diff.length ? "l'organico copre già il palco" : "nessuna postazione riconosciuta");
  if (unmapped && unmapped.length) parts.push((unmapped.length === 1 ? "1 elemento" : unmapped.length + " elementi") + " senza strumento in catalogo");
  return parts.join(", ") + ".";
}

/* Stato dei collegamenti dopo una nuova lettura del progetto: quelli non più sul palco sono `stale`. */
export function staleLinks(links, positions) {
  const alive = new Set(positions.map((p) => p.item_id));
  return (links || []).filter((l) => !alive.has(l.item_id)).map((l) => l.item_id);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function isUuid(s) { return typeof s === "string" && UUID.test(s); }
