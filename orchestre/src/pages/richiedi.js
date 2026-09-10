/* «Richiedi musicisti»: il cliente ha disegnato il palco e chiede alla società di trovargli le persone.
   Chi arriva qui NON è di un'organizzazione: è un utente qualsiasi dell'editor. Vede il suo palco, spunta i
   posti che non sa coprire, descrive l'evento, rilegge e manda. Quello che parte è una copia funzionale del
   disegno, senza la sua rubrica: la costruisce `domain/client-request.js`. */
import { BASE } from "../config.js";
import { esc, el, toast, setState, errMsg, fmtDate } from "../ui.js";
import { getSession, signIn } from "../auth.js";
import { EVENT_KINDS, motivoNonPronta, stagePositions, snapshotOf, countNeeded, summaryLines } from "../domain/client-request.js";
import { typeMapFrom, docVariants, isUuid } from "../domain/stageplot-import.js";
import * as sp from "../api/stageplot.js";
import * as api from "../api/client-requests.js";

const app = document.getElementById("app");
const q = new URLSearchParams(location.search);
const HERE = BASE + "/richiedi/" + (isUuid(q.get("p")) ? "?p=" + q.get("p") : "");

let servizio = null, progetto = null, variante = "", righe = [], ignorate = [], instr = [], typeMap = {}, miei = [];
const F = { contact_name: "", contact_company: "", contact_email: "", contact_phone: "", event_kind: "concerto", event_title: "", event_when: "", event_place: "", schedule: "", repertoire: "", budget: "", notes: "" };

async function main() {
  const session = await getSession();
  if (!session) return paintLogin();
  F.contact_email = session.user.email || "";
  F.contact_name = (session.user.user_metadata || {}).full_name || "";
  try {
    servizio = await api.serviceOrg();
    if (!servizio) return paintChiuso();
    instr = await sp.instruments();
    typeMap = typeMapFrom(instr);
    const pid = q.get("p");
    if (isUuid(pid)) progetto = await sp.project(pid).catch(() => null);
    if (progetto) caricaPostazioni();
    else miei = await sp.myProjects().catch(() => []);   /* i palchi che ha già: offerti, mai imposti */
    paintModulo();
  } catch (e) { paintErrore(errMsg(e)); }
}

function caricaPostazioni() {
  const vs = docVariants(progetto.data);
  variante = variante || (vs.find((v) => v.active) || vs[0] || {}).id || "";
  const r = stagePositions(progetto.data, variante, typeMap, instr);
  righe = r.righe; ignorate = r.ignorate;
}

/* ------------------------------------------------------------------ schermate d'ingresso */
function paintLogin() {
  app.innerHTML = "";
  app.appendChild(el(`<h1>Richiedi musicisti</h1>`));
  app.appendChild(el(`<p class="lead">Hai disegnato il palco e ti servono i musicisti per suonarci. Descrivi l'evento e dicci quali posti non riesci a coprire: ti rispondiamo con i nomi e il preventivo.</p>`));
  const b = el(`<button type="button" class="btn primary block">Accedi con Google e continua</button>`);
  b.onclick = async () => { b.disabled = true; b.textContent = "Ti porto su Google…"; try { await signIn(HERE); } catch (e) { b.disabled = false; b.textContent = "Accedi con Google e continua"; toast(errMsg(e), { err: true }); } };
  app.appendChild(b);
  app.appendChild(el(`<p class="small muted">Serve l'accesso per collegare la richiesta al tuo palco e per risponderti. <a href="${BASE}/privacy/">Come trattiamo i dati</a>.</p>`));
}

function paintChiuso() {
  app.innerHTML = "";
  app.appendChild(el(`<h1>Richiedi musicisti</h1>`));
  setState(app, "empty", "Il servizio non è attivo in questo momento. Riprova più avanti.");
}

function paintErrore(msg) {
  app.innerHTML = "";
  app.appendChild(el(`<h1>Richiedi musicisti</h1>`));
  const d = el(`<div class="err"></div>`); d.textContent = msg; app.appendChild(d);
}

/* ------------------------------------------------------------------ il modulo */
/* Quello che il browser sa già di chi scrive: compilarlo a mano su un telefono è la parte più noiosa. */
const AUTO = { contact_name: "name", contact_company: "organization", contact_email: "email", contact_phone: "tel" };

