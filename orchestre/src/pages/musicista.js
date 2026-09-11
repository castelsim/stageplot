/* L'area del musicista: profilo (onboarding in otto passi con bozza), candidature con lo stato pubblico,
   inviti a cui rispondere senza token, incarichi confermati, privacy (consensi, export, cancellazione).
   Serve una sessione: chiunque abbia fatto login con Google, staff o no. */
import { BASE } from "../config.js";
import { esc, el, toast, confirm, setState, errMsg, fmtDate, fmtDateTime } from "../ui.js";
import { getSession, signOut, barraAree } from "../auth.js";
import { STEPS, PASSI_PROFILO, GENRES, PARTI, PRIVACY_VERSION, PUBLIC_STATUS, missingFields, completion, FIELD_LABEL } from "../domain/applications.js";
import { DATE_KIND, INV_STATUS, INV_PILL, PROD_STATUS } from "../domain/staffing.js";
import { FAMILY } from "../nav.js";
import * as api from "../api/applications.js";
import { catalogs } from "../api/musicians.js";
import { claimInvite, myInvite } from "../api/invites.js";
import { isInviteToken } from "../domain/invites.js";

const app = document.getElementById("app");
const q = new URLSearchParams(location.search);
let session = null, P = null, cat = null, view = q.get("v") || "home", step = Number(q.get("step")) || 0;
/* chi arriva da un invito personale: la società lo ha già scelto, quindi appena manda il profilo è dentro */
let invito = null;

async function main() {
  session = await getSession();
  if (!session) { location.replace(BASE + "/login/?next=" + encodeURIComponent(location.pathname + location.search)); return; }
  try {
    await Promise.all([api.ensureProfile(), api.linkMusicianRows().catch(() => 0)]);
    [P, cat] = await Promise.all([api.getProfile(), catalogs()]);
    if (!P) throw new Error("profilo non trovato");
    await apriInvito();
    await invitoInCorso();
    if (!P.consent_privacy_version && view === "home" && !q.get("org")) view = "profilo";
    if (view === "profilo" && !step) step = Math.max(1, Math.min(P.step || 1, STEPS.length));
    paint();
  } catch (e) { app.innerHTML = ""; const d = el(`<div class="err"></div>`); d.textContent = errMsg(e); app.appendChild(d); }
}

/* Il link personale: si prende in carico una volta sola, poi si toglie dall'indirizzo (un link che resta
   nella barra finisce nella cronologia, nei preferiti e nei messaggi copiati). Se non è valido non si dice
   perché: si continua come una candidatura normale. */
async function apriInvito() {
  const t = q.get("inv");
  if (!isInviteToken(t)) return;
  try {
    const r = await claimInvite(t);
    if (r && r.ok) {
      invito = { org_id: r.org_id, org_name: r.org_name };
      await api.apply(r.org_id).catch(() => null);   /* la bozza di candidatura per quella società */
      view = "profilo"; step = Math.max(1, Math.min(P.step || 1, STEPS.length));
    } else if (r && r.motivo === "scaduto") {
      toast("Il link è scaduto: chiedine un altro a chi te l'ha mandato.", { err: true });
    } else if (r && r.motivo === "gia usato") {
      toast("Questo link è già stato usato da un altro account.", { err: true });
    }
  } catch { /* un invito che non va non deve impedire di usare l'area */ }
  history.replaceState(null, "", location.pathname + (view === "profilo" ? "?v=profilo" : ""));
}

/* Chi è arrivato da un link e torna più tardi non ha più `?inv=` nell'indirizzo, ma l'invito è ancora suo:
   lo si richiede al database, o la promessa «appena mandi sei dentro» sparirebbe proprio quando serve. */
async function invitoInCorso() {
  if (invito) return;
  try { invito = await myInvite(); } catch { /* senza, si vede la candidatura normale */ }
}

function nav(active) {
  return `<nav class="nav-tabs" aria-label="Sezioni">
    <a href="?v=home" data-v="home"${active === "home" ? ' aria-current="page"' : ""}>La mia area</a>
    <a href="?v=profilo" data-v="profilo"${active === "profilo" ? ' aria-current="page"' : ""}>Profilo</a>
    <a href="?v=privacy" data-v="privacy"${active === "privacy" ? ' aria-current="page"' : ""}>Privacy e account</a></nav>`;
}
/* La fotografia. Una sola, sostituibile: serve a chi organizza per riconoscere chi ha davanti quando
   sceglie fra venti nomi, e a chi si presenta per non essere solo una riga di elenco. */
