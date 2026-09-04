/* Impostazioni dell'organizzazione: nome, membri e ruoli, registro delle azioni.
   Ogni scrittura passa da una RPC che ricontrolla il ruolo sul server. */
import { ROLES } from "../config.js";
import { esc, el, toast, confirm, setState, roleLabel, fmtDateTime, errMsg } from "../ui.js";
import { requireStaff, mountTopbar } from "../auth.js";
import { listMembers, setRole, addByEmail, renameOrg, listAudit } from "../api/org.js";
import { tabs } from "../nav.js";

const app = document.getElementById("app");
let ctx = null;
let canManage = false;   /* owner/admin: cambia ruoli e aggiunge membri */

const ASSIGNABLE = ["admin", "artistic", "production", "section", "viewer"];

async function main() {
  ctx = await requireStaff();
  if (!ctx) return;
  mountTopbar(ctx, { active: "impostazioni" });
  canManage = ctx.org.role === "owner" || ctx.org.role === "admin";
  app.className = "o-wrap";
  app.innerHTML = tabs("impostazioni") + `
    <h1>Impostazioni</h1>
    <section class="card" id="orgCard"><h3>Organizzazione</h3></section>
    <h2>Membri</h2>
    <p class="small muted">Chi può entrare in quest'area e con quale ruolo. Un ruolo si cambia solo da qui, e ogni cambio resta nel registro.</p>
    <div id="addBox"></div>
    <ul class="list" id="members"><li class="loading">Un attimo…</li></ul>
    <h2>Registro</h2>
    <div id="audit" class="loading">Un attimo…</div>`;
  paintOrg();
  paintAdd();
  await Promise.all([loadMembers(), loadAudit()]);
}

function paintOrg() {
  const card = app.querySelector("#orgCard");
  if (!canManage) {
    card.appendChild(el(`<p>${esc(ctx.org.org_name)}</p>`));
    return;
  }
  const form = el(`<div class="form-row">
    <div class="field"><label for="orgName">Nome</label><input id="orgName" maxlength="120" autocomplete="organization"></div>
    <div></div><button type="button" class="btn" id="orgSave">Salva</button></div>`);
  form.querySelector("#orgName").value = ctx.org.org_name;
  form.querySelector("#orgSave").onclick = async () => {
    const name = form.querySelector("#orgName").value.trim();
    if (name.length < 2) return toast("Il nome deve avere almeno due caratteri.", { err: true });
    try {
      await renameOrg(ctx.org.org_id, name);
      ctx.org.org_name = name;
      toast("Nome salvato.");
      mountTopbar(ctx, { active: "impostazioni" });
    } catch (e) { toast(errMsg(e), { err: true }); }
  };
  card.appendChild(form);
}

function paintAdd() {
  const box = app.querySelector("#addBox");
  if (!canManage) return;
  const form = el(`<div class="card"><h3>Aggiungi una persona</h3>
    <div class="form-row">
      <div class="field"><label for="addEmail">Email dell'account Google</label><input id="addEmail" type="email" inputmode="email" autocomplete="off" placeholder="nome@esempio.it"></div>
      <div class="field"><label for="addRole">Ruolo</label><select id="addRole">${ASSIGNABLE.map((r) => `<option value="${r}">${esc(ROLES[r])}</option>`).join("")}</select></div>
      <button type="button" class="btn primary" id="addBtn">Aggiungi</button>
    </div>
    <p class="hint small muted">La persona deve aver fatto almeno un accesso a Orchestre con quell'email: prima entra, poi la trovi.</p></div>`);
  form.querySelector("#addBtn").onclick = async () => {
    const email = form.querySelector("#addEmail").value.trim();
    const role = form.querySelector("#addRole").value;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return toast("Serve un indirizzo email valido.", { err: true });
    const btn = form.querySelector("#addBtn");
    btn.disabled = true;
    try {
      await addByEmail(ctx.org.org_id, email, role);
      toast("Aggiunta: " + email + " come " + roleLabel(role).toLowerCase() + ".");
      form.querySelector("#addEmail").value = "";
      await Promise.all([loadMembers(), loadAudit()]);
    } catch (e) { toast(errMsg(e), { err: true }); }
    btn.disabled = false;
  };
  box.appendChild(form);
}