function campo(id, label, { type = "text", opts = null, hint = "", full = false } = {}) {
  const f = el(`<div class="field${full ? " full" : ""}"><label for="${id}">${esc(label)}</label></div>`);
  let inp;
  if (opts) { inp = el(`<select id="${id}">${opts.map(([v, l]) => `<option value="${esc(v)}">${esc(l)}</option>`).join("")}</select>`); inp.value = F[id] || ""; }
  else if (type === "textarea") { inp = el(`<textarea id="${id}" rows="3"></textarea>`); inp.value = F[id] || ""; }
  else { inp = el(`<input id="${id}" type="${type}" autocomplete="${AUTO[id] || "off"}">`); inp.value = F[id] || ""; }
  inp.oninput = () => { F[id] = inp.value; aggiornaConto(); };
  inp.onchange = () => { F[id] = inp.value; aggiornaConto(); };
  f.appendChild(inp);
  if (hint) f.appendChild(el(`<span class="hint">${esc(hint)}</span>`));
  return f;
}

function paintModulo() {
  app.innerHTML = "";
  app.appendChild(el(`<h1>Richiedi musicisti</h1>`));
  const p = el(`<p class="lead"></p>`);
  p.textContent = progetto
    ? "La richiesta e una copia del palco «" + progetto.title + "» arrivano a " + servizio.name + ", che ti risponde con i nomi e il preventivo. Disponibilità e prezzo si confermano dopo."
    : "Dicci che evento è e chi ti serve: " + servizio.name + " ti risponde con i nomi e il preventivo. Il disegno del palco non serve — se ce l'hai lo puoi allegare, ma è un di più.";
  app.appendChild(p);

  /* la scena, se il progetto ne ha più d'una */
  const vs = progetto ? docVariants(progetto.data) : [];
  if (vs.length > 1) {
    const f = el(`<div class="field"><label for="scena">Scena del progetto</label><select id="scena"></select></div>`);
    for (const v of vs) f.querySelector("select").appendChild(new Option(v.name + (v.active ? " (attiva)" : ""), v.id));
    f.querySelector("select").value = variante;
    f.querySelector("select").onchange = (e) => { variante = e.target.value; caricaPostazioni(); paintModulo(); };
    app.appendChild(f);
  }

  /* i posti */
  const card = el(`<section class="card"><div class="row"><h3>Chi ti serve</h3><span class="spacer"></span><span class="pill" id="conto"></span></div>
    <p class="small muted" id="chiHint"></p>
    <label class="check" for="nonSo"><input type="checkbox" id="nonSo"><span>Non so quale formazione serve: proponetemela voi</span></label>
    <ul class="list compact" id="posti"></ul>
    <div class="row"><button type="button" class="btn small ghost" id="add">${progetto ? "Aggiungi una richiesta a mano" : "Aggiungi uno strumento"}</button></div></section>`);
  card.querySelector("#chiHint").textContent = progetto
    ? "Spunta i posti che copri già tu: per gli altri cerchiamo noi il musicista."
    : "Dicci gli strumenti e quanti ne servono. Se non lo sai, spunta qui sotto e ce lo diciamo noi.";
  const nonSo = card.querySelector("#nonSo");
  nonSo.checked = !!F.formation_unknown;
  nonSo.onchange = () => { F.formation_unknown = nonSo.checked; paintModulo(); };
  const ul = card.querySelector("#posti");
  if (!F.formation_unknown) {
    righe.forEach((r, n) => ul.appendChild(rigaPosto(r, n)));
    if (!righe.length) ul.appendChild(el(`<li class="empty">${progetto ? "Nel disegno non ci sono postazioni per musicisti: aggiungile a mano qui sotto." : "Ancora nessuno strumento."}</li>`));
  } else {
    ul.appendChild(el(`<li class="empty">Ci pensiamo noi: descrivi l'evento qui sotto (che musica, quanta gente, che spazio) e ti proponiamo la formazione.</li>`));
    card.querySelector("#add").hidden = true;
  }
  card.querySelector("#add").onclick = () => {
    righe.push({ item_id: "", label: "", instrument_code: instr[0] ? instr[0].code : null, instrument_name: instr[0] ? instr[0].name : "", qty: 1, covered: false, manuale: true });
    paintModulo();
  };
  app.appendChild(card);
  if (!progetto) app.appendChild(bloccoPalco());
  if (ignorate.length) app.appendChild(el(`<p class="small muted">Non contati come musicisti: ${esc(ignorate.join(", "))}.</p>`));

  /* l'evento */
  const ev = el(`<section class="card"><h3>L'evento</h3><div class="grid2 tight" id="g1"></div></section>`);
  const g1 = ev.querySelector("#g1");
  g1.appendChild(campo("event_title", "Che evento è", { hint: "es. «Concerto di Natale», «Matrimonio Bianchi»" }));
  g1.appendChild(campo("event_kind", "Tipologia", { opts: Object.entries(EVENT_KINDS) }));
  g1.appendChild(campo("event_when", "Quando", { hint: "anche approssimativo: «fine ottobre», «14/12 da confermare»" }));
  g1.appendChild(campo("event_place", "Dove", { hint: "città o luogo, anche provvisorio" }));
  ev.appendChild(campo("schedule", "Orari e impegno", { type: "textarea", hint: "prove, soundcheck, durata: quello che sai adesso" }));
  ev.appendChild(campo("repertoire", "Repertorio e caratteristiche", { type: "textarea", hint: "cosa si suona, che stile, se servono lettura o esperienze particolari" }));
  ev.appendChild(campo("budget", "Budget indicativo", { hint: "facoltativo: aiuta a proporti la formazione giusta" }));
  ev.appendChild(campo("notes", "Note", { type: "textarea" }));
  app.appendChild(ev);

  /* il referente */
  const rf = el(`<section class="card"><h3>Chi sei</h3><div class="grid2 tight" id="g2"></div></section>`);
  const g2 = rf.querySelector("#g2");
  g2.appendChild(campo("contact_name", "Nome e cognome"));
  g2.appendChild(campo("contact_company", "Società o ente", { hint: "facoltativo" }));
  g2.appendChild(campo("contact_email", "Email", { type: "email" }));
  g2.appendChild(campo("contact_phone", "Telefono", { type: "tel", hint: "facoltativo, ma accorcia i tempi" }));
  app.appendChild(rf);

  /* riepilogo e invio */
  const go = el(`<section class="card"><h3>Prima di mandare</h3><ul class="plain" id="riep"></ul>
    <div class="row"><button type="button" class="btn primary" id="send">Manda la richiesta</button></div>
    <p class="small muted">Ti arriva una conferma via email. Se hai materiale da allegare (scaletta, riferimenti), rispondi a quella email.</p></section>`);
  go.querySelector("#send").onclick = manda;
  app.appendChild(go);
  aggiornaConto();
}

