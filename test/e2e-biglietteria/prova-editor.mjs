/* «Vai alla biglietteria» nell'editor (task 18): Chromium e WebKit, computer e telefono. Dati inventati, stack locale,
   rete esterna bloccata, accesso con sessione iniettata. Prima: WT=<worktree> REF=lavoro DEST=<cartella> ./prepara.sh
   Poi: WT=<worktree> SITO=<cartella> node prova-editor.mjs */
import { chromium, webkit, avviaSito, contesto, http, utente, TELEFONO, COMPUTER, sorveglia, esito, P } from "./comune.mjs";
import { mkdirSync } from "node:fs";
const SITO = process.env.SITO || P + "/sito", OUT = process.env.OUT || P + "/out";
mkdirSync(OUT, { recursive: true });
const E = esito(), errori = [], S = Date.now().toString(36), sito = await avviaSito(SITO);
let giro = 0;
for (const [nm, motore] of [["chromium", chromium], ["webkit", webkit]]) for (const [t, tipo] of [["computer", COMPUTER], ["telefono", TELEFONO]]) {
  const chi = `${nm} ${t}`; giro++;
  const org = await utente(`ed-${S}-${giro}@example.invalid`), no = await utente(`edno-${S}-${giro}@example.invalid`);
  await http("/rest/v1/bgl_organizzatori?on_conflict=user_id", { user_id: org.user.id, abilitato: true }, { extra: { Prefer: "resolution=merge-duplicates" } });
  for (const [u, abilitato] of [[org, true], [no, false]]) {
    const br = await motore.launch(), ctx = await contesto(br, tipo, { sessione: u });
    await ctx.addInitScript(() => { try { localStorage.setItem("sp_welcome", "1"); localStorage.setItem("sp_onboarded", "1"); localStorage.setItem("sp_tour_done", "1"); } catch (e) { /* niente */ } });
    const p = await ctx.newPage(); sorveglia(p, chi, errori);
    await p.goto(`${sito.url}/app/?v=${Date.now()}`);
    await p.waitForFunction(() => window.__bglCloud && window.__bglCloud.utente && window.__bglCloud.utente(), null, { timeout: 20000 });
    /* una platea di 12 posti GIÀ numerati, selezionata: la card «Posti del pubblico» mostra il pulsante */
    await p.evaluate(() => {
      const items = []; ["A", "B"].forEach((f, r) => { for (let k = 0; k < 6; k++) items.push({ id: "c" + f + k, type: "sediapubblico", x: 200 + 60 * k,
        y: 1100 + 90 * r, rot: 180, w: 50, d: 53, fila: f, posto: k + 1, settore: "Platea", label: "Fila " + f + " · " + (k + 1), labelMode: "hidden" }); });
      loadDoc({ _v: SCHEMA_VERSION, titolo: "Sala di prova", items, inputs: [], outputs: [] });
      state.stage = { w: 1000, d: 800, blocks: [{ x: 100, y: 0, w: 1000, d: 800 }] };
      save(); render();
      document.querySelectorAll(".modal").forEach((m) => { if (m.id === "stageSize" || m.id === "welcome") { m.hidden = true; m.style.display = "none"; } });
      selectMany(state.items.map((i) => i.id)); renderProps();
    });
    await p.waitForTimeout(1500);   /* la risposta di bgl_abilitato */
    const vis = await p.evaluate(() => { const b = document.getElementById("bGrpPostiPren"); return b && b.style.display !== "none" ? b.textContent : null; });
    if (t === "telefono") await p.evaluate(() => { document.body.classList.add("props-expanded"); const g = document.getElementById("bGrpPostiPren"); if (g) g.scrollIntoView({ block: "center" }); });   /* il pannello del telefono nasce chiuso */
    if (abilitato) await p.screenshot({ path: `${OUT}/t18-${nm}-${t}-editor.png` });   /* per le anteprime: la card col pulsante */
    E.ok(abilitato ? vis === "Vai alla biglietteria" : vis === null, `${chi}: pulsante ${abilitato ? "visibile all'abilitato" : "nascosto a chi non lo è"} (${vis})`);
    if (abilitato) {
      await p.click("#bGrpPostiPren");
      await p.waitForSelector("#guideDlg");
      E.ok(/Salva il progetto online/.test(await p.textContent("#guideDlg")), chi + ": progetto non ancora online → «Salva il progetto online»");
      const [nuova] = await Promise.all([ctx.waitForEvent("page", { timeout: 20000 }).catch(() => null), p.click("#guideDlg .btn.primary")]);
      const area = nuova || p;
      await area.waitForURL(/\/biglietteria\/gestione\/\?/, { timeout: 20000 });
      const pid = new URL(area.url()).searchParams.get("p");   /* ?p= resta anche quando l'area passa a ?v=nuovo&p= */
      const proj = await http(`/rest/v1/stageplot_projects?id=eq.${pid}&select=user_id`, null, { method: "GET" });
      E.ok(Array.isArray(proj.d) && proj.d.length === 1 && proj.d[0].user_id === org.user.id, chi + ": salvato online e aperto con ?p= del progetto");
      await area.waitForSelector("#gst-pv, #gst-progetto", { timeout: 15000 });
      E.ok(true, chi + ": l'area si apre (prima volta o Nuovo spettacolo con la sala scelta)");
      /* seconda volta: il progetto è già online, il pulsante salva in silenzio e apre l'area senza finestre */
      const [seconda] = await Promise.all([ctx.waitForEvent("page", { timeout: 20000 }).catch(() => null), p.click("#bGrpPostiPren")]);
      const area2 = seconda || p;
      await area2.waitForURL(/\/biglietteria\/gestione\/\?/, { timeout: 20000 });
      E.ok(new URL(area2.url()).searchParams.get("p") === pid, chi + ": la seconda volta apre subito l'area, stesso progetto");
    }
    await br.close();
  }
}
sito.chiudi();
E.ok(errori.filter((x) => !/supabase|realtime/i.test(x)).length === 0, "nessun errore in console: " + errori.slice(0, 3).join(" | "));
E.fine();
