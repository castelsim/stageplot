/* Scheda di una produzione: Dati · Date · Repertorio · Organico · Matching · Convocazioni · Feedback · StagePlot · Storia.
   ?id= apre, ?new=1 crea (con ?p=<progetto> nasce già collegata a StagePlot), ?t= sceglie la scheda (così il refresh resta dove eri). */
import { BASE } from "../config.js";
import { esc, el, toast, confirm, setState, errMsg, fmtDate, fmtDateTime } from "../ui.js";
import { requireStaff, mountTopbar } from "../auth.js";
import { tabs, REP_KIND } from "../nav.js";
import { PROD_STATUS, PROD_STATUS_PILL, PROD_KIND, DATE_KIND, PART, SLOT_STATUS, SLOT_PILL, EVENT, INV_STATUS, INV_PILL, INV_EVENT, TEMPLATES, templateSeats, groupStaffing, staffingCounts, suggestedStatus } from "../domain/staffing.js";
import * as api from "../api/productions.js";
import * as match from "../api/matching.js";
import * as inv from "../api/invitations.js";
import * as fb from "../api/feedback.js";
import { rankCandidates, applyOverrides, explain, ENGINE_VERSION } from "../domain/matching.js";
import { catalogs, list as listMusicians } from "../api/musicians.js";
import * as sp from "../api/stageplot.js";
import { typeMapFrom, docVariants, extractPositions, proposeRoles, diffProposal, importGroups, importSummary, isUuid } from "../domain/stageplot-import.js";

const app = document.getElementById("app");
const q = new URLSearchParams(location.search);
let ctx = null, p = null, cat = null, tab = q.get("t") || "dati";
const TABS = [["dati", "Dati"], ["date", "Date"], ["repertorio", "Repertorio"], ["organico", "Organico"], ["matching", "Matching"], ["convocazioni", "Convocazioni"], ["feedback", "Feedback"], ["stageplot", "StagePlot"], ["storia", "Storia"]];

async function main() {
  ctx = await requireStaff();
  if (!ctx) return;
  mountTopbar(ctx, { active: "produzioni" });
  app.className = "o-wrap";
  try {
    cat = await catalogs();
    if (q.get("new")) { p = { id: null, title: "", client: "", description: "", kind: "concerto", conductor: "", manager: "", venue: "", address: "", status: "draft", fee_note: "", conditions: "", dress_code: "", reply_deadline: null, notes: "", stageplot_project_id: isUuid(q.get("p")) ? q.get("p") : null }; tab = "dati"; paint(); return; }
    p = await api.get(q.get("id"));
    if (!p || p.org_id !== ctx.org.org_id) { location.replace(BASE + "/admin/produzioni/"); return; }
    paint();
  } catch (e) { app.innerHTML = tabs("produzioni"); const d = el(`<div class="err"></div>`); d.textContent = errMsg(e); app.appendChild(d); }
}

function paint() {
  app.innerHTML = tabs("produzioni") + `
    <p class="small"><a class="back" href="${BASE}/admin/produzioni/">← Produzioni</a></p>
    <div class="row"><h1 id="h"></h1><span class="spacer"></span><span class="pill ${PROD_STATUS_PILL[p.status] || ""}" id="stPill"></span></div>
    <nav class="nav-tabs sub" aria-label="Sezioni della produzione" id="subtabs"></nav>
    <div id="panel"></div>`;
  app.querySelector("#h").textContent = p.id ? p.title : "Nuova produzione";
  app.querySelector("#stPill").textContent = PROD_STATUS[p.status] || p.status;
  const nav = app.querySelector("#subtabs");
  for (const [k, label] of TABS) {
    const a = el(`<a href="?id=${esc(p.id || "")}&t=${k}">${label}</a>`);
    if (!p.id && k !== "dati") a.setAttribute("aria-disabled", "true");
    if (k === tab) a.setAttribute("aria-current", "page");
    a.onclick = (e) => { if (!p.id) { e.preventDefault(); return; } e.preventDefault(); tab = k; history.replaceState(null, "", "?id=" + p.id + "&t=" + k); paint(); };
    nav.appendChild(a);
  }
  ({ dati: paintDati, date: paintDate, repertorio: paintRepertorio, organico: paintOrganico, matching: paintMatching, convocazioni: paintConvocazioni, feedback: paintFeedback, stageplot: paintStageplot, storia: paintStoria })[tab]();
}

