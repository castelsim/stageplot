# vendor/

Dipendenze di terzi self-hosted (audit S4): servite da stageplot.it, non da CDN esterni.
Elimina la dipendenza runtime da terzi (rischio supply-chain + privacy) e permette una CSP
più stretta (niente `cdn.jsdelivr.net` in `script-src`).

## supabase.min.js

- **Pacchetto:** `@supabase/supabase-js` (build UMD)
- **Versione:** 2.110.0
- **Fonte:** https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.110.0/dist/umd/supabase.min.js
- **Scaricato:** 2026-07-02
- **SHA-256:** `fdd149b3183cbc9b80e622a85d8960267a2160cc94d978bc19367f35e4041b87`

### Come aggiornare (manuale, volutamente)

Gli aggiornamenti sono manuali per scelta: nessuna nuova versione entra in produzione da sola.

```
curl -sL "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.<NUOVA>/dist/umd/supabase.min.js" -o vendor/supabase.min.js
shasum -a 256 vendor/supabase.min.js   # aggiorna l'hash qui sopra
```

Dopo l'aggiornamento: `node build.mjs` e ritestare login + salvataggio cloud nel browser.

## qrcode.min.js

Generazione **locale** del QR nella modale Condividi (prima era `api.qrserver.com`: l'URL di
condivisione — token incluso — veniva inviato a un servizio terzo). Caricata **on-demand** alla
prima apertura della modale da `loadQrLib()`.

- **Pacchetto:** `qrcode-generator` (Kazuhiko Arase, MIT)
- **Versione:** 1.4.4
- **Fonte:** https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.min.js
- **Scaricato:** 2026-07-02 (rimossa la riga `sourceMappingURL` finale: puntava a jsdelivr)
- **SHA-256:** `d58d7bd2bec6b3fb587b15b3c98c762e23ec0063da38633334f6aece37206ed6`

### Come aggiornare

```
curl -sL "https://cdn.jsdelivr.net/npm/qrcode-generator@1.<NUOVA>/qrcode.min.js" -o vendor/qrcode.min.js
# rimuovere l'eventuale riga sourceMappingURL, poi:
shasum -a 256 vendor/qrcode.min.js   # aggiorna l'hash qui sopra
```

Dopo: ritestare "Condividi → Mostra QR" nel browser (con e senza login).

## clipper.min.js

Le operazioni **Unisci in una forma / Sottrai / Interseca** di «Crea elemento» (Contorni, Piano 2, 20/10/2026).
Caricata **on-demand** al primo uso da `custCaricaClipper()` (come `loadQrLib()`), nel precache di `sw.js`.
Scelta perché lavora a coordinate **intere** (algoritmo di Vatti): niente errori di virgola mobile sui casi degeneri.

- **Pacchetto:** `clipper-lib` (Angus Johnson, port JavaScript di Timo; Boost Software License 1.0; dentro, JSBN di Tom Wu)
- **Versione:** 6.4.2 (`ClipperLib.version` = `6.4.2.2`)
- **Fonte:** https://cdn.jsdelivr.net/npm/clipper-lib@6.4.2/clipper.min.js (minificazione automatica di jsDelivr di `clipper.js`)
- **Scaricato:** 2026-10-20. Il file minificato non ha l'intestazione con la licenza e ha una riga `sourceMappingURL` finale
  (puntava a jsDelivr): la riga è **tolta** e in cima è **rimessa l'intestazione** di
  https://cdn.jsdelivr.net/npm/clipper-lib@6.4.2/clipper.js (righe 1–65: copyright e licenza, che la Boost chiede di tenere).
- **SHA-256** (della nostra copia, non di quella di jsDelivr: i file minificati al volo possono cambiare):
  `1b0a942d1e924f474ff0f04db219fd091a2526eb7c1094100a58536e543e1132`

### Come aggiornare

```
curl -sL "https://cdn.jsdelivr.net/npm/clipper-lib@<VERSIONE>/clipper.min.js" -o /tmp/c/clipper.min.js
curl -sL "https://cdn.jsdelivr.net/npm/clipper-lib@<VERSIONE>/clipper.js" -o /tmp/c/clipper.js
# intestazione di clipper.js (fino alla riga prima di "(function ()") + clipper.min.js SENZA la riga sourceMappingURL:
{ sed -n '1,/^(function ()/p' /tmp/c/clipper.js | sed '$d'; grep -v sourceMappingURL /tmp/c/clipper.min.js; } > vendor/clipper.min.js
shasum -a 256 vendor/clipper.min.js   # aggiorna l'hash qui sopra (il test di engines lo confronta)
```

Dopo: `node test/engines.test.mjs` (le booleane girano sulla libreria vera nel sandbox) e una prova nel browser.

## pdf.min.js

Librerie per l'export PDF, **estratte dal monolite** (erano inline in `index.html`, ~449 KB parsati
a ogni avvio) e caricate **on-demand al primo export** da `loadJsPDF()` (audit P1). Bundle unico:
jsPDF prima, svg2pdf.js dopo (dipende da jsPDF).

