/* Il pool dei musicisti: ricerca immediata, filtri per famiglia e stato, lista a card. */
import { BASE } from "../config.js";
import { esc, el, setState, errMsg, toast, confirm } from "../ui.js";
import { requireStaff, mountTopbar } from "../auth.js";
import { tabs, STATUS, STATUS_PILL, FAMILY } from "../nav.js";
import { list } from "../api/musicians.js";
import { createInvite, listInvites, revokeInvite } from "../api/invites.js";
import { INVITE_PILL, INVITE_STATUS, inviteLink, inviteMessage, scadenza } from "../domain/invites.js";

const app = document.getElementById("app");
let ctx = null, all = [];
const F = { q: "", family: "", status: "" };

function norm(s) { return String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, ""); }

async function main() {
  ctx = await requireStaff();
  if (!ctx) return;
  mountTopbar(ctx, { active: "musicisti" });
  app.className = "o-wrap";
  app.innerHTML = tabs("musicisti") + `
    <div class="row"><h1>Musicisti</h1><span class="spacer"></span>
      <button type="button" class="btn" id="invita">Invita con un link</button>
      <a class="btn" href="${BASE}/admin/musicisti/importa/">Importa CSV</a>
      <a class="btn primary" href="${BASE}/admin/musicisti/scheda/?new=1">Aggiungi</a></div>
    <div id="inviti"></div>
    <div class="filters">
      <div class="field"><label for="q">Cerca</label><input id="q" type="search" placeholder="Nome, strumento, città, tag" autocomplete="off"></div>
      <div class="field"><label for="fam">Famiglia</label><select id="fam"><option value="">Tutte</option>${Object.entries(FAMILY).map(([k, v]) => `<option value="${k}">${v}</option>`).join("")}</select></div>
      <div class="field"><label for="st">Stato</label><select id="st"><option value="">Tutti</option>${Object.entries(STATUS).map(([k, v]) => `<option value="${k}">${v}</option>`).join("")}</select></div>
    </div>
    <p class="small muted" id="count"></p>
    <ul class="list" id="list"><li class="loading">Un attimo…</li></ul>`;
  try {
    const q = new URLSearchParams(location.search);
    F.q = q.get("q") || ""; F.family = q.get("fam") || ""; F.status = q.get("st") || "";
    app.querySelector("#q").value = F.q; app.querySelector("#fam").value = F.family; app.querySelector("#st").value = F.status;
  } catch { /* parametri assenti */ }
  app.querySelector("#invita").onclick = () => dialogoInvito();
  paintInviti();
  app.querySelector("#q").oninput = (e) => { F.q = e.target.value; paint(); };
  app.querySelector("#fam").onchange = (e) => { F.family = e.target.value; paint(); };
  app.querySelector("#st").onchange = (e) => { F.status = e.target.value; paint(); };
  try {
    all = await list(ctx.org.org_id);
    paint();
  } catch (e) {
    const ul = app.querySelector("#list"); ul.innerHTML = ""; setState(ul, "err", errMsg(e));
  }
}

function paint() {
  const ul = app.querySelector("#list");
  const q = norm(F.q);
  const rows = all.filter((m) => {
    if (F.family && m.primary_family !== F.family) return false;
    if (F.status && m.status !== F.status) return false;
    if (!q) return true;
    const hay = norm([m.first_name, m.last_name, m.city, m.province, ...(m.instruments || []), ...(m.tags || [])].join(" "));
    return q.split(/\s+/).every((w) => hay.includes(w));
  });
  const p = new URLSearchParams(); if (F.q) p.set("q", F.q); if (F.family) p.set("fam", F.family); if (F.status) p.set("st", F.status);
  history.replaceState(null, "", location.pathname + (p.toString() ? "?" + p : ""));
  app.querySelector("#count").textContent = rows.length === all.length
    ? (all.length === 1 ? "1 musicista" : all.length + " musicisti")
    : rows.length + " su " + all.length;
  ul.innerHTML = "";
  if (!all.length) { ul.appendChild(el(`<li class="empty">Il pool è vuoto. Aggiungi un musicista o importa un CSV.</li>`)); return; }
  if (!rows.length) { ul.appendChild(el(`<li class="empty">Nessun musicista con questi filtri.</li>`)); return; }
  for (const m of rows) {
    const li = el(`<li class="list-item"><a class="grow" href="${BASE}/admin/musicisti/scheda/?id=${esc(m.id)}">
      <div class="title"></div><div class="sub"></div></a><div class="actions"></div></li>`);
    li.querySelector(".title").textContent = m.last_name + " " + m.first_name;
    li.querySelector(".sub").textContent = [m.primary_instrument || "senza strumento", (m.instruments || []).slice(1).length ? "+ " + m.instruments.slice(1).join(", ") : "", [m.city, m.province].filter(Boolean).join(" ")].filter(Boolean).join(" · ");
    const act = li.querySelector(".actions");
    for (const t of (m.tags || []).slice(0, 3)) { const s = el(`<span class="pill"></span>`); s.textContent = t; act.appendChild(s); }
    if (m.status !== "active") act.appendChild(el(`<span class="pill ${STATUS_PILL[m.status] || ""}">${esc(STATUS[m.status] || m.status)}</span>`));
    ul.appendChild(li);
  }
}

main();


/* ------------------------------------------------------------------ inviti personali

   Il link lo si manda a una persona che si è già scelta: chi arriva da lì, appena manda il profilo, è
   dentro — nessuna valutazione, perché la fiducia gliela si è data invitandolo. Il segreto del link
   esiste solo qui, in questa finestra: al database va l'impronta. Chi lo perde ne fa un altro. */