/* ---------------------------------------------------------------- Dati */
function field(id, label, value, { type = "text", opts = null, hint = "" } = {}) {
  const f = el(`<div class="field"><label for="${id}">${esc(label)}</label></div>`);
  let inp;
  if (opts) { inp = el(`<select id="${id}">${opts.map(([v, l]) => `<option value="${esc(v)}">${esc(l)}</option>`).join("")}</select>`); inp.value = value ?? ""; }
  else if (type === "textarea") { inp = el(`<textarea id="${id}"></textarea>`); inp.value = value ?? ""; }
  else { inp = el(`<input id="${id}" type="${type}">`); inp.value = value ?? ""; }
  f.appendChild(inp);
  if (hint) f.appendChild(el(`<span class="hint">${esc(hint)}</span>`));
  return f;
}
const val = (id) => app.querySelector("#" + id).value;
const toLocalInput = (iso) => { if (!iso) return ""; const d = new Date(iso); if (isNaN(d)) return ""; const z = (n) => String(n).padStart(2, "0"); return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}T${z(d.getHours())}:${z(d.getMinutes())}`; };
const fromLocalInput = (s) => (s ? new Date(s).toISOString() : null);

function paintDati() {
  const panel = app.querySelector("#panel");
  const card = el(`<section class="card"></section>`);
  const g = el(`<div class="grid2 tight"></div>`);
  g.appendChild(field("title", "Titolo", p.title));
  g.appendChild(field("client", "Cliente", p.client));
  g.appendChild(field("kind", "Tipologia", p.kind, { opts: Object.entries(PROD_KIND) }));
  g.appendChild(field("status", "Stato", p.status, { opts: Object.entries(PROD_STATUS) }));
  g.appendChild(field("conductor", "Direttore", p.conductor));
  g.appendChild(field("manager", "Responsabile", p.manager));
  g.appendChild(field("venue", "Luogo", p.venue));
  g.appendChild(field("address", "Indirizzo", p.address));
  g.appendChild(field("fee_note", "Compenso o fascia", p.fee_note, { hint: "testo libero, es. «cachet standard» o «150 € a servizio»" }));
  g.appendChild(field("dress_code", "Dress code", p.dress_code));
  g.appendChild(field("reply_deadline", "Scadenza per rispondere", toLocalInput(p.reply_deadline), { type: "datetime-local" }));
  card.appendChild(g);
  card.appendChild(field("description", "Descrizione", p.description, { type: "textarea" }));
  card.appendChild(field("conditions", "Condizioni", p.conditions, { type: "textarea" }));
  card.appendChild(field("notes", "Note interne", p.notes, { type: "textarea" }));
  if (!p.id && p.stageplot_project_id) card.appendChild(el(`<p class="small muted">Nasce collegata al progetto StagePlot da cui arrivi: dopo il salvataggio potrai importare le postazioni.</p>`));
  const act = el(`<div class="row"><button type="button" class="btn primary" id="save">Salva</button></div>`);
  act.querySelector("#save").onclick = async () => {
    const f = {};
    for (const k of ["title", "client", "kind", "status", "conductor", "manager", "venue", "address", "fee_note", "dress_code", "description", "conditions", "notes"]) f[k] = val(k);
    f.reply_deadline = fromLocalInput(val("reply_deadline"));
    if (!f.title.trim()) return toast("Serve un titolo.", { err: true });
    try {
      if (!p.id) {
        if (p.stageplot_project_id) f.stageplot_project_id = p.stageplot_project_id;
        const id = await api.create(ctx.org.org_id, f);
        location.replace(BASE + "/admin/produzioni/scheda/?id=" + id + "&t=" + (p.stageplot_project_id ? "stageplot" : "date")); return;
      }
      await api.update(p.id, f); Object.assign(p, f);
      app.querySelector("#h").textContent = p.title; app.querySelector("#stPill").textContent = PROD_STATUS[p.status]; app.querySelector("#stPill").className = "pill " + (PROD_STATUS_PILL[p.status] || "");
      toast("Salvato.");
    } catch (e) { toast(errMsg(e), { err: true }); }
  };
  if (p.id) {
    const arch = el(`<button type="button" class="btn small danger">Archivia</button>`);
    arch.onclick = async () => {
      const yes = await confirm({ title: "Archiviare la produzione?", text: "Sparisce dall'elenco; date, organico e storia restano.", ok: "Archivia", danger: true });
      if (!yes) return;
      try { await api.archive(p.id); location.href = BASE + "/admin/produzioni/"; } catch (e) { toast(errMsg(e), { err: true }); }
    };
    act.appendChild(arch);
  }
  card.appendChild(act);
  panel.appendChild(card);
}

/* ---------------------------------------------------------------- Date */
async function paintDate() {
  const panel = app.querySelector("#panel");
  panel.innerHTML = `<ul class="list" id="dates"><li class="loading">Un attimo…</li></ul>
    <section class="card"><h3>Aggiungi una data</h3><div class="grid2 tight" id="df"></div><button type="button" class="btn" id="addD">Aggiungi</button></section>`;
  const df = panel.querySelector("#df");
  df.appendChild(field("d_kind", "Tipo", "rehearsal", { opts: Object.entries(DATE_KIND) }));
  df.appendChild(field("d_venue", "Luogo", p.venue));
  df.appendChild(field("d_start", "Inizio", "", { type: "datetime-local" }));
  df.appendChild(field("d_end", "Fine", "", { type: "datetime-local" }));
  df.appendChild(field("d_note", "Nota", ""));
  panel.querySelector("#addD").onclick = async () => {
    const starts_at = fromLocalInput(val("d_start")); if (!starts_at) return toast("Serve l'inizio.", { err: true });
    try { await api.addDate(p.id, { kind: val("d_kind"), starts_at, ends_at: fromLocalInput(val("d_end")), venue: val("d_venue"), note: val("d_note") }); toast("Data aggiunta."); await loadDates(); }
    catch (e) { toast(errMsg(e), { err: true }); }
  };
  await loadDates();
}
async function loadDates() {
  const ul = app.querySelector("#dates");
  try {
    const rows = await api.listDates(p.id);
    ul.innerHTML = "";
    if (!rows.length) { ul.appendChild(el(`<li class="empty">Nessuna data: prove, concerto, registrazione, viaggio.</li>`)); return; }
    for (const d of rows) {
      const li = el(`<li class="list-item"><div class="grow"><div class="title"></div><div class="sub"></div></div><div class="actions"><button type="button" class="btn small ghost">Togli</button></div></li>`);
      li.querySelector(".title").textContent = (DATE_KIND[d.kind] || d.kind) + " · " + fmtDateTime(d.starts_at) + (d.ends_at ? " → " + (fmtDate(d.ends_at) === fmtDate(d.starts_at) ? new Date(d.ends_at).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" }) : fmtDateTime(d.ends_at)) : "");
      li.querySelector(".sub").textContent = [d.venue, d.note].filter(Boolean).join(" · ");
      li.querySelector("button").onclick = async () => { try { await api.deleteDate(d.id); await loadDates(); } catch (e) { toast(errMsg(e), { err: true }); } };
      ul.appendChild(li);
    }
  } catch (e) { ul.innerHTML = ""; setState(ul, "err", errMsg(e)); }
}

/* ---------------------------------------------------------------- Repertorio */
async function paintRepertorio() {
  const panel = app.querySelector("#panel");
  panel.innerHTML = `<p class="small muted">Compositori, programmi, brani o generi di questa produzione. Servono al matching: chi li ha già eseguiti sale.</p>
    <ul class="list" id="reps"><li class="loading">Un attimo…</li></ul>
    <section class="card"><div class="form-row">
      <div class="field"><label for="repName">Aggiungi</label><input id="repName" placeholder="es. Ennio Morricone" autocomplete="off"></div>
      <div class="field"><label for="repKind">Tipo</label><select id="repKind">${Object.entries(REP_KIND).map(([k, v]) => `<option value="${k}">${v}</option>`).join("")}</select></div>
      <button type="button" class="btn" id="repBtn">Aggiungi</button></div></section>`;
  panel.querySelector("#repBtn").onclick = async () => {
    const name = val("repName").trim(); if (!name) return;
    try { await api.addRepertoire(ctx.org.org_id, p.id, { kind: val("repKind"), name }); app.querySelector("#repName").value = ""; await loadReps(); } catch (e) { toast(errMsg(e), { err: true }); }
  };
  await loadReps();
}
async function loadReps() {
  const ul = app.querySelector("#reps");
  try {
    const rows = await api.listRepertoire(p.id);
    ul.innerHTML = "";
    if (!rows.length) { ul.appendChild(el(`<li class="empty">Nessun repertorio ancora.</li>`)); return; }
    for (const r of rows) {
      const li = el(`<li class="list-item"><div class="grow"><div class="title"></div><div class="sub"></div></div><div class="actions"><button type="button" class="btn small ghost">Togli</button></div></li>`);
      li.querySelector(".title").textContent = r.name; li.querySelector(".sub").textContent = REP_KIND[r.kind] || r.kind;
      li.querySelector("button").onclick = async () => { try { await api.removeRepertoire(p.id, r.id); await loadReps(); } catch (e) { toast(errMsg(e), { err: true }); } };
      ul.appendChild(li);
    }
  } catch (e) { ul.innerHTML = ""; setState(ul, "err", errMsg(e)); }
}

/* ---------------------------------------------------------------- Organico */
let sections = [], musicians = null;
async function paintOrganico() {
  const panel = app.querySelector("#panel");
  panel.innerHTML = `<div id="summary" class="row"></div><div id="org"><div class="loading">Un attimo…</div></div>`;
  await loadOrganico();
}
async function loadOrganico() {
  const box = app.querySelector("#org"), sum = app.querySelector("#summary");
  try {
    sections = groupStaffing(await api.staffing(p.id));
    const c = staffingCounts(sections);
    sum.innerHTML = "";
    if (c.seats) {
      sum.appendChild(el(`<span class="pill ${c.open ? "warn" : "ok"}">${c.filled} confermati su ${c.seats}</span>`));
      if (c.open) sum.appendChild(el(`<span class="pill warn">${c.open} ${c.open === 1 ? "posto scoperto" : "posti scoperti"}</span>`));
      const sug = suggestedStatus(c, p.status);
      if (sug !== p.status) {
        const b = el(`<button type="button" class="btn small ghost">Segna «${esc(PROD_STATUS[sug])}»</button>`);
        b.onclick = async () => { try { await api.update(p.id, { status: sug }); p.status = sug; paint(); } catch (e) { toast(errMsg(e), { err: true }); } };
        sum.appendChild(b);
      }
    }
    box.innerHTML = "";
    if (!sections.length) { paintEmptyOrganico(box); return; }
    for (const s of sections) box.appendChild(sectionCard(s));
    box.appendChild(addRoleCard());
  } catch (e) { box.innerHTML = ""; setState(box, "err", errMsg(e)); }
}

function paintEmptyOrganico(box) {
  const c = el(`<section class="card"><h3>Parti da un modello</h3><p class="small muted">Sezioni e ruoli già pronti; poi correggi quantità e parti. Nessuna persona viene assegnata.</p><div class="stack" id="tpls"></div>
    <h3>Oppure copia l'organico di un'altra produzione</h3><div class="form-row"><div class="field"><label for="dupSrc">Produzione</label><select id="dupSrc"><option value="">Carico…</option></select></div><div></div><button type="button" class="btn" id="dupBtn">Copia</button></div>
    <h3>Oppure aggiungi i ruoli a mano</h3></section>`);
  const tp = c.querySelector("#tpls");
  for (const t of Object.values(TEMPLATES)) {
    const li = el(`<div class="list-item"><div class="grow"><div class="title"></div><div class="sub"></div></div><div class="actions"><button type="button" class="btn small">Usa</button></div></div>`);
    li.querySelector(".title").textContent = t.name + " · " + templateSeats(t) + " posti"; li.querySelector(".sub").textContent = t.note;
    li.querySelector("button").onclick = async () => {
      try { const n = await api.applyTemplate(p.id, t.sections); toast(n + " ruoli creati."); await loadOrganico(); } catch (e) { toast(errMsg(e), { err: true }); }
    };
    tp.appendChild(li);
  }
  api.list(ctx.org.org_id).then((rows) => {
    const sel = c.querySelector("#dupSrc"); sel.innerHTML = `<option value="">— scegli —</option>`;
    for (const r of rows.filter((x) => x.id !== p.id && Number(x.n_seats) > 0)) { const o = document.createElement("option"); o.value = r.id; o.textContent = r.title + " (" + r.n_seats + " posti)"; sel.appendChild(o); }
  }).catch(() => {});
  c.querySelector("#dupBtn").onclick = async () => {
    const src = c.querySelector("#dupSrc").value; if (!src) return;
    try { const n = await api.duplicateStaffing(src, p.id); toast(n + " ruoli copiati."); await loadOrganico(); } catch (e) { toast(errMsg(e), { err: true }); }
  };
  box.appendChild(c);
  box.appendChild(addRoleCard());
}

function sectionCard(s) {
  const card = el(`<section class="card"><div class="row"><h3></h3><span class="spacer"></span></div><div class="roles"></div></section>`);
  card.querySelector("h3").textContent = s.name;
  if (s.id) {
    const ren = el(`<button type="button" class="btn small ghost">Rinomina</button>`);
    ren.onclick = async () => { const n = prompt("Nome della sezione", s.name); if (!n || n === s.name) return; try { await api.renameSection(s.id, n.trim()); await loadOrganico(); } catch (e) { toast(errMsg(e), { err: true }); } };
    card.querySelector(".row").appendChild(ren);
  }
  const roles = card.querySelector(".roles");
  for (const r of s.roles) roles.appendChild(roleBlock(r));
  return card;
}

function roleBlock(r) {
  const filled = r.slots.filter((x) => x.status === "confirmed").length;
  const b = el(`<details class="role"><summary><span class="title"></span><span class="pill ${filled === r.slots.length && r.slots.length ? "ok" : "warn"}">${filled}/${r.slots.length}</span><span class="sub"></span></summary><div class="role-body"></div></details>`);
  b.querySelector(".title").textContent = r.name;
  b.querySelector(".sub").textContent = [r.instrument_name, PART[r.part], r.min_level ? "livello ≥ " + r.min_level : ""].filter(Boolean).join(" · ");
  const body = b.querySelector(".role-body");
  const edit = el(`<div class="form-row three">
    <div class="field"><label>Posti</label><input type="number" min="0" max="200" class="seats"></div>
    <div class="field"><label>Parte</label><select class="part">${Object.entries(PART).map(([k, v]) => `<option value="${k}">${v}</option>`).join("")}</select></div>
    <div class="field"><label>Livello minimo</label><select class="lvl"><option value="">—</option>${[1, 2, 3, 4, 5].map((n) => `<option>${n}</option>`).join("")}</select></div>
    <button type="button" class="btn small save">Salva</button><button type="button" class="btn small danger del">Togli ruolo</button></div>`);
  edit.querySelector(".seats").value = r.seats; edit.querySelector(".part").value = r.part; edit.querySelector(".lvl").value = r.min_level || "";
  edit.querySelector(".save").onclick = async () => {
    try { await api.updateRole(r.id, { seats: Number(edit.querySelector(".seats").value), part: edit.querySelector(".part").value, min_level: Number(edit.querySelector(".lvl").value) || null }); toast("Ruolo aggiornato."); await loadOrganico(); }
    catch (e) { toast(errMsg(e), { err: true }); }
  };
  edit.querySelector(".del").onclick = async () => {
    const yes = await confirm({ title: "Togliere il ruolo «" + r.name + "»?", text: filled ? "Ha " + filled + " confermati: le assegnazioni e la loro storia vengono perse." : "Nessuna persona assegnata.", ok: "Togli", danger: true });
    if (!yes) return;
    try { await api.deleteRole(r.id); await loadOrganico(); } catch (e) { toast(errMsg(e), { err: true }); }
  };
  body.appendChild(edit);
  const ul = el(`<ul class="list compact"></ul>`);
  for (const sl of r.slots) {
    const li = el(`<li class="list-item"><div class="grow"><div class="title"></div><div class="sub"></div></div><div class="actions"></div></li>`);
    li.querySelector(".title").textContent = sl.musician_name || "Posto " + sl.seat_no;
    li.querySelector(".sub").textContent = [sl.musician_name ? "Posto " + sl.seat_no : "", sl.item_label ? "postazione «" + sl.item_label + "»" : ""].filter(Boolean).join(" · ");
    const act = li.querySelector(".actions");
    act.appendChild(el(`<span class="pill ${SLOT_PILL[sl.status] || ""}">${esc(SLOT_STATUS[sl.status] || sl.status)}</span>`));
    if (sl.musician_id) {
      const rel = el(`<button type="button" class="btn small ghost">Libera</button>`);
      rel.onclick = () => releaseDialog(sl);
      act.appendChild(rel);
    } else {
      const asg = el(`<button type="button" class="btn small">Assegna</button>`);
      asg.onclick = () => assignDialog(r, sl);
      act.appendChild(asg);
    }
    ul.appendChild(li);
  }
  body.appendChild(ul);
  return b;
}

async function assignDialog(role, slot) {
  if (!musicians) { try { musicians = await listMusicians(ctx.org.org_id); } catch (e) { return toast(errMsg(e), { err: true }); } }
  const taken = new Set(sections.flatMap((s) => s.roles.flatMap((r) => r.slots.map((x) => x.musician_id))).filter(Boolean));
  const same = musicians.filter((m) => !taken.has(m.id) && m.status !== "archived" && m.status !== "suspended" && (!role.instrument_name || (m.instruments || []).includes(role.instrument_name)));
  const others = musicians.filter((m) => !taken.has(m.id) && !same.includes(m) && m.status !== "archived" && m.status !== "suspended");
  const ov = el(`<div class="modal-ov" role="dialog" aria-modal="true"><div class="modal"><h2>Assegna: ${esc(role.name)}, posto ${slot.seat_no}</h2>
    <div class="field"><label for="asgSel">Musicista</label><select id="asgSel">
      ${same.length ? `<optgroup label="Con lo strumento">${same.map((m) => `<option value="${m.id}">${esc(m.last_name + " " + m.first_name)}${m.status === "reserve" ? " (riserva)" : ""}</option>`).join("")}</optgroup>` : ""}
      ${others.length ? `<optgroup label="Altri">${others.map((m) => `<option value="${m.id}">${esc(m.last_name + " " + m.first_name)} · ${esc(m.primary_instrument || "")}</option>`).join("")}</optgroup>` : ""}
    </select><span class="hint">Assegnazione diretta, senza convocazione: il posto risulta confermato. Le convocazioni arrivano nel lotto 5.</span></div>
    <div class="field"><label for="asgWhy">Nota</label><input id="asgWhy" placeholder="facoltativa"></div>
    <div class="actions"><button type="button" class="btn" id="no">Annulla</button><button type="button" class="btn primary" id="ok">Assegna</button></div></div></div>`);
  if (!same.length && !others.length) ov.querySelector("#asgSel").innerHTML = `<option value="">Nessun musicista disponibile nel pool</option>`;
  const close = () => ov.remove();
  ov.querySelector("#no").onclick = close;
  ov.addEventListener("click", (e) => { if (e.target === ov) close(); });
  ov.querySelector("#ok").onclick = async () => {
    const mid = ov.querySelector("#asgSel").value; if (!mid) return;
    try { await api.assignSlot(slot.id, mid, ov.querySelector("#asgWhy").value); close(); toast("Assegnato."); await loadOrganico(); } catch (e) { toast(errMsg(e), { err: true }); }
  };
  document.body.appendChild(ov); ov.querySelector("#asgSel").focus();
}

function releaseDialog(slot) {
  const ov = el(`<div class="modal-ov" role="dialog" aria-modal="true"><div class="modal"><h2>Liberare il posto di ${esc(slot.musician_name)}?</h2>
    <div class="field"><label for="relEv">Perché</label><select id="relEv"><option value="withdrew">Ha rinunciato</option><option value="revoked">Decisione dell'organizzazione</option><option value="cancelled">Posto annullato</option></select></div>
    <div class="field"><label for="relWhy">Nota</label><input id="relWhy" placeholder="facoltativa"></div>
    <p class="small muted">Il posto torna scoperto. La storia resta: chi c'era e perché è uscito.</p>
    <div class="actions"><button type="button" class="btn" id="no">Annulla</button><button type="button" class="btn danger" id="ok">Libera</button></div></div></div>`);
  const close = () => ov.remove();
  ov.querySelector("#no").onclick = close;
  ov.addEventListener("click", (e) => { if (e.target === ov) close(); });
  ov.querySelector("#ok").onclick = async () => {
    try { await api.releaseSlot(slot.id, ov.querySelector("#relEv").value, ov.querySelector("#relWhy").value); close(); toast("Posto liberato."); await loadOrganico(); } catch (e) { toast(errMsg(e), { err: true }); }
  };
  document.body.appendChild(ov);
}

function addRoleCard() {
  const secOpts = sections.filter((s) => s.id).map((s) => `<option value="${s.id}">${esc(s.name)}</option>`).join("");
  const c = el(`<section class="card"><h3>Aggiungi un ruolo</h3><div class="grid2 tight">
    <div class="field"><label for="nrSec">Sezione</label><select id="nrSec">${secOpts}<option value="__new">Nuova sezione…</option><option value="">Senza sezione</option></select></div>
    <div class="field" id="nrSecNameF" hidden><label for="nrSecName">Nome della sezione</label><input id="nrSecName"></div>
    <div class="field"><label for="nrInst">Strumento</label><select id="nrInst"><option value="">—</option>${cat.instruments.map((i) => `<option value="${i.code}">${esc(i.name)}</option>`).join("")}</select></div>
    <div class="field"><label for="nrName">Nome del ruolo</label><input id="nrName" placeholder="es. Violini secondi"></div>
    <div class="field"><label for="nrSeats">Posti</label><input id="nrSeats" type="number" min="0" max="200" value="1"></div>
    <div class="field"><label for="nrPart">Parte</label><select id="nrPart">${Object.entries(PART).map(([k, v]) => `<option value="${k}"${k === "tutti" ? " selected" : ""}>${v}</option>`).join("")}</select></div>
    </div><button type="button" class="btn" id="nrAdd">Aggiungi ruolo</button></section>`);
  const sec = c.querySelector("#nrSec");
  sec.onchange = () => { c.querySelector("#nrSecNameF").hidden = sec.value !== "__new"; };
  c.querySelector("#nrInst").onchange = (e) => { const n = c.querySelector("#nrName"); if (!n.value) n.value = cat.instruments.find((i) => i.code === e.target.value)?.name || ""; };
  c.querySelector("#nrAdd").onclick = async () => {
    const name = c.querySelector("#nrName").value.trim(); if (!name) return toast("Serve il nome del ruolo.", { err: true });
    try {
      let section_id = sec.value || null;
      if (section_id === "__new") { const sn = c.querySelector("#nrSecName").value.trim(); if (!sn) return toast("Serve il nome della sezione.", { err: true }); section_id = await api.addSection(p.id, sn, sections.length + 1); }
      const sort = sections.flatMap((s) => s.roles).length + 1;
      await api.addRole(p.id, { section_id, instrument_code: c.querySelector("#nrInst").value || null, name, seats: Number(c.querySelector("#nrSeats").value) || 0, part: c.querySelector("#nrPart").value, sort });
      toast("Ruolo aggiunto."); await loadOrganico();
    } catch (e) { toast(errMsg(e), { err: true }); }
  };
  return c;
}


/* ---------------------------------------------------------------- Matching */
let mRole = q.get("role") || "", mRun = null, mWeights = null, mRuleset = null;
async function paintMatching() {
  const panel = app.querySelector("#panel");
  panel.innerHTML = `<div class="loading">Un attimo…</div>`;
  try {
    sections = groupStaffing(await api.staffing(p.id));
    mRuleset = await match.activeRuleset(ctx.org.org_id);
    mWeights = mRuleset.weights;
  } catch (e) { setState(panel.firstElementChild, "err", errMsg(e)); return; }
  const roles = sections.flatMap((s) => s.roles.map((r) => ({ ...r, section: s.name, open: r.slots.filter((x) => x.status === "open").length })));
  panel.innerHTML = "";
  if (!roles.length) { panel.appendChild(el(`<div class="empty">Prima definisci l'organico: il matching lavora su un ruolo alla volta.</div>`)); return; }
  if (!mRole || !roles.find((r) => r.id === mRole)) mRole = (roles.find((r) => r.open > 0) || roles[0]).id;
  const head = el(`<section class="card"><div class="form-row">
    <div class="field"><label for="mRole">Ruolo</label><select id="mRole">${roles.map((r) => `<option value="${r.id}">${esc(r.section + " · " + r.name)} (${r.open} ${r.open === 1 ? "scoperto" : "scoperti"} su ${r.slots.length})</option>`).join("")}</select></div>
    <div class="field"><label>Pesi</label><span class="pill">${esc(mRuleset.name || "Pesi")} · v${mRuleset.version}</span></div>
    <button type="button" class="btn primary" id="mGo">Calcola</button></div>
    <p class="small muted">Fase A: chi non ha i requisiti resta in fondo, con il motivo. Fase B: 50 punti di partenza più i contributi pesati, ognuno spiegato. Ogni calcolo resta salvato: la convocazione citerà questa proposta. I pesi si cambiano in <a href="${BASE}/admin/impostazioni/">Impostazioni</a>.</p></section>`);
  head.querySelector("#mRole").value = mRole;
  head.querySelector("#mRole").onchange = (e) => { mRole = e.target.value; history.replaceState(null, "", "?id=" + p.id + "&t=matching&role=" + mRole); loadLastRun(); };
  head.querySelector("#mGo").onclick = compute;
  panel.appendChild(head);
  panel.appendChild(el(`<div id="mOut"></div>`));   /* el() rende UN elemento: il contenitore va appeso a parte */
  await loadLastRun();
}
async function loadLastRun() {
  const out = app.querySelector("#mOut");
  out.innerHTML = `<div class="loading">Un attimo…</div>`;
  try {
    mRun = await match.lastRun(mRole);
    if (!mRun) { out.innerHTML = ""; out.appendChild(el(`<div class="empty">Nessun calcolo ancora per questo ruolo. Premi «Calcola».</div>`)); return; }
    paintResults(out);
  } catch (e) { setState(out.firstElementChild, "err", errMsg(e)); }
}
async function compute() {
  const out = app.querySelector("#mOut");
  out.innerHTML = `<div class="loading">Calcolo…</div>`;
  try {
    const data = await match.candidates(p.id, mRole);
    data.skillNames = Object.fromEntries(cat.skills.map((s) => [s.code, s.name]));
    const results = rankCandidates(data, mWeights, new Date());
    const runId = await match.saveRun(p.id, mRole, mWeights, results, ENGINE_VERSION);
    toast(`${results.filter((r) => r.eligible).length} idonei su ${results.length}. Proposta salvata.`);
    mRun = { id: runId, at: new Date().toISOString(), weights: mWeights, ruleset_version: mRuleset.version, results };
    paintResults(out);
  } catch (e) { out.innerHTML = ""; const d = el(`<div class="err"></div>`); d.textContent = errMsg(e); out.appendChild(d); }
}
function paintResults(out) {
  const role = sections.flatMap((s) => s.roles).find((r) => r.id === mRole);
  const openSlots = role ? role.slots.filter((x) => x.status === "open") : [];
  const ordered = applyOverrides(mRun.results.map((r) => ({ ...r })));
  out.innerHTML = "";
  out.appendChild(el(`<p class="small muted">Calcolato il ${esc(fmtDateTime(mRun.at))}${mRun.ruleset_version ? ", pesi v" + mRun.ruleset_version : ", pesi di partenza"}. ${openSlots.length ? openSlots.length + (openSlots.length === 1 ? " posto scoperto" : " posti scoperti") : "Nessun posto scoperto"}.</p>`));
  const bar = el(`<div class="row invite-bar"><span class="small muted" id="selCount">Seleziona chi convocare</span><span class="spacer"></span><button type="button" class="btn primary" id="inviteSel" disabled>Convoca i selezionati</button></div>`);
  out.appendChild(bar);
  const ul = el(`<ul class="list" id="mList"></ul>`);
  const selected = new Set();
  const refreshBar = () => { bar.querySelector("#selCount").textContent = selected.size ? selected.size + (selected.size === 1 ? " selezionato" : " selezionati") : "Seleziona chi convocare"; bar.querySelector("#inviteSel").disabled = !selected.size; };
  bar.querySelector("#inviteSel").onclick = () => inviteDialog([...selected]);
  ordered.forEach((r, i) => {
    const pos = i + 1;
    const li = el(`<li class="list-item match${r.eligible ? "" : " off"}"><label class="pick"><input type="checkbox" aria-label="Seleziona"></label><div class="rank"></div><div class="grow"><div class="title"></div><div class="sub"></div><div class="why small"></div></div><div class="actions"></div></li>`);
    const cb = li.querySelector("input");
    if (!r.eligible) cb.disabled = true;
    cb.onchange = () => { if (cb.checked) selected.add(r.musician_id); else selected.delete(r.musician_id); refreshBar(); };
    li.querySelector(".rank").textContent = pos;
    li.querySelector(".title").textContent = r.name;
    li.querySelector(".sub").innerHTML = `<span class="pill ${r.eligible ? (r.score >= 70 ? "ok" : r.score >= 50 ? "accent" : "warn") : "danger"}">${r.eligible ? r.score + "/100" : "non idoneo"}</span>` +
      (r.override_rank ? ` <span class="pill warn" title="${esc(r.override_reason)}">scelta manuale</span>` : "") +
      (r.warnings || []).map((w) => ` <span class="pill">${esc(w)}</span>`).join("");
    li.querySelector(".why").textContent = explain(r).replace(/^[^—]+— \d+\/100\.\s*/, "");
    const act = li.querySelector(".actions");
    if (r.eligible && openSlots.length) {
      const b = el(`<button type="button" class="btn small primary">Assegna</button>`);
      b.onclick = async () => {
        const yes = await confirm({ title: "Assegnare " + r.name + "?", text: `${role.name}, posto ${openSlots[0].seat_no}. Assegnazione diretta: il posto risulta confermato.`, ok: "Assegna" });
        if (!yes) return;
        try { await api.assignSlot(openSlots[0].id, r.musician_id, "dal matching, posizione " + pos); toast("Assegnato."); sections = groupStaffing(await api.staffing(p.id)); paintResults(out); }
        catch (e) { toast(errMsg(e), { err: true }); }
      };
      act.appendChild(b);
    }
    if (!r.override_rank && pos > 1) {
      const up = el(`<button type="button" class="btn small ghost" title="Metti in cima, con un motivo">In cima</button>`);
      up.onclick = () => overrideDialog(r, out);
      act.appendChild(up);
    }
    ul.appendChild(li);
  });
  out.appendChild(ul);
}
function overrideDialog(r, out) {
  const ov = el(`<div class="modal-ov" role="dialog" aria-modal="true"><div class="modal"><h2>Mettere ${esc(r.name)} in cima?</h2>
    <p class="small muted">La proposta del sistema resta salvata; la tua scelta le si sovrappone con il motivo, che finisce nel registro.</p>
    <div class="field"><label for="ovWhy">Motivo</label><input id="ovWhy" placeholder="es. richiesta del direttore"></div>
    <div class="actions"><button type="button" class="btn" id="no">Annulla</button><button type="button" class="btn primary" id="ok">Conferma</button></div></div></div>`);
  const close = () => ov.remove();
  ov.querySelector("#no").onclick = close;
  ov.addEventListener("click", (e) => { if (e.target === ov) close(); });
  ov.querySelector("#ok").onclick = async () => {
    const why = ov.querySelector("#ovWhy").value.trim();
    if (why.length < 3) return toast("Serve un motivo.", { err: true });
    try {
      await match.override(mRun.id, r.musician_id, 1, why);
      for (const x of mRun.results) if (x.override_rank === 1) { x.override_rank = null; }
      const me = mRun.results.find((x) => x.musician_id === r.musician_id); me.override_rank = 1; me.override_reason = why;
      close(); toast("Scelta registrata."); paintResults(out);
    } catch (e) { toast(errMsg(e), { err: true }); }
  };
  document.body.appendChild(ov); ov.querySelector("#ovWhy").focus();
}


