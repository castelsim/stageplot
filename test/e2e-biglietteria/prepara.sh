#!/bin/bash
# Copia di SOLA PROVA del sito (FUORI dal repo) con l'indirizzo e la chiave di produzione sostituiti da quelli dello
# stack LOCALE in tutti i .html e .js (vendor esclusa). Il repo non cambia.
# Uso: [WT=<worktree>] [REF=HEAD|lavoro] [DEST=<cartella>] ./prepara.sh   (REF=lavoro = i file non ancora committati)
set -euo pipefail
Q=$(cd "$(dirname "$0")" && pwd)
P=${BGL_E2E_DIR:-${TMPDIR:-/tmp}/bgl-e2e}
WT=${WT:-$Q/../..}
REF=${REF:-HEAD}; DEST=${DEST:-$P/sito}
ST=$(cd "$WT" && supabase status -o json 2>/dev/null)
API=$(echo "$ST" | python3 -c 'import json,sys; print(json.load(sys.stdin)["API_URL"])')
ANON=$(echo "$ST" | python3 -c 'import json,sys; print(json.load(sys.stdin)["ANON_KEY"])')
[[ "$API" == "http://127.0.0.1:54321" ]] || { echo "non è lo stack locale: $API"; exit 1; }
PROD_URL=https://vsodplqkuvnsdiikvmjb.supabase.co
PROD_ANON=$(grep -o 'var SUPABASE_ANON_KEY = "[^"]*"' "$WT/index.template.html" | cut -d'"' -f2)
ELENCO="404.html index.html app app.js icons.js sw.js manifest.webmanifest favicon.ico favicon.svg accedi biglietteria orchestre privacy vendor img"
rm -rf "$DEST" && mkdir -p "$DEST"
if [[ "$REF" == "lavoro" ]]; then ( cd "$WT" && rsync -a --relative $ELENCO "$DEST/" )
else ( cd "$WT" && git archive "$REF" $ELENCO | tar -x -C "$DEST" ); fi
find "$DEST" \( -name '*.html' -o -name '*.js' \) -not -path "$DEST/vendor/*" -print0 | while IFS= read -r -d '' f; do
  sed -i '' -e "s#$PROD_URL#$API#g" -e "s#wss://vsodplqkuvnsdiikvmjb.supabase.co#ws://127.0.0.1:54321#g" -e "s#$PROD_ANON#$ANON#g" "$f"
done
# solo gli indirizzi veri (https:// o wss://): un commento che nomina il progetto non è una chiamata
if grep -rlE "(https|wss)://vsodplqkuvnsdiikvmjb" "$DEST" --include='*.html' --include='*.js' | grep -v "/vendor/"; then echo "ERRORE: resta la produzione"; exit 1; fi
echo "copia di prova ($REF) pronta in $DEST (API $API)"
