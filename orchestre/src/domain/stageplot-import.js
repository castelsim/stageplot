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

/* La PARTE dedotta dall'etichetta della postazione: «Vl I 3», «Vln 1», «Violini II», «V2» → il nome del ruolo
   com'è nei modelli («Violini primi», «Violini secondi»). Solo per gli strumenti che si dividono in parti;
   se l'etichetta non lo dice, null: l'anteprima chiede. Puro, testato. */
const PARTS = {
  violino: [["Violini primi", /\b(?:vl|vln|vn|viol(?:in[oi])?|v)\s*\.?\s*(?:i|1|1[°ºa]|primi?)\b(?!i)/i], ["Violini secondi", /\b(?:vl|vln|vn|viol(?:in[oi])?|v)\s*\.?\s*(?:ii|2|2[°ºa]|second[io])\b/i]],
};
export function partFromLabel(label, instrumentCode) {
  const rules = PARTS[instrumentCode]; if (!rules) return null;
  const t = String(label || "").trim(); if (!t) return null;
  for (const [name, re] of rules) if (re.test(t)) return name;
  return null;
}

/* Un gruppo per strumento e parte: quanti posti chiede il palco. */
export function proposeRoles(positions, instruments) {
  const byCode = new Map((instruments || []).map((i) => [i.code, i]));
  const groups = new Map();
  for (const p of positions) {
    const part = partFromLabel(p.label, p.instrument_code);
    const key = p.instrument_code + "|" + (part || "");
    const g = groups.get(key) || { instrument_code: p.instrument_code, part, seats: 0, items: [], labels: [], positions: [] };
    g.seats += p.seats; g.items.push(p.item_id); if (p.label) g.labels.push(p.label); g.positions.push(p);
    groups.set(key, g);
  }
  const out = [...groups.values()].map((g) => {
    const i = byCode.get(g.instrument_code) || {};
    return { ...g, name: g.part || i.name || g.instrument_code, instrument_name: i.name || g.instrument_code, family: i.family || "", sort: Number.isFinite(i.sort) ? i.sort : 0 };
  });
  out.sort((a, b) => famRank(a.family) - famRank(b.family) || a.sort - b.sort || a.name.localeCompare(b.name, "it"));
  return out;
}
function famRank(f) { const n = FAMILY_ORDER.indexOf(f); return n < 0 ? 99 : n; }

/* Cosa cambia nell'organico se importo. `roles` sono i ruoli della produzione ({id, name, instrument_code, slots:[{item_id}]}).
   Per ogni gruppo si sceglie il ruolo di destinazione: quello con lo stesso strumento e la stessa parte; se la parte
   non è dedotta e lo strumento ha UN solo ruolo, quello; se ne ha più d'uno, `ambiguous` e l'anteprima chiede.
   I posti che servono in più = quelli chiesti dal palco meno quelli del ruolo liberi o già di queste postazioni:
   i posti non si tolgono mai da qui, e un posto con una persona sopra non cambia mano. */
export function diffProposal(proposal, roles) {
  return proposal.map((g) => {
    const same = (roles || []).filter((r) => r.instrument_code === g.instrument_code);
    let target = same.find((r) => r.name === g.name) || null, ambiguous = false;
    if (!target && !g.part && same.length === 1) target = same[0];
    if (!target && !g.part && same.length > 1) ambiguous = true;
    const options = same.map((r) => ({ id: r.id, name: r.name }));
    if (!target) {
      return { ...g, role_id: null, role_name: g.name, current: 0, add: g.seats, action: "new", ambiguous, options };
    }
    const slots = target.slots || [];
    const mine = new Set(g.items);
    const usable = slots.filter((sl) => !sl.item_id || mine.has(sl.item_id)).length;
    const add = Math.max(0, g.seats - usable);
    return { ...g, role_id: target.id, role_name: target.name, current: slots.length || Number(target.seats || 0), add, action: add ? "grow" : "ok", ambiguous: false, options };
  });
}

/* Il payload per l'RPC: un gruppo per ruolo di destinazione (scelto dall'anteprima). */
export function importGroups(diff) {
  return diff.map((d) => ({ instrument_code: d.instrument_code, role_id: d.role_id || null, role_name: d.role_name, positions: d.positions.map((p) => ({ item_id: p.item_id, item_type: p.item_type, label: p.label, seats: p.seats })) }));
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
  const amb = diff.filter((d) => d.ambiguous).length;
  if (amb) parts.push(amb === 1 ? "1 gruppo da assegnare a un ruolo" : amb + " gruppi da assegnare a un ruolo");
  return parts.join(", ") + ".";
}

/* Stato dei collegamenti dopo una nuova lettura del progetto: quelli non più sul palco sono `stale`. */
export function staleLinks(links, positions) {
  const alive = new Set(positions.map((p) => p.item_id));
  return (links || []).filter((l) => !alive.has(l.item_id)).map((l) => l.item_id);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function isUuid(s) { return typeof s === "string" && UUID.test(s); }
