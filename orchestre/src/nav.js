/* Le schede dell'area admin. Le voci senza pagina restano visibili ma disattivate: sono il menu,
   non bottoni finti dentro un flusso. */
import { BASE } from "./config.js";

export function tabs(active) {
  const items = [
    ["home", "Home", BASE + "/admin/"],
    ["musicisti", "Musicisti", null],
    ["produzioni", "Produzioni", null],
    ["impostazioni", "Impostazioni", BASE + "/admin/impostazioni/"],
  ];
  return `<nav class="nav-tabs" aria-label="Sezioni">${items.map(([k, label, href]) =>
    href
      ? `<a href="${href}" data-tab="${k}"${k === active ? ' aria-current="page"' : ""}>${label}</a>`
      : `<a data-tab="${k}" aria-disabled="true" title="In arrivo nei prossimi lotti">${label}</a>`).join("")}</nav>`;
}
