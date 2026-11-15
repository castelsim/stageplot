/* Condizioni versionate (V1/d): come si raccontano le differenze fra due versioni, e chi c'è da riconfermare.
   Funzioni pure: le usano la scheda dello staff e la pagina del musicista; si provano in Node.
   Le versioni vere stanno nel database (migrazione 0084): qui solo come si leggono. */

export const COND_LABEL = { fee_note: "Compenso", dates: "Date", venue: "Luogo", address: "Indirizzo", dress_code: "Abbigliamento", conditions: "Condizioni" };
const ORDINE = ["fee_note", "dates", "venue", "address", "dress_code", "conditions"];
const DATE_KIND = { rehearsal: "Prova", concert: "Concerto", recording: "Registrazione", travel: "Viaggio", other: "Altro" };

/* una data dello snapshot, in italiano (le date nello snapshot sono in UTC: si mostrano nel fuso di chi guarda) */
export function snapDateLine(d) {
  const t = new Date(d.starts_at);
  const quando = isNaN(t) ? "" : t.toLocaleString("it-IT", { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  return `${DATE_KIND[d.kind] || d.kind || ""} · ${quando}` + (d.venue ? " · " + d.venue : "") + (d.note ? " (" + d.note + ")" : "");
}

/* righe «cosa è cambiato»: [{key, label, was, is}], in ordine di importanza. `was`/`is` sono testo; per le date, l'elenco com'è ora */
export function changeRows(ch) {
  if (!ch || !Array.isArray(ch.changed)) return [];
  const rows = [];
  for (const k of ORDINE.filter((x) => ch.changed.includes(x))) {
    if (k === "dates") {
      const f = (s) => ((s && s.dates) || []).map(snapDateLine).join("\n") || "da definire";
      rows.push({ key: k, label: COND_LABEL[k], was: f(ch.before), is: f(ch.after) });
    } else {
      rows.push({ key: k, label: COND_LABEL[k], was: String((ch.before && ch.before[k]) ?? "").trim() || "(vuoto)", is: String((ch.after && ch.after[k]) ?? "").trim() || "(vuoto)" });
    }
  }
  return rows;
}

/* chi manca (da orc_reconfirm_needed): quanti, quanti per un cambio importante, quanti sono già stati sollecitati */
export function reconfirmSummary(rows) {
  const list = Array.isArray(rows) ? rows : [];
  const material = list.filter((r) => r.material);
  const asked = list.filter((r) => r.requested_at);
  const toAsk = material.filter((r) => !r.requested_at && r.notification_status !== "pending" && r.notification_status !== "sending");
  const version = list.reduce((m, r) => Math.max(m, Number(r.current_version) || 0), 0);
  return { total: list.length, material: material.length, asked: asked.length, toAsk: toAsk.map((r) => r.invitation_id), version };
}

/* «5 persone da riconfermare» · «1 persona da riconfermare» */
export function reconfirmText(n) {
  if (!n) return "";
  return n + (n === 1 ? " persona da riconfermare" : " persone da riconfermare");
}

/* nome breve dei campi cambiati, per la riga dell'elenco: «compenso, date» */
export function changedNames(changed) {
  return ORDINE.filter((k) => (changed || []).includes(k)).map((k) => COND_LABEL[k].toLowerCase()).join(", ");
}

/* la voce di Storia: «Condizioni v3 · compenso · Violini» */
export function versionTitle(h) {
  if (!h) return "";
  if (Number(h.version) === 0) return "Condizioni alla prima convocazione" + (h.role_name ? " · " + h.role_name : "");
  return "Condizioni v" + h.version + (h.changed && h.changed.length ? " · " + changedNames(h.changed) : "") + (h.role_name ? " · " + h.role_name : "");
}
