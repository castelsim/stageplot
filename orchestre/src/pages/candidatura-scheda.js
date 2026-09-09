/* Una candidatura: il profilo dichiarato, i file, la storia, le valutazioni interne, il cambio di stato. */
import { BASE } from "../config.js";
import { esc, el, toast, confirm, errMsg, fmtDate, fmtDateTime } from "../ui.js";
import { requireStaff, mountTopbar } from "../auth.js";
import { tabs } from "../nav.js";
import { APP_STATUS, APP_PILL, EVAL_KIND, EVAL_SCORES, publicStatus, PUBLIC_STATUS } from "../domain/applications.js";
import * as api from "../api/applications.js";

const app = document.getElementById("app");
const q = new URLSearchParams(location.search);
let ctx = null, D = null;
const NEXT = {
  submitted: ["evaluating", "interview_to_schedule", "audition_to_schedule", "rejected", "archived"],
  evaluating: ["interview_to_schedule", "audition_to_schedule", "reserve", "accepted", "rejected", "suspended"],
  interview_to_schedule: ["interview_scheduled", "evaluating", "rejected"],
  interview_scheduled: ["audition_to_schedule", "reserve", "accepted", "rejected", "evaluating"],
  audition_to_schedule: ["audition_scheduled", "evaluating", "rejected"],
  audition_scheduled: ["reserve", "accepted", "rejected", "evaluating"],
  reserve: ["accepted", "rejected", "archived"], accepted: ["archived"], rejected: ["evaluating", "archived"], suspended: ["evaluating", "archived"], archived: ["evaluating"],
};

async function main() {
  ctx = await requireStaff();
  if (!ctx) return;
  mountTopbar(ctx, { active: "candidature" });
  app.className = "o-wrap";
  try { D = await api.detail(q.get("id")); if (!D) throw new Error("Candidatura non trovata, o non della tua organizzazione."); paint(); }
  catch (e) { app.innerHTML = tabs("candidature"); const d = el(`<div class="err"></div>`); d.textContent = errMsg(e); app.appendChild(d); }
}

function paint() {
  const a = D.application, p = D.profile;
  app.innerHTML = tabs("candidature") + `
    <p class="small"><a class="back" href="${BASE}/admin/candidature/">← Candidature</a></p>
    <div class="row"><h1 id="h"></h1><span class="spacer"></span><span class="pill ${APP_PILL[a.status] || ""}">${esc(APP_STATUS[a.status] || a.status)}</span></div>
    <p class="small muted">Il candidato vede: <b>${esc(PUBLIC_STATUS[publicStatus(a.status)])}</b>${a.note_to_candidate ? " · messaggio: «" + esc(a.note_to_candidate) + "»" : ""}${p.deletion_requested_at ? ` · <span class="pill danger">chiede la cancellazione dal ${esc(fmtDate(p.deletion_requested_at))}</span>` : ""}</p>
    <div class="grid2">
      <div class="stack">
        <section class="card" id="decl"><h3>Dichiarato dal candidato</h3></section>
        <section class="card" id="files"><h3>Materiali</h3></section>
        <section class="card" id="hist"><h3>Storia</h3></section>
      </div>
      <div class="stack">
        <section class="card" id="status"><h3>Stato</h3></section>
        <section class="card" id="evals"><h3>Valutazioni interne</h3><p class="small muted">Colloqui, audizioni, note. Il candidato non le vede mai.</p></section>
      </div>
    </div>`;
  app.querySelector("#h").textContent = p.last_name + " " + p.first_name;
  paintDeclared(); paintFiles(); paintHistory(); paintStatus(); paintEvals();
}