function bloccoFoto() {
  const wrap = el(`<div class="field"><label for="upFoto">Fotografia</label>
    <div class="row" id="fotoBox"><div id="fotoPrev"></div><div class="spacer"></div></div>
    <input type="file" id="upFoto" accept="image/jpeg,image/png,image/webp" hidden>
    <span class="hint">Facoltativa. Un ritratto normale, anche col telefono: aiuta chi ti convoca a ricordarsi di te.</span></div>`);
  const box = wrap.querySelector("#fotoBox");
  const prev = wrap.querySelector("#fotoPrev");
  const input = wrap.querySelector("#upFoto");
  const disegna = async () => {
    prev.innerHTML = "";
    if (P.photo_path) {
      try {
        const url = await api.signedUrl(P.photo_path);
        const img = el(`<img alt="La tua fotografia" class="foto-prev">`);
        img.src = url;
        prev.appendChild(img);
      } catch { prev.appendChild(el(`<span class="small muted">Foto caricata.</span>`)); }
    } else prev.appendChild(el(`<span class="small muted">Nessuna foto.</span>`));
  };
  const b = el(`<button type="button" class="btn small"></button>`);
  b.textContent = P.photo_path ? "Cambia" : "Carica una foto";
  b.onclick = () => input.click();
  box.appendChild(b);
  const rm = el(`<button type="button" class="btn small ghost">Togli</button>`);
  rm.hidden = !P.photo_path;
  rm.onclick = async () => {
    try { await api.removePhoto(P); P.photo_path = ""; rm.hidden = true; b.textContent = "Carica una foto"; disegna(); toast("Foto tolta."); }
    catch (e) { toast(errMsg(e), { err: true }); }
  };
  box.appendChild(rm);
  input.onchange = async () => {
    const f = input.files && input.files[0];
    if (!f) return;
    if (f.size > 5 * 1024 * 1024) return toast("La foto è troppo grande: sotto i 5 MB.", { err: true });
    b.disabled = true; b.textContent = "Carico…";
    try {
      P.photo_path = await api.setPhoto(P, f);
      b.textContent = "Cambia"; rm.hidden = false; await disegna(); toast("Foto salvata.");
    } catch (e) { b.textContent = P.photo_path ? "Cambia" : "Carica una foto"; toast(errMsg(e), { err: true }); }
    b.disabled = false; input.value = "";
  };
  disegna();
  return wrap;
}

function go(v, s) { view = v; step = s || 0; history.replaceState(null, "", "?v=" + v + (s ? "&step=" + s : "")); paint(); }

function paint() {
  /* la barra la disegna `barraAree` — e async, e attacca lei il pulsante «Esci»: cercarlo qui subito
     dopo lo trovava ancora inesistente, e la pagina moriva prima di disegnare il resto */
  barraAree("musicista");
  app.className = "o-wrap narrow";
  app.innerHTML = nav(view);
  app.querySelectorAll(".nav-tabs a").forEach((a) => { a.onclick = (e) => { e.preventDefault(); go(a.dataset.v); }; });
  /* un ?v= storto (link vecchio, refuso, copia-incolla) non deve rompere la pagina: si torna a casa */
  const viste = { home: paintHome, profilo: paintProfilo, privacy: paintPrivacy };
  (viste[view] || viste.home)();
}

/* ---------------------------------------------------------------- home */
async function paintHome() {
  const pct = completion(P, P.instruments, P.files);
  const miss = missingFields(P, P.instruments);
  app.appendChild(el(`<h1>Ciao ${esc(P.first_name || "")}</h1>`));
  const prof = el(`<section class="card"><div class="row"><h3>Il tuo profilo</h3><span class="spacer"></span><span class="pill ${pct === 100 ? "ok" : pct >= 70 ? "accent" : "warn"}">${pct}% completo</span></div>
    <div class="bar"><div class="bar-fill"></div></div><p class="small muted" id="missTxt"></p><a class="btn ${miss.length ? "primary" : ""}" id="goProf">${miss.length ? "Completa il profilo" : "Aggiorna il profilo"}</a></section>`);
  prof.querySelector(".bar-fill").style.width = pct + "%";
  prof.querySelector("#missTxt").textContent = miss.length ? "Mancano: " + miss.map((k) => FIELD_LABEL[k] || k).join(", ") + "." : "Tutto quello che serve per candidarti c'è.";
  prof.querySelector("#goProf").onclick = () => go("profilo", miss.length ? 1 : STEPS.length - 1);
  app.appendChild(prof);

  const apps = el(`<section class="card"><h3>Candidature</h3><div class="loading">Un attimo…</div></section>`);
  app.appendChild(apps);
  const invs = el(`<section class="card"><h3>Convocazioni</h3><div class="loading">Un attimo…</div></section>`);
  app.appendChild(invs);
  const eng = el(`<section class="card"><h3>Incarichi confermati</h3><div class="loading">Un attimo…</div></section>`);
  app.appendChild(eng);
  try {
    const [mine, open, myInv, myEng] = await Promise.all([api.myApplications(), api.openOrganizations(), api.myInvitations(), api.myEngagements()]);
    /* candidature */
    const box = apps.querySelector(".loading"); box.className = "";
    box.innerHTML = "";
    if (mine.length) {
      const ul = el(`<ul class="list compact"></ul>`);
      for (const a of mine) {
        const li = el(`<li class="list-item"><div class="grow"><div class="title"></div><div class="sub"></div></div><div class="actions"><span class="pill ${a.public_status === "accepted" ? "ok" : a.public_status === "rejected" ? "danger" : a.public_status === "draft" ? "" : "accent"}">${esc(PUBLIC_STATUS[a.public_status] || a.public_status)}</span></div></li>`);
        li.querySelector(".title").textContent = a.org_name;
        li.querySelector(".sub").textContent = [a.submitted_at ? "inviata il " + fmtDate(a.submitted_at) : "bozza", a.note_to_candidate ? "«" + a.note_to_candidate + "»" : ""].filter(Boolean).join(" · ");
        if (a.public_status === "draft") { const b = el(`<button type="button" class="btn small primary">Invia</button>`); b.onclick = () => go("profilo", STEPS.length); li.querySelector(".actions").appendChild(b); }
        ul.appendChild(li);
      }
      box.appendChild(ul);
    }
    const openNotApplied = open.filter((o) => !mine.some((a) => a.org_id === o.id));
    const wanted = q.get("org");
    if (openNotApplied.length) {
      const p = el(`<p class="small muted">Organizzazioni che accettano candidature:</p>`); box.appendChild(p);
      const ul = el(`<ul class="list compact"></ul>`);
      for (const o of openNotApplied) {
        const li = el(`<li class="list-item${o.slug === wanted ? " hi" : ""}"><div class="grow"><div class="title"></div><div class="sub"></div></div><div class="actions"><button type="button" class="btn small primary">Candidati</button></div></li>`);
        li.querySelector(".title").textContent = o.name; li.querySelector(".sub").textContent = o.application_intro || "";
        li.querySelector("button").onclick = async () => {
          try { await api.apply(o.id); toast("Bozza creata: completa il profilo e invia."); go("profilo", miss.length ? 1 : STEPS.length); } catch (e) { toast(errMsg(e), { err: true }); }
        };
        ul.appendChild(li);
      }
      box.appendChild(ul);
    }
    if (!mine.length && !openNotApplied.length) box.appendChild(el(`<p class="small muted">Nessuna candidatura. Al momento nessuna organizzazione ha le candidature aperte.</p>`));
    /* convocazioni */
    const ib = invs.querySelector(".loading"); ib.className = ""; ib.innerHTML = "";
    const openInv = myInv.filter((i) => !["confirmed", "reserve", "revoked", "replaced", "no_reply", "expired", "cancelled"].includes(i.status));
    if (!myInv.length) ib.appendChild(el(`<p class="small muted">Nessuna convocazione. Quando un'organizzazione ti proporrà un posto, lo vedrai qui e via email.</p>`));
    for (const i of myInv.slice(0, 20)) ib.appendChild(invitationCard(i, openInv.includes(i)));
    /* incarichi */
    const eb = eng.querySelector(".loading"); eb.className = ""; eb.innerHTML = "";
    if (!myEng.length) eb.appendChild(el(`<p class="small muted">Nessun incarico confermato.</p>`));
    else { const ul = el(`<ul class="list compact"></ul>`); for (const e of myEng) { const li = el(`<li class="list-item"><div class="grow"><div class="title"></div><div class="sub"></div></div><div class="actions"><span class="pill ${e.status === "done" ? "" : "ok"}">${esc(PROD_STATUS[e.status] || e.status)}</span></div></li>`); li.querySelector(".title").textContent = e.title + " · " + e.role_name; li.querySelector(".sub").textContent = [e.org_name, e.first_date ? fmtDate(e.first_date) + (e.last_date && fmtDate(e.last_date) !== fmtDate(e.first_date) ? " → " + fmtDate(e.last_date) : "") : "", e.venue].filter(Boolean).join(" · "); ul.appendChild(li); } eb.appendChild(ul); }
  } catch (e) { for (const s of [apps, invs, eng]) { const l = s.querySelector(".loading"); if (l) setState(l, "err", errMsg(e)); } }
}

