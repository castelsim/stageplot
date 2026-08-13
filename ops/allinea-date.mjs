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
 * NOTA sul giorno dopo: applicando le modifiche si crea un commit, quindi da quel momento il file
 * risulta cambiato «oggi» mentre la data scritta dentro è di ieri. È inevitabile e innocuo: il test
 * tollera uno scarto, e quello che conta — le due fonti che dicono la stessa cosa — resta vero.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const scrivi = process.argv.includes("--scrivi");

/** ultima modifica del file secondo git, in AAAA-MM-GG */
function dataGit(rel) {
  const out = execFileSync("git", ["log", "-1", "--format=%cs", "--", rel], { cwd: root })
    .toString().trim();
  return out || null;
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
