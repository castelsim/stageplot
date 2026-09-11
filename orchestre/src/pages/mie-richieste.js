/* Le richieste che ho mandato, con lo stato. È la pagina che mancava al cliente: la funzione per
   leggerle esisteva dal lotto «Richiedi musicisti», ma nessuna pagina la chiamava — chi aveva chiesto
   dei musicisti non aveva modo di rivedere cosa aveva chiesto, né di sapere a che punto era.

   Quello che si vede qui è la vista del cliente e basta: il titolo dell'evento, quando e dove, quanti
   musicisti (o «formazione da definire»), e uno stato tradotto — «ricevuta» / «in lavorazione». Le note
   interne, chi l'ha presa in carico e lo stato vero della lavorazione restano dell'organizzazione. */
import { BASE } from "../config.js";
import { el, toast, confirm, setState, errMsg, fmtDate } from "../ui.js";
import { getSession, signIn, barraAree } from "../auth.js";
import { quantiLabel } from "../domain/client-request.js";
import * as api from "../api/client-requests.js";
import * as quotes from "../api/quotes.js";
import { euro } from "../domain/quote.js";

const app = document.getElementById("app");

async function main() {
  const session = await getSession();
  if (!session) return paintLogin();
  await barraAree("mie-richieste");
  setState(app, "loading", "Un attimo…");
  try {
    const [righe, preventivi] = await Promise.all([api.mine(), quotes.mine()]);
    paint(righe, preventivi);
  } catch (e) {
    app.innerHTML = ""; const d = el(`<div class="err"></div>`); d.textContent = errMsg(e); app.appendChild(d);
  }
}

function paintLogin() {
  app.className = "o-wrap narrow";
  app.innerHTML = "";
  app.appendChild(el(`<h1>Le mie richieste</h1>`));
  app.appendChild(el(`<p class="lead">Entra per rivedere le richieste di musicisti che hai mandato e sapere a che punto sono.</p>`));
  const b = el(`<button type="button" class="btn primary">Accedi con Google</button>`);
  b.onclick = () => signIn(BASE + "/mie-richieste/");
  app.appendChild(b);
}

function paint(righe, preventivi = []) {
  app.className = "o-wrap narrow";   /* setState() aveva vestito il contenitore da «sto caricando» */
  app.innerHTML = "";
  app.appendChild(el(`<h1>Le mie richieste</h1>`));
  if (!righe.length) {
    app.appendChild(el(`<p class="lead">Non hai ancora chiesto musicisti.</p>`));
    app.appendChild(el(`<p><a class="btn primary" href="${BASE}/richiedi/">Chiedi musicisti</a></p>`));
    return;
  }
  const ul = el(`<ul class="list"></ul>`);
  for (const r of righe) {
    const li = el(`<li class="list-item"><div class="grow"><div class="title"></div><div class="sub"></div></div><div class="actions"></div></li>`);
    li.querySelector(".title").textContent = r.event_title;
    li.querySelector(".sub").textContent = [
      r.slots_summary || quantiLabel(r),
      [r.event_when, r.event_place].filter(Boolean).join(" · "),
      "mandata il " + fmtDate(r.created_at),
      r.org_name ? "a " + r.org_name : "",
    ].filter(Boolean).join(" · ");
    const pill = el(`<span class="pill"></span>`);
    pill.textContent = r.status;                       /* già tradotto per il cliente da orc_my_client_requests */
    const tono = { ricevuta: "", "in lavorazione": "accent", accettata: "ok", "non andata": "", chiusa: "" }[r.status];
    if (tono) pill.classList.add(tono);
    li.querySelector(".actions").appendChild(pill);
    ul.appendChild(li);
    /* il preventivo, se è arrivato: solo la descrizione e il totale — il resto è della società */
    const q = preventivi.find((x) => x.request_id === r.id);
    if (q) ul.appendChild(schedaPreventivo(q));
  }
  app.appendChild(ul);
  app.appendChild(el(`<p class="small muted">Il preventivo, quando è pronto, lo trovi qui sotto la richiesta: lo accetti o no con un tocco. Se hai altro da dirci rispondi alla nostra email — la richiesta che è arrivata non si modifica, così chi la sta lavorando vede sempre la stessa cosa.</p>`));
  app.appendChild(el(`<p><a class="btn" href="${BASE}/richiedi/">Chiedi altri musicisti</a></p>`));
}


/* Il preventivo come lo vede il cliente: cosa gli viene proposto, imponibile, IVA, totale. Accetta o no,
   una volta sola. I cachet dei musicisti e il margine non arrivano fin qui — non è la pagina a
   nasconderli: il database non glieli dà. */
function schedaPreventivo(q) {
  const li = el(`<li class="list-item block"><section class="card quote-cliente"><h3>Il preventivo</h3></section></li>`);
  const card = li.querySelector("section");
  const d = el(`<p class="lead"></p>`); d.textContent = q.description || "Preventivo per la tua richiesta"; card.appendChild(d);
  const dl = el(`<dl class="review"></dl>`);
  for (const [k, v, cls] of [["Imponibile", euro(q.net_cents), ""], ["IVA " + Number(q.vat_pct) + "%", euro(q.vat_cents), ""], ["Totale", euro(q.total_cents), "strong"]]) {
    const dt = document.createElement("dt"); dt.textContent = k; const dd = document.createElement("dd"); dd.textContent = v; if (cls) dd.className = cls;
    dl.appendChild(dt); dl.appendChild(dd);
  }
  card.appendChild(dl);
  if (q.status === "sent") {
    const az = el(`<div class="row"><button type="button" class="btn primary">Accetto il preventivo</button><button type="button" class="btn ghost">No, grazie</button></div>`);
    const [si, no] = az.querySelectorAll("button");
    const rispondi = async (accept) => {
      const ok = await confirm(accept
        ? { title: "Accetti il preventivo?", text: "Totale " + euro(q.total_cents) + " IVA compresa. Da qui confermiamo i musicisti e ti ricontattiamo per i dettagli. La risposta è definitiva.", ok: "Accetto" }
        : { title: "Rifiuti il preventivo?", text: "Lo segnaliamo a chi l'ha preparato, e la risposta è definitiva. Se vuoi solo cambiare qualcosa, rispondi all'email del preventivo invece di rifiutarlo.", ok: "Rifiuto", danger: true });
      if (!ok) return;
      try { await quotes.answer(q.id, accept); toast(accept ? "Preventivo accettato: ti ricontattiamo." : "Risposta registrata."); main(); }
      catch (e) { toast(errMsg(e), { err: true }); }
    };
    si.onclick = () => rispondi(true);
    no.onclick = () => rispondi(false);
    card.appendChild(az);
  } else {
    const p = el(`<p class="small"></p>`);
    p.textContent = q.status === "accepted" ? "Accettato il " + fmtDate(q.answered_at) + ": ti ricontattiamo per confermare i musicisti." : "Rifiutato il " + fmtDate(q.answered_at) + ".";
    card.appendChild(p);
  }
  return li;
}

main();