function invitationCard(i, canAnswer) {
  const c = el(`<div class="inv-card"><div class="row"><b></b><span class="spacer"></span><span class="pill ${INV_PILL[i.status] || ""}">${esc(INV_STATUS[i.status] || i.status)}</span></div><p class="small muted meta"></p><ul class="plain small dl"></ul><div class="ans"></div></div>`);
  c.querySelector("b").textContent = i.title + " · " + i.role_name;
  c.querySelector(".meta").textContent = [i.org_name, i.conductor ? "dir. " + i.conductor : "", i.venue, i.fee_note ? "compenso: " + i.fee_note : "", i.deadline && canAnswer ? "rispondi entro " + fmtDateTime(i.deadline) : ""].filter(Boolean).join(" · ");
  for (const d of i.dates) { const li = document.createElement("li"); li.textContent = (DATE_KIND[d.kind] || d.kind) + " · " + fmtDateTime(d.starts_at) + (d.venue ? " · " + d.venue : "") + (typeof d.available === "boolean" ? (d.available ? " ✓" : " ✗") : ""); c.querySelector(".dl").appendChild(li); }
  if (i.note_admin) c.querySelector(".meta").textContent += " · " + i.note_admin;
  if (!canAnswer) return c;
  const ans = c.querySelector(".ans");
  const partial = {}; for (const d of i.dates) if (typeof d.available === "boolean") partial[d.id] = d.available;
  let answer = i.status === "available" ? "yes" : i.status === "unavailable" ? "no" : i.status === "partial" ? "partial" : null;
  ans.innerHTML = `<div class="row"><button type="button" class="btn small" data-a="yes">Ci sono</button><button type="button" class="btn small" data-a="partial">Solo alcune date</button><button type="button" class="btn small" data-a="no">Non posso</button></div><div class="dates" hidden></div><div class="field"><input class="note" placeholder="una nota, se serve" maxlength="1000"></div><button type="button" class="btn primary small send" disabled>Invia la risposta</button>`;
  ans.querySelector(".note").value = i.note_musician || "";
  const datesBox = ans.querySelector(".dates");
  for (const d of i.dates) {
    const row = el(`<div class="date-row"><span class="grow small"></span><div class="seg"><button type="button" class="btn small" data-v="1">Ci sono</button><button type="button" class="btn small" data-v="0">No</button></div></div>`);
    row.querySelector(".grow").textContent = (DATE_KIND[d.kind] || d.kind) + " · " + fmtDateTime(d.starts_at);
    const [b1, b0] = row.querySelectorAll("button");
    const refresh = () => { b1.classList.toggle("primary", partial[d.id] === true); b0.classList.toggle("danger", partial[d.id] === false); };
    b1.onclick = () => { partial[d.id] = true; refresh(); update(); }; b0.onclick = () => { partial[d.id] = false; refresh(); update(); };
    refresh(); datesBox.appendChild(row);
  }
  const btns = [...ans.querySelectorAll("[data-a]")];
  const update = () => { for (const b of btns) { b.classList.toggle("primary", b.dataset.a === answer && answer !== "no"); b.classList.toggle("danger", b.dataset.a === "no" && answer === "no"); } datesBox.hidden = answer !== "partial"; ans.querySelector(".send").disabled = !(answer === "yes" || answer === "no" || (answer === "partial" && i.dates.every((d) => typeof partial[d.id] === "boolean"))); };
  for (const b of btns) b.onclick = () => { answer = b.dataset.a; update(); };
  update();
  ans.querySelector(".send").onclick = async () => {
    const dates = answer === "partial" ? i.dates.map((d) => ({ id: d.id, available: !!partial[d.id] })) : [];
    try { const r = await api.respondMine(i.id, answer, dates, ans.querySelector(".note").value.trim()); if (r?.error) throw new Error(r.error === "expired" ? "La scadenza è passata." : r.error === "locked" ? "Già confermato: per cambiare scrivi a chi ti ha invitato." : "Non sono riuscito a registrare la risposta."); toast("Risposta registrata."); paint(); }
    catch (e) { toast(errMsg(e), { err: true }); }
  };
  return c;
}

