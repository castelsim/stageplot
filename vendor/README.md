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
