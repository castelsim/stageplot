/* I filtri dell'elenco musicisti. Logica pura: riceve le righe di `orc_musicians_list` e i filtri scelti,
   restituisce chi resta. Sta qui, e non nella pagina, per poterla provare senza browser. */

export const LETTURA = [["", "Qualsiasi"], ["1", "Almeno base"], ["2", "Almeno buona"], ["3", "Ottima"]];
export const ESPERIENZE = { esp_orchestrale: "Orchestrale", esp_pop: "Pop", esp_live: "Live", esp_studio: "Studio", esp_teatro_musical: "Teatro e musical" };

/* i filtri e il loro nome nell'indirizzo: così un filtro si ricarica e si manda a un collega */
export const PARAMETRI = { q: "q", family: "fam", status: "st", genre: "gen", reading: "let", exp: "esp", zone: "zona", tag: "tag" };
export const ALTRI = ["genre", "reading", "exp", "zone", "tag"];

export function vuoti() { return { q: "", family: "", status: "", genre: "", reading: "", exp: "", zone: "", tag: "" }; }

export function norm(s) { return String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim(); }

/* la zona di un musicista: la sigla della provincia e l'area che ha scritto («Veneto», «Nord-Est») */
export function zone(m) {
  const out = [];
  const p = String(m.province || "").trim().toUpperCase();
  if (p) out.push(p);
  const a = String(m.area || "").trim();
  if (a) out.push(a);
  return out;
}

/* le scelte dei menu, prese da chi c'è nel pool: niente opzioni che danno zero risultati */
export function opzioni(rows) {
  const generi = new Set(), province = new Set(), aree = new Map(), tag = new Map();
  for (const m of rows) {
    for (const g of m.genres || []) if (norm(g)) generi.add(norm(g));
    const p = String(m.province || "").trim().toUpperCase();
    if (p) province.add(p);
    const a = String(m.area || "").trim();
    if (a && !aree.has(norm(a))) aree.set(norm(a), a);
    for (const t of m.tags || []) if (norm(t) && !tag.has(norm(t))) tag.set(norm(t), String(t).trim());
  }
  const alfa = (a, b) => a.localeCompare(b, "it");
  return {
    generi: [...generi].sort(alfa),
    zone: [...[...province].sort(alfa), ...[...aree.values()].sort(alfa)],
    tag: [...tag.values()].sort(alfa),
  };
}

export function filtra(rows, F) {
  const q = norm(F.q);
  const parole = q ? q.split(/\s+/) : [];
  const soglia = Number(F.reading) || 0;
  return rows.filter((m) => {
    if (F.family && m.primary_family !== F.family) return false;
    if (F.status && m.status !== F.status) return false;
    if (F.genre && !(m.genres || []).some((g) => norm(g) === norm(F.genre))) return false;
    if (soglia && (Number(m.reading) || 0) < soglia) return false;
    if (F.exp && !(m.experiences || []).includes(F.exp)) return false;
    if (F.zone && !zone(m).some((z) => norm(z) === norm(F.zone))) return false;
    if (F.tag && !(m.tags || []).some((t) => norm(t) === norm(F.tag))) return false;
    if (!parole.length) return true;
    const hay = norm([m.first_name, m.last_name, m.city, m.province, m.area, ...(m.instruments || []), ...(m.tags || []), ...(m.genres || [])].join(" "));
    return parole.every((w) => hay.includes(w));
  });
}

/* quanti dei filtri «in più» sono accesi: si scrive accanto a «Altri filtri», che da chiuso non si vede */
export function altriAttivi(F) { return ALTRI.filter((k) => F[k]).length; }

export function daIndirizzo(search) {
  const u = new URLSearchParams(search), F = vuoti();
  for (const [k, p] of Object.entries(PARAMETRI)) F[k] = u.get(p) || "";
  return F;
}

export function aIndirizzo(F) {
  const u = new URLSearchParams();
  for (const [k, p] of Object.entries(PARAMETRI)) if (F[k]) u.set(p, F[k]);
  return u.toString();
}