function inviteDialog(musicianIds) {
  const role = sections.flatMap((s) => s.roles).find((r) => r.id === mRole);
  const dflt = p.reply_deadline ? toLocalInput(p.reply_deadline) : toLocalInput(new Date(Date.now() + 7 * 86400000).toISOString());
  const ov = el(`<div class="modal-ov" role="dialog" aria-modal="true"><div class="modal"><h2>Convocare ${musicianIds.length} ${musicianIds.length === 1 ? "musicista" : "musicisti"}?</h2>
    <p class="small muted">Ruolo: ${esc(role?.name || "")}. Ognuno riceve un'email con un link per rispondere dal telefono: sì, no, o solo alcune date. La risposta arriva qui, nella scheda Convocazioni.</p>
    <div class="field"><label for="invDl">Scadenza per rispondere</label><input id="invDl" type="datetime-local"></div>
    <div class="field"><label for="invNote">Nota nell'email</label><textarea id="invNote" rows="2" placeholder="facoltativa, es. prove obbligatorie"></textarea></div>
    <div class="actions"><button type="button" class="btn" id="no">Annulla</button><button type="button" class="btn primary" id="ok">Convoca</button></div></div></div>`);
  ov.querySelector("#invDl").value = dflt;
  const close = () => ov.remove();
  ov.querySelector("#no").onclick = close;
  ov.addEventListener("click", (e) => { if (e.target === ov) close(); });
  ov.querySelector("#ok").onclick = async () => {
    const deadline = fromLocalInput(ov.querySelector("#invDl").value);
    try {
      const n = await inv.invite(p.id, mRole, musicianIds, { deadline, note: ov.querySelector("#invNote").value.trim(), runId: mRun?.id || null });
      close(); toast(n + (n === 1 ? " convocazione creata" : " convocazioni create") + ": l'email parte entro dieci minuti.");
      tab = "convocazioni"; history.replaceState(null, "", "?id=" + p.id + "&t=convocazioni"); paint();
    } catch (e) { toast(errMsg(e), { err: true }); }
  };
  document.body.appendChild(ov);
}

