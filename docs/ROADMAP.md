# Roadmap StagePlot (rivista)

Ultimo aggiornamento: 2026-07-02.

Documento vivo. Deriva dalla roadmap del Product Owner (Master Pack Fable 5) rivista alla luce
dell'audit `docs/AUDIT_2026-07-02.md`. Non è un vincolo assoluto: se emergono soluzioni migliori,
si aggiorna con motivazione tecnica e di business.

## Principi (dalla Visione)

- La semplicità prima delle funzionalità; ogni feature riduce attrito o crea valore reale.
- Standard consolidati > soluzioni originali.
- **Monetizzare con servizi e competenze, non con limitazioni artificiali.**
- Costruire nel tempo un dataset proprietario senza compromettere l'UX.
- Desktop e mobile naturali ciascuno per la propria piattaforma.

## Perché questa revisione (3 problemi della roadmap originale)

1. **Mancava una fase di consolidamento del debito.** La collaborazione realtime moltiplica la
   superficie di stato condiviso e di sicurezza: va costruita su fondamenta sane (RLS versionate,
   CSP, performance), non prima.
2. **1C e Fase 2 costruivano due volte lo stesso motore** (presence, ruoli, conflitti, lock).
3. **La parte più difficile era troppo presto:** cursori multipli/lock in 1C, quando la consulenza
   live 1:1 non ne ha bisogno.

## Stato attuale (cosa esiste già — [CERTO] dal codice)

| Voce | Stato |
|------|-------|
| Tool gratuito, cloud (login Google + Supabase), sharing `?view=` read-only + copia, salvataggio locale/cloud | ✅ live |
| UX desktop/mobile | 🟡 UI completa; a11y incompleta, spot-check mobile dark aperto |
| Consulenza asincrona (Stripe, link vivo, email con prompt Claude per il consulente) | ✅ quasi completa |
| Sessione realtime `?view=` con ruolo editor/viewer | 🟡 base esistente |
| Cursori multipli, lock oggetti, multi-editor | ❌ da fare |
| AI automatica | ❌ non iniziata (corretto: è l'ultima) |

Conseguenza: **1A e 1B si rifiniscono, non si ricostruiscono.** Il lavoro residuo vero è
collaborazione (1C/2) e AI (3).

---

## Fasi

### Fase 0 — Fondamenta (bloccante, ~1 settimana)

Chiude il debito emerso dall'audit. Tutto il resto poggia qui.

- Sicurezza: **S2** versionare schema+RLS di `stageplot_projects` (`supabase db pull`); **S3** CSP via `<meta http-equiv>`; **S4** SRI o self-host di `supabase-js`.
- Performance: **P1** lazy-load reale delle librerie PDF (oggi inline, ~2.9 MB caricati sempre) → leva di funnel, non manutenzione.
- Qualità 1A: rifinitura a11y (focus-trap sugli overlay, `role`/`alt`) e spot-check mobile in dark.
- Igiene dati per il futuro dataset: confermare `schema_version`, consenso privacy, anonimizzazione (impostati ora, non in Fase 3).

*Già fatto in questa tornata:* S1 (XSS `venue._dataUrl`) corretto e live; hardening edge functions deployato; anti-clickjacking e privacy aggiornati.

### Fase 1B — Consolidare la consulenza asincrona

Prima monetizzazione, basso rischio, quasi pronta.

- Chiudere documentazione tecnica e output documentale del servizio.
- AI usata **internamente** dal consulente (il prompt Claude in email è il seme), con controllo umano finale.

### Fase 1C — Consulenza live (ridotta: single-editor)

Riusa la sessione `?view=` esistente: il consulente edita, il cliente guarda in diretta.

- **Niente** cursori multipli/lock qui (rimandati alla Fase 2, dove servono davvero).
- Obiettivo: monetizzare la modalità live **presto**, senza costruire il motore completo.

### Fase 2 — Motore di collaborazione unico

Il pezzo tecnicamente più duro, costruito **una volta sola**; 1C ne diventa un caso d'uso.

- Ruoli: proprietario / editor / sola lettura.
- Sincronizzazione realtime, cursori multipli, lock oggetti, risoluzione conflitti.
- Igiene dati in parallelo per abilitare la Fase 3.

### Fase 3 — Analisi AI automatica

Invariata: **solo dopo** aver costruito un dataset reale e pulito.

---

## Bivi tecnici (alternative A/B)

**Motore realtime (Fase 2)**
- **A) Yjs (CRDT standard) su Supabase Realtime** — coerente con "standard consolidati", gestisce conflitti/offline. ← consigliata
- B) Protocollo custom last-write-wins — semplice all'inizio, ma i conflitti multi-editor diventano un problema tuo. Contro la Visione.

**Consulenza live (1C)**
- **A) Single-editor sulla sessione esistente** — spedibile subito, zero nuovo motore. ← consigliata
- B) Multi-cursore/lock già in 1C — ritarda la monetizzazione per complessità da Fase 2.

---

## Decisioni aperte (Product Owner)

| # | Decisione | Default proposto |
|---|-----------|------------------|
| 1 | "Collaborazione Premium" (Fase 2) = **servizio** (con consulente) o **feature a pagamento**? Il feature-gating puro è in tensione con "non limitazioni artificiali". | Da confermare |
| 2 | Fase 0 esplicita prima di 1C/2? | Sì (adottato in questo doc) |
| 3 | Primo rilascio live 1C: ridotto (single-editor) o pieno (multi-cursore/lock)? | Ridotto (adottato in questo doc) |

## Riferimenti

- Audit: `docs/AUDIT_2026-07-02.md`
- Convenzioni: `AGENTS.md` · Modularizzazione: `docs/MODULARIZATION.md`
- Roadmap originale del PO: Master Pack `03_Roadmap_Strategica.txt`