/* ---------------------------------------------------------------- profilo: onboarding in otto passi */
function field(id, label, value, { type = "text", hint = "", opts = null, rows = 3, autocomplete = "" } = {}) {
  const f = el(`<div class="field"><label for="${id}">${esc(label)}</label></div>`);
  let inp;
  if (opts) { inp = el(`<select id="${id}">${opts.map(([v, l]) => `<option value="${esc(v)}">${esc(l)}</option>`).join("")}</select>`); inp.value = value ?? ""; }
  else if (type === "textarea") { inp = el(`<textarea id="${id}" rows="${rows}"></textarea>`); inp.value = value ?? ""; }
  else { inp = el(`<input id="${id}" type="${type}" autocomplete="${esc(autocomplete || "off")}">`); inp.value = value ?? ""; }
  f.appendChild(inp); if (hint) f.appendChild(el(`<span class="hint">${esc(hint)}</span>`)); return f;
}
const check = (id, label, value) => { const l = el(`<label class="check-line"><input type="checkbox" id="${id}"> <span>${esc(label)}</span></label>`); l.querySelector("input").checked = !!value; return l; };
const lvl = (id, label, value) => field(id, label, String(value ?? 0), { opts: [["0", "No"], ["1", "Base"], ["2", "Buona"], ["3", "Ottima"]] });
const val = (id) => { const n = app.querySelector("#" + id); return n.type === "checkbox" ? n.checked : n.value; };

