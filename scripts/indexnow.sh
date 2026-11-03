#!/bin/zsh
# IndexNow (Bing, Yandex, Seznam…): avvisa i motori delle pagine di stageplot.it.
# La chiave è pubblica per costruzione (il file 4d1fdc8b5b357ff5353a9e928c187bff.txt sta nella radice del sito e prova che il sito è nostro).
# Uso:   scripts/indexnow.sh            → mostra solo le URL che manderebbe (prova a secco)
#        scripts/indexnow.sh --invia    → manda davvero (UNA richiesta POST a api.indexnow.org)
# Prima volta: pubblicare il sito con il file chiave (deploy Pages), verificare
#   curl -s https://stageplot.it/4d1fdc8b5b357ff5353a9e928c187bff.txt   → deve restituire la chiave.
# Si invia solo dopo un cambio di contenuti, non a ogni deploy. Le URL vengono da sitemap.xml.
set -eu
KEY=4d1fdc8b5b357ff5353a9e928c187bff
HOST=stageplot.it
cd "$(dirname "$0")/.."
URLS=$(grep -o '<loc>[^<]*</loc>' sitemap.xml | sed -E 's#</?loc>##g' | grep "^https://$HOST/")
N=$(echo "$URLS" | wc -l | tr -d ' ')
echo "URL da segnalare: $N"
if [ "${1:-}" != "--invia" ]; then echo "$URLS" | head -5; echo "… (prova a secco: aggiungi --invia per mandare)"; exit 0; fi
JSON=$(python3 -c 'import json,sys; u=sys.stdin.read().split(); print(json.dumps({"host":"'$HOST'","key":"'$KEY'","keyLocation":"https://'$HOST'/'$KEY'.txt","urlList":u}))' <<< "$URLS")
curl -s -o /dev/null -w "IndexNow: HTTP %{http_code} (200/202 = accettato)\n" -X POST https://api.indexnow.org/IndexNow -H 'Content-Type: application/json; charset=utf-8' -d "$JSON"
