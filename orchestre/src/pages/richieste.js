/* Le richieste che arrivano dai clienti di StagePlot: chi ha disegnato un palco e vuole i musicisti.
   Quello che è arrivato non si modifica (lo impedisce il database): qui si legge, si prende in carico e
   si chiude. Quando il cliente accetta, un tasto crea l'evento con i posti da coprire. */
import { BASE } from "../config.js";
import { esc, el, toast, confirm, setState, errMsg, fmtDateTime } from "../ui.js";
import { requireStaff, mountTopbar } from "../auth.js";
import { tabs } from "../nav.js";
import { EVENT_KINDS, quantiLabel } from "../domain/client-request.js";
import { calcola, euro, IVA_STANDARD } from "../domain/quote.js";
import * as quotes from "../api/quotes.js";
import * as api from "../api/client-requests.js";

const app = document.getElementById("app");
const q = new URLSearchParams(location.search);
let ctx = null, tutte = [], aperta = q.get("id") || "";

const STATO = { new: "Nuova", taken: "Presa in carico", quoted: "Preventivo inviato", won: "Accettata", lost: "Non andata", closed: "Chiusa" };
const PILL = { new: "warn", taken: "accent", quoted: "accent", won: "ok", lost: "", closed: "" };

async function main() {
  ctx = await requireStaff();
  if (!ctx) return;
  mountTopbar(ctx, { active: "richieste" });
  app.className = "o-wrap";
  app.innerHTML = tabs("richieste") + `
    <div class="row"><h1>Richieste dei clienti</h1></div>
    <p class="small muted">Arrivano dal pulsante «Richiedi musicisti» dell'editor — con la copia del palco al momento dell'invio — oppure dalla home di Orchestre, dove il palco non serve: in quel caso può esserci scritto «formazione da definire», e la proponiamo noi. Quello che è arrivato non si modifica: si lavora, non si riscrive.</p>
    <ul class="list" id="list"><li class="loading">Un attimo…</li></ul>`;
  try { tutte = await api.list(ctx.org.org_id); paint(); }
  catch (e) { const ul = app.querySelector("#list"); ul.innerHTML = ""; setState(ul, "err", errMsg(e)); }
}

function paint() {
  const ul = app.querySelector("#list");
  ul.innerHTML = "";
  if (!tutte.length) {
    ul.appendChild(el(`<li class="empty">Nessuna richiesta. Arrivano da sole quando un cliente preme «Richiedi musicisti» nell'editor.</li>`));
    return;
  }
  for (const r of tutte) {
    const li = el(`<li class="list-item"><div class="grow"><div class="title"></div><div class="sub"></div></div><div class="actions"></div></li>`);
    li.querySelector(".title").textContent = r.event_title;
    li.querySelector(".sub").textContent = [
      (EVENT_KINDS[r.event_kind] || r.event_kind),
      quantiLabel(r),
      [r.event_when, r.event_place].filter(Boolean).join(" · "),
      [r.contact_name, r.contact_company].filter(Boolean).join(" · "),
      r.production_id ? "evento creato" : "",
    ].filter(Boolean).join(" · ");
    const act = li.querySelector(".actions");
    act.appendChild(el(`<span class="pill ${PILL[r.status] || ""}">${esc(STATO[r.status] || r.status)}</span>`));
    const b = el(`<button type="button" class="btn small">${aperta === r.id ? "Chiudi" : "Apri"}</button>`);
    b.onclick = () => { aperta = aperta === r.id ? "" : r.id; history.replaceState(null, "", aperta ? "?id=" + aperta : location.pathname); paint(); };
    act.appendChild(b);
    ul.appendChild(li);
    if (aperta === r.id) ul.appendChild(dettaglio(r));
  }
}