function paintProfilo() {
  const [key, title] = STEPS[step - 1];
  const pct = completion(P, P.instruments, P.files);
  /* tre elementi, tre append: el() ne rende uno solo */
  if (step > 1) app.appendChild(el(`<div class="steps-bar"><span class="small muted">Il tuo profilo · passo ${step - 1} di ${PASSI_PROFILO}</span><span class="spacer"></span><span class="pill ${pct === 100 ? "ok" : ""}">${pct}%</span></div>`));
  if (step > 1) { const bar = el(`<div class="bar"><div class="bar-fill"></div></div>`); bar.firstElementChild.style.width = Math.round(((step - 1) / PASSI_PROFILO) * 100) + "%"; app.appendChild(bar); }
  app.appendChild(el(`<h1>${esc(title)}</h1>`));
  const card = el(`<section class="card"></section>`); app.appendChild(card);
  let save = async () => {};
  if (key === "candidatura") {
    /* Tutto quello che serve per candidarsi, in una schermata sola. Il resto del profilo — foto,
       curriculum, esperienze, strumenti secondari — si aggiunge dopo, quando uno ha tempo: prima questi
       sei campi stavano sparsi su quattro passi e per mandare bisognava attraversarli tutti. */
    card.appendChild(el(`<p class="small muted">Bastano questi. Foto, curriculum ed esperienze si aggiungono dopo, con calma.</p>`));
    card.appendChild(field("first_name", "Nome", P.first_name, { autocomplete: "given-name" }));
    card.appendChild(field("last_name", "Cognome", P.last_name, { autocomplete: "family-name" }));
    card.appendChild(field("email", "Email", P.email, { type: "email", autocomplete: "email" }));
    card.appendChild(field("phone", "Telefono", P.phone, { type: "tel", autocomplete: "tel" }));
    card.appendChild(field("city", "Città", P.city, { autocomplete: "address-level2" }));
    card.appendChild(field("province", "Provincia", P.province, { hint: "sigla, es. VI", autocomplete: "address-level1" }));

    /* lo strumento principale: uno, quello che suoni. Gli altri si aggiungono dal passo «Strumenti». */
    const primario = P.instruments.find((x) => x.is_primary);
    const selStr = el(`<div class="field"><label for="strPrinc">Strumento principale</label><select id="strPrinc">${Object.entries(FAMILY).map(([f, fl]) => `<optgroup label="${esc(fl)}">${cat.instruments.filter((i) => i.family === f).map((i) => `<option value="${esc(i.code)}">${esc(i.name)}</option>`).join("")}</optgroup>`).join("")}</select><span class="hint">Se ne suoni altri li aggiungi dopo.</span></div>`);
    if (primario) selStr.querySelector("select").value = primario.instrument_code;
    card.appendChild(selStr);
    card.appendChild(field("livello", "Come te la cavi", String(primario && primario.level ? primario.level : 3),
      { opts: [["1", "Ci sto lavorando"], ["2", "Me la cavo"], ["3", "Bene"], ["4", "Molto bene"], ["5", "È il mio mestiere"]] }));
    card.appendChild(lvl("reading_sight", "Lettura a prima vista", P.reading_sight));

    /* il consenso: senza, la candidatura non si può mandare — ed è giusto che si legga qui, non alla fine */
    const consent = el(`<div class="stack"></div>`);
    if (P.consent_privacy_version) {
      consent.appendChild(el(`<p class="small muted">Consenso dato il ${esc(fmtDate(P.consent_privacy_at))} (versione ${esc(P.consent_privacy_version)}).</p>`));
    } else {
      consent.appendChild(el(`<p class="small">Per candidarti serve il consenso al trattamento dei dati (<a href="${BASE}/privacy/" target="_blank" rel="noopener">informativa, versione ${esc(PRIVACY_VERSION)}</a>).</p>`));
      consent.appendChild(check("consent", "Ho letto l'informativa e acconsento al trattamento dei miei dati", false));
    }
    consent.appendChild(check("consent_requests", "Voglio ricevere proposte di lavoro", P.consent_requests));
    card.appendChild(consent);

    save = async () => {
      const f = {};
      for (const k of ["first_name", "last_name", "email", "phone", "city", "province"]) f[k] = val(k).trim();
      f.reading_sight = Number(val("reading_sight"));
      await api.saveProfile(P.id, f); Object.assign(P, f);
      const code = val("strPrinc");
      const liv = Number(val("livello")) || null;
      const altri = P.instruments.filter((x) => x.instrument_code !== code).map((x) => ({ ...x, is_primary: false }));
      P.instruments = [{ instrument_code: code, is_primary: true, level: liv, doubling: false }, ...altri];
      await api.setInstruments(P.id, P.instruments.map((x) => ({ code: x.instrument_code, primary: x.is_primary, level: x.level, doubling: x.doubling })));
    };
    card.appendChild(bloccoInvio(save));
  } else if (key === "strumenti") {
    card.appendChild(el(`<p class="small muted">Il primo è lo strumento principale. Aggiungi doubling e strumenti secondari.</p>`));
    const ul = el(`<ul class="list compact" id="insts"></ul>`); card.appendChild(ul);
    const paintInst = () => {
      ul.innerHTML = "";
      if (!P.instruments.length) ul.appendChild(el(`<li class="empty">Nessuno strumento ancora.</li>`));
      for (const it of P.instruments) {
        const i = cat.instruments.find((x) => x.code === it.instrument_code);
        const li = el(`<li class="list-item"><div class="grow"><div class="title"></div><div class="sub"></div></div><div class="actions"></div></li>`);
        li.querySelector(".title").textContent = (i ? i.name : it.instrument_code) + (it.is_primary ? " · principale" : "");
        li.querySelector(".sub").textContent = (it.level ? "livello " + it.level + "/5" : "") + (it.doubling ? " · doubling" : "");
        const rm = el(`<button type="button" class="btn small ghost">Togli</button>`); rm.onclick = () => { P.instruments = P.instruments.filter((x) => x !== it); if (P.instruments.length && !P.instruments.some((x) => x.is_primary)) P.instruments[0].is_primary = true; paintInst(); };
        li.querySelector(".actions").appendChild(rm); ul.appendChild(li);
      }
    };
    paintInst();
    const add = el(`<div class="form-row"><div class="field"><label for="addInst">Strumento</label><select id="addInst">${Object.entries(FAMILY).map(([f, fl]) => `<optgroup label="${esc(fl)}">${cat.instruments.filter((x) => x.family === f).map((x) => `<option value="${x.code}">${esc(x.name)}</option>`).join("")}</optgroup>`).join("")}</select></div>
      <div class="field"><label for="addLvl">Livello</label><select id="addLvl"><option value="">—</option>${[1, 2, 3, 4, 5].map((n) => `<option>${n}</option>`).join("")}</select></div><button type="button" class="btn" id="addBtn">Aggiungi</button></div>`);
    add.querySelector("#addBtn").onclick = () => { const code = add.querySelector("#addInst").value; if (P.instruments.some((x) => x.instrument_code === code)) return toast("Già presente.", { err: true }); P.instruments.push({ instrument_code: code, level: Number(add.querySelector("#addLvl").value) || null, is_primary: P.instruments.length === 0, doubling: P.instruments.length > 0 }); paintInst(); };
    card.appendChild(add);
    save = async () => { await api.setInstruments(P.id, P.instruments.map((x) => ({ code: x.instrument_code, primary: x.is_primary, level: x.level, doubling: x.doubling }))); };
  } else if (key === "competenze") {
    card.appendChild(lvl("reading_sight", "Lettura a prima vista", P.reading_sight)); card.appendChild(lvl("reading_score", "Lettura della partitura", P.reading_score)); card.appendChild(lvl("improvisation", "Improvvisazione", P.improvisation));
    const g = el(`<div class="stack"></div>`); g.appendChild(check("with_conductor", "Lavoro con direttore", P.with_conductor)); g.appendChild(check("click", "Suono a click", P.click)); g.appendChild(check("sequences", "Suono con sequenze", P.sequences)); g.appendChild(check("in_ear", "Uso in-ear monitor", P.in_ear)); card.appendChild(g);
    /* la parte: chi cerca una spalla o un solista la guarda per prima */
    const pt = el(`<div class="field"><label>Che parte fai</label><div class="row" id="parti"></div><span class="hint">Anche più di una.</span></div>`);
    for (const [k, v] of PARTI) pt.querySelector("#parti").appendChild(check("part_" + k, v, (P.parts || []).includes(k)));
    card.appendChild(pt);
    save = async () => { const f = { reading_sight: Number(val("reading_sight")), reading_score: Number(val("reading_score")), improvisation: Number(val("improvisation")), with_conductor: val("with_conductor"), click: val("click"), sequences: val("sequences"), in_ear: val("in_ear"), parts: PARTI.map(([k]) => k).filter((k) => val("part_" + k)) }; await api.saveProfile(P.id, f); Object.assign(P, f); };
  } else if (key === "esperienze") {
    card.appendChild(field("education", "Formazione", P.education, { type: "textarea", rows: 2, hint: "conservatorio, diplomi, maestri" }));
    card.appendChild(field("years_experience", "Anni di esperienza", P.years_experience ?? "", { type: "number" }));
    const g = el(`<div class="stack"></div>`); g.appendChild(check("exp_orchestral", "Esperienza orchestrale", P.exp_orchestral)); g.appendChild(check("exp_pop", "Esperienza pop", P.exp_pop)); g.appendChild(check("exp_live", "Esperienza live", P.exp_live)); g.appendChild(check("exp_studio", "Esperienza in studio", P.exp_studio)); g.appendChild(check("exp_theatre", "Esperienza teatrale e musical", P.exp_theatre)); card.appendChild(g);
    const gen = el(`<div class="field"><label>Generi</label><div class="row" id="genres"></div></div>`);
    for (const x of GENRES) { const l = el(`<label class="check-line"><input type="checkbox" value="${esc(x)}"> <span>${esc(x)}</span></label>`); l.querySelector("input").checked = (P.genres || []).includes(x); gen.querySelector("#genres").appendChild(l); }
    card.appendChild(gen);
    card.appendChild(field("rep", "Compositori e repertori che conosci", (P.repertoire || []).map((r) => r.name).join(", "), { type: "textarea", rows: 2, hint: "separati da virgola, es. Morricone, Rota, Pooh in sinfonia" }));
    save = async () => {
      const f = { education: val("education").trim(), years_experience: val("years_experience"), exp_orchestral: val("exp_orchestral"), exp_pop: val("exp_pop"), exp_live: val("exp_live"), exp_studio: val("exp_studio"), exp_theatre: val("exp_theatre"), genres: [...card.querySelectorAll("#genres input:checked")].map((i) => i.value) };
      await api.saveProfile(P.id, f); Object.assign(P, f, { years_experience: f.years_experience === "" ? null : Number(f.years_experience) });
      const rep = val("rep").split(",").map((x) => x.trim()).filter(Boolean).map((name) => ({ kind: "composer", name }));
      await api.setRepertoire(P.id, rep); P.repertoire = rep;
    };
  } else if (key === "geografia") {
    card.appendChild(field("area", "Area geografica", P.area, { hint: "es. Veneto, Nord-Est" }));
    card.appendChild(field("max_distance_km", "Distanza massima indicativa (km)", P.max_distance_km ?? "", { type: "number" }));
    const g = el(`<div class="stack"></div>`); g.appendChild(check("has_car", "Ho l'auto", P.has_car)); g.appendChild(check("travel_ok", "Disponibile a trasferte", P.travel_ok)); g.appendChild(check("tour_ok", "Disponibile a tournée", P.tour_ok)); card.appendChild(g);
    card.appendChild(field("rehearsal_availability", "Disponibilità per le prove", P.rehearsal_availability, { type: "textarea", rows: 2, hint: "es. sere infrasettimanali e weekend" }));
    save = async () => { const f = { area: val("area").trim(), max_distance_km: val("max_distance_km"), has_car: val("has_car"), travel_ok: val("travel_ok"), tour_ok: val("tour_ok"), rehearsal_availability: val("rehearsal_availability").trim() }; await api.saveProfile(P.id, f); Object.assign(P, f, { max_distance_km: f.max_distance_km === "" ? null : Number(f.max_distance_km) }); };
  } else if (key === "materiali") {
    card.appendChild(bloccoFoto());
    card.appendChild(field("website", "Sito o pagina", P.website, { type: "url" })); card.appendChild(field("audio_url", "Link audio", P.audio_url, { type: "url" })); card.appendChild(field("video_url", "Link video", P.video_url, { type: "url" }));
    const fl = el(`<div class="field"><label>Curriculum (PDF) e audio (mp3, m4a, wav), fino a 10 MB</label><ul class="list compact" id="files"></ul><div class="row"><input type="file" id="upCv" accept="application/pdf" hidden><button type="button" class="btn small" id="btnCv">Carica CV</button><input type="file" id="upAu" accept="audio/*" hidden><button type="button" class="btn small" id="btnAu">Carica audio</button></div></div>`);
    const paintFiles = () => { const ul = fl.querySelector("#files"); ul.innerHTML = ""; if (!P.files.length) ul.appendChild(el(`<li class="empty">Nessun file.</li>`)); for (const f of P.files) { const li = el(`<li class="list-item"><div class="grow"><div class="title"></div><div class="sub"></div></div><div class="actions"></div></li>`); li.querySelector(".title").textContent = f.name; li.querySelector(".sub").textContent = (f.kind === "cv" ? "CV" : f.kind) + " · " + Math.round(f.size / 1024) + " KB"; const rm = el(`<button type="button" class="btn small ghost">Togli</button>`); rm.onclick = async () => { try { await api.deleteFile(f); P.files = P.files.filter((x) => x !== f); paintFiles(); } catch (e) { toast(errMsg(e), { err: true }); } }; li.querySelector(".actions").appendChild(rm); ul.appendChild(li); } };
    paintFiles();
    const upload = async (kind, file) => { if (!file) return; if (file.size > 10 * 1024 * 1024) return toast("Il file supera i 10 MB.", { err: true }); try { const f = await api.uploadFile(P, kind, file); P.files.push(f); paintFiles(); toast("Caricato."); } catch (e) { toast(errMsg(e), { err: true }); } };
    fl.querySelector("#btnCv").onclick = () => fl.querySelector("#upCv").click(); fl.querySelector("#upCv").onchange = (e) => upload("cv", e.target.files[0]);
    fl.querySelector("#btnAu").onclick = () => fl.querySelector("#upAu").click(); fl.querySelector("#upAu").onchange = (e) => upload("audio", e.target.files[0]);
    card.appendChild(fl);
    save = async () => { const f = { website: val("website").trim(), audio_url: val("audio_url").trim(), video_url: val("video_url").trim() }; await api.saveProfile(P.id, f); Object.assign(P, f); };
  } else if (key === "revisione") {
    const miss = missingFields(P, P.instruments);
    if (miss.length) card.appendChild(el(`<div class="banner">Mancano: ${esc(miss.map((k) => FIELD_LABEL[k] || k).join(", "))}.</div>`));
    else card.appendChild(el(`<div class="banner ok">Il profilo ha tutto quello che serve per candidarti.</div>`));
    const rows = [["Nome", P.first_name + " " + P.last_name], ["Contatti", [P.email, P.phone].filter(Boolean).join(" · ")], ["Città", [P.city, P.province].filter(Boolean).join(" ")],
      ["Strumenti", P.instruments.map((i) => (cat.instruments.find((x) => x.code === i.instrument_code)?.name || i.instrument_code) + (i.is_primary ? " (principale)" : "")).join(", ")],
      ["Lettura", `prima vista ${P.reading_sight}/3 · partitura ${P.reading_score}/3`], ["Parte", PARTI.filter(([k]) => (P.parts || []).includes(k)).map(([, v]) => v.toLowerCase()).join(", ") || "—"], ["Esperienze", ["orchestrale", "pop", "live", "studio", "teatro"].filter((_k, i) => [P.exp_orchestral, P.exp_pop, P.exp_live, P.exp_studio, P.exp_theatre][i]).join(", ") || "—"],
      ["Repertorio", (P.repertoire || []).map((r) => r.name).join(", ") || "—"], ["Trasferte", [P.travel_ok ? "trasferte sì" : "trasferte no", P.tour_ok ? "tournée sì" : "tournée no", P.has_car ? "auto" : ""].filter(Boolean).join(" · ")], ["Materiali", P.files.map((f) => f.name).concat([P.audio_url, P.video_url, P.website].filter(Boolean)).join(", ") || "—"]];
    const dl = el(`<dl class="review"></dl>`); for (const [k, v] of rows) { const dt = document.createElement("dt"); dt.textContent = k; const dd = document.createElement("dd"); dd.textContent = v; dl.appendChild(dt); dl.appendChild(dd); } card.appendChild(dl);

  }
  const nav2 = el(`<div class="row wizard-nav"><button type="button" class="btn" id="prev"${step === 1 ? " disabled" : ""}>Indietro</button><span class="spacer"></span><span class="small muted" id="saveState"></span><button type="button" class="btn${step === 1 ? "" : " primary"}" id="next">${step === 1 ? "Completa il profilo" : step === STEPS.length ? "Torna alla mia area" : "Salva e avanti"}</button></div>`);
  app.appendChild(nav2);
  const doSave = async (nextStep) => { const st = nav2.querySelector("#saveState"); st.textContent = "Salvo…"; try { await save(); await api.saveProfile(P.id, { step: Math.max(P.step || 1, nextStep) }); P.step = Math.max(P.step || 1, nextStep); st.textContent = "Salvato"; go("profilo", nextStep); } catch (e) { st.textContent = ""; toast(errMsg(e), { err: true }); } };
  nav2.querySelector("#prev").onclick = () => doSave(step - 1);
  nav2.querySelector("#next").onclick = () => step === STEPS.length ? go("home") : doSave(step + 1);
}

