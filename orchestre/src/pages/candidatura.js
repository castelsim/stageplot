/* La pagina pubblica della candidatura.

   Due passaggi di correzione, entrambi su segnalazione di Simone (10/09/2026):
   1. Mostrava un elenco di organizzazioni fra cui scegliere, come se ci fosse un mercato di orchestre, e a
      chi la apriva rispondeva «Al momento nessuna organizzazione accetta candidature».
   2. Poi mostrava UNA organizzazione in un riquadro intitolato «A chi ti candidi». Ma una scelta con una
      sola opzione non è una scelta: chi arriva qui si candida alla società che gestisce il servizio, e lo
      sa già dal titolo della pagina. Il nome interno dell'organizzazione, per giunta, non gli dice niente.

   Quello che resta utile è **cosa cercano**: se la società ha scritto una presentazione, quella va in alto,
   dove uno decide se vale la pena di compilare. Il resto sparisce. */
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
    if (soc) return paintSocieta(soc, cta);
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

/* Una sola destinazione: niente sezione, niente riquadro, niente secondo bottone. Restano la presentazione
   (se c'è) in cima, e l'avviso quando le candidature sono chiuse — che è l'unica cosa che cambia la
   decisione di chi sta leggendo. */
function paintSocieta(soc, cta) {
  titolo.remove();
  box.remove();
  if (soc.application_intro) {
    const p = el(`<p class="lead"></p>`);
    p.textContent = soc.application_intro;
    app.querySelector("p.lead").after(p);
  }
  if (!soc.accepting) {
    const avviso = el(`<div class="banner"></div>`);
    avviso.textContent = "In questo momento non stiamo raccogliendo candidature. Puoi compilare il profilo lo stesso: quando riapriamo, lo mandi in due tocchi.";
    app.querySelector("p.lead").after(avviso);
    cta.textContent = cta.textContent === "Vai alla tua area" ? cta.textContent : "Accedi e prepara il profilo";
  }
}
