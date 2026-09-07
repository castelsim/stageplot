/* Login: entra con Google, crea il profilo, smista. Con una sessione già valida non mostra niente:
   porta subito dove l'utente voleva andare (?next=) o all'area admin. */
import { BASE, STAFF } from "../config.js";
import { sb } from "../sb.js";
import { esc, el, setState, roleLabel, errMsg } from "../ui.js";
import { getSession, signIn, signOut, ensureProfile, myMemberships, currentOrg, setCurrentOrg, nextUrl } from "../auth.js";

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
    if (staff.length === 0) return paintNoOrg(session, ms);
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
  if (why === "noorg") app.appendChild(el(`<div class="banner">Serve un account che faccia parte di un'organizzazione.</div>`));
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

function paintNoOrg(session, ms) {
  const nome = (session.user.user_metadata && (session.user.user_metadata.full_name || session.user.user_metadata.name)) || session.user.email;
  app.innerHTML = `<h1>Ciao ${esc(nome)}</h1>
    <div class="banner">Il tuo account non fa parte di nessuna organizzazione con permessi di gestione.</div>
    <p>Chi amministra un'orchestra su StagePlot Orchestre può aggiungerti dalle sue impostazioni, con questa email: <strong>${esc(session.user.email)}</strong>.</p>
    ${ms.length ? `<p class="muted small">Sei ${esc(roleLabel(ms[0].role).toLowerCase())} in ${esc(ms[0].org_name)}: l'area per questo ruolo arriva nei prossimi aggiornamenti.</p>` : ""}
    <p class="row"><button type="button" class="btn" id="out">Esci</button><a class="btn ghost" href="${BASE}/">Torna alla presentazione</a></p>`;
  app.querySelector("#out").onclick = signOut;
}

function paintError(msg) {
  app.innerHTML = `<h1>Accesso non riuscito</h1><div class="err"></div><p><a class="btn" href="${BASE}/login/">Riprova</a></p>`;
  app.querySelector(".err").textContent = msg;
}

main();
