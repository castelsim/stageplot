/* Scheda di un musicista: dati, strumenti, competenze, repertorio, tag, note private.
   ?id=<uuid> apre, ?new=1 crea. Ogni sezione salva da sola: niente modulo infinito. */
import { BASE } from "../config.js";
import { esc, el, toast, confirm, setState, errMsg, fmtDate } from "../ui.js";
import { requireStaff, mountTopbar } from "../auth.js";
import { tabs, STATUS, FAMILY, REP_KIND, REP_SOURCE } from "../nav.js";
import * as api from "../api/musicians.js";

const app = document.getElementById("app");
const q = new URLSearchParams(location.search);
let ctx = null, cat = null, m = null;

async function main() {
  ctx = await requireStaff();
  if (!ctx) return;
  mountTopbar(ctx, { active: "musicisti" });
  app.className = "o-wrap";
  try {
    cat = await api.catalogs();
    if (q.get("new")) { m = blank(); paint(); return; }
    const id = q.get("id");
    if (!id) { location.replace(BASE + "/admin/musicisti/"); return; }
    m = await api.get(id);
    if (!m) { app.innerHTML = tabs("musicisti"); app.appendChild(el(`<div class="empty">Musicista non trovato, o non della tua organizzazione.</div>`)); return; }
    if (m.org_id !== ctx.org.org_id) { location.replace(BASE + "/admin/musicisti/"); return; }
    paint();
  } catch (e) { app.innerHTML = tabs("musicisti"); const d = el(`<div class="err"></div>`); d.textContent = errMsg(e); app.appendChild(d); }
}

function blank() {
  return { id: null, first_name: "", last_name: "", email: "", phone: "", city: "", province: "", area: "", has_car: false, max_distance_km: null,
    travel_ok: true, tour_ok: false, status: "active", bio: "", notes_private: "", instruments: [], skills: [], repertoire: [], tags: [] };
}

function paint() {
  const isNew = !m.id;
  app.innerHTML = tabs("musicisti") + `
    <p class="small"><a href="${BASE}/admin/musicisti/">← Musicisti</a></p>
    <div class="row"><h1 id="h"></h1><span class="spacer"></span><span id="stPill"></span></div>
    <div class="grid2">
      <section class="card" id="dati"><h3>Dati e contatti</h3></section>
      <div class="stack">
        <section class="card" id="strum"><h3>Strumenti</h3></section>
        <section class="card" id="comp"><h3>Competenze</h3></section>
        <section class="card" id="rep"><h3>Repertorio eseguito</h3></section>
        <section class="card" id="tag"><h3>Tag</h3></section>
        <section class="card" id="note"><h3>Note private</h3><p class="small muted">Le vede solo lo staff dell'organizzazione. Mai il musicista.</p></section>
      </div>
    </div>`;
  app.querySelector("#h").textContent = isNew ? "Nuovo musicista" : m.last_name + " " + m.first_name;
  paintDati();
  if (!isNew) { paintStrumenti(); paintCompetenze(); paintRepertorio(); paintTag(); paintNote(); }
  else for (const id of ["strum", "comp", "rep", "tag", "note"]) app.querySelector("#" + id).appendChild(el(`<p class="small muted">Disponibile dopo il primo salvataggio.</p>`));
}

function field(id, label, value, { type = "text", opts = null, hint = "" } = {}) {
  const f = el(`<div class="field"><label for="${id}">${esc(label)}</label></div>`);
  let inp;
  if (opts) { inp = el(`<select id="${id}">${opts.map(([v, l]) => `<option value="${esc(v)}">${esc(l)}</option>`).join("")}</select>`); inp.value = value ?? ""; }
  else if (type === "textarea") { inp = el(`<textarea id="${id}"></textarea>`); inp.value = value ?? ""; }
  else if (type === "checkbox") { f.className = "field check"; inp = el(`<label class="check-line"><input type="checkbox" id="${id}"> <span>${esc(label)}</span></label>`); inp.querySelector("input").checked = !!value; f.innerHTML = ""; }
  else { inp = el(`<input id="${id}" type="${type}">`); inp.value = value ?? ""; }
  f.appendChild(inp);
  if (hint) f.appendChild(el(`<span class="hint">${esc(hint)}</span>`));
  return f;
}
const val = (id) => { const n = app.querySelector("#" + id); return n.type === "checkbox" ? n.checked : n.value; };