async function loadMembers() {
  const ul = app.querySelector("#members");
  try {
    const list = await listMembers(ctx.org.org_id);
    ul.innerHTML = "";
    if (!list.length) { ul.appendChild(el(`<li class="empty">Nessun membro.</li>`)); return; }
    for (const m of list) ul.appendChild(memberRow(m));
  } catch (e) {
    ul.innerHTML = "";
    ul.appendChild(el(`<li class="err"></li>`)).textContent = errMsg(e);
  }
}

function memberRow(m) {
  const me = m.user_id === ctx.session.user.id;
  const li = el(`<li class="list-item">
    <div class="grow"><div class="title"></div><div class="sub"></div></div>
    <div class="actions"></div></li>`);
  li.querySelector(".title").textContent = (m.display_name || m.email || m.user_id) + (me ? " (tu)" : "");
  li.querySelector(".sub").textContent = (m.display_name ? m.email + " · " : "") + "dal " + fmtDateTime(m.created_at);
  const actions = li.querySelector(".actions");
  const iAmOwner = ctx.org.role === "owner";
  const editable = canManage && (m.role !== "owner" || iAmOwner);
  if (!editable) {
    actions.appendChild(el(`<span class="pill${m.role === "owner" ? " accent" : ""}">${esc(roleLabel(m.role))}</span>`));
    return li;
  }
  const opts = (iAmOwner ? ["owner"] : []).concat(ASSIGNABLE);
  const sel = el(`<select aria-label="Ruolo di ${esc(m.display_name || m.email)}">${opts.map((r) =>
    `<option value="${r}"${r === m.role ? " selected" : ""}>${esc(ROLES[r])}</option>`).join("")}</select>`);
  sel.onchange = async () => {
    const to = sel.value;
    const yes = await confirm({ title: "Cambio di ruolo", text: `${m.display_name || m.email} diventa ${roleLabel(to).toLowerCase()}.`, ok: "Cambia" });
    if (!yes) { sel.value = m.role; return; }
    try {
      await setRole(ctx.org.org_id, m.user_id, to);
      toast("Ruolo aggiornato.");
      await Promise.all([loadMembers(), loadAudit()]);
    } catch (e) { sel.value = m.role; toast(errMsg(e), { err: true }); }
  };
  actions.appendChild(sel);
  if (!me) {
    const rm = el(`<button type="button" class="btn small danger">Rimuovi</button>`);
    rm.onclick = async () => {
      const yes = await confirm({ title: "Togliere l'accesso?", text: `${m.display_name || m.email} non entrerà più in quest'area. Si può riaggiungere in qualsiasi momento.`, ok: "Rimuovi", danger: true });
      if (!yes) return;
      try {
        await setRole(ctx.org.org_id, m.user_id, "remove");
        toast("Accesso rimosso.");
        await Promise.all([loadMembers(), loadAudit()]);
      } catch (e) { toast(errMsg(e), { err: true }); }
    };
    actions.appendChild(rm);
  }
  return li;
}

const ACTIONS = { "org.bootstrap": "Organizzazione creata", "membership.add": "Persona aggiunta", "membership.role": "Ruolo cambiato" };

async function loadAudit() {
  const box = app.querySelector("#audit");
  if (!canManage) { setState(box, "empty", "Il registro è visibile a proprietari e amministratori."); return; }
  try {
    const rows = await listAudit(ctx.org.org_id, 50);
    if (!rows.length) { setState(box, "empty", "Nessuna azione registrata."); return; }
    setState(box, "");
    box.className = "table-wrap";
    box.innerHTML = `<table class="table"><thead><tr><th>Quando</th><th>Cosa</th><th>Dettaglio</th></tr></thead><tbody></tbody></table>`;
    const tb = box.querySelector("tbody");
    for (const r of rows) {
      const tr = el(`<tr><td class="mono small"></td><td></td><td class="small muted"></td></tr>`);
      tr.children[0].textContent = fmtDateTime(r.at);
      tr.children[1].textContent = ACTIONS[r.action] || r.action;
      tr.children[2].textContent = auditDetail(r);
      tb.appendChild(tr);
    }
  } catch (e) { setState(box, "err", errMsg(e)); }
}

function auditDetail(r) {
  const p = r.payload || {};
  if (r.action === "membership.role") return `${roleLabel(p.from)} → ${p.to === "remove" ? "rimosso" : roleLabel(p.to)}`;
  if (r.action === "membership.add") return "come " + roleLabel(p.role).toLowerCase();
  return "";
}

main();
