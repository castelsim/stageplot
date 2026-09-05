/* Scheda di una produzione: Dati · Date · Repertorio · Organico · Storia. ?id= apre, ?new=1 crea,
   ?t= sceglie la scheda (così il refresh resta dove eri). */
import { BASE } from "../config.js";
import { esc, el, toast, confirm, setState, errMsg, fmtDate, fmtDateTime } from "../ui.js";
import { requireStaff, mountTopbar } from "../auth.js";
import { tabs, REP_KIND } from "../nav.js";
import { PROD_STATUS, PROD_STATUS_PILL, PROD_KIND, DATE_KIND, PART, SLOT_STATUS, SLOT_PILL, EVENT, TEMPLATES, templateSeats, groupStaffing, staffingCounts, suggestedStatus } from "../domain/staffing.js";
import * as api from "../api/productions.js";
import { catalogs, list as listMusicians } from "../api/musicians.js";

const app = document.getElementById("app");
const q = new URLSearchParams(location.search);
let ctx = null, p = null, cat = null, tab = q.get("t") || "dati";
const TABS = [["dati", "Dati"], ["date", "Date"], ["repertorio", "Repertorio"], ["organico", "Organico"], ["storia", "Storia"]];

async function main() {
  ctx = await requireStaff();
  if (!ctx) return;
  mountTopbar(ctx, { active: "produzioni" });
  app.className = "o-wrap";
  try {
    cat = await catalogs();
    if (q.get("new")) { p = { id: null, title: "", client: "", description: "", kind: "concerto", conductor: "", manager: "", venue: "", address: "", status: "draft", fee_note: "", conditions: "", dress_code: "", reply_deadline: null, notes: "" }; tab = "dati"; paint(); return; }
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
  ({ dati: paintDati, date: paintDate, repertorio: paintRepertorio, organico: paintOrganico, storia: paintStoria })[tab]();
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
  const act = el(`<div class="row"><button type="button" class="btn primary" id="save">Salva</button></div>`);
  act.querySelector("#save").onclick = async () => {
    const f = {};
    for (const k of ["title", "client", "kind", "status", "conductor", "manager", "venue", "address", "fee_note", "dress_code", "description", "conditions", "notes"]) f[k] = val(k);
    f.reply_deadline = fromLocalInput(val("reply_deadline"));
    if (!f.title.trim()) return toast("Serve un titolo.", { err: true });
    try {
      if (!p.id) { const id = await api.create(ctx.org.org_id, f); location.replace(BASE + "/admin/produzioni/scheda/?id=" + id + "&t=date"); return; }
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
    li.querySelector(".sub").textContent = sl.musician_name ? "Posto " + sl.seat_no : "";
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