function paintDati() {
  const s = app.querySelector("#dati");
  const g = el(`<div class="grid2 tight"></div>`);
  g.appendChild(field("first_name", "Nome", m.first_name));
  g.appendChild(field("last_name", "Cognome", m.last_name));
  g.appendChild(field("email", "Email", m.email, { type: "email" }));
  g.appendChild(field("phone", "Telefono", m.phone, { type: "tel" }));
  g.appendChild(field("city", "Città", m.city));
  g.appendChild(field("province", "Provincia", m.province, { hint: "sigla, es. VI" }));
  g.appendChild(field("area", "Area", m.area, { hint: "es. Veneto, Nord-Est" }));
  g.appendChild(field("max_distance_km", "Distanza massima (km)", m.max_distance_km ?? "", { type: "number" }));
  g.appendChild(field("status", "Stato", m.status, { opts: Object.entries(STATUS) }));
  s.appendChild(g);
  const checks = el(`<div class="row"></div>`);
  checks.appendChild(field("has_car", "Ha l'auto", m.has_car, { type: "checkbox" }));
  checks.appendChild(field("travel_ok", "Disponibile a trasferte", m.travel_ok, { type: "checkbox" }));
  checks.appendChild(field("tour_ok", "Disponibile a tournée", m.tour_ok, { type: "checkbox" }));
  s.appendChild(checks);
  s.appendChild(field("bio", "Presentazione", m.bio, { type: "textarea" }));
  const act = el(`<div class="row"><button type="button" class="btn primary" id="saveDati">Salva</button></div>`);
  if (m.id) act.appendChild(el(`<span class="small muted">Creato il ${esc(fmtDate(m.created_at))}</span>`));
  s.appendChild(act);
  act.querySelector("#saveDati").onclick = async () => {
    const fields = {};
    for (const k of ["first_name", "last_name", "email", "phone", "city", "province", "area", "max_distance_km", "status", "has_car", "travel_ok", "tour_ok", "bio"]) fields[k] = val(k);
    if (!fields.first_name.trim() || !fields.last_name.trim()) return toast("Servono nome e cognome.", { err: true });
    try {
      if (!m.id) {
        const id = await api.create(ctx.org.org_id, fields);
        location.replace(BASE + "/admin/musicisti/scheda/?id=" + id);
        return;
      }
      await api.update(m.id, fields);
      Object.assign(m, fields);
      app.querySelector("#h").textContent = m.last_name + " " + m.first_name;
      toast("Salvato.");
    } catch (e) { toast(errMsg(e), { err: true }); }
  };
  if (m.id) {
    const arch = el(`<button type="button" class="btn small danger">Archivia</button>`);
    arch.onclick = async () => {
      const yes = await confirm({ title: "Archiviare il musicista?", text: "Sparisce dal pool ma nessun dato va perso: lo storico resta.", ok: "Archivia", danger: true });
      if (!yes) return;
      try { await api.archive(m.id); location.href = BASE + "/admin/musicisti/"; } catch (e) { toast(errMsg(e), { err: true }); }
    };
    act.appendChild(arch);
  }
}