/* ---------------------------------------------------------------- Convocazioni */
async function paintConvocazioni() {
  const panel = app.querySelector("#panel");
  panel.innerHTML = `<div id="cvSummary" class="row"></div><div id="cv"><div class="loading">Un attimo…</div></div>`;
  await loadConvocazioni();
}
async function loadConvocazioni() {
  const box = app.querySelector("#cv"), sum = app.querySelector("#cvSummary");
  try {
    const [rows, st] = await Promise.all([inv.list(p.id), api.staffing(p.id)]);
    sections = groupStaffing(st);
    const c = staffingCounts(sections);
    const waiting = rows.filter((r) => ["draft", "sent", "viewed"].includes(r.status)).length;
    const yes = rows.filter((r) => ["available", "partial"].includes(r.status)).length;
    const noReply = rows.filter((r) => ["no_reply", "expired"].includes(r.status)).length;
    sum.innerHTML = "";
    if (c.seats) sum.appendChild(el(`<span class="pill ${c.open ? "warn" : "ok"}">${c.open ? c.open + (c.open === 1 ? " posto scoperto" : " posti scoperti") : "organico completo"}</span>`));
    if (waiting) sum.appendChild(el(`<span class="pill accent">${waiting} in attesa</span>`));
    if (yes) sum.appendChild(el(`<span class="pill ok">${yes} da confermare</span>`));
    if (noReply) sum.appendChild(el(`<span class="pill warn">${noReply} senza risposta</span>`));
    box.innerHTML = "";
    if (!rows.length) {
      box.appendChild(el(`<div class="empty">Nessuna convocazione ancora. Dal Matching scegli chi chiamare e premi «Convoca i selezionati».</div>`));
      box.appendChild(el(`<p><a class="btn primary" href="?id=${esc(p.id)}&t=matching">Vai al Matching</a></p>`));
      return;
    }
    const byRole = new Map();
    for (const r of rows) { if (!byRole.has(r.role_id)) byRole.set(r.role_id, { name: r.role_name, rows: [] }); byRole.get(r.role_id).rows.push(r); }
    for (const [roleId, g] of byRole) {
      const role = sections.flatMap((s) => s.roles).find((r) => r.id === roleId);
      const open = role ? role.slots.filter((x) => x.status === "open").length : 0;
      const card = el(`<section class="card"><div class="row"><h3></h3><span class="pill ${open ? "warn" : "ok"}">${open ? open + " scoperti" : "completo"}</span><span class="spacer"></span><a class="btn small" href="?id=${esc(p.id)}&t=matching&role=${esc(roleId)}">Convoca altri</a></div><ul class="list compact"></ul></section>`);
      card.querySelector("h3").textContent = g.name;
      const ul = card.querySelector("ul");
      for (const r of g.rows) ul.appendChild(invitationRow(r, open));
      box.appendChild(card);
    }
  } catch (e) { box.innerHTML = ""; setState(box, "err", errMsg(e)); }
}
function invitationRow(r, openSlots) {
  const li = el(`<li class="list-item"><div class="grow"><div class="title"></div><div class="sub"></div></div><div class="actions"></div></li>`);
  li.querySelector(".title").textContent = r.musician_name + (r.wave > 1 ? " · onda " + r.wave : "");
  const bits = [];
  if (r.deadline && ["draft", "sent", "viewed"].includes(r.status)) bits.push("entro " + fmtDateTime(r.deadline));
  if (r.responded_at) bits.push("risposto " + fmtDateTime(r.responded_at));
  if (r.status === "partial") bits.push(`${r.dates_yes} date su ${r.dates_total}`);
  if (r.note_musician) bits.push("«" + r.note_musician + "»");
  if (r.notification_status === "pending") bits.push("email in coda");
  if (r.notification_status === "sending") bits.push("email in spedizione");
  if (r.notification_status === "failed") bits.push("email NON consegnata" + (r.notification_last_error ? " (" + r.notification_last_error + ")" : ""));
  if (r.slot_seat) bits.push("posto " + r.slot_seat);
  li.querySelector(".sub").textContent = bits.join(" · ");
  const act = li.querySelector(".actions");
  act.appendChild(el(`<span class="pill ${INV_PILL[r.status] || ""}">${esc(INV_STATUS[r.status] || r.status)}</span>`));
  const btn = (label, cls, fn) => { const b = el(`<button type="button" class="btn small ${cls}">${label}</button>`); b.onclick = fn; act.appendChild(b); };
  const doAction = async (action, reason, okMsg) => { try { await inv.action(r.id, action, reason); toast(okMsg); await loadConvocazioni(); } catch (e) { toast(errMsg(e), { err: true }); } };
  if (["available", "partial", "reserve"].includes(r.status) && openSlots > 0) btn("Conferma", "primary", async () => {
    const yes = await confirm({ title: "Confermare " + r.musician_name + "?", text: "Prende il primo posto scoperto del ruolo. Il musicista non potrà più cambiare la risposta da solo.", ok: "Conferma" });
    if (yes) doAction("confirm", "", "Confermato.");
  });
  if (["available", "partial"].includes(r.status)) btn("Riserva", "", () => doAction("reserve", "", "In riserva."));
  if (["sent", "viewed"].includes(r.status) && r.notification_status !== "pending" && r.notification_status !== "sending") btn("Promemoria", "", () => doAction("remind", "", "Promemoria in coda: parte entro dieci minuti."));
  if (r.status === "confirmed") btn("Revoca", "danger", () => {
    const why = prompt("Motivo della revoca (resta nella storia):", ""); if (why === null) return;
    doAction("revoke", why, "Conferma revocata: il posto è di nuovo scoperto.");
  });
  if (!["confirmed", "cancelled", "revoked", "replaced"].includes(r.status)) btn("Annulla", "ghost", async () => {
    const yes = await confirm({ title: "Annullare la convocazione?", text: "Il link smette di funzionare. Se ha già risposto, la risposta resta nella storia.", ok: "Annulla convocazione", danger: true });
    if (yes) doAction("cancel", "", "Annullata.");
  });
  const hist = el(`<button type="button" class="btn small ghost" title="Storia">…</button>`);
  hist.onclick = async () => {
    try {
      const evs = await inv.events(r.id);
      const ov = el(`<div class="modal-ov" role="dialog" aria-modal="true"><div class="modal"><h2>${esc(r.musician_name)}</h2><ul class="plain small" id="evl"></ul><div class="actions"><button type="button" class="btn" id="no">Chiudi</button></div></div></div>`);
      for (const e of evs) { const li2 = document.createElement("li"); li2.textContent = fmtDateTime(e.at) + " · " + (INV_EVENT[e.event] || e.event) + (e.meta?.answer ? " (" + (INV_STATUS[e.meta.answer] || e.meta.answer) + ")" : "") + (e.meta?.reason ? " · " + e.meta.reason : ""); ov.querySelector("#evl").appendChild(li2); }
      ov.querySelector("#no").onclick = () => ov.remove(); ov.addEventListener("click", (e) => { if (e.target === ov) ov.remove(); });
      document.body.appendChild(ov);
    } catch (e) { toast(errMsg(e), { err: true }); }
  };
  act.appendChild(hist);
  return li;
}


