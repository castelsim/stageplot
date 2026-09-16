// supabase/functions/_shared/feedback-limits.ts
//
// I LIMITI DELLA CASELLA SEGNALAZIONI (16/09, verifica di sicurezza). submit-feedback è pubblica: chiunque
// su internet può chiamarla, con una schermata da 2 MB e una mail che parte ogni volta. Il limite per IP
// da solo non bastava: l'IP era il PRIMO valore di `x-forwarded-for`, che scrive il client, quindi con un
// IP inventato a ogni richiesta il contatore ripartiva da zero; e senza il salt il limite saltava in
// silenzio. Qui i tre tetti che reggono anche se l'IP è falso.

/** Il corpo più grande che si legge: schermata (2,8 MB di base64) + progetto (1 MB) + margine. */
export const MAX_BODY_BYTES = 4_500_000;

/** Segnalazioni in un'ora da TUTTA internet. Oggi ne arrivano poche al giorno: oltre questo è abuso. */
export const GLOBAL_MAX_PER_HOUR = 30;

/** Ogni campo di `meta` è una stringa corta: finisce nelle colonne e nel corpo della mail. */
export const META_MAX_CHARS = 500;
const META_KEYS = ["app_version", "page_url", "user_agent", "viewport", "language"] as const;

/**
 * L'IP del client, dalla fonte più affidabile disponibile. `cf-connecting-ip` e `x-real-ip` li scrive il
 * proxy e sovrascrivono quello che manda il client; il primo valore di `x-forwarded-for` resta l'ultima
 * risorsa. Anche nel caso peggiore il tetto globale regge.
 */
export function clientIp(headers: Headers): string {
  for (const h of ["cf-connecting-ip", "x-real-ip"]) {
    const v = (headers.get(h) || "").trim();
    if (v) return v;
  }
  return (headers.get("x-forwarded-for") || "").split(",")[0].trim();
}

/** Tiene solo i campi noti, solo se sono stringhe, tagliati a META_MAX_CHARS. */
export function metaPulito(x: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!x || typeof x !== "object") return out;
  const o = x as Record<string, unknown>;
  for (const k of META_KEYS) {
    if (typeof o[k] === "string") out[k] = (o[k] as string).slice(0, META_MAX_CHARS);
  }
  return out;
}

/** Il corpo dichiarato (o letto) è oltre il tetto? */
export function corpoTroppoGrande(bytes: number): boolean {
  return Number.isFinite(bytes) && bytes > MAX_BODY_BYTES;
}

/** Con `n` segnalazioni nell'ultima ora, la prossima va rifiutata? */
export function oraPiena(n: number | null | undefined): boolean {
  return typeof n === "number" && n >= GLOBAL_MAX_PER_HOUR;
}
