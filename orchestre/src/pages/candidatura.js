/* La pagina pubblica della candidatura: cos'è, come funziona, chi accetta candidature; poi il login. */
import { BASE } from "../config.js";
import { sb } from "../sb.js";
import { esc, el, setState, errMsg } from "../ui.js";
import { getSession, signIn } from "../auth.js";
import { openOrganizations } from "../api/applications.js";

const app = document.getElementById("app");
const box = app.querySelector("#orgs");

(async () => {
  const session = await getSession();
  const cta = app.querySelector("#cta");
  if (session) { cta.textContent = "Vai alla tua area"; cta.href = BASE + "/musicista/"; }
  else cta.onclick = (e) => { e.preventDefault(); signIn(BASE + "/musicista/"); };
  if (!sb) return;
  try {
    /* le org aperte si leggono solo da loggati (RLS): da anonimi mostriamo il passo successivo */
    if (!session) { setState(box, "empty", "Accedi con Google per vedere chi accetta candidature."); return; }
    const orgs = await openOrganizations();
    if (!orgs.length) { setState(box, "empty", "Al momento nessuna organizzazione accetta candidature."); return; }
    setState(box, ""); box.innerHTML = "";
    const ul = el(`<ul class="list"></ul>`);
    for (const o of orgs) {
      const li = el(`<li class="list-item"><div class="grow"><div class="title"></div><div class="sub"></div></div><div class="actions"><a class="btn small primary" href="${BASE}/musicista/?org=${esc(o.slug)}">Candidati</a></div></li>`);
      li.querySelector(".title").textContent = o.name; li.querySelector(".sub").textContent = o.application_intro || "";
      ul.appendChild(li);
    }
    box.appendChild(ul);
  } catch (e) { setState(box, "err", errMsg(e)); }
})();
