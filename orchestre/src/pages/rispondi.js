/* La risposta del musicista a una convocazione: dal link con token, senza account, in due tocchi.
   Parla solo con la Edge Function orc-respond (niente supabase-js, niente policy anonime). */
import { SB_URL } from "../config.js";
import { esc, el, setState, fmtDateTime, fmtDate } from "../ui.js";
import { DATE_KIND } from "../domain/staffing.js";

const FN = SB_URL + "/functions/v1/orc-respond";
const app = document.getElementById("app");
const token = new URLSearchParams(location.search).get("t") || "";
let D = null, answer = null;
const partial = {};

function api(method, body) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 20000);
  return fetch(FN + "?t=" + encodeURIComponent(token), { method, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined, signal: ctl.signal })
    .then(async (r) => { clearTimeout(t); let d = null; try { d = await r.json(); } catch { /* corpo vuoto */ } return { ok: r.ok, status: r.status, d }; });
}

function timeOf(iso) { const d = new Date(iso); return isNaN(d) ? "" : d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" }); }
function dateLine(d) {
  const end = d.ends_at ? (fmtDate(d.ends_at) === fmtDate(d.starts_at) ? " → " + timeOf(d.ends_at) : " → " + fmtDateTime(d.ends_at)) : "";
  return `${DATE_KIND[d.kind] || d.kind} · ${fmtDateTime(d.starts_at)}${end}` + (d.venue ? " · " + d.venue : "") + (d.note ? " (" + d.note + ")" : "");
}

async function main() {
  if (!token) return denied("Questo link non è completo. Apri quello che hai ricevuto per email.");
  let r;
  try { r = await api("GET"); } catch { return denied("Non riesco a raggiungere il server. Controlla la connessione e riprova."); }
  if (!r.ok) return denied(r.d?.message || "Questo link non è valido.");
  D = r.d;
  answer = D.status === "available" ? "yes" : D.status === "unavailable" ? "no" : D.status === "partial" ? "partial" : null;
  for (const d of D.dates) if (typeof d.available === "boolean") partial[d.id] = d.available;
  paint();
}

function denied(msg) {
  app.innerHTML = `<h1>Convocazione</h1>`;
  const d = el(`<div class="err"></div>`); d.textContent = msg; app.appendChild(d);
}

function paint() {
  const p = D.production, ro = D.role;
  app.innerHTML = "";
  app.appendChild(el(`<p class="small muted">${esc(D.organization)}</p>`));
  app.appendChild(el(`<h1>${esc(p.title)}</h1>`));
  const lead = el(`<p class="lead"></p>`);
  lead.textContent = `Ciao ${D.musician.first_name}, ti proponiamo un posto come ${ro.name}.`;
  app.appendChild(lead);
  const info = el(`<section class="card"><ul class="plain" id="dl"></ul></section>`);
  const ul = info.querySelector("#dl");
  for (const d of D.dates) { const li = document.createElement("li"); li.textContent = dateLine(d); ul.appendChild(li); }
  if (!D.dates.length) ul.appendChild(el(`<li class="muted">Date da definire.</li>`));
  const extra = [];
  if (p.conductor) extra.push(["Direzione", p.conductor]);
  if (p.venue) extra.push(["Luogo", [p.venue, p.address].filter(Boolean).join(", ")]);
  if (p.fee_note) extra.push(["Compenso", p.fee_note]);
  if (p.dress_code) extra.push(["Dress code", p.dress_code]);
  if (p.conditions) extra.push(["Condizioni", p.conditions]);
  if (ro.notes) extra.push(["Il ruolo", ro.notes]);
  if (D.note_admin) extra.push(["Nota", D.note_admin]);
  for (const [k, v] of extra) { const pp = el(`<p class="small"><b></b> <span></span></p>`); pp.querySelector("b").textContent = k + ":"; pp.querySelector("span").textContent = v; info.appendChild(pp); }
  if (D.deadline) info.appendChild(el(`<p class="small muted">Rispondi entro ${esc(fmtDateTime(D.deadline))}.</p>`));
  app.appendChild(info);

  if (D.mode === "expired") { const b = el(`<div class="banner"></div>`); b.textContent = "La scadenza per rispondere è passata. Se sei ancora disponibile, scrivi a chi ti ha invitato."; app.appendChild(b); return; }
  if (D.mode === "locked") { const b = el(`<div class="banner ok"></div>`); b.textContent = D.status === "confirmed" ? "Confermato: ci sei. Per qualunque cambiamento scrivi a chi ti ha invitato." : "Sei in riserva: ti avvisiamo se si libera un posto."; app.appendChild(b); return; }

  const box = el(`<section class="card answer"><h3>Ci sei?</h3><div class="stack">
    <button type="button" class="btn primary big" data-a="yes">Sì, sono disponibile</button>
    <button type="button" class="btn big" data-a="partial">Solo per alcune date</button>
    <button type="button" class="btn big" data-a="no">No, non posso</button></div>
    <div id="dates" hidden></div>
    <div class="field"><label for="note">Una nota, se serve</label><textarea id="note" rows="3" maxlength="1000" placeholder="es. arrivo alle prove con mezz'ora di ritardo"></textarea></div>
    <button type="button" class="btn primary block" id="send" disabled>Invia la risposta</button>
    <p class="small muted" id="hint"></p></section>`);
  box.querySelector("#note").value = D.note || "";
  const datesBox = box.querySelector("#dates");
  for (const d of D.dates) {
    const row = el(`<div class="date-row"><span class="grow"></span><div class="seg"><button type="button" class="btn small" data-v="1">Ci sono</button><button type="button" class="btn small" data-v="0">No</button></div></div>`);
    row.querySelector(".grow").textContent = dateLine(d);
    const [b1, b0] = row.querySelectorAll("button");
    const refresh = () => { b1.classList.toggle("primary", partial[d.id] === true); b0.classList.toggle("danger", partial[d.id] === false); };
    b1.onclick = () => { partial[d.id] = true; refresh(); update(); }; b0.onclick = () => { partial[d.id] = false; refresh(); update(); };
    refresh(); datesBox.appendChild(row);
  }
  const btns = [...box.querySelectorAll("[data-a]")];
  const update = () => {
    for (const b of btns) { b.classList.toggle("primary", b.dataset.a === answer); b.classList.toggle("danger", b.dataset.a === "no" && answer === "no"); }
    datesBox.hidden = answer !== "partial";
    const complete = answer === "yes" || answer === "no" || (answer === "partial" && D.dates.every((d) => typeof partial[d.id] === "boolean"));
    box.querySelector("#send").disabled = !complete;
    box.querySelector("#hint").textContent = answer === "partial" && !complete ? "Segna ogni data." : (D.responded_at ? "Hai già risposto il " + fmtDateTime(D.responded_at) + ": puoi cambiare fino alla scadenza." : "");
  };
  for (const b of btns) b.onclick = () => { answer = b.dataset.a; update(); };
  update();
  box.querySelector("#send").onclick = async () => {
    const send = box.querySelector("#send"); send.disabled = true; send.textContent = "Invio…";
    const body = { answer, note: box.querySelector("#note").value.trim() };
    if (answer === "partial") body.dates = D.dates.map((d) => ({ id: d.id, available: !!partial[d.id] }));
    try {
      const r = await api("POST", body);
      if (!r.ok) { send.disabled = false; send.textContent = "Invia la risposta"; return alert(r.d?.message || "Non sono riuscito a registrare la risposta. Riprova."); }
      app.innerHTML = "";
      app.appendChild(el(`<h1>Grazie${esc(D.musician.first_name ? ", " + D.musician.first_name : "")}.</h1>`));
      const ok = el(`<div class="banner ok"></div>`);
      ok.textContent = r.d.status === "available" ? "Risposta registrata: ci sei. Ti confermeranno il posto." : r.d.status === "unavailable" ? "Risposta registrata: non ci sei. Grazie per averlo detto subito." : "Risposta registrata: ci sei solo per alcune date. Decideranno loro e ti diranno.";
      app.appendChild(ok);
      const again = el(`<p class="small muted">Puoi cambiare la risposta fino alla scadenza riaprendo questo link.</p>`);
      app.appendChild(again);
    } catch { send.disabled = false; send.textContent = "Invia la risposta"; alert("Sei offline: riprova quando torna la connessione."); }
  };
  app.appendChild(box);
}

setState(null, "");
main();