function dettaglio(r) {
  const li = el(`<li class="list-item block"><section class="card"><div id="d" class="dett"><div class="loading">Un attimo…</div></div></section></li>`);
  const box = li.querySelector("#d");
  (async () => {
    try {
      const [slots, full] = await Promise.all([api.slotsOf(r.id), api.detail(r.id)]);
      box.innerHTML = "";
      const dl = el(`<dl class="review"></dl>`);
      const riga = (k, v) => { if (!v) return; const dt = document.createElement("dt"); dt.textContent = k; const dd = document.createElement("dd"); dd.textContent = v; dl.appendChild(dt); dl.appendChild(dd); };
      riga("Chi", [full.contact_name, full.contact_company].filter(Boolean).join(" · "));
      riga("Email", full.contact_email);
      riga("Telefono", full.contact_phone);
      riga("Evento", (EVENT_KINDS[full.event_kind] || full.event_kind) + ": " + full.event_title);
      riga("Quando", full.event_when);
      riga("Dove", full.event_place);
      riga("Orari e impegno", full.schedule);
      riga("Repertorio", full.repertoire);
      riga("Budget", full.budget);
      riga("Note", full.notes);
      riga("Arrivata", fmtDateTime(full.created_at));
      box.appendChild(dl);
      /* i posti chiesti */
      const ul = el(`<ul class="list compact"></ul>`);
      for (const s of slots) {
        const x = el(`<li class="list-item"><div class="grow"><div class="title"></div><div class="sub"></div></div><div class="actions"></div></li>`);
        x.querySelector(".title").textContent = s.label || s.instrument_code || "posto";
        x.querySelector(".sub").textContent = [s.instrument_code, s.qty === 1 ? "1 posto" : s.qty + " posti"].filter(Boolean).join(" · ");
        x.querySelector(".actions").appendChild(el(s.covered ? `<span class="pill">lo copre il cliente</span>` : `<span class="pill warn">da coprire</span>`));
        ul.appendChild(x);
      }
      box.appendChild(el(`<h3>Posti</h3>`));
      box.appendChild(ul);
      /* la copia del palco al momento dell'invio */
      const snap = full.snapshot || {};
      const p = el(`<p class="small muted"></p>`);
      p.textContent = "Palco allegato: " + [snap.titolo, snap.luogo, snap.palco ? (snap.palco.larghezza_cm / 100) + " × " + (snap.palco.profondita_cm / 100) + " m" : "", snap.elementi ? snap.elementi + " elementi" : ""].filter(Boolean).join(" · ") + ". Questa copia non cambia più, anche se il cliente continua a disegnare.";
      box.appendChild(p);
      if (full.project_id) box.appendChild(el(`<p><a class="btn small" href="/app/?p=${esc(full.project_id)}" target="_blank" rel="noopener">Apri il progetto vivo</a></p>`));
      /* il preventivo */
      box.appendChild(await bloccoPreventivo(r, slots));
      /* l'evento */
      box.appendChild(bloccoEvento(r, slots));
      /* la lavorazione */
      const act = el(`<div class="row" id="az"></div>`);
      for (const [st, label] of [["taken", "Prendi in carico"], ["quoted", "Preventivo inviato"], ["won", "Accettata"], ["lost", "Non andata"], ["closed", "Chiudi"]]) {
        if (st === r.status) continue;
        const b = el(`<button type="button" class="btn small${st === "taken" && r.status === "new" ? " primary" : " ghost"}">${label}</button>`);
        b.onclick = async () => {
          try { await api.setStatus(r.id, st); toast("Segnata: " + (STATO[st] || st).toLowerCase() + "."); tutte = await api.list(ctx.org.org_id); paint(); }
          catch (e) { toast(errMsg(e), { err: true }); }
        };
        act.appendChild(b);
      }
      box.appendChild(act);
      box.appendChild(el(`<p class="small muted">Rispondi al cliente dalla tua email: <a href="mailto:${esc(full.contact_email)}?subject=${encodeURIComponent("Re: " + full.event_title)}">${esc(full.contact_email)}</a>. Gli abbiamo scritto che sentirà entro un giorno lavorativo.</p>`));
    } catch (e) { box.innerHTML = ""; setState(box, "err", errMsg(e)); }
  })();
  return li;
}


