/* Helper di interfaccia. Nessun accesso al DOM a livello di modulo: le funzioni pure sono importabili
   da Node (test), quelle che toccano il documento lo fanno solo quando vengono chiamate. */
import { ROLES, STAFF } from "./config.js";

export function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
/* Un indirizzo scritto da un'altra persona, prima di finire in un href. `<input type="url">` accetta
   `javascript:` — è una URL formalmente valida — e quel link, cliccato da chi guarda la scheda,
   girerebbe con i suoi permessi. Qui passano solo http e https: tutto il resto torna stringa vuota,
   e chi chiama mostra il testo senza renderlo cliccabile. */
export function safeHttpUrl(u) {
  const t = String(u == null ? "" : u).trim();
  if (!t) return "";
  try {
    /* Senza base, apposta: `new URL(t, base)` risolverebbe qualsiasi cosa contro stageplot.it —
       la stringa vuota diventava la home, e «evil.com» un percorso nostro. Qui passa solo
       un indirizzo assoluto, e chi ha scritto «example.org» senza schema resta testo. */
    const p = new URL(t);
    return (p.protocol === "http:" || p.protocol === "https:") ? p.href : "";
  } catch (e) { return ""; }
}
/* Da HTML a elemento. Con <template>, non con un div: dentro un div il parser butta via un <tr> o un
   <td> senza tabella intorno (visto il 04/09: il registro restava vuoto senza errori in console). */
export function el(html) {
  const t = document.createElement("template");
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}
export function roleLabel(role) { return ROLES[role] || String(role || ""); }
export function isStaff(role) { return STAFF.includes(role); }
export function fmtDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d)) return "";
  return d.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" });
}
export function fmtDateTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d)) return "";
  return d.toLocaleString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
/* Il messaggio di un errore, in una riga leggibile.

   Le nostre funzioni sollevano eccezioni già in italiano («non autorizzato», «posto già occupato: prima
   liberalo»): quelle passano come sono. Quando invece a parlare è il database — «new row violates
   row-level security policy for table "orc_productions"» — chi organizza un concerto non deve leggerlo:
   diventa una frase che dice cosa fare (collaudo 10/09/2026). */
const DB_ERR = {
  "42501": "Non hai i permessi per questa operazione.",
  "23505": "Esiste già: controlla se l'hai inserito due volte.",
  "23503": "Manca qualcosa a cui questo dato è collegato.",
  "23514": "Un valore non è valido per questo campo.",
  "22023": "Un dato non è valido.",
  "PGRST301": "La sessione è scaduta: rientra e riprova.",
  "PGRST116": "Non trovato: forse è stato eliminato nel frattempo.",
};
/* i modi in cui si riconosce che a parlare è Postgres e non noi */
const TECNICO = /row-level security|policy|violates|constraint|duplicate key|relation "|column "|function [a-z_]+\(|permission denied|syntax error|invalid input|null value in/i;
export function errMsg(e) {
  if (!e) return "Qualcosa non ha risposto. Riprova.";
  if (typeof e === "string") return e;
  const m = e.message || e.error_description || e.details || "";
  /* la rete che cade parla inglese: «Failed to fetch» non è una frase nostra */
  if (/Failed to fetch|NetworkError|Load failed|network/i.test(m)) return "Nessuna risposta dalla rete: controlla la connessione e riprova.";
  if (m && !TECNICO.test(m)) return m;                       /* già una frase nostra, in italiano */
  if (DB_ERR[e.code]) return DB_ERR[e.code];
  return "Non è stato possibile completare l'operazione. Riprova, e se continua scrivici.";
}

let toastT = null;
export function toast(msg, { err = false, action = "", onAction = null } = {}) {
  let n = document.getElementById("oToast");
  if (!n) {
    n = el('<div id="oToast" class="toast" role="status" aria-live="polite"></div>');
    document.body.appendChild(n);
  }
  n.className = "toast" + (err ? " err" : "");
  n.innerHTML = "<span></span>" + (action ? '<button type="button"></button>' : "");
  n.firstChild.textContent = msg;
  const hide = () => n.classList.remove("show");
  if (action) {
    const b = n.querySelector("button");
    b.textContent = action;
    b.onclick = () => { hide(); if (onAction) onAction(); };
  }
  requestAnimationFrame(() => n.classList.add("show"));
  clearTimeout(toastT);
  toastT = setTimeout(hide, err ? 6000 : 3500);
}

export function confirm({ title = "Confermi?", text = "", ok = "Conferma", cancel = "Annulla", danger = false } = {}) {
  return new Promise((resolve) => {
    const ov = el(`<div class="modal-ov" role="dialog" aria-modal="true" aria-labelledby="oConfirmT">
      <div class="modal"><h2 id="oConfirmT"></h2><p class="muted"></p>
      <div class="actions"><button type="button" class="btn" data-x="0"></button><button type="button" class="btn ${danger ? "danger" : "primary"}" data-x="1"></button></div></div></div>`);
    ov.querySelector("h2").textContent = title;
    ov.querySelector("p").textContent = text;
    const [bNo, bOk] = ov.querySelectorAll("button");
    bNo.textContent = cancel;
    bOk.textContent = ok;
    const done = (v) => { ov.remove(); document.removeEventListener("keydown", onKey); resolve(v); };
    const onKey = (e) => { if (e.key === "Escape") done(false); };
    bNo.onclick = () => done(false);
    bOk.onclick = () => done(true);
    ov.addEventListener("click", (e) => { if (e.target === ov) done(false); });
    document.addEventListener("keydown", onKey);
    document.body.appendChild(ov);
    bOk.focus();
  });
}

/* Stato di una regione: "loading" | "empty" | "err" | "" (contenuto). Con "" non tocca l'HTML. */
export function setState(node, kind, msg) {
  if (!node) return;
  if (!kind) { node.classList.remove("loading", "empty", "err"); return; }
  node.className = kind;
  node.textContent = msg || { loading: "Un attimo…", empty: "Niente da mostrare.", err: "Qualcosa non ha risposto. Riprova." }[kind];
}
