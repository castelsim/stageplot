/* Il pool dei musicisti: ricerca immediata, filtri per famiglia e stato, lista a card. */
import { BASE } from "../config.js";
import { esc, el, setState, errMsg } from "../ui.js";
import { requireStaff, mountTopbar } from "../auth.js";
import { tabs, STATUS, STATUS_PILL, FAMILY } from "../nav.js";
import { list } from "../api/musicians.js";

const app = document.getElementById("app");
let ctx = null, all = [];
const F = { q: "", family: "", status: "" };

function norm(s) { return String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, ""); }

async function main() {
  ctx = await requireStaff();
  if (!ctx) return;
  mountTopbar(ctx, { active: "musicisti" });
  app.className = "o-wrap";
  app.innerHTML = tabs("musicisti") + `
    <div class="row"><h1>Musicisti</h1><span class="spacer"></span>
      <a class="btn" href="${BASE}/admin/musicisti/importa/">Importa CSV</a>
      <a class="btn primary" href="${BASE}/admin/musicisti/scheda/?new=1">Aggiungi</a></div>
    <div class="filters">
      <div class="field"><label for="q">Cerca</label><input id="q" type="search" placeholder="Nome, strumento, città, tag" autocomplete="off"></div>
      <div class="field"><label for="fam">Famiglia</label><select id="fam"><option value="">Tutte</option>${Object.entries(FAMILY).map(([k, v]) => `<option value="${k}">${v}</option>`).join("")}</select></div>
      <div class="field"><label for="st">Stato</label><select id="st"><option value="">Tutti</option>${Object.entries(STATUS).map(([k, v]) => `<option value="${k}">${v}</option>`).join("")}</select></div>
    </div>
    <p class="small muted" id="count"></p>
    <ul class="list" id="list"><li class="loading">Un attimo…</li></ul>`;
  try {
    const q = new URLSearchParams(location.search);
    F.q = q.get("q") || ""; F.family = q.get("fam") || ""; F.status = q.get("st") || "";
    app.querySelector("#q").value = F.q; app.querySelector("#fam").value = F.family; app.querySelector("#st").value = F.status;
  } catch { /* parametri assenti */ }
  app.querySelector("#q").oninput = (e) => { F.q = e.target.value; paint(); };
  app.querySelector("#fam").onchange = (e) => { F.family = e.target.value; paint(); };
  app.querySelector("#st").onchange = (e) => { F.status = e.target.value; paint(); };
  try {
    all = await list(ctx.org.org_id);
    paint();
  } catch (e) {
    const ul = app.querySelector("#list"); ul.innerHTML = ""; setState(ul, "err", errMsg(e));
  }
}

function paint() {
  const ul = app.querySelector("#list");
  const q = norm(F.q);
  const rows = all.filter((m) => {
    if (F.family && m.primary_family !== F.family) return false;
    if (F.status && m.status !== F.status) return false;
    if (!q) return true;
    const hay = norm([m.first_name, m.last_name, m.city, m.province, ...(m.instruments || []), ...(m.tags || [])].join(" "));
    return q.split(/\s+/).every((w) => hay.includes(w));
  });
  const p = new URLSearchParams(); if (F.q) p.set("q", F.q); if (F.family) p.set("fam", F.family); if (F.status) p.set("st", F.status);
  history.replaceState(null, "", location.pathname + (p.toString() ? "?" + p : ""));
  app.querySelector("#count").textContent = rows.length === all.length
    ? (all.length === 1 ? "1 musicista" : all.length + " musicisti")
    : rows.length + " su " + all.length;
  ul.innerHTML = "";
  if (!all.length) { ul.appendChild(el(`<li class="empty">Il pool è vuoto. Aggiungi un musicista o importa un CSV.</li>`)); return; }
  if (!rows.length) { ul.appendChild(el(`<li class="empty">Nessun musicista con questi filtri.</li>`)); return; }
  for (const m of rows) {
    const li = el(`<li class="list-item"><a class="grow" href="${BASE}/admin/musicisti/scheda/?id=${esc(m.id)}">
      <div class="title"></div><div class="sub"></div></a><div class="actions"></div></li>`);
    li.querySelector(".title").textContent = m.last_name + " " + m.first_name;
    li.querySelector(".sub").textContent = [m.primary_instrument || "senza strumento", (m.instruments || []).slice(1).length ? "+ " + m.instruments.slice(1).join(", ") : "", [m.city, m.province].filter(Boolean).join(" ")].filter(Boolean).join(" · ");
    const act = li.querySelector(".actions");
    for (const t of (m.tags || []).slice(0, 3)) { const s = el(`<span class="pill"></span>`); s.textContent = t; act.appendChild(s); }
    if (m.status !== "active") act.appendChild(el(`<span class="pill ${STATUS_PILL[m.status] || ""}">${esc(STATUS[m.status] || m.status)}</span>`));
    ul.appendChild(li);
  }
}

main();