- **Pacchetti:** `jspdf` 2.5.1 + `svg2pdf.js` 2.2.3 (concatenati)
- **Origine:** erano già incorporati nel repo; estratti da `index.template.html` il 2026-07-02
- **SHA-256:** `49c9f301b49b5bf97fef357bfcec5dbd7f8b5b3f2fcf9b2e0d97efefea1ccc82`

> Nota: l'export PDF ora richiede che `/vendor/pdf.min.js` sia raggiungibile (lo è su stageplot.it).
> Un `index.html` aperto isolato da `file://` offline non potrà esportare in PDF (l'editing sì).

### Come aggiornare

```
# scaricare le build UMD desiderate e concatenarle (jspdf poi svg2pdf.js), rigenerare l'hash:
shasum -a 256 vendor/pdf.min.js
```

Dopo: ritestare l'export PDF (vettoriale e raster) nel browser.

### Vulnerabilità nota — jsPDF 2.5.1 (audit M-11)

`jspdf` 2.5.1 è affetto da **CVE-2025-29907 / GHSA-w532-jxjh-hjhj** (ReDoS: un URL immagine
malformato può innescare backtracking catastrofico nel parser, corretto in jsPDF **3.0.1**).

- **Tipo di rischio:** denial-of-service **lato client** (blocca la scheda di chi esporta), non
  esecuzione di codice né esfiltrazione. Nessun jsPDF gira lato server.
- **Raggiungibilità:** l'unico dato non generato dall'app che raggiunge jsPDF è **l'immagine
  planimetria** (venue). Vettore teorico = un progetto condiviso con un data-URL immagine ostile.
- **Già mitigato in-app (di fatto non sfruttabile):** ① il `_dataUrl` della venue è **sempre**
  prodotto da `canvas.toDataURL` (import PDF/immagine e re-encode in export → PNG/JPEG puliti),
  mai il byte grezzo dell'utente; ② `safeVenueDataUrl` impone una **allowlist regex stretta e
  ReDoS-safe** — `^data:image/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+/]+={0,2}$` (classe singola,
  nessun quantificatore annidato) — applicata in serializzazione **e** al render (seconda
  barriera). A jsPDF arrivano quindi solo data-URL base64 ben formati: l'input malformato che
  innescherebbe il backtracking catastrofico **non è costruibile**.
- **Perché non aggiorniamo (ancora):** è un **bundle custom** (jspdf+svg2pdf concatenati); il salto
  a 3.x è major, ad alto rischio di regressione su una funzione molto usata, **senza golden test
  PDF**. Con il rischio già neutralizzato a monte, il bump è **igiene rimandabile**, non urgente.
- **Se/quando si aggiorna:** pianificarlo separatamente con suite di regressione PDF (vettoriale +
  raster, multipagina, cartiglio, planimetria) prima del merge, e mantenere comunque le due
  barriere sopra (difesa in profondità).

## pdfjs/ (pdf.min.js + pdf.worker.min.js)

Importa un **PDF come sfondo della Planimetria** (19/11/2026): la pagina scelta si disegna in un canvas e da lì
segue la strada delle immagini (ricompressione, scala a 2 punti, opacità, rotazione). Il PDF **non** viene salvato
né caricato altrove: resta nel browser, nel progetto entra solo l'immagine. Caricata **on-demand** al primo PDF
da `venueCaricaPdfJs()`; non è nel precache (1,4 MB): il service worker la tiene dopo il primo uso, offline da lì.
La CSP non cambia: lo script e il worker sono di `'self'` (`worker-src` ricade su `script-src`); `isEvalSupported:false`
perché la CSP non ha `'unsafe-eval'`.

- **Pacchetto:** `pdfjs-dist` (Mozilla, Apache License 2.0; testo in `vendor/pdfjs/LICENSE.txt`)
- **Versione:** 3.11.174 (ultima con build UMD classica; dalla 4.x i file sono moduli ES `.mjs`)
- **Fonte:** `npm pack pdfjs-dist@3.11.174` → `build/pdf.min.js` e `build/pdf.worker.min.js`, senza modifiche
- **Scaricato:** 2026-11-19
- **SHA-256 `pdf.min.js`:** `5b5799e6f8c680663207ac5b42ee14eed2a406fa7af48f50c154f0c0b1566946`
- **SHA-256 `pdf.worker.min.js`:** `feabdf309770ed24bba31a5467836cdc8cf639c705af27d52b585b041bb8527b`

### Come aggiornare

```
npm pack pdfjs-dist@3.11.<NUOVA> && tar xzf pdfjs-dist-*.tgz package/build package/LICENSE
cp package/build/pdf.min.js package/build/pdf.worker.min.js vendor/pdfjs/ && cp package/LICENSE vendor/pdfjs/LICENSE.txt
shasum -a 256 vendor/pdfjs/*.js   # aggiorna gli hash qui sopra
```

Dopo: provare nel browser un PDF a una pagina, uno a più pagine, uno con password.