/* ---------------------------------------------------------------- Feedback */
const SCORES = [["punctuality", "Puntualità"], ["preparation", "Preparazione"], ["artistic", "Qualità artistica"], ["professionalism", "Professionalità"], ["overall", "Complessivo"]];
async function paintFeedback() {
  const panel = app.querySelector("#panel");
  panel.innerHTML = `<p class="small muted">Per ogni musicista confermato: com'è andata davvero. I fatti (presenza, problemi) e il giudizio restano separati dallo storico dei posti, che non si tocca. Le medie che ne derivano dicono sempre su quante produzioni sono calcolate.</p>
    <div id="fbState" class="row"></div><div id="fbList"><div class="loading">Un attimo…</div></div>`;
  const state = panel.querySelector("#fbState");
  if (!["done", "running", "confirmed", "complete"].includes(p.status)) {
    state.appendChild(el(`<span class="pill warn">La produzione non è ancora conclusa</span>`));
    const b = el(`<button type="button" class="btn small">Segna «Conclusa»</button>`);
    b.onclick = async () => { try { await api.update(p.id, { status: "done" }); p.status = "done"; paint(); } catch (e) { toast(errMsg(e), { err: true }); } };
    state.appendChild(b);
  }
  const box = panel.querySelector("#fbList");
  try {
    const rows = await fb.roster(p.id);
    box.innerHTML = "";
    if (!rows.length) { box.appendChild(el(`<div class="empty">Nessun musicista confermato in questa produzione.</div>`)); return; }
    const done = rows.filter((r) => r.feedback_id).length;
    state.appendChild(el(`<span class="pill ${done === rows.length ? "ok" : "accent"}">${done} feedback su ${rows.length}</span>`));
    for (const r of rows) box.appendChild(feedbackRow(r));
  } catch (e) { box.innerHTML = ""; setState(box, "err", errMsg(e)); }
}
function feedbackRow(r) {
  const d = el(`<details class="role fb"><summary><span class="title"></span><span class="pill ${r.feedback_id ? (r.attended === false ? "danger" : "ok") : ""}">${r.feedback_id ? (r.attended === false ? "assente" : (r.overall ? r.overall + "/5" : "registrato")) : "da fare"}</span><span class="sub"></span></summary><div class="role-body"></div></details>`);
  d.querySelector(".title").textContent = r.musician_name;
  d.querySelector(".sub").textContent = r.role_name + " · posto " + r.seat_no;
  const body = d.querySelector(".role-body");
  const form = el(`<div class="fb-form">
    <div class="row"><label class="check-line"><input type="checkbox" class="att"> <span>Presente</span></label><label class="check-line"><input type="checkbox" class="rehire"> <span>Da richiamare</span></label></div>
    <div class="scores"></div>
    <div class="field"><label>Problemi verificati</label><input class="issues" placeholder="es. in ritardo alla prova generale"></div>
    <div class="field"><label>Note private</label><textarea class="note" rows="2"></textarea></div>
    <div class="row"><button type="button" class="btn primary save">Salva</button><span class="small muted saved"></span></div></div>`);
  form.querySelector(".att").checked = r.attended !== false;
  form.querySelector(".rehire").checked = r.rehire !== false;
  form.querySelector(".issues").value = r.issues || ""; form.querySelector(".note").value = r.note || "";
  const sc = form.querySelector(".scores");
  for (const [k, label] of SCORES) {
    const row = el(`<div class="score-row"><span></span><div class="seg"></div></div>`);
    row.querySelector("span").textContent = label;
    for (let n = 1; n <= 5; n++) { const b = el(`<button type="button" class="btn small" data-k="${k}" data-n="${n}">${n}</button>`); if (r[k] === n) b.classList.add("primary"); b.onclick = () => { row.querySelectorAll("button").forEach((x) => x.classList.remove("primary")); b.classList.add("primary"); }; row.querySelector(".seg").appendChild(b); }
    sc.appendChild(row);
  }
  form.querySelector(".save").onclick = async () => {
    const fields = { attended: form.querySelector(".att").checked, rehire: form.querySelector(".rehire").checked, issues: form.querySelector(".issues").value.trim(), note: form.querySelector(".note").value.trim() };
    for (const [k] of SCORES) { const sel = sc.querySelector(`button.primary[data-k="${k}"]`); fields[k] = sel ? Number(sel.dataset.n) : null; }
    try { await fb.save(ctx.org.org_id, p.id, r.musician_id, fields); toast("Feedback salvato."); form.querySelector(".saved").textContent = "Salvato"; d.querySelector("summary .pill").textContent = fields.attended === false ? "assente" : (fields.overall ? fields.overall + "/5" : "registrato"); d.querySelector("summary .pill").className = "pill " + (fields.attended === false ? "danger" : "ok"); }
    catch (e) { toast(errMsg(e), { err: true }); }
  };
  body.appendChild(form);
  return d;
}

