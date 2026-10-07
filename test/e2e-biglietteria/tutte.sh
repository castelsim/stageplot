#!/bin/bash
# Tutte le prove della biglietteria sul ramo intero. Script in test/e2e-biglietteria/; copia di prova e screenshot FUORI dal repo (BGL_E2E_DIR, predefinito $TMPDIR/bgl-e2e). Mai produzione.
# Diverso dal piano (T22 step 1): NIENTE `supabase db reset` (lo stack locale è condiviso con altri agenti): si controlla
# che le migrazioni 0000–0078 siano applicate e che 0074–0078 si ripassino (idempotenti). Dati di prova con prefisso unico.
# Prima: stack locale acceso e `supabase functions serve --env-file test/e2e-biglietteria/env --no-verify-jwt` in un altro terminale.
# Uso: WT=<worktree> [SALTA_SUITE=1] [SOLO="pubblico viaggio"] ./tutte.sh
set -uo pipefail
Q=$(cd "$(dirname "$0")" && pwd)
P=${BGL_E2E_DIR:-${TMPDIR:-/tmp}/bgl-e2e}
WT=${WT:-$Q/../..}
J=$P
ESITO=$J/esito-$(date +%Y-%m-%d).txt; mkdir -p $P $J/shot; : > "$ESITO"
export WT SITO=$P/sito; export OUT=$J/shot
passo() { echo "== $1" | tee -a "$ESITO"; shift; ( "$@" ) >> "$ESITO" 2>&1; local c=$?; echo "   -> uscita $c" | tee -a "$ESITO"; return 0; }
cd "$WT"
if [[ -z "${SALTA_SUITE:-}" ]]; then
passo "build --check"            node build.mjs --check
passo "engines"                  node test/engines.test.mjs
passo "collaudo 30"              node test/collaudo.test.mjs
passo "pagine (node --test)"     node --test test/biglietteria.test.mjs test/bgl-*.test.mjs
passo "Deno"                     deno test --lock=deno.lock --frozen supabase/functions/_shared/*.test.ts
passo "deno check"               deno check --lock=deno.lock --frozen supabase/functions/bgl-prenota/index.ts supabase/functions/bgl-avvisa/index.ts supabase/functions/bgl-account/index.ts supabase/functions/retention-purge/index.ts
passo "deno lint"                deno lint supabase/functions
passo "RLS tutte"                env ORC_RLS=1 node --test orchestre/test/*.test.mjs
fi
DB=$(docker ps --format '{{.Names}}' | grep '^supabase_db_')
passo "migrazioni 0000-0078 applicate" bash -c "test \$(supabase migration list --local 2>/dev/null | grep -o '\"local\":\"[0-9]*\",\"remote\":\"[0-9]*\"' | grep -c '\"local\":\"\\([0-9]*\\)\",\"remote\":\"\\1\"') -ge 79"
for m in 0074 0075 0076 0077 0078; do
  passo "migrazione $m si ripassa" bash -c "docker exec -i $DB psql -U postgres -v ON_ERROR_STOP=1 -q < $WT/supabase/migrations/${m}_*.sql"
done
passo "copia di prova"           env REF=HEAD DEST=$P/sito $Q/prepara.sh
for s in ${SOLO:-404 pubblico area-ingresso modulo scheda sala sposta editor google mie ritorno segnala fuso gara viaggio}; do
  f=$Q/prova-$s.mjs; [[ $s == viaggio ]] && f=$Q/e2e-viaggio.mjs
  passo "browser: $s" node $f
done
passo "browser: viaggio a parti invertite" env INVERTI=1 node $Q/e2e-viaggio.mjs
passo "browser: viaggio, tema scuro" env TEMA=scuro node $Q/e2e-viaggio.mjs
grep -E "^== |uscita [1-9]" "$ESITO"