/* Il palco resta un di più: chi ce l'ha lo allega e ci risparmia domande, chi non l'ha manda lo stesso.
   Prima questa era una schermata obbligatoria, e chi non aveva progetti salvati non poteva andare avanti. */
function bloccoPalco() {
  const c = el(`<section class="card"><h3>Hai il disegno del palco?</h3>
    <p class="small muted">Non serve per mandare la richiesta. Se ce l'hai ci dice quanti stanno sul palco, come, e con quanto spazio.</p>
    <ul class="list compact" id="miei"></ul></section>`);
  const ul = c.querySelector("#miei");
  for (const m of miei.slice(0, 5)) {
    const li = el(`<li class="list-item"><a class="grow" href="${BASE}/richiedi/?p=${esc(m.id)}"><div class="title"></div><div class="sub"></div></a></li>`);
    li.querySelector(".title").textContent = m.title;
    li.querySelector(".sub").textContent = "aggiornato il " + fmtDate(m.updated_at);
    ul.appendChild(li);
  }
  if (!miei.length) ul.remove();
  c.appendChild(el(`<p class="small"><a href="/app/">${miei.length ? "Disegnane un altro" : "Disegna il palco"} con StagePlot</a></p>`));
  return c;
}

function rigaPosto(r, n) {
  const li = el(`<li class="list-item"><div class="grow"><div class="title"></div><div class="sub"></div></div><div class="actions"></div></li>`);
  const act = li.querySelector(".actions");
  if (r.manuale) {
    const sel = el(`<select aria-label="Strumento"></select>`);
    for (const i of instr) sel.appendChild(new Option(i.name, i.code));
    sel.value = r.instrument_code || "";
    sel.onchange = () => { r.instrument_code = sel.value; r.instrument_name = (instr.find((i) => i.code === sel.value) || {}).name || ""; r.label = r.instrument_name; aggiornaConto(); };
    li.querySelector(".title").textContent = "";
    li.querySelector(".title").appendChild(sel);
    const qty = el(`<input type="number" min="1" max="60" value="${r.qty}" aria-label="Quanti" style="width:5rem">`);
    qty.oninput = () => { r.qty = Math.max(1, Math.min(60, Number(qty.value) || 1)); aggiornaConto(); };
    act.appendChild(qty);
    const rm = el(`<button type="button" class="btn small ghost">Togli</button>`);
    rm.onclick = () => { righe.splice(n, 1); paintModulo(); };
    act.appendChild(rm);
    return li;
  }
  li.querySelector(".title").textContent = r.label;
  li.querySelector(".sub").textContent = [r.instrument_name, r.qty === 1 ? "1 posto" : r.qty + " posti"].filter(Boolean).join(" · ");
  const lab = el(`<label class="check-line"><input type="checkbox"${r.covered ? " checked" : ""}> lo copro io</label>`);
  lab.querySelector("input").onchange = (e) => { r.covered = e.target.checked; li.classList.toggle("muted", r.covered); aggiornaConto(); };
  act.appendChild(lab);
  li.classList.toggle("muted", r.covered);
  return li;
}

