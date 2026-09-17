// supabase/functions/_shared/tenta-invio.ts
//
// QUANDO RESEND NON RISPONDE (17/09, verifica di resilienza). Le spedizioni prendono la riga («sending»)
// e poi chiamano Resend: se la chiamata LANCIAVA un errore (rete, DNS, funzione uccisa dal limite di
// tempo) l'aggiornamento successivo non avveniva e la riga restava «in spedizione» per sempre — la
// richiesta di musicisti non arrivava mai alla società, senza che nessuno lo vedesse.

/** Oltre questo tempo una chiamata a Resend si considera persa: meglio riprovare al giro dopo. */
export const RESEND_TIMEOUT_MS = 15_000;

/** Esegue un invio e risponde true/false: un errore lanciato vale «non spedita», mai un'eccezione. */
export async function tentaInvio(invio: () => Promise<{ ok: boolean }>): Promise<boolean> {
  try {
    return (await invio()).ok === true;
  } catch (e) {
    console.error("invio email non riuscito:", e instanceof Error ? e.message : "unknown");
    return false;
  }
}