async function paintInviti() {
  const box = app.querySelector("#inviti");
  if (!box) return;
  let inviti = [];
  try { inviti = await listInvites(ctx.org.org_id); } catch { return; }
  const vivi = inviti.filter((i) => i.status === "open" || i.status === "claimed");
  box.innerHTML = "";
  if (!vivi.length) return;
  const card = el(`<section class="card"><div class="row"><h3>Inviti in corso</h3><span class="spacer"></span><span class="pill accent">${vivi.length}</span></div><ul class="list compact" id="invl"></ul></section>`);
  const ul = card.querySelector("#invl");
  for (const i of vivi) {
    const li = el(`<li class="list-item"><div class="grow"><div class="title"></div><div class="sub"></div></div><div class="actions"></div></li>`);
    li.querySelector(".title").textContent = i.label || i.email || "Invito senza nome";
    li.querySelector(".sub").textContent = [INVITE_STATUS[i.status], scadenza(i.expires_at), i.email && i.label ? i.email : ""].filter(Boolean).join(" · ");
    const act = li.querySelector(".actions");
    act.appendChild(el(`<span class="pill ${INVITE_PILL[i.status] || ""}">${esc(INVITE_STATUS[i.status] || i.status)}</span>`));
    const rev = el(`<button type="button" class="btn small ghost">Revoca</button>`);
    rev.onclick = async () => {
      const yes = await confirm({ title: "Revocare l'invito?", text: "Il link smette di funzionare. Se la persona lo ha già aperto ma non ha ancora mandato il profilo, dovrà ricominciare con un link nuovo.", ok: "Revoca", danger: true });
      if (!yes) return;
      try { await revokeInvite(i.id); toast("Invito revocato."); paintInviti(); } catch (e) { toast(errMsg(e), { err: true }); }
    };
    act.appendChild(rev);
    ul.appendChild(li);
  }
  box.appendChild(card);
}

function dialogoInvito() {
  const ov = el(`<div class="modal-ov" role="dialog" aria-modal="true" aria-labelledby="invT"><div class="modal">
    <h2 id="invT">Invita un musicista</h2>
    <p class="muted">Gli mandi un link: entra con Google, compila il profilo e da quel momento è fra i tuoi musicisti. Nessuna valutazione da fare: lo hai scelto tu.</p>
    <div class="field"><label for="invNome">Chi stai invitando</label><input id="invNome" type="text" placeholder="es. Anna Bianchi, violino" autocomplete="off"><span class="hint">Serve solo a te per ritrovare l'invito: lui non lo vede.</span></div>
    <div class="field"><label for="invMail">Email</label><input id="invMail" type="email" placeholder="facoltativa" autocomplete="off"><span class="hint">Non manda niente: è un promemoria di dove hai spedito il link.</span></div>
    <div class="actions"><button type="button" class="btn ghost" id="invNo">Annulla</button><button type="button" class="btn primary" id="invOk">Crea il link</button></div>
  </div></div>`);
  document.body.appendChild(ov);
  const close = () => ov.remove();
  ov.querySelector("#invNo").onclick = close;
  ov.addEventListener("click", (e) => { if (e.target === ov) close(); });
  ov.querySelector("#invOk").onclick = async () => {
    const b = ov.querySelector("#invOk");
    b.disabled = true; b.textContent = "Creo…";
    try {
      const { token } = await createInvite(ctx.org.org_id, { label: ov.querySelector("#invNome").value.trim(), email: ov.querySelector("#invMail").value.trim() });
      mostraLink(ov, token, ov.querySelector("#invNome").value.trim());
      paintInviti();
    } catch (e) { b.disabled = false; b.textContent = "Crea il link"; toast(errMsg(e), { err: true }); }
  };
}

function mostraLink(ov, token, nome) {
  const link = inviteLink(token, location.origin);
  const msg = inviteMessage(ctx.org.org_name, link, nome);
  const box = ov.querySelector(".modal");
  box.innerHTML = "";
  box.appendChild(el(`<h2>Il link è pronto</h2>`));
  const avviso = el(`<p class="muted"></p>`);
  avviso.textContent = "Copialo adesso: per sicurezza non viene salvato da nessuna parte e non si può rivedere. Se lo perdi, ne fai un altro.";
  box.appendChild(avviso);
  const campo = el(`<textarea rows="4" readonly class="mono link-box"></textarea>`);   /* il link intero, senza scorrere */
  campo.value = link;
  box.appendChild(campo);
  const az = el(`<div class="row"></div>`);
  const copia = (testo, etichetta, b) => {
    navigator.clipboard.writeText(testo).then(() => { b.textContent = "Copiato ✓"; setTimeout(() => { b.textContent = etichetta; }, 2000); },
      () => { campo.value = testo; campo.select(); toast("Seleziona e copia a mano.", { err: true }); });
  };
  const b1 = el(`<button type="button" class="btn primary">Copia il link</button>`);
  b1.onclick = () => copia(link, "Copia il link", b1);
  const b2 = el(`<button type="button" class="btn">Copia il messaggio</button>`);
  b2.onclick = () => copia(msg, "Copia il messaggio", b2);
  az.appendChild(b1); az.appendChild(b2);
  box.appendChild(az);
  const wa = el(`<p><a class="btn block" target="_blank" rel="noopener">Mandalo su WhatsApp</a></p>`);
  wa.querySelector("a").href = "https://wa.me/?text=" + encodeURIComponent(msg);
  box.appendChild(wa);
  const chiudi = el(`<div class="actions"><button type="button" class="btn ghost">Ho copiato, chiudi</button></div>`);
  chiudi.querySelector("button").onclick = () => ov.remove();
  box.appendChild(chiudi);
}
