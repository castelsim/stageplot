-- 0038 — «In attesa» fra gli stati del triage.
--
-- Il pannello di triage (ops/triage) ha quattro pulsanti: Da fare · In attesa · Fatto · Scarta.
-- L'enum nato con la 0037 ne conosceva tre — nuovo, in_lavorazione, fatto, scartato — e «in attesa»
-- non è nessuno di quelli: non è «nuovo» (l'ho già guardata) e non è «in lavorazione» (non ci sto
-- lavorando). È la segnalazione buona che non si fa adesso; senza questo valore finirebbe fra le
-- nuove e me la ritroverei davanti ogni volta, che è esattamente il problema che lo stato risolve.
--
-- ADD VALUE non si può usare nella stessa transazione che lo crea: qui infatti non lo usa nessuno,
-- lo useranno le UPDATE successive.

alter type public.feedback_stato add value if not exists 'in_attesa';
