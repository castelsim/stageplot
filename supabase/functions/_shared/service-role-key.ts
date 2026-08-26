/**
 * Quale chiave service_role usare per parlare col database.
 *
 * Perché esiste. Dal 25/08/2026 il worker delle notifiche fallisce a intermittenza: le query al
 * database tornano «JWT issued at future» e la function risponde 500, così il workflow che la chiama
 * ogni ~40 minuti va rosso (26 run su 30 in due giorni). Chi paga una consulenza rischia di non
 * essere annunciato da nessuna mail.
 *
 * Cosa sappiamo, misurato: la function parte e autentica (con un segreto sbagliato risponde 401);
 * l'`iat` della chiave legacy anon è nel passato (28/06/2026); gli header `Date` di REST, Functions e
 * Auth sono allineati al secondo; rideployare tutte le function non ha cambiato nulla. Il progetto ha
 * migrato le chiavi di firma JWT a **ECC (P-256)**, tenendo la vecchia HS256 solo per verificare i
 * token ancora vivi. Con le chiavi nuove il token che arriva al database è **generato al momento**:
 * se la verifica non tollera nemmeno una frazione di secondo di sfasamento fra i nodi, ogni tanto lo
 * rifiuta perché «emesso nel futuro» — e infatti qualche giro passa e la maggior parte no.
 *
 * Il rimedio. Una chiave service_role **legacy** è un JWT statico con `iat` fisso nel passato: non
 * viene rigenerata a ogni richiesta, quindi non può risultare futura. Se il secret `SERVICE_ROLE_LEGACY`
 * c'è, si usa quello; altrimenti resta la chiave iniettata dalla piattaforma e il comportamento è
 * identico a prima. Il nome non ha il prefisso `SUPABASE_` perché quello è riservato: i secret che lo
 * portano li gestisce la piattaforma e non si possono sovrascrivere a mano.
 *
 * Da togliere quando la causa sarà risolta a monte: allora `SERVICE_ROLE_LEGACY` si cancella e questo
 * file torna a essere una riga sola.
 */
export type EnvLike = { get(name: string): string | undefined };

export function serviceRoleKey(env: EnvLike): string {
  const legacy = (env.get("SERVICE_ROLE_LEGACY") ?? "").trim();
  if (legacy) return legacy;
  return (env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "").trim();
}

/** true se la chiave in uso è quella legacy: serve solo a dirlo nei log, per sapere cosa sta girando. */
export function usingLegacyKey(env: EnvLike): boolean {
  return (env.get("SERVICE_ROLE_LEGACY") ?? "").trim().length > 0;
}