function paintStrumenti() {
  const s = app.querySelector("#strum");
  s.querySelectorAll(".sec").forEach((n) => n.remove());
  const box = el(`<div class="sec"></div>`);
  const ul = el(`<ul class="list compact"></ul>`);
  for (const it of m.instruments) {
    const i = cat.instruments.find((x) => x.code === it.instrument_code);
    const li = el(`<li class="list-item"><div class="grow"><div class="title"></div><div class="sub"></div></div><div class="actions"></div></li>`);
    li.querySelector(".title").textContent = (i ? i.name : it.instrument_code) + (it.is_primary ? " · principale" : "") + (it.doubling ? " · doubling" : "");
    li.querySelector(".sub").textContent = (i ? FAMILY[i.family] : "") + (it.level ? " · livello " + it.level + "/5" : "");
    const rm = el(`<button type="button" class="btn small ghost">Togli</button>`);
    rm.onclick = () => saveInstruments(m.instruments.filter((x) => x !== it));
    li.querySelector(".actions").appendChild(rm);
    ul.appendChild(li);
  }
  if (!m.instruments.length) ul.appendChild(el(`<li class="empty">Nessuno strumento.</li>`));
  box.appendChild(ul);
  const add = el(`<div class="form-row">
    <div class="field"><label for="addInst">Aggiungi</label><select id="addInst">${Object.entries(FAMILY).map(([f, fl]) =>
      `<optgroup label="${esc(fl)}">${cat.instruments.filter((x) => x.family === f).map((x) => `<option value="${x.code}">${esc(x.name)}</option>`).join("")}</optgroup>`).join("")}</select></div>
    <div class="field"><label for="addLvl">Livello</label><select id="addLvl"><option value="">—</option>${[1, 2, 3, 4, 5].map((n) => `<option>${n}</option>`).join("")}</select></div>
    <button type="button" class="btn" id="addInstBtn">Aggiungi</button></div>`);
  add.querySelector("#addInstBtn").onclick = () => {
    const code = add.querySelector("#addInst").value, level = Number(add.querySelector("#addLvl").value) || null;
    if (m.instruments.some((x) => x.instrument_code === code)) return toast("Strumento già presente.", { err: true });
    const next = m.instruments.concat([{ instrument_code: code, level, is_primary: m.instruments.length === 0, doubling: m.instruments.length > 0 }]);
    saveInstruments(next);
  };
  box.appendChild(add);
  if (m.instruments.length > 1) {
    const pr = el(`<div class="field"><label for="prim">Principale</label><select id="prim">${m.instruments.map((it) => `<option value="${it.instrument_code}"${it.is_primary ? " selected" : ""}>${esc(cat.instruments.find((x) => x.code === it.instrument_code)?.name || it.instrument_code)}</option>`).join("")}</select></div>`);
    pr.querySelector("select").onchange = (e) => saveInstruments(m.instruments.map((x) => ({ ...x, is_primary: x.instrument_code === e.target.value, doubling: x.instrument_code !== e.target.value })));
    box.appendChild(pr);
  }
  s.appendChild(box);
}
async function saveInstruments(next) {
  try {
    await api.setInstruments(m.id, next.map((x) => ({ code: x.instrument_code, primary: x.is_primary, level: x.level, doubling: x.doubling })));
    m.instruments = next; paintStrumenti(); toast("Strumenti salvati.");
  } catch (e) { toast(errMsg(e), { err: true }); }
}

function paintCompetenze() {
  const s = app.querySelector("#comp");
  s.querySelectorAll(".sec").forEach((n) => n.remove());
  const box = el(`<div class="sec"></div>`);
  box.appendChild(el(`<p class="small muted">0 = no, 1 = base, 2 = buono, 3 = ottimo. Le competenze verificate vengono dallo storico o da un'audizione.</p>`));
  const tbl = el(`<div class="table-wrap"><table class="table"><tbody></tbody></table></div>`);
  const tb = tbl.querySelector("tbody");
  for (const sk of cat.skills) {
    const cur = m.skills.find((x) => x.skill_code === sk.code);
    const tr = el(`<tr><td></td><td class="right"><select aria-label="${esc(sk.name)}"><option value="">—</option>${[0, 1, 2, 3].map((n) => `<option value="${n}">${n}</option>`).join("")}</select></td><td class="small muted"></td></tr>`);
    tr.children[0].textContent = sk.name;
    tr.querySelector("select").value = cur ? String(cur.level) : "";
    tr.children[2].textContent = cur && cur.source === "verified" ? "verificata" : "";
    tr.querySelector("select").onchange = async (e) => {
      const next = m.skills.filter((x) => x.skill_code !== sk.code);
      if (e.target.value !== "") next.push({ skill_code: sk.code, level: Number(e.target.value), source: cur?.source || "declared" });
      try { await api.setSkills(m.id, next.map((x) => ({ code: x.skill_code, level: x.level, source: x.source }))); m.skills = next; toast("Competenze salvate."); }
      catch (err) { toast(errMsg(err), { err: true }); }
    };
    tb.appendChild(tr);
  }
  box.appendChild(tbl);
  s.appendChild(box);
}