/* ---------------------------------------------------------------- privacy e account */
function paintPrivacy() {
  app.appendChild(el(`<h1>Privacy e account</h1>`));
  const c = el(`<section class="card"><h3>I tuoi dati</h3><p class="small">Puoi revocare il consenso alle richieste professionali o chiedere la cancellazione. Per avere una copia dei tuoi dati basta chiederla ai contatti che trovi nell'<a href="${BASE}/privacy/">informativa</a> (versione ${esc(PRIVACY_VERSION)}).</p>
    <div class="row"><button type="button" class="btn" id="req">${P.consent_requests ? "Non ricevere più richieste" : "Ricevi richieste professionali"}</button><button type="button" class="btn danger" id="del">Chiedi la cancellazione</button></div></section>`);
  c.querySelector("#req").onclick = async () => { try { if (P.consent_requests) { await api.revokeConsent(P.id, "requests"); P.consent_requests = false; } else { await api.grantConsent(P.id, "requests", PRIVACY_VERSION); P.consent_requests = true; } toast("Preferenza salvata."); paint(); } catch (e) { toast(errMsg(e), { err: true }); } };
  c.querySelector("#del").onclick = async () => { const yes = await confirm({ title: "Chiedere la cancellazione?", text: "La richiesta arriva alle organizzazioni a cui ti sei candidato; i dati verranno rimossi o resi anonimi. Fino ad allora il profilo resta com'è.", ok: "Chiedi la cancellazione", danger: true }); if (!yes) return; try { await api.requestDeletion(); P.deletion_requested_at = new Date().toISOString(); toast("Richiesta registrata."); paint(); } catch (e) { toast(errMsg(e), { err: true }); } };
  if (P.deletion_requested_at) c.appendChild(el(`<p class="banner">Cancellazione richiesta il ${esc(fmtDate(P.deletion_requested_at))}.</p>`));
  app.appendChild(c);
  const acc = el(`<section class="card"><h3>Account</h3><p class="small muted">Accedi con Google: ${esc(session.user.email)}.</p><button type="button" class="btn" id="out">Esci</button></section>`);
  acc.querySelector("#out").onclick = signOut; app.appendChild(acc);
}


