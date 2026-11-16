/* Foglio stampabile INTERNO dell'organico (con i nomi) o lista dei convocati. Il numero di versione lo dà il server
   (orc_staffing_stamp): stesso organico = stessa versione, organico cambiato = versione nuova. «Cambiato rispetto a
   prima» confronta con la versione precedente. Si salva in PDF dalla stampa del browser (A4, piè «vN · data · 1 di N»). */
import { BASE } from "../config.js";
import { el, setState, errMsg, avvia } from "../ui.js";
import { requireStaff, mountTopbar } from "../auth.js";
import * as api from "../api/stampe.js";
import { get } from "../api/productions.js";
import { sezioniDaSnapshot, conteggi, differenze, listaConvocati, dataIt, pieDiPagina } from "../domain/stampe.js";

const app = document.getElementById("app");
const q = new URLSearchParams(location.search);

async function main() {
  const ctx = await requireStaff();
  if (!ctx) return;
  mountTopbar(ctx, { active: "produzioni" });
  const id = q.get("id"), kind = q.get("k") === "convocati" ? "convocati" : "organico";
  if (!id) { setState(app, "err", "Manca la produzione."); return; }
  try {
    const [p, st] = await Promise.all([get(id), api.stamp(id)]);
    if (!p) { setState(app, "err", "Produzione non trovata."); return; }
    draw(p, st, kind);
  } catch (e) { setState(app, "err", errMsg(e)); }
}

function draw(p, st, kind) {
  const pie = pieDiPagina(st.version, st.at);
  document.title = (kind === "convocati" ? "Convocati" : "Organico") + " " + p.title + " " + pie;
  app.className = "o-wrap";
  app.innerHTML = "";
  const bar = el(`<div class="s-bar no-print"><button type="button" class="btn primary" id="stampa">Stampa / Salva PDF</button><a class="btn" id="indietro">Torna alla produzione</a>
    <span class="small muted">A4, con «${pie.replace(/[<&]/g, "")} · 1 di N» in fondo. Foglio interno: ha i nomi, non va nel pacchetto per il service.</span></div>`);
  bar.querySelector("#indietro").href = BASE + "/admin/produzioni/scheda/?id=" + encodeURIComponent(p.id) + "&t=organico";
  bar.querySelector("#stampa").onclick = () => globalThis.print();
  app.appendChild(bar);
  const f = el(`<article class="s-foglio"></article>`);
  f.style.setProperty("--pie", JSON.stringify(pie));
  document.documentElement.style.setProperty("--pie", JSON.stringify(pie));
  const c = conteggi(st.snapshot);
  const h = el(`<header><h1></h1><p class="s-meta"></p></header>`);
  h.querySelector("h1").textContent = (kind === "convocati" ? "Convocati" : "Organico") + " · " + p.title;
  h.querySelector(".s-meta").textContent = [pie, p.venue || "", c.posti ? `${c.confermati} confermati su ${c.posti} posti` + (c.scoperti ? ` · ${c.scoperti} scoperti` : "") : "organico vuoto"].filter(Boolean).join(" · ");
  const int = el(`<span class="s-int">INTERNO</span>`); h.querySelector(".s-meta").prepend(int, " ");
  f.appendChild(h);
  if (kind === "organico") {
    const dif = st.previous ? differenze(st.previous.snapshot, st.snapshot) : null;
    const box = el(`<section class="s-camb"></section>`);
    if (!st.previous) box.textContent = "Prima versione dell'organico.";
    else if (!dif.length) box.textContent = `Uguale alla v${st.previous.version} del ${dataIt(st.previous.at)}.`;
    else {
      box.appendChild(el(`<b></b>`)).textContent = `Cambiato rispetto alla v${st.previous.version} del ${dataIt(st.previous.at)}:`;
      const ul = el(`<ul></ul>`); for (const d of dif) ul.appendChild(el(`<li></li>`)).textContent = d.testo; box.appendChild(ul);
    }
    f.appendChild(box);
    const sez = sezioniDaSnapshot(st.snapshot);
    if (!sez.length) f.appendChild(el(`<p class="s-vuoto">Nessun ruolo definito.</p>`));
    for (const s of sez) {
      const sec = el(`<section class="s-sez"><h2></h2><table class="s-tab"><thead><tr><th>Ruolo</th><th>Posto</th><th>Persona</th><th>Stato</th></tr></thead><tbody></tbody></table></section>`);
      sec.querySelector("h2").textContent = s.name;
      const tb = sec.querySelector("tbody");
      for (const r of s.righe) {
        const tr = el(`<tr><td></td><td></td><td></td><td></td></tr>`);
        tr.children[0].textContent = r.ruolo + (r.parte && r.parte !== "Fila" ? " · " + r.parte : "");
        tr.children[1].textContent = r.posto == null ? "" : String(r.posto);
        tr.children[2].textContent = r.persona || (r.posto == null ? "" : "da coprire");
        tr.children[3].textContent = r.posto == null ? "" : r.statoEt;
        tb.appendChild(tr);
      }
      f.appendChild(sec);
    }
  } else {
    const lista = listaConvocati(st.snapshot);
    const sec = el(`<section class="s-sez"><h2>Persone convocate</h2><table class="s-tab"><thead><tr><th>Persona</th><th>Ruolo</th><th>Sezione</th><th>Stato</th></tr></thead><tbody></tbody></table></section>`);
    const tb = sec.querySelector("tbody");
    if (!lista.length) f.appendChild(el(`<p class="s-vuoto">Nessuna persona assegnata o invitata ancora.</p>`));
    for (const r of lista) {
      const tr = el(`<tr><td></td><td></td><td></td><td></td></tr>`);
      [r.persona, r.ruolo, r.sezione, r.statoEt].forEach((t, i) => { tr.children[i].textContent = t; });
      tb.appendChild(tr);
    }
    if (lista.length) f.appendChild(sec);
  }
  app.appendChild(f);
}
avvia(main);
