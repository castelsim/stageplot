/* La scorciatoia nel browser vero (Chromium e WebKit): 404.html rimanda all'indirizzo canonico. node prova-404.mjs */
import { chromium, webkit, avviaSito, contesto, COMPUTER, TELEFONO, esito } from "./comune.mjs";
const E = esito(), sito = await avviaSito();
for (const [nome, motore] of [["Chromium", chromium], ["WebKit", webkit]]) for (const [t, tipo] of [["computer", COMPUTER], ["telefono", TELEFONO]]) {
  const b = await motore.launch(), ctx = await contesto(b, tipo), p = await ctx.newPage();
  await p.goto(sito.url + "/biglietteria/Teatro-Prova/Concerto-9-Ottobre/?x=1");
  await p.waitForURL(/\?o=/, { timeout: 5000 }).catch(() => {});
  E.ok(p.url() === sito.url + "/biglietteria/?o=teatro-prova&s=concerto-9-ottobre&x=1", `${nome} ${t}: scorciatoia → ${p.url()}`);
  await p.goto(sito.url + "/biglietteria/gestionx/a/b");
  E.ok((await p.textContent("h1")) === "Pagina non trovata", `${nome} ${t}: tre livelli restano «non trovata»`);
  await b.close();
}
sito.chiudi(); E.fine();
