// supabase/functions/_shared/bgl-cors.ts
//
// BIGLIETTERIA — chi può chiamare `bgl-prenota` dal browser. In produzione solo la pagina di stageplot.it.
// Per le prove in locale (pagina servita su localhost, flag BGL_CORS_DEV=1 nell'ambiente della funzione)
// si accetta anche http://localhost:<porta> e http://127.0.0.1:<porta>, rimandando indietro l'origine.
// `cors.ts` (usato da tutte le altre funzioni) NON si tocca: cambiarlo obbligherebbe a ridistribuirle.

export const ORIGINE_SITO = "https://stageplot.it";
const ORIGINE_LOCALE = /^http:\/\/(localhost|127\.0\.0\.1)(:\d{1,5})?$/;

export function bglCors(origin: string | null, dev: boolean): Record<string, string> {
  const ammessa = origin === ORIGINE_SITO || (dev && !!origin && ORIGINE_LOCALE.test(origin));
  return {
    "Access-Control-Allow-Origin": ammessa ? origin! : ORIGINE_SITO,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}
