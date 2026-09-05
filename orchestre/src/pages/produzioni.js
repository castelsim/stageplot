/* Le produzioni dell'organizzazione: una card ciascuna con date, stato e posti coperti. */
import { BASE } from "../config.js";
import { esc, el, setState, errMsg, fmtDate } from "../ui.js";
import { requireStaff, mountTopbar } from "../auth.js";
import { tabs } from "../nav.js";
import { PROD_STATUS, PROD_STATUS_PILL, PROD_KIND } from "../domain/staffing.js";
import { list } from "../api/productions.js";

const app = document.getElementById("app");
let ctx = null, all = [];
const F = { q: "", status: "" };
const GROUPS = { aperte: ["draft", "planning", "staffing", "collecting", "partial", "complete", "confirmed", "running"], concluse: ["done"], altre: ["cancelled", "archived"] };

async function main() {
  ctx = await requireStaff();
  if (!ctx) return;
  mountTopbar(ctx, { active: "produzioni" });
  app.className = "o-wrap";
  app.innerHTML = tabs("produzioni") + `
    <div class="row"><h1>Produzioni</h1><span class="spacer"></span><a class="btn primary" href="${BASE}/admin/produzioni/scheda/?new=1">Nuova produzione</a></div>
    <div class="filters two">
      <div class="field"><label for="q">Cerca</label><input id="q" type="search" placeholder="Titolo, cliente, direttore, luogo" autocomplete="off"></div>
      <div class="field"><label for="st">Mostra</label><select id="st"><option value="">In corso e in preparazione</option><option value="concluse">Concluse</option><option value="altre">Annullate e archiviate</option><option value="tutte">Tutte</option></select></div>
    </div>
    <ul class="list" id="list"><li class="loading">Un attimo…</li></ul>`;
  app.querySelector("#q").oninput = (e) => { F.q = e.target.value; paint(); };
  app.querySelector("#st").onchange = (e) => { F.status = e.target.value; paint(); };
  try { all = await list(ctx.org.org_id); paint(); }
  catch (e) { const ul = app.querySelector("#list"); ul.innerHTML = ""; setState(ul, "err", errMsg(e)); }
}

function paint() {
  const ul = app.querySelector("#list");
  const q = F.q.trim().toLowerCase();
  const allowed = F.status === "tutte" ? null : GROUPS[F.status || "aperte"];
  const rows = all.filter((p) => (!allowed || allowed.includes(p.status)) &&
    (!q || [p.title, p.client, p.conductor, p.venue].join(" ").toLowerCase().includes(q)));
  ul.innerHTML = "";
  if (!all.length) { ul.appendChild(el(`<li class="empty">Nessuna produzione. Creane una: titolo, date, organico.</li>`)); return; }
  if (!rows.length) { ul.appendChild(el(`<li class="empty">Niente con questi filtri.</li>`)); return; }
  for (const p of rows) {
    const li = el(`<li class="list-item"><a class="grow" href="${BASE}/admin/produzioni/scheda/?id=${esc(p.id)}"><div class="title"></div><div class="sub"></div></a><div class="actions"></div></li>`);
    li.querySelector(".title").textContent = p.title;
    const when = p.first_date ? (p.last_date && fmtDate(p.last_date) !== fmtDate(p.first_date) ? fmtDate(p.first_date) + " → " + fmtDate(p.last_date) : fmtDate(p.first_date)) : "date da definire";
    li.querySelector(".sub").textContent = [PROD_KIND[p.kind] || p.kind, when, p.venue, p.conductor ? "dir. " + p.conductor : ""].filter(Boolean).join(" · ");
    const act = li.querySelector(".actions");
    const seats = Number(p.n_seats), filled = Number(p.n_filled), open = Number(p.n_open);
    if (seats) act.appendChild(el(`<span class="pill ${open ? "warn" : "ok"}">${filled}/${seats} posti</span>`));
    act.appendChild(el(`<span class="pill ${PROD_STATUS_PILL[p.status] || ""}">${esc(PROD_STATUS[p.status] || p.status)}</span>`));
    ul.appendChild(li);
  }
}

main();
