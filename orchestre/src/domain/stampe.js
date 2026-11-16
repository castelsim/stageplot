/* Stampe dell'organico: dallo snapshot del server (orc_staffing_stamp, 0086) alle sezioni da stampare, al
   «cambiato rispetto a prima» e ai CSV. Puro: niente rete, niente DOM (testato in Node). */
import { SLOT_STATUS, PART } from "./staffing.js";

const ORDINE_STATO = { confirmed: 0, reserve: 1, invited: 2, open: 3, replaced: 4, cancelled: 5 };

/* Chiave stabile di un posto, per confrontare due versioni. */
export function chiavePosto(r) { return [r.section || "", r.role || "", r.seat].join("␟"); }

/* snapshot → [{ name, righe:[{ruolo, strumento, parte, posto, stato, persona}] }] nell'ordine dello snapshot. */
export function sezioniDaSnapshot(snap) {
  const out = []; let cur = null;
  for (const r of snap || []) {
    if (!cur || cur.name !== (r.section || "Senza sezione")) { cur = { name: r.section || "Senza sezione", righe: [] }; out.push(cur); }
    cur.righe.push({ ruolo: r.role, strumento: r.instrument || "", parte: PART[r.part] || "", posto: r.seat, stato: r.status || "open", statoEt: SLOT_STATUS[r.status || "open"] || r.status, persona: r.musician || "" });
  }
  return out;
}

export function conteggi(snap) {
  const posti = (snap || []).filter((r) => r.seat != null);
  const conf = posti.filter((r) => r.status === "confirmed").length;
  return { posti: posti.length, confermati: conf, scoperti: posti.filter((r) => r.status === "open").length, invitati: posti.filter((r) => r.status === "invited").length, riserve: posti.filter((r) => r.status === "reserve").length };
}

/* Cosa è cambiato fra due snapshot: persone arrivate/partite/sostituite, posti nuovi/tolti, stato cambiato. */
export function differenze(prima, dopo) {
  const mp = new Map((prima || []).filter((r) => r.seat != null).map((r) => [chiavePosto(r), r]));
  const md = new Map((dopo || []).filter((r) => r.seat != null).map((r) => [chiavePosto(r), r]));
  const righe = [];
  const nome = (r) => r.role + (r.seat > 1 || (dopo || []).filter((x) => x.role === r.role && x.section === r.section).length > 1 ? " · posto " + r.seat : "");
  for (const [k, d] of md) {
    const p = mp.get(k);
    if (!p) { righe.push({ tipo: "nuovo", testo: `${nome(d)}: posto nuovo${d.musician ? ", " + d.musician : ""}` }); continue; }
    if ((p.musician_id || null) !== (d.musician_id || null)) {
      righe.push({ tipo: "persona", testo: `${nome(d)}: ${p.musician || "scoperto"} → ${d.musician || "scoperto"}` });
    } else if (p.status !== d.status) {
      righe.push({ tipo: "stato", testo: `${nome(d)}${d.musician ? " (" + d.musician + ")" : ""}: ${SLOT_STATUS[p.status] || p.status} → ${SLOT_STATUS[d.status] || d.status}` });
    }
  }
  for (const [k, p] of mp) if (!md.has(k)) righe.push({ tipo: "tolto", testo: `${nome(p)}: posto tolto${p.musician ? " (era " + p.musician + ")" : ""}` });
  return righe;
}

/* Data nel piè di pagina: GG/MM/AAAA, sempre. */
export function dataIt(d) {
  const x = new Date(d); const z = (n) => String(n).padStart(2, "0");
  return `${z(x.getDate())}/${z(x.getMonth() + 1)}/${x.getFullYear()}`;
}
export function pieDiPagina(version, at) { return `v${version} · ${dataIt(at)}`; }

/* Lista convocati: una riga per persona con ruolo, stato dell'invito/posto. Ordine: confermati, riserve, invitati, scoperti. */
export function listaConvocati(snap) {
  return (snap || []).filter((r) => r.seat != null && r.musician)
    .map((r) => ({ persona: r.musician, ruolo: r.role + (r.seat > 1 ? " · posto " + r.seat : ""), sezione: r.section || "", stato: r.status, statoEt: SLOT_STATUS[r.status] || r.status }))
    .sort((a, b) => (ORDINE_STATO[a.stato] ?? 9) - (ORDINE_STATO[b.stato] ?? 9) || a.persona.localeCompare(b.persona, "it"));
}

/* CSV per Excel italiano: separatore «;», BOM, virgolette sempre; le celle che iniziano con = + - @ perdono l'effetto formula. */
export function cella(v) {
  let s = v == null ? "" : String(v).replace(/\r?\n/g, " ");
  if (/^[=+\-@\t]/.test(s)) s = "'" + s;
  return '"' + s.replace(/"/g, '""') + '"';
}
export function csv(intestazioni, righe) {
  return "\uFEFF" + [intestazioni, ...righe].map((r) => r.map(cella).join(";")).join("\r\n") + "\r\n";
}
export function csvPool(musicisti) {
  return csv(["Cognome", "Nome", "Email", "Telefono", "Città", "Provincia", "Strumenti", "Tag", "Stato"],
    (musicisti || []).map((m) => [m.last_name, m.first_name, m.email, m.phone, m.city, m.province, (m.instruments || []).join(" | "), (m.tags || []).join(" | "), m.status]));
}