/* Chiudere la candidatura: il consenso è già stato raccolto sopra, qui resta la scelta di a chi mandarla
   (di norma una sola società) e il pulsante. Prima era un passo a sé, l'ottavo: ci si arrivava dopo aver
   attraversato tutto il resto, e chi si fermava a metà non risultava candidato da nessuna parte. */
function bloccoInvio(save) {
  const box = el(`<div id="sendBox"><div class="loading">Un attimo…</div></div>`);
  (async () => {
    try {
      const [mine, open] = await Promise.all([api.myApplications(), api.openOrganizations()]);
      box.innerHTML = "";
      const drafts = mine.filter((a) => a.public_status === "draft");
      const inviate = mine.filter((a) => a.public_status !== "draft");
      const todo = open.filter((o) => !mine.some((a) => a.org_id === o.id));
      if (invito) {
        const b = el(`<div class="banner"></div>`);
        b.textContent = invito.org_name + " ti ha invitato: appena mandi sei fra i loro musicisti, senza passare da nessuna valutazione. Riceverai le proposte adatte a te; essere nell'elenco non è un impegno.";
        box.appendChild(b);
      }
      if (inviate.length) {
        const q = el(`<p class="small"></p>`);
        q.textContent = "Candidatura inviata a " + inviate.map((a) => a.org_name).join(", ") + ". Quello che cambi qui aggiorna il tuo profilo.";
        box.appendChild(q);
        const sv = el(`<button type="button" class="btn primary block">Salva le modifiche</button>`);
        sv.onclick = async () => { try { await save(); toast("Profilo aggiornato."); } catch (e) { toast(errMsg(e), { err: true }); } };
        box.appendChild(sv);
        const altre = [...drafts, ...todo];
        if (altre.length) {
          const d = el(`<details class="mt"><summary class="small">Candidati anche a un'altra organizzazione</summary></details>`);
          for (const o of drafts) { const b = el(`<button type="button" class="btn block">Manda a ${esc(o.org_name)}</button>`); b.onclick = () => manda(o.id, null, save); d.appendChild(b); }
          for (const o of todo) { const b = el(`<button type="button" class="btn block">Manda a ${esc(o.name)}</button>`); b.onclick = () => manda(null, o.id, save); d.appendChild(b); }
          box.appendChild(d);
        }
        return;
      }
      if (!drafts.length && !todo.length) { box.appendChild(el(`<p class="small muted">Al momento nessuna organizzazione raccoglie candidature.</p>`)); return; }
      box.appendChild(field("msg", "Due righe su di te", "", { type: "textarea", rows: 2, hint: "facoltativo" }));
      const mete = [...drafts.map((d) => ({ app: d.id, org: null, nome: d.org_name })), ...todo.map((o) => ({ app: null, org: o.id, nome: o.name }))];
      if (mete.length === 1) {
        const b = el(`<button type="button" class="btn primary block">Manda la candidatura a ${esc(mete[0].nome)}</button>`);
        b.onclick = () => manda(mete[0].app, mete[0].org, save);
        box.appendChild(b);
      } else {
        /* più d'una destinazione è l'eccezione: una tendina, non una colonna di bottoni identici */
        box.appendChild(field("dove", "A chi la mandi", "0", { opts: mete.map((m, n) => [String(n), m.nome]) }));
        const b = el(`<button type="button" class="btn primary block">Manda la candidatura</button>`);
        b.onclick = () => { const m = mete[Number(val("dove")) || 0]; manda(m.app, m.org, save); };
        box.appendChild(b);
      }
    } catch (e) { box.innerHTML = ""; setState(box, "err", errMsg(e)); }
  })();
  return box;
}