/* ------------------------------------------------------------------ l'evento

   La richiesta sa già cosa, dove, quando e chi serve: l'evento nasce da lì, con un ruolo per ogni posto
   da coprire, e si va dritti all'Organico a cercare i musicisti. Il tasto c'è anche prima dell'accettazione
   — a volte ci si accorda al telefono — ma è in evidenza solo quando il cliente ha detto sì. */
function bloccoEvento(r, slots) {
  const sez = el(`<section class="card"><h3>Evento</h3><div id="ebox"></div></section>`);
  const ebox = sez.querySelector("#ebox");
  if (r.production_id) {
    ebox.appendChild(el(`<p class="small muted">L'evento c'è già: organico, date e convocazioni si seguono da lì.</p>`));
    ebox.appendChild(el(`<p><a class="btn small primary" href="${BASE}/admin/produzioni/scheda/?id=${esc(r.production_id)}&amp;t=organico">Apri l'evento</a></p>`));
    return sez;
  }
  if (r.status === "lost" || r.status === "closed") {
    ebox.appendChild(el(`<p class="small muted">La richiesta è chiusa: niente evento da creare.</p>`));
    return sez;
  }
  const posti = slots.filter((x) => !x.covered).reduce((n, x) => n + (Number(x.qty) || 0), 0);
  const quali = posti ? (posti === 1 ? "1 posto da coprire" : posti + " posti da coprire") : "i posti del preventivo";
  const p = el(`<p class="small muted"></p>`);
  p.textContent = r.status === "won"
    ? "Il cliente ha accettato. L'evento nasce con titolo, luogo e " + quali + "; poi cerchi i musicisti dall'Organico."
    : "Se vi siete già accordati, puoi creare l'evento anche adesso: nasce con titolo, luogo e " + quali + ".";
  ebox.appendChild(p);
  const b = el(`<button type="button" class="btn small${r.status === "won" ? " primary" : ""}">Crea l'evento</button>`);
  b.onclick = async () => {
    const ok = await confirm({ title: "Creare l'evento?", text: "«" + r.event_title + "» diventa una produzione con " + quali + ". La richiesta resta com'è.", ok: "Crea l'evento" });
    if (!ok) return;
    b.disabled = true;
    try {
      const pid = await api.toProduction(r.id);
      toast("Evento creato.");
      location.href = BASE + "/admin/produzioni/scheda/?id=" + encodeURIComponent(pid) + "&t=organico";
    } catch (e) { b.disabled = false; toast(errMsg(e), { err: true }); }
  };
  ebox.appendChild(b);
  return sez;
}

/* ------------------------------------------------------------------ il preventivo

   Per ogni posto il cachet del musicista; un margine unico; sopra l'IVA. Mentre si scrive i conti li fa
   il browser, per vederli; quando si manda li rifà il database, e quelli sono i numeri che contano. Al
   cliente arriva solo la descrizione e il totale — cachet, margine e note restano qui. */
async function bloccoPreventivo(r, slots) {
  const sez = el(`<section class="card quote"><h3>Preventivo</h3><div id="qbox"><div class="loading">Un attimo…</div></div></section>`);
  const qbox = sez.querySelector("#qbox");
  let q = null;
  try { q = await quotes.ofRequest(r.id); } catch (e) { qbox.innerHTML = ""; setState(qbox, "err", errMsg(e)); return sez; }
  qbox.innerHTML = "";

  if (q && q.status !== "draft") {
    /* mandato: si vede cosa ha ricevuto il cliente, e si può solo farne uno nuovo */
    const STQ = { sent: "Mandato, in attesa di risposta", accepted: "Accettato dal cliente", declined: "Rifiutato dal cliente" };
    const dl = el(`<dl class="review"></dl>`);
    const AVV = { sent: "email mandata", pending: "email in partenza", sending: "email in partenza", none: "nessuna email (indirizzo di prova o assente)", failed: "email non partita" };
    for (const [k, v] of [["Stato", STQ[q.status] || q.status], ["Avviso", AVV[q.notify_status] || "—"], ["Al cliente", q.description || "—"], ["Imponibile", euro(q.net_cents)],
      ["IVA " + Number(q.vat_pct) + "%", euro(q.vat_cents)], ["Totale", euro(q.total_cents)], ["Mandato il", fmtDateTime(q.sent_at)]]) {
      const dt = document.createElement("dt"); dt.textContent = k; const dd = document.createElement("dd"); dd.textContent = v; dl.appendChild(dt); dl.appendChild(dd);
    }
    qbox.appendChild(dl);
    const nuovo = el(`<button type="button" class="btn small">Fanne uno nuovo</button>`);
    nuovo.onclick = () => { disegnaBozza(qbox, r, slots, { ...q, status: "draft", id: null }); };
    if (q.status === "sent") qbox.appendChild(el(`<p class="small muted">Se lo cambi, il cliente vedrà solo quello nuovo: questo diventa «superato».</p>`));
    qbox.appendChild(nuovo);
    return sez;
  }
  disegnaBozza(qbox, r, slots, q);
  return sez;
}

