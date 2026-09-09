/* Le produzioni dell'organizzazione: una card ciascuna con date, stato e posti coperti.
   ?p=<progetto StagePlot> arriva dal menu File dell'editor: porta alla produzione collegata, o propone di crearla. */
import { BASE } from "../config.js";
import { esc, el, setState, errMsg, fmtDate, toast } from "../ui.js";
import { requireStaff, mountTopbar } from "../auth.js";
import { tabs } from "../nav.js";
import { PROD_STATUS, PROD_STATUS_PILL, PROD_KIND } from "../domain/staffing.js";
import { list } from "../api/productions.js";
import { productionsForProject } from "../api/stageplot.js";
import { isUuid } from "../domain/stageplot-import.js";

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
  const proj = new URLSearchParams(location.search).get("p");
  if (isUuid(proj)) { try { if (await fromEditor(proj)) return; } catch (e) { toast(errMsg(e), { err: true }); } }
  try { all = await list(ctx.org.org_id); paint(); }
  catch (e) { const ul = app.querySelector("#list"); ul.innerHTML = ""; setState(ul, "err", errMsg(e)); }
}

/* dall'editor: una sola produzione collegata → ci vai; nessuna → la crei già collegata; più d'una → scegli */
async function fromEditor(proj) {
  const linked = await productionsForProject(proj);
  if (linked.length === 1) { location.replace(BASE + "/admin/produzioni/scheda/?id=" + linked[0].id + "&t=stageplot"); return true; }
  const b = el(`<section class="card banner"><h3></h3><p class="small muted"></p><div class="row" id="bAct"></div></section>`);
  if (!linked.length) {
    b.querySelector("h3").textContent = "Questo progetto StagePlot non è collegato a nessuna produzione";
    b.querySelector("p").textContent = "Creane una: nasce già collegata, poi importi le postazioni del palco come posti dell'organico. Oppure apri una produzione esistente e collegala dalla scheda «StagePlot».";
    b.querySelector("#bAct").appendChild(el(`<a class="btn primary" href="${BASE}/admin/produzioni/scheda/?new=1&p=${esc(proj)}">Nuova produzione collegata</a>`));
  } else {
    b.querySelector("h3").textContent = "Questo progetto è collegato a più produzioni";
    b.querySelector("p").textContent = "Scegli quella su cui lavorare.";
    for (const l of linked) b.querySelector("#bAct").appendChild(el(`<a class="btn" href="${BASE}/admin/produzioni/scheda/?id=${esc(l.id)}&t=stageplot">${esc(l.title)}</a>`));
  }
  app.querySelector("h1").parentNode.after(b);
  return false;
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