/* Salva quello che ha scritto, dà il consenso, e manda. Un pulsante solo: se qualcosa manca lo dice,
   invece di lasciare la candidatura in bozza senza che nessuno se ne accorga. */
async function manda(appId, orgId, save) {
  try {
    await save();
  } catch (e) { return toast(errMsg(e), { err: true }); }
  const miss = missingFields(P, P.instruments).filter((k) => k !== "consent");
  if (miss.length) return toast("Manca ancora: " + miss.map((k) => FIELD_LABEL[k]).join(", ") + ".", { err: true });
  try {
    if (!P.consent_privacy_version) {
      if (!val("consent")) return toast("Serve il consenso al trattamento dei dati.", { err: true });
      await api.grantConsent(P.id, "privacy", PRIVACY_VERSION);
      P.consent_privacy_version = PRIVACY_VERSION; P.consent_privacy_at = new Date().toISOString();
    }
    if (val("consent_requests") !== P.consent_requests) {
      if (val("consent_requests")) await api.grantConsent(P.id, "requests", PRIVACY_VERSION); else await api.revokeConsent(P.id, "requests");
      P.consent_requests = val("consent_requests");
    }
    let id = appId; if (!id) id = (await api.apply(orgId)).id;
    await api.submit(id, (app.querySelector("#msg") ? val("msg") : "").trim());
    toast("Candidatura inviata.");
    go("home");
  } catch (e) { toast(errMsg(e), { err: true }); }
}

main();
