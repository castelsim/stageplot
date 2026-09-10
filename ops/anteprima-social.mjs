#!/usr/bin/env node
/* Genera preview.png (1200x630): l'immagine che Google, WhatsApp, Slack e i social mostrano
 * al posto del sito. La usano TUTTE le pagine — landing, /app/, /guida/*, /consulenza/, /stage-plot/*.
 *
 * PERCHE' ESISTE QUESTO FILE. Fino al 10/09/2026 preview.png era un PNG statico senza sorgente:
 * l'ultima volta l'aveva toccato qualcuno l'08/08. Risultato, il 10/09 l'anteprima diceva ancora
 * «Ogni canale. Ogni cavo. Ogni watt.» (slogan sostituito il 22/08), «quartetto.stageplot» (il
 * progetto d'esempio si chiama quartetto-rock) e soprattutto «8,6 kW» — il numero ELETTRICAMENTE
 * FALSO corretto nella PR #59, perche' le voci dei carichi non sommavano a quel totale. Nessuno
 * poteva tenerlo allineato: non c'era niente da modificare, solo pixel.
 *
 * Quindi l'anteprima non RIPETE i dati della landing: LI LEGGE. Titolo, promessa, nome del progetto
 * d'esempio e i suoi totali arrivano da index.html. Se domani la landing cambia lo slogan o i kW,
 * qui cambiano da soli — e finche' nessuno rigenera il PNG il presidio in test/engines.test.mjs
 * diventa rosso, perche' confronta la landing di oggi con ops/anteprima-social.json.
 *
 * Uso:  node ops/anteprima-social.mjs          → riscrive preview.png + ops/anteprima-social.json
 *       node ops/anteprima-social.mjs --html   → stampa solo l'HTML sorgente (per guardarlo nel browser)
 *
 * VINCOLO: il rendering vuole Chrome e i font di sistema di macOS (la landing usa -apple-system).
 * Girarlo altrove cambia il disegno delle lettere. Per questo il PNG sta nel repo e in CI si
 * verificano i DATI, non i pixel.
 */
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

/* ── I dati: uno solo li possiede, la landing ──────────────────────────────── */
export function datiDallaLanding(landing) {
  const scava = (re, cosa) => {
    const m = landing.match(re);
    if (!m) throw new Error(`Nella landing non trovo piu ${cosa} (${re}). L'anteprima social si genera da li: aggiorna il pescaggio invece di scrivere il valore a mano.`);
    return m;
  };

  /* Il titolo e' l'H1, spezzato dove lo spezza la pagina: «Disegna il palco.» + «in scala.» */
  const h1 = scava(/<h1[^>]*>([\s\S]*?)<\/h1>/, "l'H1")[1];
  const righe = h1.split(/<br\s*\/?>/i).map((x) => x.replace(/<[^>]*>/g, "").trim()).filter(Boolean);

  /* La promessa: la prima frase del sottotitolo dell'hero, col suo grassetto */
  const sub = scava(/<p class="sub">([\s\S]*?)<\/p>/, "il sottotitolo dell'hero")[1];
  const forte = (sub.match(/<b>([\s\S]*?)<\/b>/) || [, ""])[1].replace(/<[^>]*>/g, "").trim();
  const piano = sub.replace(/<[^>]*>/g, "").trim().slice(forte.length).replace(/^[:\s]+/, "").split(/(?<=\.)\s/)[0].trim();

  /* Il progetto d'esempio e i suoi totali, dalla barra della console interattiva */
  const progetto = scava(/<span>([\w-]+\.stageplot) — <em>esempio<\/em><\/span>/, "il nome del progetto d'esempio")[1];
  const barra = scava(/<span id="con-sum">([\s\S]*?)<\/span>/, "i totali del progetto d'esempio")[1];
  const totali = [...barra.matchAll(/<b data-n="([^"]+)">[^<]*<\/b>\s*([^<]*)/g)]
    .map((m) => ({ n: m[1], unita: m[2].replace(/[·\s]+$/, "").trim() }));

  /* Anche il marchio arriva da li: e' lo stesso SVG dell'intestazione, ingrandito */
  const logo = scava(/<a class="logo" href="\/">\s*(<svg[\s\S]*?<\/svg>)/, "il logo dell'intestazione")[1]
    .replace(/width="\d+" height="\d+"/, 'width="30" height="30"');

  return { righe, forte, piano, progetto, totali, logo };
}

