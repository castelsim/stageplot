#!/usr/bin/env node
/**
 * ALLINEA LE DATE DI MODIFICA — sitemap.xml e JSON-LD, da una fonte sola: git.
 *
 * Il problema che risolve: la data di ogni pagina è scritta a mano in DUE posti — `<lastmod>` nella
 * sitemap e `dateModified` nel JSON-LD — e due fonti separate divergono sempre. Al 13/08 divergevano
 * su cinque pagine, e su una il sitemap era più NUOVO del contenuto: Google usa `lastmod` per
 * decidere quando ripassare, e quando lo trova inaffidabile smette di fidarsene per tutto il sito.
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
    const soloDate = righe.length > 0 && righe.every((l) => /dateModified|<lastmod>/.test(l));
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

const blocchi = [...sitemap.matchAll(/<url>\s*<loc>([^<]+)<\/loc>\s*<lastmod>([^<]+)<\/lastmod>/g)];
const cambi = [];

for (const [, url, lastmod] of blocchi) {
  const rel = fileDi(url);
  if (!existsSync(join(root, rel))) { cambi.push([url, "FILE MANCANTE", rel, ""]); continue; }
  const vera = dataGit(rel);
  if (!vera) continue;

  const html = readFileSync(join(root, rel), "utf8");
  const dm = (html.match(/"dateModified"\s*:\s*"([^"]+)"/) || [])[1] || null;

  if (lastmod !== vera || (dm && dm !== vera)) {
    cambi.push([url, lastmod, dm ?? "—", vera]);
    if (scrivi) {
      sitemap = sitemap.replace(
        new RegExp(`(<loc>${url.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}</loc>\\s*<lastmod>)[^<]+`),
        `$1${vera}`);
      if (dm) {
        writeFileSync(join(root, rel),
          html.replace(/("dateModified"\s*:\s*")[^"]+/g, `$1${vera}`));
      }
    }
  }
}

if (scrivi && cambi.length) writeFileSync(sitemapPath, sitemap);

console.log(`\n${cambi.length} pagine ${scrivi ? "allineate" : "da allineare"} su ${blocchi.length}\n`);
if (cambi.length) {
  console.log("pagina".padEnd(46) + "sitemap".padEnd(13) + "schema".padEnd(13) + "git");
  console.log("-".repeat(84));
  for (const [url, sm, dm, vera] of cambi)
    console.log(url.replace("https://stageplot.it", "").padEnd(46) + String(sm).padEnd(13) + String(dm).padEnd(13) + vera);
  if (!scrivi) console.log("\n(nessun file toccato: rilancia con --scrivi)");
}
