/* L-C (27/11/2026): la ricerca del catalogo nel browser vero, con le parole delle ricerche senza risultato. FUORI dalla CI.
   Uso: node test/e2e-esporta/ricerca.mjs [cartella-per-gli-screenshot] */
import { chromium, pagina, VISTE } from "./comune.mjs";
const out = process.argv[2] || ""; let falliti = 0; const ok = (c, m) => { console.log((c ? "✓ " : "✗ ") + m); if (!c) falliti++; };
const CASI = [["parled", "PAR LED"], ["movig he", "Testa mobile"], ["controbass", "Contrabbasso"], ["centralina", "Console luci"], ["gradino", "Scala accesso"], ["sm58", "Asta microfono"], ["espo", "Esporta"], ["duplica", "Nuova versione"]];
const b = await chromium.launch();
for (const [nome, dark] of [["hd", false], ["iphone", false], ["iphone", true]]) {
  const { ctx, p } = await pagina(b, VISTE[nome], { dark }); const et = nome + (dark ? "-scuro" : "");
  if (dark) await p.evaluate(() => document.body.classList.add("dark"));
  if (nome === "iphone") { await p.click('[data-dock="add"]'); await p.waitForTimeout(500); }   /* sul telefono la ricerca sta nel pannello «Aggiungi» del dock */
  const sel = await p.evaluate(() => { const c = [...document.querySelectorAll("input")].find((i) => /cerca/i.test(i.placeholder || "") && i.offsetParent); return c ? (c.id ? "#" + c.id : null) : null; });
  if (!sel) { ok(false, et + ": campo di ricerca non trovato"); await ctx.close(); continue; }
  for (const [q, atteso] of CASI) {
    await p.fill(sel, ""); await p.fill(sel, q); await p.waitForTimeout(250);
    const testo = await p.evaluate(() => document.body.innerText);
    ok(testo.includes(atteso) && !/Nessun elemento trovato/.test(testo), et + ": «" + q + "» → " + atteso);
    if (out && q === "parled") await p.screenshot({ path: out + "/ricerca-" + et + ".png" });
  }
  await p.fill(sel, "akg"); await p.waitForTimeout(250);
  ok(/Nessun elemento trovato/.test(await p.evaluate(() => document.body.innerText)), et + ": «akg» resta «Nessun elemento trovato» (lacuna di catalogo, non finta)");
  const errV = p.__err.filter((m) => !/ERR_FAILED/.test(m)); ok(errV.length === 0, et + ": nessun errore nella pagina " + errV.slice(0, 2).join(" | "));
  await ctx.close();
}
await b.close(); console.log(falliti ? "✗ " + falliti + " falliti" : "✓ tutto ok"); process.exit(falliti ? 1 : 0);