/* ── La pagina: 1200x630, gli stessi colori e lo stesso carattere della landing ── */
export function paginaAnteprima(d) {
  const [prima, ...resto] = d.righe;
  const somma = d.totali.map((t) => `<b>${t.n}</b> ${t.unita}`).join(" · ");
  return `<!doctype html><html lang="it"><head><meta charset="utf-8"><style>
  *{margin:0;padding:0;box-sizing:border-box}
  html,body{width:1200px;height:630px;overflow:hidden}
  body{background:#0a0e0e;color:#e9f1ef;display:flex;align-items:center;gap:56px;padding:0 76px;
    font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;
    background-image:radial-gradient(1100px 620px at 14% 6%,rgba(20,184,166,.10),transparent 62%)}
  .sx{width:560px;flex:none}
  /* svg{width:100%} vale SOLO per il disegno del palco: applicata a tutti stirerebbe il marchio */
  .marchio{display:flex;align-items:center;gap:11px;margin-bottom:38px}
  .marchio svg{flex:none}
  .marchio span{font-size:27px;font-weight:700;letter-spacing:-.018em}
  .k{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:13px;letter-spacing:.19em;
    color:#2dd4bf;text-transform:uppercase;margin-bottom:20px}
  h1{font-size:66px;line-height:1.03;letter-spacing:-.03em;font-weight:800}
  h1 .scala{color:#2dd4bf;text-transform:uppercase;letter-spacing:.012em}
  .sub{margin-top:26px;font-size:21px;line-height:1.42;color:#8ca39e;max-width:520px}
  .sub b{color:#e9f1ef;font-weight:700}
  .url{margin-top:38px;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:21px;color:#2dd4bf}
  .dx{flex:1;background:#101616;border:1px solid #1f2a29;border-radius:16px;padding:20px 22px}
  .barra{display:flex;justify-content:space-between;align-items:baseline;gap:14px;padding-bottom:14px;
    border-bottom:1px solid #1f2a29;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;
    font-size:12.5px;color:#8ca39e;white-space:nowrap}
  .barra b{color:#e9f1ef;font-weight:600}
  .dx svg{display:block;width:100%;margin-top:16px}
</style></head><body>
  <div class="sx">
    <div class="marchio">
      ${d.logo}<span>StagePlot</span>
    </div>
    <div class="k">Stage plot · Scheda tecnica · Rider</div>
    <h1>${prima}<br><span class="scala">${resto.join(" ")}</span></h1>
    <p class="sub"><b>${d.forte}</b>${d.piano ? ": " + d.piano : ""}</p>
    <div class="url">stageplot.it</div>
  </div>
  <div class="dx">
    <div class="barra"><span>${d.progetto}</span><span>${somma}</span></div>
    <svg viewBox="0 0 420 330" role="img" aria-label="Palco in scala: batteria, amplificatori, microfoni e monitor">
      <defs><pattern id="g" width="70" height="70" patternUnits="userSpaceOnUse">
        <path d="M70 0H0v70" fill="none" stroke="#16201f" stroke-width="1"/></pattern></defs>
      <rect x="4" y="4" width="412" height="292" fill="url(#g)" stroke="#1f2a29" rx="7"/>
      <!-- amplificatori -->
      <rect x="52" y="46" width="62" height="34" rx="6" fill="none" stroke="#2dd4bf" stroke-width="2"/>
      <rect x="306" y="46" width="62" height="34" rx="6" fill="none" stroke="#2dd4bf" stroke-width="2"/>
      <!-- batteria -->
      <rect x="150" y="34" width="120" height="66" rx="8" fill="#141c1b" stroke="#2b3a38"/>
      <ellipse cx="176" cy="52" rx="15" ry="8" fill="none" stroke="#2dd4bf" stroke-width="1.6"/>
      <ellipse cx="244" cy="52" rx="15" ry="8" fill="none" stroke="#2dd4bf" stroke-width="1.6"/>
      <circle cx="210" cy="52" r="7" fill="none" stroke="#2dd4bf" stroke-width="1.6"/>
      <circle cx="210" cy="78" r="17" fill="none" stroke="#2dd4bf" stroke-width="2"/>
      <!-- il wedge del batterista -->
      <path d="M186 122h48l-8 22h-32z" fill="none" stroke="#d4a72c" stroke-width="2" stroke-linejoin="round"/>
      <!-- microfoni sulle aste -->
      ${[83, 210, 337].map((x) => `<g stroke="#2dd4bf" stroke-width="2" fill="none">
        <circle cx="${x}" cy="176" r="9"/><path d="M${x} 185v22"/></g>`).join("")}
      <!-- i tre wedge di fronte ai musicisti -->
      ${[83, 210, 337].map((x) => `<path d="M${x - 27} 240h54l-9 24h-36z" fill="none" stroke="#d4a72c" stroke-width="2" stroke-linejoin="round"/>`).join("")}
      <path d="M18 288h384" stroke="#14b8a6" stroke-width="3" stroke-linecap="round"/>
      <text x="210" y="316" text-anchor="middle" font-family="ui-monospace,monospace" font-size="12"
        fill="#5c706d" letter-spacing="2.6">PUBBLICO</text>
    </svg>
  </div>
</body></html>`;
}

/* ── Il rendering ──────────────────────────────────────────────────────────── */
if (process.argv[1] && process.argv[1].endsWith("anteprima-social.mjs")) {
  const dati = datiDallaLanding(readFileSync(join(root, "index.html"), "utf8"));
  const html = paginaAnteprima(dati);

  if (process.argv.includes("--html")) { process.stdout.write(html); process.exit(0); }

  const dir = mkdtempSync(join(tmpdir(), "anteprima-"));
  const sorgente = join(dir, "anteprima.html");
  writeFileSync(sorgente, html);
  execFileSync("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", [
    "--headless=new", "--disable-gpu", "--hide-scrollbars", "--force-device-scale-factor=1",
    "--window-size=1200,630", `--screenshot=${join(root, "preview.png")}`, `file://${sorgente}`,
  ], { stdio: "pipe" });

  /* Il patto con il presidio: ecco con quali dati e' stato disegnato il PNG che sta nel repo. */
  writeFileSync(join(root, "ops/anteprima-social.json"), JSON.stringify(dati, null, 2) + "\n");
  console.log("✓ preview.png rigenerata dalla landing:",
    dati.righe.join(" "), "·", dati.progetto, "·", dati.totali.map((t) => t.n + " " + t.unita).join(" · "));
}