/* ---------------------------------------------------------------- StagePlot */
const editorUrl = (id) => "/app/?p=" + encodeURIComponent(id);
async function paintStageplot() {
  const panel = app.querySelector("#panel");
  panel.innerHTML = `<div id="sp"><div class="loading">Un attimo…</div></div>`;
  const box = panel.querySelector("#sp");
  try {
    if (!p.stageplot_project_id) { await paintSpLink(box); return; }
    const [proj, lk] = await Promise.all([sp.project(p.stageplot_project_id).catch(() => null), sp.links(p.id)]);
    box.innerHTML = "";
    const card = el(`<section class="card"><div class="row"><h3>Progetto collegato</h3><span class="spacer"></span><span class="pill accent" id="spPill"></span></div><p id="spInfo"></p><p class="small muted" id="spHint"></p><div class="row" id="spAct"></div></section>`);
    card.querySelector("#spPill").textContent = proj ? "tuo" : "di un altro account";
    card.querySelector("#spInfo").textContent = proj ? proj.title + " · aggiornato il " + fmtDate(proj.updated_at) : "Il progetto non è nel tuo account StagePlot (o è stato eliminato): si apre solo da chi lo possiede, e solo da lì si importano le postazioni.";
    const linked = lk.filter((l) => l.status === "linked"), stale = lk.filter((l) => l.status === "stale");
    card.querySelector("#spHint").textContent = p.stageplot_synced_at
      ? `Postazioni importate il ${fmtDateTime(p.stageplot_synced_at)}: ${linked.length} collegate` + (stale.length ? `, ${stale.length} non più sul palco` : "") + "."
      : "Nessuna postazione importata ancora. Le postazioni-persona del disegno diventano posti dell'organico; i posti non si tolgono mai da qui.";
    const act = card.querySelector("#spAct");
    act.appendChild(el(`<a class="btn" href="${esc(editorUrl(p.stageplot_project_id))}" target="_blank" rel="noopener">Apri in StagePlot</a>`));
    if (proj) { const b = el(`<button type="button" class="btn primary">Importa postazioni…</button>`); b.onclick = () => paintSpImport(box, proj); act.appendChild(b); }
    const un = el(`<button type="button" class="btn small ghost">Scollega</button>`);
    un.onclick = async () => {
      const yes = await confirm({ title: "Scollegare il progetto?", text: "L'organico resta com'è; spariscono solo i collegamenti alle postazioni.", ok: "Scollega", danger: true });
      if (!yes) return;
      try { await sp.unlink(p.id); Object.assign(p, { stageplot_project_id: null, stageplot_variant_id: null, stageplot_synced_at: null }); toast("Scollegato."); paint(); } catch (e) { toast(errMsg(e), { err: true }); }
    };
    act.appendChild(un);
    box.appendChild(card);
    if (lk.length) {
      const lc = el(`<section class="card"><h3>Postazioni collegate</h3><p class="small muted">Ogni postazione del disegno copre un posto dell'organico (una postazione a due ne copre due). Chi sparisce dal palco tiene il posto e la persona: ricollegalo a un'altra postazione o reimporta.</p><ul class="list" id="lk"></ul></section>`);
      const ul = lc.querySelector("#lk");
      const names = new Map((cat.instruments || []).map((i) => [i.code, i.name]));
      const slotInfo = new Map(); for (const sec of groupStaffing(await api.staffing(p.id))) for (const r of sec.roles) for (const sl of r.slots) slotInfo.set(sl.id, { role: r.name, seat: sl.seat_no, who: sl.musician_name, status: sl.status });
      for (const l of lk) {
        const li = el(`<li class="list-item"><div class="grow"><div class="title"></div><div class="sub"></div></div><div class="actions"></div></li>`);
        const si = slotInfo.get(l.slot_id);
        li.querySelector(".title").textContent = (l.item_label || l.item_type) + (l.seats === 2 ? " · " + (l.seat_index === 1 ? "sinistra" : "destra") : "");
        li.querySelector(".sub").textContent = si ? [si.role + " · posto " + si.seat, si.who ? si.who + " (" + (SLOT_STATUS[si.status] || si.status).toLowerCase() + ")" : "scoperto"].join(" · ") : [names.get(l.instrument_code) || l.instrument_code, "senza posto"].join(" · ");
        const act = li.querySelector(".actions");
        act.appendChild(el(l.status === "stale" ? `<span class="pill warn">non più sul palco</span>` : `<span class="pill ok">collegata</span>`));
        if (l.status === "stale") {
          const rl = el(`<button type="button" class="btn small ghost">Ricollega…</button>`);
          rl.onclick = () => relinkDialog(l, proj);
          act.appendChild(rl);
        }
        ul.appendChild(li);
      }
      box.appendChild(lc);
    }
  } catch (e) { box.innerHTML = ""; setState(box, "err", errMsg(e)); }
}