function paintRepertorio() {
  const s = app.querySelector("#rep");
  s.querySelectorAll(".sec").forEach((n) => n.remove());
  const box = el(`<div class="sec"></div>`);
  const ul = el(`<ul class="list compact"></ul>`);
  for (const r of m.repertoire) {
    const li = el(`<li class="list-item"><div class="grow"><div class="title"></div><div class="sub"></div></div><div class="actions"></div></li>`);
    li.querySelector(".title").textContent = r.name;
    li.querySelector(".sub").textContent = (REP_KIND[r.kind] || r.kind) + " · " + (REP_SOURCE[r.source] || r.source) + (r.note ? " · " + r.note : "");
    const rm = el(`<button type="button" class="btn small ghost">Togli</button>`);
    rm.onclick = async () => { try { await api.removeRepertoire(m.id, r.id); m.repertoire = m.repertoire.filter((x) => x !== r); paintRepertorio(); } catch (e) { toast(errMsg(e), { err: true }); } };
    li.querySelector(".actions").appendChild(rm);
    ul.appendChild(li);
  }
  if (!m.repertoire.length) ul.appendChild(el(`<li class="empty">Nessun repertorio registrato.</li>`));
  box.appendChild(ul);
  const add = el(`<div class="form-row">
    <div class="field"><label for="repName">Aggiungi</label><input id="repName" placeholder="es. Ennio Morricone" list="repList"><datalist id="repList"></datalist></div>
    <div class="field"><label for="repKind">Tipo</label><select id="repKind">${Object.entries(REP_KIND).map(([k, v]) => `<option value="${k}">${v}</option>`).join("")}</select></div>
    <button type="button" class="btn" id="repBtn">Aggiungi</button></div>`);
  api.listRepertoire(ctx.org.org_id).then((rows) => { const dl = add.querySelector("#repList"); for (const r of rows) { const o = document.createElement("option"); o.value = r.name; dl.appendChild(o); } }).catch(() => {});
  add.querySelector("#repBtn").onclick = async () => {
    const name = add.querySelector("#repName").value.trim(), kind = add.querySelector("#repKind").value;
    if (!name) return;
    try { await api.addRepertoire(ctx.org.org_id, m.id, { kind, name }); m = await api.get(m.id); paintRepertorio(); toast("Repertorio aggiunto."); }
    catch (e) { toast(errMsg(e), { err: true }); }
  };
  box.appendChild(add);
  s.appendChild(box);
}

function paintTag() {
  const s = app.querySelector("#tag");
  s.querySelectorAll(".sec").forEach((n) => n.remove());
  const box = el(`<div class="sec"></div>`);
  const f = el(`<div class="field"><label for="tags">Tag, separati da virgola</label><input id="tags" autocomplete="off"><span class="hint">es. prima parte, affidabile, nuovo</span></div>`);
  f.querySelector("input").value = m.tags.join(", ");
  const b = el(`<button type="button" class="btn">Salva tag</button>`);
  b.onclick = async () => {
    const tags = f.querySelector("input").value.split(",").map((x) => x.trim()).filter(Boolean);
    try { await api.setTags(m.id, tags); m.tags = [...new Set(tags)]; toast("Tag salvati."); } catch (e) { toast(errMsg(e), { err: true }); }
  };
  box.appendChild(f); box.appendChild(b);
  s.appendChild(box);
}

function paintNote() {
  const s = app.querySelector("#note");
  const f = field("notes_private", "Note", m.notes_private, { type: "textarea" });
  f.querySelector("label").className = "sr-only";
  const b = el(`<button type="button" class="btn">Salva note</button>`);
  b.onclick = async () => { try { await api.update(m.id, { notes_private: val("notes_private") }); toast("Note salvate."); } catch (e) { toast(errMsg(e), { err: true }); } };
  s.appendChild(f); s.appendChild(b);
  setState(null, "");
}

main();
