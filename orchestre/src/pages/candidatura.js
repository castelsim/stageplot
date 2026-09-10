/* La pagina pubblica della candidatura.

   Diceva «chi accetta candidature» e mostrava un elenco di organizzazioni, come se ci fosse un mercato di
   orchestre fra cui scegliere; a chi la apriva rispondeva «Al momento nessuna organizzazione accetta
   candidature» (segnalazione di Simone, 10/09/2026). Il modello vero è un altro: una società raccoglie i
   musicisti e li propone ai suoi clienti. Qui si dice a chi ci si candida, con le sue parole, e lo si dice
   anche a chi non ha ancora fatto l'accesso — prima era nascosto dietro il login, che è il modo più veloce
   per far chiudere la pagina. */
import { BASE } from "../config.js";
import { sb } from "../sb.js";
import { el, setState, errMsg } from "../ui.js";
import { getSession, signIn } from "../auth.js";
import { openOrganizations } from "../api/applications.js";

const app = document.getElementById("app");
const box = app.querySelector("#orgs");
const titolo = app.querySelector("#orgsTitle");

(async () => {
  const session = await getSession();
  const cta = app.querySelector("#cta");
  if (session) { cta.textContent = "Vai alla tua area"; cta.href = BASE + "/musicista/"; }
  else cta.onclick = (e) => { e.preventDefault(); signIn(BASE + "/musicista/"); };
  if (!sb) return;
  try {
    const { data } = await sb.rpc("orc_service_org_public");
    const soc = (data || [])[0] || null;
    if (soc) return paintSocieta(soc, session, cta);
    /* nessuna società di servizi: allora è davvero un elenco, e serve l'accesso per leggerlo */
    if (!session) { setState(box, "empty", "Accedi con Google per vedere chi raccoglie candidature."); return; }
    const orgs = await openOrganizations();
    if (!orgs.length) { setState(box, "empty", "In questo momento non si stanno raccogliendo candidature. Riprova più avanti."); return; }
    setState(box, ""); box.innerHTML = "";
    const ul = el(`<ul class="list"></ul>`);
    for (const o of orgs) {
      const li = el(`<li class="list-item"><div class="grow"><div class="title"></div><div class="sub"></div></div><div class="actions"></div></li>`);
      li.querySelector(".title").textContent = o.name;
      li.querySelector(".sub").textContent = o.application_intro || "";
      const a = el(`<a class="btn small primary">Candidati</a>`);
      a.href = BASE + "/musicista/?org=" + encodeURIComponent(o.id);
      li.querySelector(".actions").appendChild(a);
      ul.appendChild(li);
    }
    box.appendChild(ul);
  } catch (e) { setState(box, "err", errMsg(e)); }
})();

function paintSocieta(soc, session, cta) {
  titolo.textContent = "A chi ti candidi";
  setState(box, ""); box.innerHTML = "";
  const card = el(`<section class="card"><h3 id="socNome"></h3><p id="socIntro" class="muted"></p><div class="row" id="socAz"></div></section>`);
  card.querySelector("#socNome").textContent = soc.name;
  card.querySelector("#socIntro").textContent = soc.accepting
    ? (soc.application_intro || "Raccoglie i musicisti con cui lavora e li propone ai propri clienti: concerti, cerimonie, registrazioni. Il profilo che compili resta tuo.")
    : "In questo momento non sta raccogliendo candidature. Puoi comunque compilare il profilo: quando riapre, lo mandi in due tocchi.";
  const az = card.querySelector("#socAz");
  const a = el(`<a class="btn primary"></a>`);
  /* a candidature chiuse il profilo si compila lo stesso: il bottone non deve promettere quello che non c'è */
  a.textContent = session ? "Vai alla tua area" : soc.accepting ? "Accedi con Google e candidati" : "Accedi e prepara il profilo";
  a.href = BASE + "/musicista/";
  if (!session) a.onclick = (e) => { e.preventDefault(); signIn(BASE + "/musicista/"); };
  az.appendChild(a);
  box.appendChild(card);
  if (!soc.accepting) cta.textContent = session ? "Vai alla tua area" : "Accedi e compila il profilo";
}