async function paintSpLink(box) {
  const mine = await sp.myProjects();
  box.innerHTML = "";
  const c = el(`<section class="card"><h3>Collega un progetto StagePlot</h3>
    <p class="small muted">Il disegno del palco e l'organico si parlano: le postazioni-persona del progetto diventano posti da coprire, e dall'editor arrivi qui con File → Organico (Orchestre).</p>
    <div class="form-row"><div class="field"><label for="spSel">Progetto</label><select id="spSel"></select></div><div></div><button type="button" class="btn primary" id="spGo">Collega</button></div></section>`);
  const sel = c.querySelector("#spSel");
  if (!mine.length) { sel.appendChild(new Option("Nessun progetto nel tuo account StagePlot", "")); c.querySelector("#spGo").disabled = true; c.appendChild(el(`<p class="small muted">Disegna il palco nell'<a href="/app/" target="_blank" rel="noopener">editor</a> e salvalo nel cloud: comparirà qui.</p>`)); }
  else { sel.appendChild(new Option("— scegli —", "")); for (const m of mine) sel.appendChild(new Option(m.title + " · " + fmtDate(m.updated_at), m.id)); }
  c.querySelector("#spGo").onclick = async () => {
    const id = sel.value; if (!id) return toast("Scegli un progetto.", { err: true });
    try { await api.update(p.id, { stageplot_project_id: id }); p.stageplot_project_id = id; toast("Collegato."); paint(); } catch (e) { toast(errMsg(e), { err: true }); }
  };
  box.appendChild(c);
}

