/* Versione dell'organico per le stampe (0086): il server fotografa l'organico e dà il numero di versione. */
import { sb } from "../sb.js";
export async function stamp(productionId) {
  const { data, error } = await sb.rpc("orc_staffing_stamp", { production: productionId });
  if (error) throw error;
  return data;
}
