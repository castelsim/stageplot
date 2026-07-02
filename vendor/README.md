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
