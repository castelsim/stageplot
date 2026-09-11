/* Login: entra con Google, crea il profilo, smista. Con una sessione già valida non mostra niente:
   porta subito dove l'utente voleva andare (?next=) o all'area admin. */
import { BASE, STAFF } from "../config.js";
import { sb } from "../sb.js";
import { el, setState, errMsg } from "../ui.js";
import { getSession, signIn, ensureProfile, myMemberships, currentOrg, setCurrentOrg, nextUrl, mieAree } from "../auth.js";

const app = document.getElementById("app");
const q = new URLSearchParams(location.search);
const next = nextUrl(q.get("next"));

async function main() {
  if (!sb) return paintError("Il browser non ha caricato la libreria di accesso. Ricarica la pagina.");
  if (q.get("error_description") || q.get("error")) return paintError(q.get("error_description") || q.get("error"));
  const session = await getSession();
  if (!session) return paintLogin();
  setState(app, "loading", "Ti riconosco…");
  try {
    await ensureProfile();
    const ms = await myMemberships();
    const staff = ms.filter((m) => STAFF.includes(m.role));
    if (staff.length > 0) {
      const org = currentOrg(staff);
      setCurrentOrg(org.org_id);
      location.replace(next);
      return;
    }
    /* Non è dello staff: può essere musicista, cliente, o tutti e due. Chi ha due strade se le sceglie,
       invece di finire sempre nella stessa — prima chi aveva chiesto musicisti veniva mandato all'area
       musicista e non aveva nessun modo di rivedere le proprie richieste. */
    const org = q.get("org") ? "?org=" + encodeURIComponent(q.get("org")) : "";
    /* chi stava andando da qualche parte ci torna: «Cerco musicisti» → Accedi → di nuovo al modulo della
       richiesta. Solo le pagine fuori dall'area di gestione, e solo indirizzi di Orchestre (nextUrl). */
    const voleva = q.get("next") ? nextUrl(q.get("next")) : "";
    if (voleva && voleva === q.get("next") && !voleva.startsWith(BASE + "/admin")) { location.replace(voleva); return; }
    const aree = await mieAree();
    if (aree.cliente && !aree.musicista) { location.replace(BASE + "/mie-richieste/"); return; }
    if (aree.cliente && aree.musicista) return paintBivio(org);
    location.replace(BASE + "/musicista/" + org);
  } catch (e) {
    paintError(errMsg(e));
  }
}

function paintLogin() {
  const why = q.get("why");
  app.className = "o-wrap narrow";   /* «Ti riconosco…» aveva vestito il contenitore da stato */
  app.innerHTML = "";
  app.appendChild(el(`<h1>Accedi</h1>`));
  if (why === "noorg") app.appendChild(el(`<div class="banner">Serve un account che faccia parte di un'organizzazione. Se sei un musicista, dopo l'accesso trovi la tua area.</div>`));
  app.appendChild(el(`<p class="muted">Con il tuo account Google. Nessuna password da ricordare.</p>`));
  const b = el(`<button type="button" class="btn primary block">Accedi con Google</button>`);
  b.onclick = async () => {
    b.disabled = true;
    b.textContent = "Ti porto su Google…";
    try { await signIn(next); } catch (e) { b.disabled = false; b.textContent = "Accedi con Google"; paintError(errMsg(e)); }
  };
  app.appendChild(b);
  const note = el(`<p class="small muted"></p>`);
  note.textContent = "Accedendo accetti le condizioni di StagePlot. I tuoi dati li vede solo la società con cui lavori: quella a cui ti candidi o a cui chiedi musicisti.";
  app.appendChild(note);
}

function paintError(msg) {
  app.innerHTML = `<h1>Accesso non riuscito</h1><div class="err"></div><p><a class="btn" href="${BASE}/login/">Riprova</a></p>`;
  app.querySelector(".err").textContent = msg;
}

/* Due strade, dichiarate. Non un menu a tendina: due porte grandi, come sulla home. */
function paintBivio(org) {
  app.className = "o-wrap narrow";   /* «Ti riconosco…» aveva vestito il contenitore da stato */
  app.innerHTML = "";
  app.appendChild(el(`<h1 class="mid">Dove vuoi andare?</h1>`));
  const box = el(`<div class="porte due"></div>`);
  const a = el(`<a class="porta" href="${BASE}/musicista/${org}"><b>Il mio profilo</b><span>Il tuo profilo di musicista, le convocazioni e le date a cui hai detto sì.</span><span class="vai">Entra &rarr;</span></a>`);
  const b = el(`<a class="porta" href="${BASE}/mie-richieste/"><b>Le mie richieste</b><span>I musicisti che hai chiesto per i tuoi eventi, e a che punto sono.</span><span class="vai">Guarda &rarr;</span></a>`);
  box.appendChild(a); box.appendChild(b);
  app.appendChild(box);
  app.appendChild(el(`<p class="small muted mid">Puoi passare dall'una all'altra quando vuoi, dalla barra in alto: non serve uscire.</p>`));
}

main();
