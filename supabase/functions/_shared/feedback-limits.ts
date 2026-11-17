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

// LIMITE PER CHI INVIA (17/11, decisione di Simone: «alza il limite»). Alla 6ª segnalazione dell'ora
// arrivava «troppi invii» anche a chi stava correggendo uno stage plot con l'account. Tre fasce:
// anonimo 5/ora per IP, utente con accesso 30/ora per utente, amministratore nessun limite per invio.
// Il tetto GLOBALE (GLOBAL_MAX_PER_HOUR) resta per tutti.

/** Segnalazioni/ora per chi non ha fatto l'accesso (per IP). */
export const ANON_MAX_PER_HOUR = 5;
/** Segnalazioni/ora per un utente autenticato (per id utente). */
export const USER_MAX_PER_HOUR = 30;
/** Stesso id usato da get-shared-project e save-shared-project per riconoscere l'amministratore. */
export const ADMIN_USER_ID = "4b899cba-3cc2-4b26-9ef0-c3e915929277";

export type LimiteInvio =
  | { kind: "admin" }                       // nessun limite per chi invia
  | { kind: "user"; key: string; max: number }
  | { kind: "ip"; key: string; max: number };

/**
 * Sceglie chi si conta e quanto: `userId` è l'id ricavato dal JWT VERIFICATO (mai dal payload).
 * Chiave = prefisso + id/IP, da hashare prima di usarla (la funzione SQL vuole 64 esadecimali).
 */
export function limiteInvio(userId: string | null | undefined, ip: string): LimiteInvio | null {
  if (userId) {
    if (userId === ADMIN_USER_ID) return { kind: "admin" };
    return { kind: "user", key: "u:" + userId, max: USER_MAX_PER_HOUR };
  }
  if (ip) return { kind: "ip", key: ip, max: ANON_MAX_PER_HOUR };
  return null; // anonimo senza IP: resta solo il tetto globale
}

/** Con il contatore a `count` (già incrementato), questo invio va rifiutato? */
export function oltreLimite(count: unknown, max: number): boolean {
  return typeof count === "number" && count > max;
}

/** L'amministratore non è soggetto al tetto globale, e le sue righe non lo fanno salire per gli altri. */
export function soggettoAlTettoGlobale(userId: string | null | undefined): boolean {
  return userId !== ADMIN_USER_ID;
}

/** Filtro PostgREST: tutte le righe tranne quelle dell'amministratore (le righe senza utente restano). */
export const FILTRO_SENZA_ADMIN = `user_id.is.null,user_id.neq.${ADMIN_USER_ID}`;
