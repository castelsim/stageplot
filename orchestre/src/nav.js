/* Le schede dell'area admin. Le voci senza pagina restano visibili ma disattivate: sono il menu,
   non bottoni finti dentro un flusso. */
import { BASE } from "./config.js";

export function tabs(active) {
  const items = [
    ["home", "Home", BASE + "/admin/"],
    ["musicisti", "Musicisti", BASE + "/admin/musicisti/"],
    ["produzioni", "Produzioni", null],
    ["impostazioni", "Impostazioni", BASE + "/admin/impostazioni/"],
  ];
  return `<nav class="nav-tabs" aria-label="Sezioni">${items.map(([k, label, href]) =>
    href
      ? `<a href="${href}" data-tab="${k}"${k === active ? ' aria-current="page"' : ""}>${label}</a>`
      : `<a data-tab="${k}" aria-disabled="true" title="In arrivo nei prossimi lotti">${label}</a>`).join("")}</nav>`;
}

export const STATUS = { active: "Attivo", reserve: "Riserva", suspended: "Sospeso", archived: "Archiviato" };
export const STATUS_PILL = { active: "ok", reserve: "accent", suspended: "warn", archived: "" };
export const FAMILY = { archi: "Archi", legni: "Legni", ottoni: "Ottoni", percussioni: "Percussioni", tastiere: "Tastiere", corde: "Corde", voci: "Voci", direzione: "Direzione", ritmica: "Ritmica" };
export const REP_KIND = { composer: "Compositore", work: "Brano", program: "Programma", genre: "Genere" };
export const REP_SOURCE = { declared: "dichiarato", verified: "verificato", history: "dallo storico" };