function kv(k, v) { const pp = el(`<p class="small"><b></b> <span></span></p>`); pp.querySelector("b").textContent = k + ":"; pp.querySelector("span").textContent = v || "—"; return pp; }
function paintDeclared() {
  const s = app.querySelector("#decl"), p = D.profile;
  s.appendChild(kv("Contatti", [p.email, p.phone].filter(Boolean).join(" · ")));
  s.appendChild(kv("Città", [p.city, p.province, p.area].filter(Boolean).join(", ")));
  s.appendChild(kv("Strumenti", D.instruments.map((i) => i.name + (i.primary ? " (principale)" : "") + (i.level ? " " + i.level + "/5" : "")).join(", ")));
  s.appendChild(kv("Lettura", `prima vista ${p.reading_sight}/3 · partitura ${p.reading_score}/3 · improvvisazione ${p.improvisation}/3`));
  s.appendChild(kv("Sa lavorare con", [p.with_conductor ? "direttore" : "", p.click ? "click" : "", p.sequences ? "sequenze" : "", p.in_ear ? "in-ear" : ""].filter(Boolean).join(", ")));
  s.appendChild(kv("Esperienze", [p.exp_orchestral ? "orchestrale" : "", p.exp_pop ? "pop" : "", p.exp_live ? "live" : "", p.exp_studio ? "studio" : "", p.exp_theatre ? "teatro/musical" : ""].filter(Boolean).join(", ") + (p.years_experience ? ` · ${p.years_experience} anni` : "")));
  s.appendChild(kv("Formazione", p.education)); s.appendChild(kv("Generi", (p.genres || []).join(", ")));
  s.appendChild(kv("Repertorio", D.repertoire.map((r) => r.name).join(", ")));
  s.appendChild(kv("Disponibilità", [p.rehearsal_availability, p.travel_ok ? "trasferte" : "no trasferte", p.tour_ok ? "tournée" : "", p.has_car ? "auto" : "", p.max_distance_km ? "≤ " + p.max_distance_km + " km" : ""].filter(Boolean).join(" · ")));
  s.appendChild(kv("Presentazione", p.bio));
  if (D.application.message) s.appendChild(kv("Messaggio", D.application.message));
  s.appendChild(kv("Consenso privacy", p.consent_privacy_version ? "versione " + p.consent_privacy_version + " del " + fmtDate(p.consent_privacy_at) : "assente"));
}
function paintFiles() {
  const s = app.querySelector("#files"), p = D.profile;
  const links = [p.website && ["Sito", p.website], p.audio_url && ["Audio", p.audio_url], p.video_url && ["Video", p.video_url]].filter(Boolean);
  for (const [k, u] of links) { const pp = el(`<p class="small"><b>${esc(k)}:</b> <a target="_blank" rel="noopener noreferrer"></a></p>`); pp.querySelector("a").href = u; pp.querySelector("a").textContent = u; s.appendChild(pp); }
  if (!D.files.length && !links.length) s.appendChild(el(`<p class="small muted">Nessun materiale.</p>`));
  for (const f of D.files) {
    const row = el(`<p class="small"><b>${esc(f.kind === "cv" ? "CV" : f.kind)}:</b> <span></span> <button type="button" class="btn small">Apri</button></p>`);
    row.querySelector("span").textContent = f.name + " (" + Math.round(f.size / 1024) + " KB)";
    row.querySelector("button").onclick = async () => { try { const u = await api.signedUrl(f.path); globalThis.open(u, "_blank", "noopener"); } catch (e) { toast(errMsg(e), { err: true }); } };
    s.appendChild(row);
  }
}
function paintHistory() {
  const s = app.querySelector("#hist");
  const ul = el(`<ul class="plain small"></ul>`);
  for (const e of D.events) { const li = document.createElement("li"); li.textContent = fmtDateTime(e.at) + " · " + (e.from ? (APP_STATUS[e.from] || e.from) + " → " : "") + (APP_STATUS[e.to] || e.to) + " (" + (e.actor === "candidate" ? "candidato" : e.actor) + ")" + (e.note ? " · " + e.note : ""); ul.appendChild(li); }
  s.appendChild(ul);
}
function paintStatus() {
  const s = app.querySelector("#status"), a = D.application;
  const opts = NEXT[a.status] || [];
  if (!opts.length) { s.appendChild(el(`<p class="small muted">Nessun passaggio disponibile.</p>`)); return; }
  const f = el(`<div class="stack"><div class="field"><label for="ns">Nuovo stato</label><select id="ns">${opts.map((k) => `<option value="${k}">${esc(APP_STATUS[k])}</option>`).join("")}</select></div>
    <div class="field"><label for="nn">Nota interna</label><input id="nn" placeholder="facoltativa"></div>
    <div class="field"><label for="nc">Messaggio al candidato</label><input id="nc" placeholder="facoltativo, lo vedrà nella sua area"></div>
    <button type="button" class="btn primary" id="go">Applica</button></div>`);
  f.querySelector("#go").onclick = async () => {
    const ns = f.querySelector("#ns").value;
    if (ns === "accepted") { const yes = await confirm({ title: "Accettare la candidatura?", text: "Il musicista entra nel pool dell'organizzazione con i dati dichiarati, collegato al suo account: potrà ricevere convocazioni.", ok: "Accetta" }); if (!yes) return; }
    if (ns === "rejected") { const yes = await confirm({ title: "Rifiutare la candidatura?", text: "Il candidato vedrà «Non accettata» e il messaggio, se lo scrivi.", ok: "Rifiuta", danger: true }); if (!yes) return; }
    try { await api.setStatus(a.id, ns, f.querySelector("#nn").value.trim(), f.querySelector("#nc").value.trim() || null); toast("Stato aggiornato."); D = await api.detail(a.id); paint(); }
    catch (e) { toast(errMsg(e), { err: true }); }
  };
  s.appendChild(f);
}
function paintEvals() {
  const s = app.querySelector("#evals");
  for (const ev of D.evaluations) s.appendChild(evalCard(ev));
  const add = el(`<button type="button" class="btn">Nuova valutazione</button>`);
  add.onclick = () => { add.replaceWith(evalForm({ org_id: ctx.org.org_id, application_id: D.application.id, kind: "interview", date: new Date().toISOString().slice(0, 10) })); };
  s.appendChild(add);
}
function evalCard(ev) {
  const c = el(`<details class="role"><summary><span class="title"></span><span class="pill ${ev.overall >= 4 ? "ok" : ev.overall ? "" : ""}">${ev.overall ? ev.overall + "/5" : "—"}</span><span class="sub"></span></summary><div class="role-body"></div></details>`);
  c.querySelector(".title").textContent = (EVAL_KIND[ev.kind] || ev.kind) + (ev.date ? " · " + fmtDate(ev.date) : "");
  c.querySelector(".sub").textContent = [ev.outcome, ev.decision].filter(Boolean).join(" · ");
  const b = c.querySelector(".role-body");
  const scores = EVAL_SCORES.filter(([k]) => ev[k]).map(([k, l]) => l + " " + ev[k]).join(" · ");
  if (scores) b.appendChild(kv("Punteggi", scores));
  if (ev.strengths) b.appendChild(kv("Punti di forza", ev.strengths)); if (ev.issues) b.appendChild(kv("Criticità", ev.issues)); if (ev.private_note) b.appendChild(kv("Note private", ev.private_note));
  const row = el(`<div class="row"><button type="button" class="btn small">Modifica</button><button type="button" class="btn small ghost">Elimina</button></div>`);
  row.children[0].onclick = () => c.replaceWith(evalForm(ev));
  row.children[1].onclick = async () => { const yes = await confirm({ title: "Eliminare la valutazione?", ok: "Elimina", danger: true }); if (!yes) return; try { await api.deleteEvaluation(ev.id); D = await api.detail(D.application.id); paint(); } catch (e) { toast(errMsg(e), { err: true }); } };
  b.appendChild(row);
  return c;
}
function evalForm(ev) {
  const f = el(`<div class="card eval-form"><div class="grid2 tight">
    <div class="field"><label>Tipo</label><select class="kind">${Object.entries(EVAL_KIND).map(([k, v]) => `<option value="${k}"${ev.kind === k ? " selected" : ""}>${v}</option>`).join("")}</select></div>
    <div class="field"><label>Data</label><input class="date" type="date"></div>
    <div class="field"><label>Esito</label><input class="outcome" placeholder="es. positivo, da rivedere"></div>
    <div class="field"><label>Decisione</label><input class="decision" placeholder="es. audizione, accettare, no"></div></div>
    <div class="scores"></div>
    <div class="field"><label>Punti di forza</label><input class="strengths"></div>
    <div class="field"><label>Criticità</label><input class="issues"></div>
    <div class="field"><label>Note private</label><textarea class="note" rows="2"></textarea></div>
    <div class="row"><button type="button" class="btn primary save">Salva</button><button type="button" class="btn ghost cancel">Annulla</button></div></div>`);
  f.querySelector(".date").value = ev.date || ""; f.querySelector(".outcome").value = ev.outcome || ""; f.querySelector(".decision").value = ev.decision || "";
  f.querySelector(".strengths").value = ev.strengths || ""; f.querySelector(".issues").value = ev.issues || ""; f.querySelector(".note").value = ev.private_note || "";
  const sc = f.querySelector(".scores");
  for (const [k, label] of [...EVAL_SCORES, ["overall", "Complessivo"]]) {
    const row = el(`<div class="score-row"><span></span><div class="seg"></div></div>`); row.querySelector("span").textContent = label;
    for (let n = 1; n <= 5; n++) { const b = el(`<button type="button" class="btn small" data-k="${k}" data-n="${n}">${n}</button>`); if (ev[k] === n) b.classList.add("primary"); b.onclick = () => { const on = b.classList.contains("primary"); row.querySelectorAll("button").forEach((x) => x.classList.remove("primary")); if (!on) b.classList.add("primary"); }; row.querySelector(".seg").appendChild(b); }
    sc.appendChild(row);
  }
  f.querySelector(".cancel").onclick = () => { D && paint(); };
  f.querySelector(".save").onclick = async () => {
    const row = { id: ev.id, org_id: ev.org_id, application_id: ev.application_id, kind: f.querySelector(".kind").value, date: f.querySelector(".date").value || null, outcome: f.querySelector(".outcome").value.trim(), decision: f.querySelector(".decision").value.trim(), strengths: f.querySelector(".strengths").value.trim(), issues: f.querySelector(".issues").value.trim(), private_note: f.querySelector(".note").value.trim() };
    for (const [k] of [...EVAL_SCORES, ["overall"]]) { const sel = sc.querySelector(`button.primary[data-k="${k}"]`); row[k] = sel ? Number(sel.dataset.n) : null; }
    if (!row.id) delete row.id;
    try { await api.saveEvaluation(row); toast("Valutazione salvata."); D = await api.detail(D.application.id); paint(); } catch (e) { toast(errMsg(e), { err: true }); }
  };
  return f;
}

main();
