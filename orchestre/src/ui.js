/* Helper di interfaccia. Nessun accesso al DOM a livello di modulo: le funzioni pure sono importabili
   da Node (test), quelle che toccano il documento lo fanno solo quando vengono chiamate. */
import { ROLES, STAFF } from "./config.js";

export function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}
export function el(html) {
  const d = document.createElement("div");
  d.innerHTML = html.trim();
  return d.firstElementChild;
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
/* Il messaggio di un errore Supabase/PostgREST, in una riga leggibile. */
export function errMsg(e) {
  if (!e) return "Qualcosa non ha risposto. Riprova.";
  if (typeof e === "string") return e;
  return e.message || e.error_description || e.details || "Qualcosa non ha risposto. Riprova.";
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
