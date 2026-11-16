/* Interfaccia della cascata di riserve e delle squadre tipo (lotto Q, 16/11/2026).
   Tre pezzi, agganciati alla scheda produzione con poche righe:
     · cascataRuolo()  — nella scheda Convocazioni, per ogni ruolo: «Chiama il prossimo» (un tocco, sempre a mano) e la lista in ordine (chiusa di serie);
     · matchingLista() — nel Matching: «Metti in lista» e «Usa l'ordine della proposta»;
     · squadreCard()   — nell'Organico: squadre tipo (chiusa di serie, regola 13/11).
   Niente parte da solo: un'email esce SOLO quando lo staff preme «Chiama il prossimo», e per un solo nome. */
import { esc, el, toast, confirm, errMsg } from "../ui.js";
import * as casc from "../api/cascata.js";
import * as inv from "../api/invitations.js";
import { TEMPLATES } from "../domain/staffing.js";
import { prossimo, quanteDaChiamare, sposta, inCima, togli, aggiungi, daMatching, testoChiama, statoEtichetta, statoPill } from "../domain/cascata.js";

/* -------------------------------------------------------------- «Chiama il prossimo» */
/* Un invito vero per una persona, con l'orc_invite di sempre: stesso link, stessa email, stessa storia.
   La nota è quella dell'ultimo invito di questo ruolo, così il testo aggiuntivo non cambia da una chiamata all'altra. */
export async function chiamaProssimo({ p, role, lista, ultimaNota = "", dopo }) {
  const prox = prossimo(lista);
  if (!prox) return toast("Nessuno da chiamare in lista.", { err: true });
  try {
    const n = await inv.invite(p.id, role.id, [prox.musician_id], { deadline: null, note: ultimaNota || "", runId: null });
    if (!n) {
      toast(prox.musician_name + " non si può convocare adesso (ha scelto di non ricevere proposte o ha già un invito). Toglilo dalla lista o spostalo in fondo.", { err: true });
    } else {
      const esito = inv.esitoEmail(await inv.notifyNow(p.id));
      toast("Chiamato " + prox.musician_name + ". " + esito);
    }
    if (dopo) await dopo();
  } catch (e) { toast(errMsg(e), { err: true }); }
}

/* -------------------------------------------------------------- Convocazioni: un ruolo */
/* Restituisce { bottone, dettagli }: il bottone sta nella riga del titolo (solo se c'è un posto scoperto e qualcuno da chiamare),
   i dettagli sotto la lista degli inviti, chiusi di serie. */