function aggiornaConto() {
  const n = countNeeded(righe);
  const pill = app.querySelector("#conto");
  if (pill) {
    pill.textContent = F.formation_unknown ? "da definire" : n === 0 ? "nessuno" : n === 1 ? "1 musicista" : n + " musicisti";
    pill.className = "pill " + (F.formation_unknown || n ? "accent" : "warn");
  }
  const riep = app.querySelector("#riep");
  if (riep) { riep.innerHTML = ""; for (const l of summaryLines(F, righe)) { const li = document.createElement("li"); li.textContent = l; riep.appendChild(li); } }
}

async function manda() {
  const motivo = motivoNonPronta(F, righe);
  if (motivo) { toast(motivo, { err: true }); const primo = app.querySelector(".field input, .field select"); if (primo) primo.focus(); return; }
  const b = app.querySelector("#send");
  b.disabled = true; b.textContent = "Mando…";
  try {
    const snap = progetto ? snapshotOf(progetto.data, variante, righe) : {};
    const slots = (F.formation_unknown ? [] : righe).map((r) => ({ item_id: r.item_id || "", label: r.label || r.instrument_name || "", instrument_code: r.instrument_code || null, role_name: "", qty: r.qty, covered: !!r.covered, note: "" }));
    const id = await api.create(progetto ? progetto.id : null, snap, F, slots);
    /* la richiesta è salvata: da qui in poi non si perde più niente, nemmeno se l'invio non parte */
    const inviata = await api.notifyNow(id).catch(() => ({ ok: false }));
    paintFatto(inviata && inviata.ok);
  } catch (e) { b.disabled = false; b.textContent = "Manda la richiesta"; toast(errMsg(e), { err: true }); }
}

function paintFatto(subito) {
  app.innerHTML = "";
  app.appendChild(el(`<h1>Richiesta ricevuta</h1>`));
  const p = el(`<p class="lead"></p>`);
  p.textContent = "È arrivata a " + servizio.name + (progetto ? " con la copia del palco" : "") + ". Ti rispondiamo entro un giorno lavorativo con "
    + (F.formation_unknown ? "una proposta di formazione e il preventivo" : "i nomi e il preventivo") + ": disponibilità e prezzo si confermano lì, non adesso.";
  app.appendChild(p);
  const c = el(`<section class="card"><h3>Cosa succede ora</h3><ol class="steps one">
    <li><b>Guardiamo la richiesta</b>Quanti musicisti servono, che strumenti, dove e quando.</li>
    <li><b>Cerchiamo le persone</b>Chiediamo la disponibilità per le tue date: essere liberi non è ancora un impegno.</li>
    <li><b>Ti mandiamo il preventivo</b>Con i nomi e il costo. Confermi tu, e solo allora ingaggiamo.</li>
  </ol></section>`);
  app.appendChild(c);
  if (!subito) app.appendChild(el(`<p class="small muted">L'avviso a ${esc(servizio.name)} parte entro pochi minuti: la richiesta è già salvata, non serve rimandarla.</p>`));
  app.appendChild(el(`<p><a class="btn" href="${progetto ? "/app/" : BASE + "/"}">${progetto ? "Torna al palco" : "Torna a Orchestre"}</a></p>`));
  if (progetto) app.appendChild(el(`<p class="small muted">Il progetto che continui a modificare non cambia la richiesta già mandata: quello che è arrivato resta com'era.</p>`));
}

main();
