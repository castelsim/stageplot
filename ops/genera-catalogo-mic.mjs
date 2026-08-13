#!/usr/bin/env node
/**
 * GENERA /guida/microfoni/ DAL CATALOGO VERO.
 *
 * Perché generata e non scritta a mano: il numero di microfoni è già stato dichiarato sbagliato una
 * volta (155 in pagina, 223 nel programma) proprio perché la pagina e il catalogo erano due cose
 * separate. Qui la pagina NASCE da `MIC_DB`: quando il catalogo cresce si rilancia questo script e
 * la pagina è di nuovo vera. Un test verifica che le due cose coincidano.
 *
 * Uso:  node ops/genera-catalogo-mic.mjs [--scrivi]
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import vm from "node:vm";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const scrivi = process.argv.includes("--scrivi");

/* --- il catalogo, letto dal programma vero --------------------------------------------------- */
const app = readFileSync(join(root, "app.js"), "utf8");
const inizio = app.indexOf("var MIC_DB = {");
const fine = app.indexOf("};", app.indexOf("Object.keys(MIC_DB)") - 400);
const ctx = {};
vm.createContext(ctx);
vm.runInContext(app.slice(inizio, fine + 2) + "\nglobalThis.__db = MIC_DB;", ctx);
const voci = Object.entries(ctx.__db).map(([chiave, v]) => ({ chiave, ...v }));

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const marche = [...new Set(voci.map((v) => v.brand))].sort((a, b) =>
  voci.filter((x) => x.brand === b).length - voci.filter((x) => x.brand === a).length || a.localeCompare(b));

const conPhantom = voci.filter((v) => v.p48).length;
const nastri = voci.filter((v) => v.type === "nastro");
const oggi = new Date().toISOString().slice(0, 10);
const dataIt = new Date().toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" });

/* --- le righe della tabella, una per microfono ----------------------------------------------- */
const righe = marche.map((m) => {
  const dellaMarca = voci.filter((v) => v.brand === m)
    .sort((a, b) => a.model.localeCompare(b.model, "it", { numeric: true }));
  return `      <tr class="marca"><th colspan="6" scope="colgroup">${esc(m)} <span>${dellaMarca.length}</span></th></tr>\n` +
    dellaMarca.map((v) => `      <tr data-cerca="${esc((v.brand + " " + v.model + " " + (v.alias || "") + " " + v.uso).toLowerCase())}" data-p48="${v.p48 ? 1 : 0}" data-tipo="${esc(v.type)}">
        <td><strong>${esc(v.model)}</strong></td>
        <td>${esc(v.type)}${v.caps ? ` <span class="sott">${esc(v.caps)}</span>` : ""}</td>
        <td>${esc(v.pol)}</td>
        <td class="c">${v.p48 ? '<span class="si">48 V</span>' : '<span class="no">no</span>'}</td>
        <td>${esc(v.stand)}</td>
        <td class="uso">${esc(v.uso)}</td>
      </tr>`).join("\n");
}).join("\n");

/* --- i dati strutturati: un elenco, non un articolo ------------------------------------------ */
const ld = {
  "@context": "https://schema.org",
  "@graph": [
    { "@type": "BreadcrumbList", itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: "https://stageplot.it/" },
      { "@type": "ListItem", position: 2, name: "Guida", item: "https://stageplot.it/guida/" },
      { "@type": "ListItem", position: 3, name: "Microfoni riconosciuti", item: "https://stageplot.it/guida/microfoni/" },
    ]},
    { "@type": "Dataset",
      "@id": "https://stageplot.it/guida/microfoni/#catalogo",
      name: `Catalogo dei microfoni per il live: ${voci.length} modelli con tipo, polare, phantom e asta`,
      description: `Tabella di ${voci.length} microfoni di ${marche.length} marche usati negli spettacoli dal vivo, con tipo (dinamico, condensatore, nastro), diagramma polare, necessità di alimentazione phantom e asta consigliata. I valori sono presi dalle schede tecniche dei costruttori.`,
      inLanguage: "it", isAccessibleForFree: true, dateModified: oggi,
      creator: { "@id": "https://simonecastellan.com/#person" },
      publisher: { "@id": "https://stageplot.it/#org" },
      variableMeasured: ["tipo", "diagramma polare", "alimentazione phantom", "asta consigliata", "uso tipico"],
    },
    { "@type": "FAQPage", mainEntity: [
      { "@type": "Question", name: "Quali microfoni hanno bisogno del phantom a 48 V?",
        acceptedAnswer: { "@type": "Answer", text: `I microfoni a condensatore: in questo catalogo sono ${conPhantom} su ${voci.length}. I dinamici non ne hanno bisogno e non si danneggiano se lo ricevono. I microfoni a nastro passivi invece non vanno mai alimentati: il phantom può danneggiarli.` } },
      { "@type": "Question", name: "Che differenza c'è tra microfono dinamico e a condensatore?",
        acceptedAnswer: { "@type": "Answer", text: "Il dinamico non richiede alimentazione, regge pressioni sonore alte ed è più robusto: è la scelta abituale per voce dal vivo, rullante e amplificatori. Il condensatore è più sensibile e dettagliato, richiede il phantom a 48 V ed è preferito per panoramici, strumenti acustici e hi-hat." } },
      { "@type": "Question", name: "Cosa significa il diagramma polare di un microfono?",
        acceptedAnswer: { "@type": "Answer", text: "È la direzione da cui il microfono raccoglie il suono. Cardioide riprende davanti e rifiuta dietro, supercardioide è più stretto ma riapre un lobo posteriore, omnidirezionale raccoglie da tutte le direzioni, figura di 8 davanti e dietro ma non ai lati. Dal vivo il polare decide quanto rientro di palco finisce nel canale." } },
    ]},
  ],
};

