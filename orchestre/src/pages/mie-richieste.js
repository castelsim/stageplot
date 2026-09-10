/* Le richieste che ho mandato, con lo stato. È la pagina che mancava al cliente: la funzione per
   leggerle esisteva dal lotto «Richiedi musicisti», ma nessuna pagina la chiamava — chi aveva chiesto
   dei musicisti non aveva modo di rivedere cosa aveva chiesto, né di sapere a che punto era.

   Quello che si vede qui è la vista del cliente e basta: il titolo dell'evento, quando e dove, quanti
   musicisti (o «formazione da definire»), e uno stato tradotto — «ricevuta» / «in lavorazione». Le note
   interne, chi l'ha presa in carico e lo stato vero della lavorazione restano dell'organizzazione. */
import { BASE } from "../config.js";
import { el, setState, errMsg, fmtDate } from "../ui.js";
import { getSession, signIn, barraAree } from "../auth.js";
import { quantiLabel } from "../domain/client-request.js";
import * as api from "../api/client-requests.js";

const app = document.getElementById("app");

async function main() {
  const session = await getSession();
  if (!session) return paintLogin();
  await barraAree("mie-richieste");
  setState(app, "loading", "Un attimo…");
  try {
    const righe = await api.mine();
    paint(righe);
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

function paint(righe) {
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
      quantiLabel(r),
      [r.event_when, r.event_place].filter(Boolean).join(" · "),
      "mandata il " + fmtDate(r.created_at),
      r.org_name ? "a " + r.org_name : "",
    ].filter(Boolean).join(" · ");
    const pill = el(`<span class="pill"></span>`);
    pill.textContent = r.status;                       /* già tradotto per il cliente da orc_my_client_requests */
    if (r.status !== "ricevuta") pill.classList.add("accent");
    li.querySelector(".actions").appendChild(pill);
    ul.appendChild(li);
  }
  app.appendChild(ul);
  app.appendChild(el(`<p class="small muted">Ti rispondiamo via email con i nomi e il preventivo. Se hai altro da dirci, rispondi a quella email: la richiesta che è arrivata non si modifica, così chi la sta lavorando vede sempre la stessa cosa.</p>`));
  app.appendChild(el(`<p><a class="btn" href="${BASE}/richiedi/">Chiedi altri musicisti</a></p>`));
}

main();
