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
