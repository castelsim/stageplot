/* Dashboard dell'organizzazione. Nel lotto 1 mostra chi sei, dove sei e i membri; le liste di cose
   da fare (candidature, inviti senza risposta, posti scoperti) si riempiono nei lotti successivi. */
import { BASE } from "../config.js";
import { esc, el, roleLabel, setState, errMsg } from "../ui.js";
import { requireStaff, mountTopbar } from "../auth.js";
import { listMembers } from "../api/org.js";
import { list as listProductions } from "../api/productions.js";
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
    const prods = (await listProductions(ctx.org.org_id)).filter((p) => Number(p.n_open) > 0 && !["done", "cancelled", "archived"].includes(p.status));
    if (!prods.length) setState(todo, "empty", "Nessun posto scoperto nelle produzioni aperte.");
    else {
      setState(todo, "");
      todo.innerHTML = `<ul class="list compact"></ul>`;
      for (const p of prods) {
        const li = el(`<li class="list-item"><a class="grow" href="${BASE}/admin/produzioni/scheda/?id=${esc(p.id)}&t=matching"><div class="title"></div><div class="sub"></div></a></li>`);
        li.querySelector(".title").textContent = p.title;
        li.querySelector(".sub").textContent = p.n_open + (Number(p.n_open) === 1 ? " posto scoperto" : " posti scoperti") + " su " + p.n_seats;
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
