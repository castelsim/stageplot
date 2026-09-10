/* Gli inviti personali ai musicisti. Il segreto del link vive solo nel browser di chi invita: al database
   va l'impronta. Chi lo perde ne fa un altro. */
import { sb } from "../sb.js";
import { hashToken, newInviteToken, isInviteToken } from "../domain/invites.js";

const fail = (error) => { if (error) throw error; };

/* Ritorna il token IN CHIARO: è l'unica volta che esiste da questa parte, va mostrato subito. */
export async function createInvite(orgId, { label = "", email = "", note = "", days = 30 } = {}) {
  const token = newInviteToken();
  const hash = await hashToken(token);
  const { data, error } = await sb.rpc("orc_musician_invite_create", { org: orgId, hash, label, email, note, days });
  fail(error);
  return { id: data, token };
}
export async function listInvites(orgId) {
  const { data, error } = await sb.rpc("orc_musician_invites_list", { org: orgId });
  fail(error);
  return data || [];
}
export async function revokeInvite(id) { fail((await sb.rpc("orc_musician_invite_revoke", { inv: id })).error); }

/* Lato musicista: apre l'invito e lo prende in carico. Non dice mai se un invito esiste o no quando non
   è valido: la risposta è la stessa. */
export async function claimInvite(token) {
  if (!isInviteToken(token)) return { ok: false, motivo: "non valido" };
  const hash = await hashToken(token);
  const { data, error } = await sb.rpc("orc_musician_invite_claim", { hash });
  if (error) return { ok: false, motivo: "non valido" };
  return (data || [])[0] || { ok: false, motivo: "non valido" };
}

/* L'invito che ho già preso in carico: la pagina se lo dimentica a ogni ricarica, il database no. Senza
   questo, chi arriva dal link e torna il giorno dopo non legge più da chi è stato invitato. */
export async function myInvite() {
  const { data, error } = await sb.rpc("orc_my_invite");
  if (error) return null;
  const r = (data || [])[0];
  return r ? { org_id: r.org_id, org_name: r.org_name } : null;
}
