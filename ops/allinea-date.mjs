#!/usr/bin/env node
/**
 * ALLINEA LE DATE DI MODIFICA — sitemap.xml, JSON-LD e byline, da una fonte sola: git.
 *
 * Il problema che risolve: la data di ogni pagina è scritta a mano in TRE posti — `<lastmod>` nella
 * sitemap, `dateModified` nel JSON-LD e la riga «aggiornato il …» sotto il titolo — e tre fonti
 * separate divergono sempre. Al 13/08 divergevano su cinque pagine, e su una il sitemap era più
 * NUOVO del contenuto: Google usa `lastmod` per decidere quando ripassare, e quando lo trova
 * inaffidabile smette di fidarsene per tutto il sito.
 *
 * La byline è entrata il 13/08, dopo aver scoperto che su QUINDICI pagine diceva un'altra cosa
 * ancora (`come-fare-uno-stage-plot`: schema 13/08, byline 28/06; le 11 formazioni ferme a luglio).
 * È la data più esposta delle tre — la leggono il visitatore e le AI che citano la pagina — ed era
 * l'unica che nessuno controllava.
 *
 * La fonte diventa `git log -1` sul file: non è un'opinione, è quando la pagina è cambiata davvero.
 *
 * Uso:
 *   node ops/allinea-date.mjs            → dice cosa cambierebbe, senza toccare niente
 *   node ops/allinea-date.mjs --scrivi   → applica
 *
 * NOTA sul giorno dopo: applicando le modifiche si crea un commit che tocca i file. Se contassimo
 * anche quello, alla prossima esecuzione ogni pagina risulterebbe «cambiata oggi» per colpa
 * dell'esecuzione precedente — una rincorsa senza fine. Per questo `dataGit` salta i commit che su
 * quel file hanno toccato SOLO le date: dopo aver allineato, rieseguire dice zero.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const scrivi = process.argv.includes("--scrivi");

/**
 * Ultima modifica VERA del file secondo git, in AAAA-MM-GG.
 *
 * Salta i commit che su quel file hanno cambiato soltanto la data: sono i commit di questo stesso
 * strumento, e contarli farebbe rincorrere la coda — ogni esecuzione sposterebbe la data a «oggi»
 * per via dell'esecuzione precedente, all'infinito. La data giusta è quella dell'ultima modifica
 * di CONTENUTO.
 */
function dataGit(rel) {
  const storia = execFileSync("git", ["log", "-12", "--format=%H %cs", "--", rel], { cwd: root })
    .toString().trim().split("\n").filter(Boolean);
  for (const riga of storia) {
    const [hash, data] = riga.split(" ");
    let diff = "";
    try {
      diff = execFileSync("git", ["show", "--format=", "--unified=0", hash, "--", rel], { cwd: root })
        .toString();
    } catch { return data; }
    const righe = diff.split("\n").filter((l) => /^[+-]/.test(l) && !/^(\+\+\+|---)/.test(l));
    /* La riga della byline porta con sé anche il testo che le sta intorno («A cura di…»): se un
       commit cambiasse quel testo E la data insieme, verrebbe scambiato per un commit di sole date.
       L'errore è dalla parte giusta — al più la pagina tiene una data un po' più vecchia — mentre
       ignorare la byline qui farebbe rincorrere la coda a ogni esecuzione. */
    const soloDate = righe.length > 0 && righe.every((l) => /dateModified|<lastmod>|aggiornat[oa] (?:il |l')\d{2}\/\d{2}\/\d{4}/.test(l));
    if (!soloDate) return data;          /* questo commit ha toccato il contenuto: è la data buona */
  }
  return (storia[0] || "").split(" ")[1] || null;
}

const sitemapPath = join(root, "sitemap.xml");
let sitemap = readFileSync(sitemapPath, "utf8");

/** dall'URL pubblico al file su disco */
const fileDi = (url) => {
  const p = url.replace("https://stageplot.it/", "");
  return p === "" ? "index.html" : p.replace(/\/$/, "") + "/index.html";
};

/**
 * La byline nella lingua in cui è scritta: «aggiornato il 16/07/2026», ma «aggiornato l'11/08/2026».
 * L'articolo si elide davanti a otto e undici — le uniche due cifre del mese che cominciano per
 * vocale — ed è così che sono scritte a mano le pagine già in produzione.
 */
const bylineIt = (iso) => {
  const [a, m, g] = iso.split("-");
  return `${g === "08" || g === "11" ? "l'" : "il "}${g}/${m}/${a}`;
};
/* Solo dentro `<p class="byline">`: nel corpo delle guide ci sono altre frasi con una data
   («rider aggiornato al 03/08/2026») che non c'entrano con la modifica della pagina. E l'articolo
   sta DENTRO il gruppo catturato, non fuori: confrontando la sola data, una pagina con la data
   giusta e l'articolo sbagliato («il 11/08») risultava a posto e restava com'era. */
const RE_BYLINE = /(<p class="byline">[\s\S]{0,400}?aggiornat[oa] )((?:il |l')\d{2}\/\d{2}\/\d{4})/;

const blocchi = [...sitemap.matchAll(/<url>\s*<loc>([^<]+)<\/loc>\s*<lastmod>([^<]+)<\/lastmod>/g)];
const cambi = [];

for (const [, url, lastmod] of blocchi) {
  const rel = fileDi(url);
  if (!existsSync(join(root, rel))) { cambi.push([url, "FILE MANCANTE", rel, "", ""]); continue; }
  const vera = dataGit(rel);
  if (!vera) continue;

  const html = readFileSync(join(root, rel), "utf8");
  const dm = (html.match(/"dateModified"\s*:\s*"([^"]+)"/) || [])[1] || null;
  const by = (html.match(RE_BYLINE) || [])[2] || null;      /* «il GG/MM/AAAA», come la legge il visitatore */
  const byAttesa = bylineIt(vera);

  if (lastmod !== vera || (dm && dm !== vera) || (by && by !== byAttesa)) {
    cambi.push([url, lastmod, dm ?? "—", by ?? "—", vera]);
    if (scrivi) {
      sitemap = sitemap.replace(
        new RegExp(`(<loc>${url.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}</loc>\\s*<lastmod>)[^<]+`),
        `$1${vera}`);
      if (dm || by) {
        let out = html;
        if (dm) out = out.replace(/("dateModified"\s*:\s*")[^"]+/g, `$1${vera}`);
        if (by) out = out.replace(RE_BYLINE, `$1${bylineIt(vera)}`);
        writeFileSync(join(root, rel), out);
      }
    }
  }
}

if (scrivi && cambi.length) writeFileSync(sitemapPath, sitemap);

console.log(`\n${cambi.length} pagine ${scrivi ? "allineate" : "da allineare"} su ${blocchi.length}\n`);
if (cambi.length) {
  console.log("pagina".padEnd(46) + "sitemap".padEnd(13) + "schema".padEnd(13) + "byline".padEnd(16) + "git");
  console.log("-".repeat(100));
  for (const [url, sm, dm, by, vera] of cambi)
    console.log(url.replace("https://stageplot.it", "").padEnd(46) + String(sm).padEnd(13) + String(dm).padEnd(13) + String(by).padEnd(16) + vera);
  if (!scrivi) console.log("\n(nessun file toccato: rilancia con --scrivi)");
}