/* La bozza: righe precompilate dai posti che il cliente ha chiesto (senza cachet: quello lo sai tu). */
function disegnaBozza(qbox, r, slots, q) {
  qbox.innerHTML = "";
  let righe = q && q.lines && q.lines.length
    ? q.lines.map((l) => ({ label: l.label, qty: l.qty, fee_cents: Number(l.fee_cents) }))
    : slots.filter((x) => !x.covered).map((x) => ({ label: x.label || x.instrument_code || "Musicista", qty: x.qty || 1, fee_cents: 0 }));
  if (!righe.length) righe = [{ label: "Musicista", qty: 1, fee_cents: 0 }];
  const stato = { margin: q ? Number(q.margin_pct) : 25, vat: q ? Number(q.vat_pct) : IVA_STANDARD, description: q ? q.description : "", notes: q ? q.notes_internal : "" };

  const tab = el(`<div class="table-wrap"><table class="table quote-lines"><thead><tr><th>Posto</th><th>Quanti</th><th>Cachet €</th><th></th></tr></thead><tbody></tbody></table></div>`);
  const tb = tab.querySelector("tbody");
  const conti = el(`<dl class="review" id="qconti"></dl>`);
  const aggiorna = () => {
    const c = calcola(righe, stato.margin || 0, stato.vat || 0);
    conti.innerHTML = "";
    for (const [k, v, cls] of [["Cachet", euro(c.costo), ""], ["Margine " + (stato.margin || 0) + "%", euro(c.margine), "muted"],
      ["Imponibile", euro(c.imponibile), ""], ["IVA " + (stato.vat || 0) + "%", euro(c.iva), ""], ["Totale al cliente", euro(c.totale), "strong"]]) {
      const dt = document.createElement("dt"); dt.textContent = k; const dd = document.createElement("dd"); dd.textContent = v; if (cls) dd.className = cls;
      conti.appendChild(dt); conti.appendChild(dd);
    }
  };
  const disegnaRighe = () => {
    tb.innerHTML = "";
    righe.forEach((l, i) => {
      const tr = el(`<tr><td><input class="ql-label" aria-label="Posto"></td><td><input class="ql-qty" type="number" min="1" max="200" aria-label="Quanti"></td>
        <td><input class="ql-fee" type="number" min="0" step="10" aria-label="Cachet in euro"></td><td><button type="button" class="btn small ghost" aria-label="Togli">×</button></td></tr>`);
      tr.querySelector(".ql-label").value = l.label;
      tr.querySelector(".ql-qty").value = l.qty;
      tr.querySelector(".ql-fee").value = l.fee_cents ? (l.fee_cents / 100) : "";
      tr.querySelector(".ql-label").oninput = (e) => { l.label = e.target.value; };
      tr.querySelector(".ql-qty").oninput = (e) => { l.qty = Math.max(1, Math.round(Number(e.target.value) || 1)); aggiorna(); };
      tr.querySelector(".ql-fee").oninput = (e) => { l.fee_cents = Math.max(0, Math.round((Number(e.target.value) || 0) * 100)); aggiorna(); };
      tr.querySelector("button").onclick = () => { righe.splice(i, 1); disegnaRighe(); aggiorna(); };
      tb.appendChild(tr);
    });
  };
  disegnaRighe();
  qbox.appendChild(tab);
  const add = el(`<p><button type="button" class="btn small ghost">Aggiungi un posto</button></p>`);
  add.querySelector("button").onclick = () => { righe.push({ label: "", qty: 1, fee_cents: 0 }); disegnaRighe(); };
  qbox.appendChild(add);

  const par = el(`<div class="grid2 tight">
    <div class="field"><label for="qMargin">Margine %</label><input id="qMargin" type="number" min="0" max="500" step="1"></div>
    <div class="field"><label for="qVat">IVA %</label><input id="qVat" type="number" min="0" max="100" step="1"></div></div>`);
  par.querySelector("#qMargin").value = stato.margin;
  par.querySelector("#qVat").value = stato.vat;
  par.querySelector("#qMargin").oninput = (e) => { stato.margin = Number(e.target.value) || 0; aggiorna(); };
  par.querySelector("#qVat").oninput = (e) => { stato.vat = Number(e.target.value) || 0; aggiorna(); };
  qbox.appendChild(par);
  const desc = el(`<div class="field"><label for="qDesc">Cosa legge il cliente</label><textarea id="qDesc" rows="2"></textarea><span class="hint">La formazione e l'impegno, in una riga: «Quartetto d'archi per cerimonia e aperitivo, 2 ore». Il cliente vede questa e il totale, nient'altro.</span></div>`);
  desc.querySelector("textarea").value = stato.description;
  desc.querySelector("textarea").oninput = (e) => { stato.description = e.target.value; };
  qbox.appendChild(desc);
  const note = el(`<div class="field"><label for="qNote">Note interne</label><textarea id="qNote" rows="2"></textarea><span class="hint">Solo per voi: il cliente non le vede mai.</span></div>`);
  note.querySelector("textarea").value = stato.notes;
  note.querySelector("textarea").oninput = (e) => { stato.notes = e.target.value; };
  qbox.appendChild(note);
  qbox.appendChild(conti);
  aggiorna();

  const az = el(`<div class="row"><button type="button" class="btn" id="qSave">Salva la bozza</button><button type="button" class="btn primary" id="qSend">Manda al cliente</button></div>`);
  const salva = () => {
    const lines = righe.filter((l) => l.qty >= 1).map((l) => ({ label: l.label.trim(), qty: l.qty, fee_cents: l.fee_cents }));
    return quotes.save(r.id, { margin: stato.margin, vat: stato.vat, description: stato.description.trim(), notes: stato.notes.trim(), lines });
  };
  az.querySelector("#qSave").onclick = async () => { try { await salva(); toast("Bozza salvata."); } catch (e) { toast(errMsg(e), { err: true }); } };
  az.querySelector("#qSend").onclick = async () => {
    const c = calcola(righe, stato.margin || 0, stato.vat || 0);
    if (!c.costo) return toast("Il preventivo è vuoto: metti almeno un cachet.", { err: true });
    if (!stato.description.trim()) return toast("Scrivi cosa legge il cliente: è l'unica riga che vede oltre al totale.", { err: true });
    const ok = await confirm({ title: "Mandare il preventivo?", text: "Il cliente vedrà «" + stato.description.trim() + "» e il totale di " + euro(c.totale) + " IVA compresa. Una volta mandato non si modifica: per cambiarlo se ne fa uno nuovo.", ok: "Manda" });
    if (!ok) return;
    try {
      const id = await salva();
      const sent = await quotes.send(id);
      const avviso = await quotes.notifyNow(sent.id);
      toast("Preventivo mandato: " + euro(sent.total_cents) + ". "
        + (avviso && avviso.client === "sent" ? "Il cliente riceve l'email." : "L'email al cliente parte fra poco."));
      tutte = await api.list(ctx.org.org_id); paint();
    } catch (e) { toast(errMsg(e), { err: true }); }
  };
  qbox.appendChild(az);
}

main();
