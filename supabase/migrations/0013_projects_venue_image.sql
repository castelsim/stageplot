-- 0013_projects_venue_image.sql
--
-- PERF planimetria (13/07/2026): l'immagine di sfondo (planimetria) finora viveva DENTRO `data`
-- (jsonb, riscritto ad ogni autosave ~10s) → ogni salvataggio ri-caricava MB di base64 anche se
-- l'immagine non era cambiata (spreco di banda; con immagini grandi rischio di errori di payload).
--
-- Ora l'immagine sta in una colonna DEDICATA `venue_image` (text = JSON {name,_dataUrl,_imgW,_imgH}),
-- scritta dal client SOLO quando cambia. Il `data` torna leggero (serializzazione stripped, senza _dataUrl).
--
-- Retrocompatibile: i progetti esistenti hanno l'immagine dentro `data` e `venue_image` NULL.
-- All'apertura il client usa `venue_image` se presente, altrimenti l'immagine dentro `data`;
-- al primo ri-salvataggio l'immagine migra da sola in `venue_image`. Nessuna rottura in nessun ordine di deploy.
-- Idempotente. RLS invariata.

alter table public.stageplot_projects
  add column if not exists venue_image text;
