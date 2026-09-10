/* Le richieste che arrivano dai clienti di StagePlot: chi ha disegnato un palco e vuole i musicisti.
   Quello che è arrivato non si modifica (lo impedisce il database): qui si legge, si prende in carico e
   si chiude. La trasformazione in evento con l'organico arriva col passo successivo. */
import { esc, el, toast, setState, errMsg, fmtDateTime } from "../ui.js";
import { requireStaff, mountTopbar } from "../auth.js";
import { tabs } from "../nav.js";
import { EVENT_KINDS, quantiLabel } from "../domain/client-request.js";
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
  const li = el(`<li class="list-item block"><section class="card"><div id="d"><div class="loading">Un attimo…</div></div></section></li>`);
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
      /* la lavorazione */
      const act = el(`<div class="row" id="az"></div>`);
      for (const [st, label] of [["taken", "Prendi in carico"], ["quoted", "Preventivo inviato"], ["won", "Accettata"], ["lost", "Non andata"], ["closed", "Chiudi"]]) {
        if (st === r.status) continue;
        const b = el(`<button type="button" class="btn small${st === "taken" ? " primary" : " ghost"}">${label}</button>`);
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

main();