export function cascataRuolo({ p, role, open, lista, ultimaNota, pool, dopo }) {
  const prox = open > 0 ? prossimo(lista) : null;
  let bottone = null;
  if (prox) {
    bottone = el(`<button type="button" class="btn small primary" data-x="prossimo"></button>`);
    bottone.textContent = testoChiama(prox);
    bottone.title = "Manda l'invito a questa persona e a nessun altro. Non parte niente da solo.";
    bottone.onclick = async () => { bottone.disabled = true; await chiamaProssimo({ p, role, lista, ultimaNota, dopo }); };
  }
  const da = quanteDaChiamare(lista);
  const dettagli = el(`<details class="cascata avanzate"><summary class="small"></summary><div class="cascata-body"></div></details>`);
  dettagli.querySelector("summary").textContent = lista.length
    ? "Riserve in ordine: " + lista.length + " in lista, " + da + (da === 1 ? " da chiamare" : " da chiamare")
    : "Riserve in ordine: nessuna lista";
  const body = dettagli.querySelector(".cascata-body");
  body.appendChild(el(`<p class="small muted">Chi viene chiamato per primo se qualcuno rifiuta. Mettere qualcuno in lista non gli manda niente: l'invito parte solo con «Chiama il prossimo».</p>`));
  const ids = lista.map((r) => r.musician_id);
  const salva = async (nuovi, msg) => { try { await casc.set(role.id, nuovi, "manual"); if (msg) toast(msg); await dopo(); } catch (e) { toast(errMsg(e), { err: true }); } };
  if (lista.length) {
    const ul = el(`<ol class="list compact cascata-list"></ol>`);
    lista.forEach((r, i) => {
      const li = el(`<li class="list-item"><span class="rank"></span><div class="grow"><div class="title"></div></div><div class="actions"></div></li>`);
      li.querySelector(".rank").textContent = i + 1;
      li.querySelector(".title").textContent = r.musician_name;
      const act = li.querySelector(".actions");
      act.appendChild(el(`<span class="pill ${statoPill(r.state)}">${esc(statoEtichetta(r.state))}</span>`));
      const b = (txt, tit, fn, dis) => { const x = el(`<button type="button" class="btn small ghost" title="${esc(tit)}" aria-label="${esc(tit)} ${esc(r.musician_name)}">${txt}</button>`); x.disabled = !!dis; x.onclick = fn; act.appendChild(x); };
      b("↑", "Sposta su", () => salva(sposta(ids, r.musician_id, -1)), i === 0);
      b("↓", "Sposta giù", () => salva(sposta(ids, r.musician_id, 1)), i === lista.length - 1);
      if (i > 0) b("In cima", "Metti per primo", () => salva(inCima(ids, r.musician_id)));
      b("Togli", "Togli dalla lista", () => salva(togli(ids, r.musician_id)));
      ul.appendChild(li);
    });
    body.appendChild(ul);
  }
  const scelta = pool.filter((m) => !ids.includes(m.id) && m.status !== "archived" && m.status !== "suspended");
  const stessi = scelta.filter((m) => !role.instrument_name || (m.instruments || []).includes(role.instrument_name));
  const altri = scelta.filter((m) => !stessi.includes(m));
  const add = el(`<div class="form-row"><div class="field"><label>Aggiungi in fondo alla lista</label><select><option value="">Scegli…</option>
    ${stessi.length ? `<optgroup label="Con lo strumento">${stessi.map((m) => `<option value="${m.id}">${esc(m.last_name + " " + m.first_name)}</option>`).join("")}</optgroup>` : ""}
    ${altri.length ? `<optgroup label="Altri">${altri.map((m) => `<option value="${m.id}">${esc(m.last_name + " " + m.first_name)}</option>`).join("")}</optgroup>` : ""}
    </select></div><button type="button" class="btn small">Aggiungi</button></div>`);
  add.querySelector("button").onclick = () => { const v = add.querySelector("select").value; if (v) salva(aggiungi(ids, [v]), "Aggiunto in fondo."); };
  body.appendChild(add);
  if (!lista.length) body.appendChild(el(`<p class="small muted">Per riempirla in un colpo: dal Matching «Usa l'ordine della proposta», oppure importa una squadra tipo dalla scheda Organico.</p>`));
  return { bottone, dettagli };
}

/* -------------------------------------------------------------- Matching */
/* Due pulsanti nella barra: aggiungere gli spuntati in fondo alla lista (nell'ordine mostrato), o usare l'ordine della proposta
   per tutti gli idonei. Nessun invito: è solo la lista. */
