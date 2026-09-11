/* Il preventivo. Lato società si prepara e si manda; lato cliente si legge e si risponde. I totali che
   contano sono quelli calcolati dal database all'invio: il browser li mostra mentre si scrive, ma la
   cifra che il cliente accetta non la decide lui. */
import { sb } from "../sb.js";
import { SB_URL, SB_ANON } from "../config.js";

const fail = (error) => { if (error) throw error; };

/* lato società: l'ultimo preventivo della richiesta (bozza o mandato), con le righe */
export async function ofRequest(requestId) {
  const { data, error } = await sb.from("orc_quotes").select("*, orc_quote_lines(label, qty, fee_cents, sort)")
    .eq("request_id", requestId).neq("status", "superseded").order("created_at", { ascending: false }).limit(1);
  fail(error);
  const q = (data || [])[0];
  if (!q) return null;
  q.lines = (q.orc_quote_lines || []).sort((a, b) => a.sort - b.sort);
  delete q.orc_quote_lines;
  return q;
}

export async function save(requestId, { margin, vat, description, notes, lines }) {
  const { data, error } = await sb.rpc("orc_quote_save", { request: requestId, margin, vat, description, notes, lines });
  fail(error);
  return data;
}

export async function send(quoteId) {
  const { data, error } = await sb.rpc("orc_quote_send", { quote: quoteId });
  fail(error);
  return data;
}

/* L'avviso al cliente, subito: se non parte, il preventivo resta «da avvisare» e lo riprende il worker.
   Per questo un errore qui non è un errore del preventivo — quello è già mandato e salvato. */
export async function notifyNow(quoteId) {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return { ok: false };
  try {
    const r = await fetch(SB_URL + "/functions/v1/orc-quote-notify", {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: SB_ANON, Authorization: "Bearer " + session.access_token },
      body: JSON.stringify({ quote_id: quoteId }),
    });
    return r.ok ? await r.json().catch(() => ({ ok: true })) : { ok: false, status: r.status };
  } catch { return { ok: false }; }
}

/* lato cliente: solo i preventivi mandati, e solo i campi che gli spettano — mai cachet né margine */
export async function mine() {
  const { data, error } = await sb.rpc("orc_my_quotes");
  fail(error);
  return data || [];
}

export async function answer(quoteId, accept) {
  const { data, error } = await sb.rpc("orc_quote_answer", { quote: quoteId, accept });
  fail(error);
  return data;
}