/* --- la pagina ------------------------------------------------------------------------------- */
const html = `<!doctype html>
<html lang="it">
<head>
  <meta charset="utf-8">
  <!-- CSP difesa in profondità (audit S3): pagina statica, solo risorse self. -->
  <meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; object-src 'none'; base-uri 'self'; form-action 'self'">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Microfoni per il live: ${voci.length} modelli a confronto | StagePlot</title>
  <!-- description: sotto i 160 caratteri o Google la tronca — c'è un test che lo verifica -->
  <meta name="description" content="Tabella di ${voci.length} microfoni per il live: tipo, diagramma polare, phantom 48 V e asta consigliata, dalle schede dei costruttori. Cercabile e gratuita.">
  <meta name="author" content="Simone Castellan">
  <meta name="robots" content="index,follow,max-image-preview:large">
  <link rel="canonical" href="https://stageplot.it/guida/microfoni/">
  <meta property="og:type" content="article">
  <meta property="og:locale" content="it_IT">
  <meta property="og:title" content="Microfoni per il live: ${voci.length} modelli a confronto">
  <meta property="og:description" content="Tipo, polare, phantom e asta consigliata per ${voci.length} microfoni di ${marche.length} marche, dalle schede dei costruttori.">
  <meta property="og:url" content="https://stageplot.it/guida/microfoni/">
  <meta property="og:image" content="https://stageplot.it/preview.png?v=3">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:image:alt" content="Esempio di stage plot in scala creato con StagePlot">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="Microfoni per il live: ${voci.length} modelli a confronto">
  <meta name="twitter:description" content="Tipo, polare, phantom e asta consigliata, dalle schede dei costruttori.">
  <meta name="twitter:image" content="https://stageplot.it/preview.png?v=3">
  <meta name="theme-color" content="#101820">
  <link rel="icon" href="/favicon.svg" type="image/svg+xml">
  <link rel="apple-touch-icon" href="/favicon.svg">
  <link rel="manifest" href="/manifest.webmanifest">
  <link rel="stylesheet" href="/guida/style.css">
  <script type="application/ld+json">
${JSON.stringify(ld, null, 2)}
  </script>
  <style>
    .mic-cerca{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin:22px 0 6px}
    .mic-cerca input{flex:1;min-width:220px;padding:11px 14px;border:1px solid #d8d2c6;border-radius:10px;font:inherit;background:#fffdf8}
    .mic-cerca button{padding:9px 15px;border:1px solid #d8d2c6;border-radius:999px;background:#fffdf8;font:inherit;font-size:14px;cursor:pointer}
    .mic-cerca button[aria-pressed="true"]{background:#101820;color:#fff;border-color:#101820}
    .mic-conta{font-size:14px;color:#5b6675;margin:4px 0 14px}
    .mic-tab{width:100%;border-collapse:collapse;font-size:14.5px}
    .mic-tab th{text-align:left;padding:9px 10px;border-bottom:1px solid #e6e1d8;font-size:12.5px;text-transform:uppercase;letter-spacing:.05em;color:#5b6675}
    .mic-tab td{padding:9px 10px;border-bottom:1px solid #efece4;vertical-align:top}
    .mic-tab tr.marca th{background:#f4f1ea;font-size:14px;text-transform:none;letter-spacing:0;color:#101820;padding-top:14px}
    .mic-tab tr.marca th span{color:#8a9099;font-weight:400}
    .mic-tab td.c{text-align:center;white-space:nowrap}
    .mic-tab .si{color:#0d6a5e;font-weight:600}
    .mic-tab .no{color:#8a9099}
    .mic-tab .uso{color:#5b6675}
    .mic-tab .sott{display:block;font-size:12.5px;color:#8a9099}
    .mic-wrap{overflow-x:auto;-webkit-overflow-scrolling:touch}
    @media(max-width:700px){ .mic-tab{font-size:13.5px} .mic-tab td,.mic-tab th{padding:8px 7px} }
    .mic-vuoto{padding:20px;color:#5b6675}
  </style>
</head>
<body>
  <header class="topbar">
    <a class="brand" href="/"><span class="mark">SP</span><span>StagePlot</span></a>
    <nav class="nav">
      <a href="/app/">Tool gratuito</a>
      <a href="/guida/">Guida</a>
      <a href="/consulenza/">Consulenza</a>
    </nav>
    <a class="btn primary" href="/app/">Apri l'editor</a>
  </header>

  <main>
    <nav class="crumbs" aria-label="Breadcrumb">
      <a href="/">Home</a> › <a href="/guida/">Guida</a> › Microfoni
    </nav>

    <h1>I ${voci.length} microfoni riconosciuti da StagePlot</h1>
    <p class="lead">Tipo, diagramma polare, alimentazione phantom e asta consigliata per ${voci.length} modelli di ${marche.length} marche. Sono gli stessi che l'editor riconosce quando dichiari il microfono su un canale: da lì nascono la colonna «48 V» della channel list e l'asta nella lista aste.</p>
    <p class="byline"><span class="dot"></span>A cura di <strong>Simone Castellan</strong>, sound engineer per spettacoli dal vivo · aggiornato il ${dataIt}</p>

    <p>Ogni valore di questa tabella è preso dalla <strong>scheda tecnica del costruttore</strong>, non da un forum o dalla memoria: dove i produttori pubblicano manuali diversi per lo stesso modello, vale l'ultima <em>user guide</em> ufficiale. Serve a rispondere in fretta alle domande che ci si fa mentre si prepara un palco — questo vuole il phantom? con che asta lo monto? quanto rientro mi porta dietro? — e a compilare una <a href="/guida/channel-list-input-list/">channel list</a> senza tirare a indovinare. ${conPhantom} dei ${voci.length} modelli richiedono alimentazione phantom a 48 V; gli altri ${voci.length - conPhantom} no.</p>

    <div class="mic-cerca">
      <input type="search" id="micQ" placeholder="Cerca: SM58, rullante, nastro, overhead…" aria-label="Cerca fra i microfoni">
      <button type="button" class="filtro" data-f="p48" aria-pressed="false">Solo phantom 48 V</button>
      <button type="button" class="filtro" data-f="dinamico" aria-pressed="false">Solo dinamici</button>
      <button type="button" class="filtro" data-f="condensatore" aria-pressed="false">Solo condensatori</button>
    </div>
    <p class="mic-conta" id="micConta">${voci.length} microfoni</p>

    <div class="mic-wrap">
      <table class="mic-tab" id="micTab">
        <thead><tr><th>Modello</th><th>Tipo</th><th>Polare</th><th>48 V</th><th>Asta</th><th>Uso tipico</th></tr></thead>
        <tbody>
${righe}
        </tbody>
      </table>
      <p class="mic-vuoto" id="micVuoto" hidden>Nessun microfono corrisponde alla ricerca.</p>
    </div>

    <h2>Il phantom sui microfoni a nastro</h2>
    <p>È l'unico punto di questa tabella in cui sbagliare costa un microfono. I ${nastri.length} modelli a nastro elencati qui${nastri.length ? ` — ${nastri.slice(0, 4).map((n) => esc(n.brand + " " + n.model)).join(", ")}${nastri.length > 4 ? " e altri" : ""} —` : ""} sono passivi: <strong>non vanno alimentati</strong>. Il phantom a 48 V su un nastro passivo, soprattutto se il cavo è difettoso o lo si inserisce a canale aperto, può deformare o rompere il nastro. Nella channel list vanno segnati esplicitamente come «no 48 V», e sul banco conviene tenere il phantom di quel canale disattivato per tutta la serata.</p>

    <h2>Come leggere il diagramma polare</h2>
    <p>Il polare dice da dove il microfono raccoglie, e dal vivo decide quanto degli altri strumenti finisce nel canale. <strong>Cardioide</strong> riprende davanti e rifiuta dietro: è la scelta abituale per la voce, perché il monitor sta proprio lì dietro. <strong>Supercardioide</strong> è più stretto davanti ma riapre un lobo posteriore, quindi il wedge va spostato di lato. <strong>Omnidirezionale</strong> raccoglie da tutte le direzioni: ottimo per il suono d'insieme, difficile da gestire con l'impianto acceso. <strong>Figura di 8</strong> prende davanti e dietro e rifiuta ai lati, ed è il motivo per cui i nastri si usano volentieri sugli ottoni.</p>

    <div class="cta-box">
      <p><strong>Questi microfoni sono già dentro l'editor.</strong> Quando ne dichiari uno su un canale, la channel list si compila da sola con phantom e asta.</p>
      <p><a class="btn primary" href="/app/?model=band&amp;from=catalogo-mic">Apri un palco di esempio</a></p>
    </div>

    <div class="related">
      <h2>Guide correlate</h2>
      <div class="cards">
        <a href="/guida/channel-list-input-list/"><strong>Channel list e input list</strong><span>Come si numerano e si compilano</span></a>
        <a href="/guida/rider-tecnico/"><strong>Rider tecnico</strong><span>Cos'è e cosa deve contenere</span></a>
        <a href="/guida/scheda-tecnica-band/"><strong>Scheda tecnica della band</strong><span>Passo per passo, con esempio</span></a>
      </div>
    </div>

  <aside class="author-card">
    <p class="ac-name">Simone Castellan <span>· sound engineer</span></p>
    <p class="ac-bio">Fonico per spettacoli dal vivo e gestore di uno studio di registrazione certificato Dolby Atmos. Cura registrazione e mix di produzioni orchestrali sinfoniche con oltre 70 eventi dal vivo l'anno; docente di elettroacustica. Ha creato StagePlot per dare a musicisti e tecnici uno strumento gratuito e in scala reale.</p>
    <p class="ac-link"><a href="https://simonecastellan.com" rel="author noopener" target="_blank">simonecastellan.com</a></p>
  </aside>
  </main>

  <footer>
    <div class="inner">
      <p><a href="/app/">Tool gratuito</a> · <a href="/stage-plot/">Stage plot</a> · <a href="/guida/">Guida</a> · <a href="/consulenza/">Consulenza</a> · <a href="/privacy/">Privacy</a> · <a href="/termini/">Termini</a> · <a href="https://www.instagram.com/stageplot.it/" target="_blank" rel="me noopener">Instagram</a></p>
      <p>Guida a cura di Simone Castellan — sound engineer per spettacoli dal vivo. © 2026 StagePlot.</p>
    </div>
  </footer>

<script>
/* Ricerca e filtri: tutto in pagina, nessuna richiesta di rete. Chi ha JavaScript spento vede
   comunque la tabella intera — è il motivo per cui le righe sono nell'HTML e non caricate dopo. */
(function(){
  var q = document.getElementById('micQ'), tab = document.getElementById('micTab');
  var conta = document.getElementById('micConta'), vuoto = document.getElementById('micVuoto');
  var righe = [].slice.call(tab.querySelectorAll('tbody tr:not(.marca)'));
  var marche = [].slice.call(tab.querySelectorAll('tbody tr.marca'));
  var filtri = [].slice.call(document.querySelectorAll('.filtro'));
  var attivo = null;

  function aggiorna(){
    var testo = (q.value || '').trim().toLowerCase();
    var visibili = 0;
    righe.forEach(function(r){
      var ok = !testo || r.dataset.cerca.indexOf(testo) > -1;
      if (ok && attivo === 'p48') ok = r.dataset.p48 === '1';
      else if (ok && attivo) ok = r.dataset.tipo === attivo;
      r.hidden = !ok;
      if (ok) visibili++;
    });
    /* un'intestazione di marca senza righe sotto non serve a nessuno */
    marche.forEach(function(h){
      var n = 0, r = h.nextElementSibling;
      while (r && !r.classList.contains('marca')) { if (!r.hidden) n++; r = r.nextElementSibling; }
      h.hidden = n === 0;
    });
    conta.textContent = visibili + (visibili === 1 ? ' microfono' : ' microfoni');
    vuoto.hidden = visibili > 0;
  }

  q.addEventListener('input', aggiorna);
  filtri.forEach(function(b){
    b.addEventListener('click', function(){
      var f = b.dataset.f;
      attivo = (attivo === f) ? null : f;
      filtri.forEach(function(x){ x.setAttribute('aria-pressed', String(x.dataset.f === attivo)); });
      aggiorna();
    });
  });
})();
</script>
</body>
</html>
`;

const dest = join(root, "guida/microfoni");
if (scrivi) {
  mkdirSync(dest, { recursive: true });
  writeFileSync(join(dest, "index.html"), html);
}
console.log(`${voci.length} microfoni · ${marche.length} marche · ${conPhantom} con phantom · ${nastri.length} a nastro`);
console.log(`pagina di ${(html.length / 1024).toFixed(0)} KB ${scrivi ? "scritta in guida/microfoni/" : "NON scritta (usa --scrivi)"}`);
