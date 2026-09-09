/* Le candidature ricevute dall'organizzazione: elenco con filtri per stato. */
import { BASE } from "../config.js";
import { esc, el, setState, errMsg, fmtDate } from "../ui.js";
import { requireStaff, mountTopbar } from "../auth.js";
import { tabs } from "../nav.js";
import { APP_STATUS, APP_PILL } from "../domain/applications.js";
import { list, orgSettings } from "../api/applications.js";

const app = document.getElementById("app");
let ctx = null, all = [];
const F = { q: "", status: "" };
const GROUPS = { aperte: ["submitted", "evaluating", "interview_to_schedule", "interview_scheduled", "audition_to_schedule", "audition_scheduled"], decise: ["reserve", "accepted", "rejected"], altre: ["suspended", "archived"] };

async function main() {
  ctx = await requireStaff();
  if (!ctx) return;
  mountTopbar(ctx, { active: "candidature" });
  app.className = "o-wrap";
  app.innerHTML = tabs("candidature") + `
    <div class="row"><h1>Candidature</h1><span class="spacer"></span><span id="accepting"></span></div>
    <div class="filters two">
      <div class="field"><label for="q">Cerca</label><input id="q" type="search" placeholder="Nome, strumento, città" autocomplete="off"></div>
      <div class="field"><label for="st">Mostra</label><select id="st"><option value="">Da valutare e in corso</option><option value="decise">Decise</option><option value="altre">Sospese e archiviate</option><option value="tutte">Tutte</option></select></div>
    </div>
    <ul class="list" id="list"><li class="loading">Un attimo…</li></ul>`;
  app.querySelector("#q").oninput = (e) => { F.q = e.target.value; paint(); };
  app.querySelector("#st").onchange = (e) => { F.status = e.target.value; paint(); };
  try {
    const [rows, s] = await Promise.all([list(ctx.org.org_id), orgSettings(ctx.org.org_id)]);
    all = rows;
    const acc = app.querySelector("#accepting");
    acc.innerHTML = s.accepting_applications ? `<span class="pill ok">Candidature aperte</span> <a class="btn small ghost" href="${BASE}/admin/impostazioni/">Impostazioni</a>` : `<span class="pill warn">Candidature chiuse</span> <a class="btn small ghost" href="${BASE}/admin/impostazioni/">Apri</a>`;
    paint();
  } catch (e) { const ul = app.querySelector("#list"); ul.innerHTML = ""; setState(ul, "err", errMsg(e)); }
}

function paint() {
  const ul = app.querySelector("#list");
  const q = F.q.trim().toLowerCase();
  const allowed = F.status === "tutte" ? null : GROUPS[F.status || "aperte"];
  const rows = all.filter((a) => (!allowed || allowed.includes(a.status)) && (!q || [a.first_name, a.last_name, a.city, ...(a.instruments || [])].join(" ").toLowerCase().includes(q)));
  ul.innerHTML = "";
  if (!all.length) { ul.appendChild(el(`<li class="empty">Nessuna candidatura ricevuta. Le candidature arrivano da <code>/orchestre/candidatura/</code> quando sono aperte.</li>`)); return; }
  if (!rows.length) { ul.appendChild(el(`<li class="empty">Niente con questi filtri.</li>`)); return; }
  for (const a of rows) {
    const li = el(`<li class="list-item"><a class="grow" href="${BASE}/admin/candidature/scheda/?id=${esc(a.id)}"><div class="title"></div><div class="sub"></div></a><div class="actions"></div></li>`);
    li.querySelector(".title").textContent = a.last_name + " " + a.first_name;
    li.querySelector(".sub").textContent = [a.primary_instrument || "senza strumento", [a.city, a.province].filter(Boolean).join(" "), a.submitted_at ? "inviata " + fmtDate(a.submitted_at) : "", Number(a.n_evaluations) ? a.n_evaluations + (Number(a.n_evaluations) === 1 ? " valutazione" : " valutazioni") : ""].filter(Boolean).join(" · ");
    const act = li.querySelector(".actions");
    if (a.deletion_requested_at) act.appendChild(el(`<span class="pill danger">chiede la cancellazione</span>`));
    act.appendChild(el(`<span class="pill ${APP_PILL[a.status] || ""}">${esc(APP_STATUS[a.status] || a.status)}</span>`));
    ul.appendChild(li);
  }
}

main();
