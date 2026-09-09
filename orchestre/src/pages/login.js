/* Login: entra con Google, crea il profilo, smista. Con una sessione già valida non mostra niente:
   porta subito dove l'utente voleva andare (?next=) o all'area admin. */
import { BASE, STAFF } from "../config.js";
import { sb } from "../sb.js";
import { el, setState, errMsg } from "../ui.js";
import { getSession, signIn, ensureProfile, myMemberships, currentOrg, setCurrentOrg, nextUrl } from "../auth.js";

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
    if (staff.length === 0) { location.replace(BASE + "/musicista/" + (q.get("org") ? "?org=" + encodeURIComponent(q.get("org")) : "")); return; }
    const org = currentOrg(staff);
    setCurrentOrg(org.org_id);
    location.replace(next);
  } catch (e) {
    paintError(errMsg(e));
  }
}

function paintLogin() {
  const why = q.get("why");
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
  note.textContent = "Accedendo accetti le condizioni di StagePlot. I tuoi dati restano nell'organizzazione che ti ha invitato.";
  app.appendChild(note);
}

function paintError(msg) {
  app.innerHTML = `<h1>Accesso non riuscito</h1><div class="err"></div><p><a class="btn" href="${BASE}/login/">Riprova</a></p>`;
  app.querySelector(".err").textContent = msg;
}

main();
