/* Import del pool da CSV: scegli il file (o incolla il testo), vedi l'anteprima e gli errori,
   conferma. L'upsert è per email dentro l'organizzazione; lo fa una RPC in una transazione. */
import { BASE } from "../config.js";
import { esc, el, toast, confirm, errMsg } from "../ui.js";
import { requireStaff, mountTopbar } from "../auth.js";
import { tabs } from "../nav.js";
import { csvToRows } from "../domain/csv.js";
import { catalogs, importRows } from "../api/musicians.js";

const app = document.getElementById("app");
let ctx = null, cat = null, parsed = { rows: [], errors: [] };

async function main() {
  ctx = await requireStaff();
  if (!ctx) return;
  mountTopbar(ctx, { active: "musicisti" });
  app.className = "o-wrap";
  app.innerHTML = tabs("musicisti") + `
    <p class="small"><a class="back" href="${BASE}/admin/musicisti/">← Musicisti</a></p>
    <h1>Importa musicisti</h1>
    <p class="muted">Un file CSV con una riga per musicista. Chi ha già la stessa email nell'organizzazione viene aggiornato, non duplicato.</p>
    <section class="card">
      <h3>Il formato</h3>
      <p class="small">Intestazioni: <code>nome, cognome, email, telefono, citta, provincia, area, auto, km_max, trasferte, tournee, stato, strumenti, competenze, repertorio, tag, note</code>. Solo nome e cognome sono obbligatori.</p>
      <p class="small">Liste separate da «;». Strumenti <code>violino:5:principale;viola:3:doubling</code> (codice:livello). Competenze <code>click:2;in_ear:3</code>. Repertorio <code>composer:Ennio Morricone:history;program:Pooh in sinfonia</code>. Sì/no: <code>si</code> o <code>no</code>.</p>
      <p class="row"><a class="btn small" href="${BASE}/demo/musicisti-demo.csv" download>Scarica un esempio (40 musicisti inventati)</a>
        <button type="button" class="btn small ghost" id="codes">Codici di strumenti e competenze</button></p>
      <div id="codesBox" hidden></div>
    </section>
    <section class="card">
      <div class="field"><label for="file">File CSV</label><input id="file" type="file" accept=".csv,text/csv"></div>
      <div class="field"><label for="txt">Oppure incolla qui il testo</label><textarea id="txt" rows="6" placeholder="nome,cognome,email,…"></textarea></div>
      <button type="button" class="btn" id="preview">Controlla</button>
    </section>
    <section id="out"></section>`;
  cat = await catalogs();
  app.querySelector("#codes").onclick = () => {
    const box = app.querySelector("#codesBox");
    box.hidden = !box.hidden;
    if (box.hidden || box.childElementCount) return;
    box.innerHTML = `<p class="small"><b>Strumenti</b>: ${cat.instruments.map((i) => `<code>${esc(i.code)}</code>`).join(" ")}</p>
      <p class="small"><b>Competenze</b>: ${cat.skills.map((s) => `<code>${esc(s.code)}</code>`).join(" ")}</p>`;
  };
  app.querySelector("#file").onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    app.querySelector("#txt").value = await f.text();
    check();
  };
  app.querySelector("#preview").onclick = check;
}

function check() {
  const text = app.querySelector("#txt").value;
  parsed = csvToRows(text, { instruments: new Set(cat.instruments.map((i) => i.code)), skills: new Set(cat.skills.map((s) => s.code)) });
  const out = app.querySelector("#out");
  out.innerHTML = "";
  if (!text.trim()) { out.appendChild(el(`<div class="empty">Scegli un file o incolla il testo.</div>`)); return; }
  if (parsed.errors.length) {
    const b = el(`<div class="banner"><b>${parsed.errors.length === 1 ? "Un problema" : parsed.errors.length + " problemi"}</b><ul class="small"></ul></div>`);
    for (const e of parsed.errors.slice(0, 30)) { const li = document.createElement("li"); li.textContent = e; b.querySelector("ul").appendChild(li); }
    out.appendChild(b);
  }
  if (!parsed.rows.length) { out.appendChild(el(`<div class="empty">Nessuna riga importabile.</div>`)); return; }
  const card = el(`<section class="card"><h3>${parsed.rows.length === 1 ? "1 musicista pronto" : parsed.rows.length + " musicisti pronti"}</h3>
    <div class="table-wrap"><table class="table"><thead><tr><th>Nome</th><th>Email</th><th>Strumenti</th><th>Repertorio</th><th>Tag</th></tr></thead><tbody></tbody></table></div>
    <p class="row"><button type="button" class="btn primary" id="go">Importa</button><span class="small muted">${parsed.errors.length ? "Le parti segnalate restano fuori; il resto della riga entra." : ""}</span></p></section>`);
  const tb = card.querySelector("tbody");
  for (const r of parsed.rows.slice(0, 200)) {
    const tr = el(`<tr><td></td><td class="small"></td><td class="small"></td><td class="small"></td><td class="small"></td></tr>`);
    tr.children[0].textContent = r.last_name + " " + r.first_name;
    tr.children[1].textContent = r.email;
    tr.children[2].textContent = r.instruments.map((x) => x.code + (x.level ? " " + x.level : "")).join(", ");
    tr.children[3].textContent = r.repertoire.map((x) => x.name).join(", ");
    tr.children[4].textContent = r.tags.join(", ");
    tb.appendChild(tr);
  }
  card.querySelector("#go").onclick = async () => {
    const yes = await confirm({ title: "Importare " + parsed.rows.length + " musicisti?", text: "Chi ha la stessa email viene aggiornato; strumenti, competenze, repertorio e tag della riga sostituiscono quelli esistenti.", ok: "Importa" });
    if (!yes) return;
    const btn = card.querySelector("#go"); btn.disabled = true; btn.textContent = "Importo…";
    try {
      const res = await importRows(ctx.org.org_id, parsed.rows);
      const msg = `${res.new} nuovi, ${res.updated} aggiornati` + (res.errors ? `, ${res.errors} scartati` : "");
      out.innerHTML = "";
      const ok = el(`<div class="banner ok"></div>`); ok.textContent = "Fatto: " + msg + ".";
      out.appendChild(ok);
      if (res.details && res.details.length) {
        const ul = el(`<ul class="small muted"></ul>`);
        for (const d of res.details) { const li = document.createElement("li"); li.textContent = d.row + ": " + d.error; ul.appendChild(li); }
        out.appendChild(ul);
      }
      out.appendChild(el(`<p><a class="btn primary" href="${BASE}/admin/musicisti/">Vai al pool</a></p>`));
      toast("Import completato.");
    } catch (e) { btn.disabled = false; btn.textContent = "Importa"; toast(errMsg(e), { err: true }); }
  };
  out.appendChild(card);
}

main();
