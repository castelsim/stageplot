/* L'invito personale a un musicista: il link che la società gli manda.

   Il segreto del link non passa mai dal server in chiaro. Lo genera qui il browser di chi invita, che
   manda al database solo l'impronta (sha-256) e mostra il link una volta sola. Chi lo perde ne fa un
   altro; quello vecchio si revoca. È lo stesso schema delle richieste di setup dell'editor e delle
   convocazioni: chi guarda il database non trova niente con cui entrare. */

const HEX = "0123456789abcdef";

/* 32 byte casuali in esadecimale: 256 bit, non indovinabili. */
export function newInviteToken() {
  const b = new Uint8Array(32);
  (globalThis.crypto || {}).getRandomValues(b);
  let out = "";
  for (const n of b) out += HEX[n >> 4] + HEX[n & 15];
  return out;
}

export async function hashToken(token) {
  const data = new TextEncoder().encode(String(token || ""));
  const buf = await globalThis.crypto.subtle.digest("SHA-256", data);
  let out = "";
  for (const n of new Uint8Array(buf)) out += HEX[n >> 4] + HEX[n & 15];
  return out;
}

/* Un token che ha la forma giusta: si controlla prima di chiamare il database, così un link storto
   non diventa una richiesta inutile. */
export function isInviteToken(t) {
  return typeof t === "string" && /^[0-9a-f]{64}$/.test(t);
}

export function inviteLink(token, origin = "https://stageplot.it") {
  return String(origin).replace(/\/+$/, "") + "/orchestre/musicista/?inv=" + token;
}

/* Il messaggio già scritto, da incollare dove si vuole: chi lo riceve deve capire in tre righe di cosa
   si tratta e cosa gli si chiede. Niente promesse di lavoro: è un elenco, non un ingaggio. */
export function inviteMessage(orgName, link, nome = "") {
  const ciao = nome ? "Ciao " + nome.split(" ")[0] + "," : "Ciao,";
  return [
    ciao,
    "",
    "ti va di entrare fra i musicisti di " + (orgName || "StagePlot") + "? Da qui compili il tuo profilo — strumenti, esperienze, repertorio, curriculum — e resti nell'elenco per le prossime produzioni:",
    link,
    "",
    "Ci vogliono pochi minuti, si entra con Google e il profilo resta tuo. Quando c'è un lavoro adatto ti arriva una proposta via email: essere nell'elenco non è un impegno per nessuno.",
  ].join("\n");
}

export const INVITE_STATUS = {
  open: "Da aprire",
  claimed: "Sta compilando",
  done: "Entrato",
  revoked: "Revocato",
  expired: "Scaduto",
};
export const INVITE_PILL = { open: "accent", claimed: "warn", done: "ok", revoked: "", expired: "" };

/* Quanto resta, in parole. Si contano i GIORNI DI CALENDARIO, non le ore: un invito che finisce fra nove
   ore scade oggi, non domani, e chi legge deve poterci contare. */
export function scadenza(iso) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  if (d.getTime() < Date.now()) return "scaduto";
  const mezzanotte = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const giorni = Math.round((mezzanotte(d) - mezzanotte(new Date())) / 86400000);
  if (giorni <= 0) return "scade oggi";
  if (giorni === 1) return "scade domani";
  return "scade fra " + giorni + " giorni";
}