export function matchingLista({ bar, productionId, roleId, ordinati, selezione, dopo }) {
  const aggiungiSel = el(`<button type="button" class="btn" id="toList" disabled>Metti in lista</button>`);
  const tutti = el(`<button type="button" class="btn ghost" id="toListAll" title="Tutti gli idonei, nell'ordine della proposta">Usa l'ordine della proposta</button>`);
  aggiungiSel.title = "Aggiunge gli spuntati in fondo alla lista di riserve di questo ruolo. Non manda niente.";
  const attuale = async () => (await casc.list(productionId)).filter((x) => x.role_id === roleId).sort((a, b) => a.pos - b.pos).map((x) => x.musician_id);
  aggiungiSel.onclick = async () => {
    try {
      const sel = ordinati.filter((r) => selezione.has(r.musician_id)).map((r) => r.musician_id);
      const nuova = aggiungi(await attuale(), sel);
      await casc.set(roleId, nuova, "manual");
      toast(sel.length + (sel.length === 1 ? " persona messa" : " persone messe") + " in lista (" + nuova.length + " in tutto). Non è partito nessun invito.");
      if (dopo) dopo();
    } catch (e) { toast(errMsg(e), { err: true }); }
  };
  tutti.onclick = async () => {
    try {
      const ids = daMatching(ordinati);
      if (!ids.length) return toast("Nessun idoneo da mettere in lista.", { err: true });
      const prima = await attuale();
      if (prima.length) {
        const yes = await confirm({ title: "Sostituire la lista di riserve?", text: "Ora ci sono " + prima.length + " persone in lista: verranno rimpiazzate dai " + ids.length + " idonei nell'ordine della proposta.", ok: "Sostituisci" });
        if (!yes) return;
      }
      await casc.set(roleId, ids, "matching");
      toast(ids.length + " idonei in lista, nell'ordine della proposta. Non è partito nessun invito.");
      if (dopo) dopo();
    } catch (e) { toast(errMsg(e), { err: true }); }
  };
  const spacer = bar.querySelector(".spacer");
  bar.insertBefore(tutti, spacer.nextSibling); bar.insertBefore(aggiungiSel, spacer.nextSibling);
  return { aggiorna: (n) => { aggiungiSel.disabled = !n; } };
}

/* -------------------------------------------------------------- Organico: squadre tipo */
function chiediNome({ titolo, testo = "", valore = "", modello = false, ok = "Salva" }) {
  return new Promise((resolve) => {
    const ov = el(`<div class="modal-ov" role="dialog" aria-modal="true"><div class="modal"><h2></h2><p class="muted small"></p>
      <div class="field"><label for="sqNome">Nome</label><input id="sqNome" maxlength="80"></div>
      ${modello ? `<div class="field"><label for="sqMod">Modello di organico (facoltativo)</label><select id="sqMod"><option value="">Nessuno</option>${Object.entries(TEMPLATES).map(([k, t]) => `<option value="${esc(k)}">${esc(t.name)}</option>`).join("")}</select></div>` : ""}
      <div class="actions"><button type="button" class="btn" data-x="0">Annulla</button><button type="button" class="btn primary" data-x="1"></button></div></div></div>`);
    ov.querySelector("h2").textContent = titolo; ov.querySelector("p").textContent = testo; ov.querySelector("#sqNome").value = valore; ov.querySelector("[data-x='1']").textContent = ok;
    const done = (v) => { ov.remove(); document.removeEventListener("keydown", onKey); resolve(v); };
    const onKey = (e) => { if (e.key === "Escape") done(null); };
    ov.querySelector("[data-x='0']").onclick = () => done(null);
    ov.querySelector("[data-x='1']").onclick = () => { const nome = ov.querySelector("#sqNome").value.trim(); if (!nome) return toast("Serve un nome.", { err: true }); done({ nome, modello: modello ? ov.querySelector("#sqMod").value : "" }); };
    ov.addEventListener("click", (e) => { if (e.target === ov) done(null); });
    document.addEventListener("keydown", onKey); document.body.appendChild(ov); ov.querySelector("#sqNome").focus();
  });
}

