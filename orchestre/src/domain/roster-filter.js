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

/* Ricerca che perdona i refusi («vioino», «fagoto», «dalligna»). Si usa SOLO quando la ricerca esatta non trova nessuno: così chi scrive
   giusto non vede mai risultati in più. Ogni parola cercata deve somigliare a una parola della scheda: stessa parola con al più 1 errore
   (2 se lunga 8 o più), contando anche l'inizio di una parola più lunga («viol» è già coperto dall'inclusione, qui no).
   Parole sotto le 4 lettere non si correggono: troppi falsi. */
export function distanza(a, b) {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > 2) return 3;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length];
}
export function paroleSimili(w, hay) {
  if (w.length < 4) return false;
  const tol = w.length >= 8 ? 2 : 1;
  /* «Dall'Igna» si scrive anche «Dalligna»: si confronta sia con i pezzi separati dall'apostrofo o dal trattino, sia con la parola unita */
  const pezzi = new Set(hay.split(/[^a-z0-9]+/).filter(Boolean));
  for (const t of hay.split(/\s+/)) { const u = t.replace(/[^a-z0-9]/g, ""); if (u) pezzi.add(u); }
  return [...pezzi].some((t) => distanza(w, t) <= tol);
}
export function filtraSimili(rows, F) {
  const parole = norm(F.q).split(/\s+/).filter(Boolean);
  if (!parole.length) return [];
  const senzaTesto = filtra(rows, { ...F, q: "" });
  return senzaTesto.filter((m) => {
    const hay = norm([m.first_name, m.last_name, m.city, m.province, m.area, ...(m.instruments || []), ...(m.tags || []), ...(m.genres || [])].join(" "));
    return parole.every((w) => hay.includes(w) || paroleSimili(w, hay));
  });
}
