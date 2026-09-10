/* «Richiedi musicisti»: la richiesta che un cliente di StagePlot manda alla società di servizi.
   Il cliente non è membro di nessuna organizzazione: legge soltanto le proprie richieste. */
import { sb } from "../sb.js";
import { SB_URL, SB_ANON } from "../config.js";

const fail = (error) => { if (error) throw error; };

/* chi riceve le richieste; null se il servizio non è acceso */
export async function serviceOrg() {
  const { data, error } = await sb.rpc("orc_service_org");
  fail(error);
  return (data || [])[0] || null;
}
export async function create(projectId, snapshot, fields, slots) {
  const { data, error } = await sb.rpc("orc_client_request_create", { project: projectId || null, snap: snapshot, fields, slots });
  fail(error);
  return data;
}
/* Manda subito le due email della richiesta appena creata. Se fallisce non è grave: la riga resta
   «da spedire» e il worker la prende al prossimo giro — ma il giro può tardare ore, quindi qui si prova. */
export async function notifyNow(requestId) {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return { ok: false };
  const r = await fetch(SB_URL + "/functions/v1/orc-request-notify", {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: SB_ANON, Authorization: "Bearer " + session.access_token },
    body: JSON.stringify({ request_id: requestId }),
  });
  return r.ok ? await r.json().catch(() => ({ ok: true })) : { ok: false, status: r.status };
}

export async function mine() {
  const { data, error } = await sb.rpc("orc_my_client_requests");
  fail(error);
  return data || [];
}

/* lato società */
export async function list(orgId) {
  const { data, error } = await sb.rpc("orc_client_requests_list", { org: orgId });
  fail(error);
  return data || [];
}
export async function slotsOf(reqId) {
  const { data, error } = await sb.from("orc_client_request_slots").select("item_id, label, instrument_code, role_name, qty, covered, note").eq("request_id", reqId).order("sort");
  fail(error);
  return data || [];
}
export async function detail(reqId) {
  const { data, error } = await sb.from("orc_client_requests").select("*").eq("id", reqId).maybeSingle();
  fail(error);
  return data;
}
export async function setStatus(reqId, status, productionId = null) {
  fail((await sb.rpc("orc_client_request_set_status", { req: reqId, new_status: status, production: productionId })).error);
}
