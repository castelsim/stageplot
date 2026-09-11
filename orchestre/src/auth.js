/* Sessione, profilo, organizzazione attiva e guardie delle pagine.
   Le regole vere stanno nel database (RLS): qui si decide solo dove mandare l'utente. */
import { BASE, STAFF } from "./config.js";
import { sb } from "./sb.js";
import { esc, roleLabel } from "./ui.js";

/* Dove tornare dopo il login: solo percorsi interni a Orchestre, mai il login stesso, mai host
   esterni, mai schemi. Pura: testata in test/pure.test.mjs. */
export function nextUrl(raw) {
  const fallback = BASE + "/admin/";
  const s = String(raw || "");
  if (!s.startsWith(BASE + "/") || s.startsWith("//") || /[\s\\]/.test(s)) return fallback;
  if (s.startsWith(BASE + "/login")) return fallback;
  return s;
}

export async function getSession() {
  if (!sb) return null;
  const { data } = await sb.auth.getSession();
  return data.session || null;
}

export function signIn(next) {
  const back = location.origin + BASE + "/login/?next=" + encodeURIComponent(nextUrl(next));
  return sb.auth.signInWithOAuth({ provider: "google", options: { redirectTo: back } });
}

export async function signOut() {
  try { await sb.auth.signOut(); } catch { /* la sessione locale sparisce comunque */ }
  location.href = BASE + "/";
}

export async function ensureProfile() {
  const { data, error } = await sb.rpc("orc_ensure_profile");
  if (error) throw error;
  return data;
}

export async function myMemberships() {
  const { data, error } = await sb.rpc("orc_my_memberships");
  if (error) throw error;
  return data || [];
}

const ORG_KEY = "orc.org";
export function currentOrg(memberships) {
  let id = null;
  try { id = localStorage.getItem(ORG_KEY); } catch { /* storage negato: si prende la prima */ }
  return memberships.find((m) => m.org_id === id) || memberships[0] || null;
}
export function setCurrentOrg(id) {
  try { localStorage.setItem(ORG_KEY, id); } catch { /* idem */ }
}

/* Guardia delle pagine admin: senza sessione → login (con ritorno); senza org di staff → login con
   la spiegazione. Restituisce il contesto per la pagina, oppure null se ha già reindirizzato. */
export async function requireStaff() {
  const here = location.pathname + location.search;
  if (!sb) { location.replace(BASE + "/login/?why=nolib"); return null; }
  const session = await getSession();
  if (!session) { location.replace(BASE + "/login/?next=" + encodeURIComponent(here)); return null; }
  const [profile, memberships] = await Promise.all([ensureProfile(), myMemberships()]);
  const staffOrgs = memberships.filter((m) => STAFF.includes(m.role));
  const org = currentOrg(staffOrgs);
  if (!org) { location.replace(BASE + "/login/"); return null; }   /* il login smista: musicista, cliente o tutti e due */
  setCurrentOrg(org.org_id);
  return { session, profile, memberships, org };
}

/* Barra in alto delle pagine admin: brand, selettore org (se più di una), chi sei, Esci. */
/* Le aree di chi sta guardando: musicista, cliente, gestionale. È una domanda sola al database
   (`orc_my_areas`), e serve solo a decidere quali porte mostrare — chi entra lo decidono le policy,
   come sempre. Una porta in più mostrata per errore non apre niente: manda su una pagina che rimbalza. */
export async function mieAree() {
  if (!sb) return { musicista: false, cliente: false, staff: false };
  const { data, error } = await sb.rpc("orc_my_areas");
  if (error) return { musicista: false, cliente: false, staff: false };
  const r = (data || [])[0] || {};
  return { musicista: !!r.musicista, cliente: !!r.cliente, staff: !!r.staff };
}

/* La barra delle pagine personali: il marchio, le aree che ha davvero, e «Esci». Si mostra solo quando
   le aree sono più d'una: chi ne ha una sola non ha niente da scegliere e non deve vedere un menu. */
export async function barraAree(attiva = "") {
  const top = document.querySelector(".o-top");
  if (!top) return;
  const aree = await mieAree();
  const voci = [];
  if (aree.musicista) voci.push(["musicista", "Il mio profilo", BASE + "/musicista/"]);
  if (aree.cliente) voci.push(["mie-richieste", "Le mie richieste", BASE + "/mie-richieste/"]);
  if (aree.staff) voci.push(["admin", "Gestionale", BASE + "/admin/"]);
  const link = voci.length > 1
    ? `<nav class="o-aree" aria-label="Le tue aree">` + voci.map(([k, testo, href]) =>
        `<a class="btn small${k === attiva ? " primary" : ""}"${k === attiva ? ' aria-current="page"' : ""} href="${href}">${esc(testo)}</a>`).join("") + `</nav>`
    : "";
  top.innerHTML = `<a class="o-brand" href="${BASE}/"><span>StagePlot</span><small>Orchestre</small></a><span class="spacer"></span>`
    + `<button type="button" class="btn small ghost" id="oOut">Esci</button>` + link;
  const out = top.querySelector("#oOut");
  if (out) out.onclick = signOut;
  return aree;
}

export function mountTopbar(ctx, { active = "" } = {}) {
  const top = document.querySelector(".o-top");
  if (!top) return;
  const who = ctx ? esc(ctx.profile.display_name || ctx.session.user.email) : "";
  const orgs = ctx ? ctx.memberships.filter((m) => STAFF.includes(m.role)) : [];
  let orgHtml = "";
  if (orgs.length > 1) {
    orgHtml = `<select id="oOrg" aria-label="Organizzazione">${orgs.map((m) =>
      `<option value="${esc(m.org_id)}"${m.org_id === ctx.org.org_id ? " selected" : ""}>${esc(m.org_name)}</option>`).join("")}</select>`;
  } else if (ctx) {
    orgHtml = `<span class="who">${esc(ctx.org.org_name)}</span>`;
  }
  top.innerHTML = `<a class="o-brand" href="${BASE}/admin/"><span>StagePlot</span><small>Orchestre</small></a><span class="spacer"></span>` +
    orgHtml +
    (ctx ? `<span class="who" title="${esc(roleLabel(ctx.org.role))}">${who}</span><button type="button" class="btn small ghost" id="oOut">Esci</button>` : "");
  const sel = top.querySelector("#oOrg");
  if (sel) sel.onchange = () => { setCurrentOrg(sel.value); location.reload(); };
  const out = top.querySelector("#oOut");
  if (out) out.onclick = signOut;
  const tabs = document.querySelector(".nav-tabs");
  if (tabs) tabs.querySelectorAll("a").forEach((a) => { if (a.dataset.tab === active) a.setAttribute("aria-current", "page"); });
}
