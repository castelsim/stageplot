/* Dashboard dell'organizzazione. Nel lotto 1 mostra chi sei, dove sei e i membri; le liste di cose
   da fare (candidature, inviti senza risposta, posti scoperti) si riempiono nei lotti successivi. */
import { BASE } from "../config.js";
import { esc, el, roleLabel, setState, errMsg } from "../ui.js";
import { requireStaff, mountTopbar } from "../auth.js";
import { listMembers } from "../api/org.js";
import { list as listProductions } from "../api/productions.js";
import { openCounts } from "../api/invitations.js";
import { list as listApplications } from "../api/applications.js";
import { sb } from "../sb.js";
import { tabs } from "../nav.js";

const app = document.getElementById("app");

async function main() {
  const ctx = await requireStaff();
  if (!ctx) return;
  mountTopbar(ctx, { active: "home" });
  app.className = "o-wrap";
  app.innerHTML = tabs("home") + `
    <h1>${esc(ctx.org.org_name)}</h1>
    <p class="muted">Sei ${esc(roleLabel(ctx.org.role).toLowerCase())}.</p>
    <div class="grid3">
      <section class="card"><h3>Da fare</h3><div id="todo"></div></section>
      <section class="card"><h3>Membri</h3><div id="members" class="loading">Un attimo…</div></section>
      <section class="card"><h3>Prossimi passi</h3>
        <p class="small muted">Lotto 2: il pool dei musicisti e lo storico. Lotto 3: produzioni e organico. Poi matching, convocazioni, storico, candidature, collegamento a StagePlot.</p>
      </section>
    </div>`;
  const todo = app.querySelector("#todo");
  setState(todo, "loading");
  try {
    const [all, invs] = await Promise.all([listProductions(ctx.org.org_id), openCounts(ctx.org.org_id)]);
    const prods = all.filter((p) => Number(p.n_open) > 0 && !["done", "cancelled", "archived"].includes(p.status));
    const byProd = {};
    for (const i of invs) { const b = byProd[i.production_id] || (byProd[i.production_id] = { toConfirm: 0, waiting: 0, noReply: 0 }); if (["available", "partial"].includes(i.status)) b.toConfirm++; else if (i.status === "no_reply") b.noReply++; else b.waiting++; }
    /* produzioni concluse senza feedback: lo storico si costruisce qui */
    const doneProds = all.filter((p) => p.status === "done" && Number(p.n_filled) > 0);
    let noFb = [];
    if (doneProds.length) {
      const { data: fbs } = await sb.from("orc_performance_feedback").select("production_id").in("production_id", doneProds.map((p) => p.id));
      const has = new Set((fbs || []).map((f) => f.production_id));
      noFb = doneProds.filter((p) => !has.has(p.id));
    }
    const apps = (await listApplications(ctx.org.org_id).catch(() => [])).filter((a) => ["submitted", "evaluating", "interview_to_schedule", "audition_to_schedule"].includes(a.status));
    if (!prods.length && !noFb.length && !apps.length) setState(todo, "empty", "Niente in sospeso: nessun posto scoperto, nessun feedback da registrare, nessuna candidatura da valutare.");
    else {
      setState(todo, "");
      todo.innerHTML = `<ul class="list compact"></ul>`;
      if (apps.length) {
        const li = el(`<li class="list-item"><a class="grow" href="${BASE}/admin/candidature/"><div class="title"></div><div class="sub"></div></a></li>`);
        li.querySelector(".title").textContent = apps.length + (apps.length === 1 ? " candidatura da valutare" : " candidature da valutare");
        li.querySelector(".sub").textContent = apps.slice(0, 3).map((a) => a.last_name + " " + a.first_name + (a.primary_instrument ? " · " + a.primary_instrument : "")).join(", ") + (apps.length > 3 ? "…" : "");
        todo.querySelector("ul").appendChild(li);
      }
      for (const p of prods) {
        const b = byProd[p.id] || { toConfirm: 0, waiting: 0, noReply: 0 };
        const li = el(`<li class="list-item"><a class="grow" href="${BASE}/admin/produzioni/scheda/?id=${esc(p.id)}&t=${b.toConfirm || b.waiting || b.noReply ? "convocazioni" : "matching"}"><div class="title"></div><div class="sub"></div></a></li>`);
        li.querySelector(".title").textContent = p.title;
        li.querySelector(".sub").textContent = [p.n_open + (Number(p.n_open) === 1 ? " posto scoperto" : " posti scoperti") + " su " + p.n_seats,
          b.toConfirm ? b.toConfirm + " da confermare" : "", b.waiting ? b.waiting + " in attesa" : "", b.noReply ? b.noReply + " senza risposta" : ""].filter(Boolean).join(" · ");
        todo.querySelector("ul").appendChild(li);
      }
      for (const p of noFb) {
        const li = el(`<li class="list-item"><a class="grow" href="${BASE}/admin/produzioni/scheda/?id=${esc(p.id)}&t=feedback"><div class="title"></div><div class="sub"></div></a></li>`);
        li.querySelector(".title").textContent = p.title;
        li.querySelector(".sub").textContent = "conclusa: feedback da registrare per " + p.n_filled + (Number(p.n_filled) === 1 ? " musicista" : " musicisti");
        todo.querySelector("ul").appendChild(li);
      }
    }
  } catch (e) { setState(todo, "err", errMsg(e)); }
  const mem = app.querySelector("#members");
  try {
    const list = await listMembers(ctx.org.org_id);
    setState(mem, "");
    mem.innerHTML = `<p class="num">${list.length}</p><p class="small muted">${list.length === 1 ? "una persona" : "persone"} con accesso</p>
      <a class="btn small" href="${BASE}/admin/impostazioni/">Gestisci</a>`;
  } catch (e) {
    setState(mem, "err", errMsg(e));
  }
}

main();