/* Chiusa di serie come le altre funzioni avanzate: la apre chi serve, e solo allora carica l'elenco. */
export function squadreCard({ p, orgId, dopo }) {
  const d = el(`<details class="card avanzate" id="squadre"><summary><b>Squadre tipo</b> <span class="small muted">chi si chiama di solito, per ruolo</span></summary><div class="squadre-body"><div class="loading">Un attimo…</div></div></details>`);
  let caricata = false;
  const body = d.querySelector(".squadre-body");
  const carica = async () => {
    body.innerHTML = "";
    let elenco;
    try { elenco = await casc.teams(orgId); } catch (e) { body.appendChild(el(`<div class="err"></div>`)).textContent = errMsg(e); return; }
    body.appendChild(el(`<p class="small muted">Una squadra tipo è una lista ordinata di musicisti per ruolo (violini, flauti…), da riusare quando il formato torna. Importarla riempie le liste di riserve dei ruoli con lo stesso nome (o lo stesso strumento); non manda nessun invito.</p>`));
    const salva = el(`<p><button type="button" class="btn">Salva questa produzione come squadra tipo</button></p>`);
    salva.querySelector("button").onclick = async () => {
      const r = await chiediNome({ titolo: "Salva come squadra tipo", testo: "Per ogni ruolo: prima i confermati, poi la lista di riserve, poi chi è stato invitato. Gli archiviati restano fuori.", valore: p.title || "", modello: true });
      if (!r) return;
      try { await casc.saveTeam(p.id, r.nome, r.modello); toast("Squadra salvata."); await carica(); } catch (e) { toast(errMsg(e), { err: true }); }
    };
    body.appendChild(salva);
    if (!elenco.length) { body.appendChild(el(`<div class="empty">Nessuna squadra tipo ancora.</div>`)); return; }
    const ul = el(`<ul class="list compact"></ul>`);
    for (const t of elenco) {
      const li = el(`<li class="list-item"><div class="grow"><div class="title"></div><div class="sub"></div></div><div class="actions"></div></li>`);
      li.querySelector(".title").textContent = t.name;
      li.querySelector(".sub").textContent = [Number(t.roles) + (Number(t.roles) === 1 ? " ruolo" : " ruoli"), Number(t.people) + (Number(t.people) === 1 ? " persona" : " persone"), TEMPLATES[t.template_key] ? "modello: " + TEMPLATES[t.template_key].name : ""].filter(Boolean).join(" · ");
      const act = li.querySelector(".actions");
      const b = (txt, cls, fn) => { const x = el(`<button type="button" class="btn small ${cls}">${txt}</button>`); x.onclick = fn; act.appendChild(x); };
      b("Importa", "primary", async () => {
        const yes = await confirm({ title: "Importare «" + t.name + "» in questa produzione?", text: "Le liste di riserve dei ruoli abbinati vengono sostituite. Gli inviti già partiti non cambiano e non parte niente.", ok: "Importa" });
        if (!yes) return;
        try { const n = await casc.applyTeam(t.id, p.id); toast(n ? n + (n === 1 ? " ruolo riempito" : " ruoli riempiti") + ". Le liste sono nella scheda Convocazioni." : "Nessun ruolo abbinato: i nomi dei ruoli sono diversi."); if (dopo) dopo(); } catch (e) { toast(errMsg(e), { err: true }); }
      });
      b("Rinomina", "ghost", async () => { const r = await chiediNome({ titolo: "Rinomina la squadra", valore: t.name, ok: "Rinomina" }); if (!r) return; try { await casc.renameTeam(t.id, r.nome); await carica(); } catch (e) { toast(errMsg(e), { err: true }); } });
      b("Duplica", "ghost", async () => { const r = await chiediNome({ titolo: "Duplica la squadra", valore: t.name + " (copia)", ok: "Duplica" }); if (!r) return; try { await casc.duplicateTeam(t.id, r.nome); await carica(); } catch (e) { toast(errMsg(e), { err: true }); } });
      b("Cancella", "danger", async () => { const yes = await confirm({ title: "Cancellare «" + t.name + "»?", text: "Le liste già importate nelle produzioni restano.", ok: "Cancella", danger: true }); if (!yes) return; try { await casc.deleteTeam(t.id); await carica(); } catch (e) { toast(errMsg(e), { err: true }); } });
      ul.appendChild(li);
    }
    body.appendChild(ul);
  };
  d.addEventListener("toggle", () => { if (d.open && !caricata) { caricata = true; carica(); } });
  return d;
}