async function paintSpImport(box, proj) {
  const old = box.querySelector("#spImp"); if (old) old.remove();
  const c = el(`<section class="card" id="spImp"><h3>Importa le postazioni</h3>
    <div class="form-row"><div class="field"><label for="spVar">Scena del progetto</label><select id="spVar"></select></div><div></div><span></span></div>
    <p class="small" id="spSum"></p><ul class="list" id="spDiff"></ul><ul class="list" id="spUn"></ul>
    <div class="row"><button type="button" class="btn primary" id="spDo">Importa</button><button type="button" class="btn ghost" id="spNo">Annulla</button></div></section>`);
  box.appendChild(c);
  c.scrollIntoView({ block: "start", behavior: "smooth" });
  const instr = await sp.instruments(), typeMap = typeMapFrom(instr);
  const roles = groupStaffing(await api.staffing(p.id)).flatMap((s) => s.roles.map((r) => ({ id: r.id, name: r.name, instrument_code: r.instrument_code, seats: r.seats, slots: r.slots.map((sl) => ({ item_id: sl.item_id })) })));
  const variants = docVariants(proj.data);
  const sel = c.querySelector("#spVar");
  for (const v of variants) sel.appendChild(new Option(v.name + (v.active ? " (attiva)" : ""), v.id));
  sel.value = (variants.find((v) => v.id === p.stageplot_variant_id) || variants.find((v) => v.active) || variants[0] || {}).id || "";
  let cur = null;
  const preview = () => {
    const ex = extractPositions(proj.data, sel.value, typeMap);
    const diff = diffProposal(proposeRoles(ex.positions, instr), roles);
    cur = { ...ex, diff };
    c.querySelector("#spSum").textContent = "Se importi: " + importSummary(diff, ex.unmapped);
    const ul = c.querySelector("#spDiff"); ul.innerHTML = "";
    diff.forEach((d, n) => {
      const li = el(`<li class="list-item"><div class="grow"><div class="title"></div><div class="sub"></div></div><div class="actions"></div></li>`);
      li.querySelector(".title").textContent = d.instrument_name + (d.part ? " · " + d.part : "") + " · " + (d.seats === 1 ? "1 posto sul palco" : d.seats + " posti sul palco");
      li.querySelector(".sub").textContent = d.labels.join(", ");
      const act = li.querySelector(".actions");
      /* il ruolo di destinazione si può cambiare: gli altri ruoli dello strumento, o uno nuovo */
      const sel = el(`<select class="small" aria-label="Ruolo di destinazione"></select>`);
      for (const o of d.options) sel.appendChild(new Option(o.name, o.id));
      sel.appendChild(new Option("Nuovo ruolo «" + d.name + "»", ""));
      sel.value = d.role_id || "";
      sel.onchange = () => { const chosen = roles.find((r) => r.id === sel.value) || null; const re = diffProposal([d], chosen ? [chosen] : []); Object.assign(cur.diff[n], re[0], { role_id: chosen ? chosen.id : null, role_name: chosen ? chosen.name : d.name, ambiguous: false }); paintPills(); };
      act.appendChild(sel);
      const pill = el(`<span class="pill"></span>`); act.appendChild(pill);
      li._pill = pill; li._n = n;
      ul.appendChild(li);
    });
    const paintPills = () => {
      for (const li of ul.children) { const d = cur.diff[li._n]; li._pill.className = "pill " + (d.ambiguous ? "danger" : d.action === "new" ? "accent" : d.action === "grow" ? "warn" : "ok"); li._pill.textContent = d.ambiguous ? "scegli il ruolo" : d.action === "new" ? "ruolo nuovo" : d.action === "grow" ? `+${d.add} ${d.add === 1 ? "posto" : "posti"} (ne hai ${d.current})` : `già coperto (${d.current})`; }
      c.querySelector("#spSum").textContent = "Se importi: " + importSummary(cur.diff, cur.unmapped);
      c.querySelector("#spDo").disabled = !cur.positions.length || cur.diff.some((d) => d.ambiguous);
    };
    paintPills();
    const un = c.querySelector("#spUn"); un.innerHTML = "";
    if (ex.unmapped.length) { const li = el(`<li class="empty"></li>`); li.textContent = "Fuori dall'organico (nessuno strumento in catalogo): " + ex.unmapped.map((u) => u.label || u.item_type).join(", ") + "."; un.appendChild(li); }
  };
  sel.onchange = preview; preview();
  c.querySelector("#spNo").onclick = () => c.remove();
  c.querySelector("#spDo").onclick = async () => {
    if (!cur || !cur.positions.length) return;
    try {
      const r = await sp.importGroups(p.id, proj.id, sel.value, importGroups(cur.diff));
      Object.assign(p, { stageplot_variant_id: sel.value, stageplot_synced_at: new Date().toISOString() });
      toast(`Importate: ${r.roles_created} ruoli nuovi, ${r.roles_grown} allargati, ${r.seats_added} posti in più, ${r.linked} posti collegati` + (r.stale ? `, ${r.stale} non più sul palco.` : "."));
      paint();
    } catch (e) { toast(errMsg(e), { err: true }); }
  };
}

async function relinkDialog(l, proj) {
  const wrap = el(`<div class="modal"><div class="box"><h3>Ricollega la postazione</h3><p class="small muted"></p><div class="field"><label for="rlSel">Postazione del disegno</label><select id="rlSel"></select></div><div class="actions"><button type="button" class="btn ghost">Annulla</button><button type="button" class="btn primary">Ricollega</button></div></div></div>`);
  wrap.querySelector("p").textContent = "«" + (l.item_label || l.item_type) + "» non è più sul palco. Il suo posto e la persona restano: scegli quale postazione lo copre adesso.";
  const sel = wrap.querySelector("#rlSel");
  let cands = [];
  if (proj) {
    const instr = await sp.instruments(), typeMap = typeMapFrom(instr);
    const ex = extractPositions(proj.data, p.stageplot_variant_id, typeMap);
    const taken = new Set((await sp.links(p.id)).filter((x) => x.status === "linked").map((x) => x.item_id));
    cands = ex.positions.filter((x) => x.instrument_code === l.instrument_code && !taken.has(x.item_id));
  }
  if (!cands.length) sel.appendChild(new Option("Nessuna postazione libera di questo strumento nel disegno", ""));
  for (const c of cands) sel.appendChild(new Option((c.label || c.item_type) + " (" + c.item_type + ")", c.item_id));
  document.body.appendChild(wrap);
  const close = () => wrap.remove();
  wrap.querySelector(".btn.ghost").onclick = close;
  wrap.querySelector(".btn.primary").onclick = async () => {
    const it = cands.find((x) => x.item_id === sel.value); if (!it) return toast("Scegli una postazione.", { err: true });
    try { await sp.relink(l.id, it.item_id, it.item_type, it.label); close(); toast("Ricollegata."); paint(); } catch (e) { toast(errMsg(e), { err: true }); }
  };
}

/* ---------------------------------------------------------------- Storia */
async function paintStoria() {
  const panel = app.querySelector("#panel");
  panel.innerHTML = `<p class="small muted">Tutto quello che è successo ai posti di questa produzione. Non si modifica e non si cancella.</p><div id="ev" class="loading">Un attimo…</div>`;
  const box = panel.querySelector("#ev");
  try {
    const rows = await api.slotEvents(p.id);
    if (!rows.length) { setState(box, "empty", "Nessun evento ancora."); return; }
    setState(box, ""); box.className = "table-wrap";
    box.innerHTML = `<table class="table"><thead><tr><th>Quando</th><th>Chi</th><th>Cosa</th><th>Dove</th><th>Nota</th></tr></thead><tbody></tbody></table>`;
    const tb = box.querySelector("tbody");
    for (const e of rows) {
      const tr = el(`<tr><td class="mono small"></td><td></td><td></td><td class="small muted"></td><td class="small muted"></td></tr>`);
      tr.children[0].textContent = fmtDateTime(e.at); tr.children[1].textContent = e.musician; tr.children[2].textContent = EVENT[e.event] || e.event;
      tr.children[3].textContent = e.role ? e.role + " · posto " + e.seat_no : ""; tr.children[4].textContent = e.reason;
      tb.appendChild(tr);
    }
  } catch (e) { setState(box, "err", errMsg(e)); }
}

main();
