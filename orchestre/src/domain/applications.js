/* Candidature: stati, etichette, completamento del profilo. Puro, testato in Node. */

export const PRIVACY_VERSION = "2026-09-09";

/* stato interno (staff) */
export const APP_STATUS = {
  draft: "Bozza", submitted: "Inviata", evaluating: "In valutazione", interview_to_schedule: "Colloquio da programmare",
  interview_scheduled: "Colloquio programmato", audition_to_schedule: "Audizione da programmare", audition_scheduled: "Audizione programmata",
  reserve: "Riserva", accepted: "Accettata", rejected: "Rifiutata", suspended: "Sospesa", archived: "Archiviata",
};
export const APP_PILL = { draft: "", submitted: "accent", evaluating: "accent", interview_to_schedule: "warn", interview_scheduled: "warn", audition_to_schedule: "warn", audition_scheduled: "warn", reserve: "accent", accepted: "ok", rejected: "danger", suspended: "", archived: "" };
/* stato mostrato al candidato: mai i dettagli interni (stessa mappa di orc_public_status nel DB) */
export const PUBLIC_STATUS = { draft: "Bozza", submitted: "Inviata", evaluating: "In valutazione", interview: "Colloquio programmato", audition: "Audizione programmata", reserve: "In riserva", accepted: "Accettata", rejected: "Non accettata", archived: "Archiviata" };
export function publicStatus(s) {
  return ({ draft: "draft", submitted: "submitted", evaluating: "evaluating", interview_to_schedule: "evaluating", audition_to_schedule: "evaluating",
    interview_scheduled: "interview", audition_scheduled: "audition", reserve: "reserve", accepted: "accepted", rejected: "rejected", suspended: "evaluating", archived: "archived" })[s] || "evaluating";
}
export const EVAL_KIND = { interview: "Colloquio", audition: "Audizione", general: "Valutazione" };
export const EVAL_SCORES = [["technical", "Tecnica"], ["intonation", "Intonazione"], ["timing", "Timing"], ["musicality", "Musicalità"], ["reading", "Lettura"], ["versatility", "Versatilità"],
  ["preparation", "Preparazione"], ["experience", "Esperienza"], ["attitude", "Atteggiamento"], ["punctuality", "Puntualità"], ["communication", "Comunicazione"], ["reliability", "Affidabilità"], ["availability", "Disponibilità"]];

/* Gli otto passi dell'onboarding. */
/* Il primo passo è la candidatura intera: nome, contatti, città, strumento principale, consenso, e si
   manda. Gli altri sei sono il profilo, che si completa dopo con calma — foto, curriculum, esperienze.
   Prima i sei campi obbligatori erano sparsi su quattro passi diversi (identità, strumenti, geografia,
   invio): per candidarsi bisognava attraversarli tutti, e sembravano tutti necessari. */
export const STEPS = [
  ["candidatura", "Candidati"],
  ["strumenti", "Strumenti"], ["competenze", "Competenze"], ["esperienze", "Esperienze"],
  ["geografia", "Dove e quando"], ["materiali", "Curriculum e materiali"], ["revisione", "Revisione"],
];
/* Quanti passi ci sono DOPO la candidatura: quelli facoltativi, da contare a parte nella barra. */
export const PASSI_PROFILO = STEPS.length - 1;

export const GENRES = ["classica", "sinfonica", "colonne sonore", "pop", "rock", "jazz", "musical", "sacra", "folk", "elettronica", "altro"];
/* le parti che un musicista sa coprire, con gli stessi codici dei ruoli dell'organico (orc_staffing_roles.part) */
export const PARTI = [["tutti", "Fila"], ["principal", "Prima parte"], ["solo", "Solista"]];

/* Che cosa manca per inviare (stessa regola di orc_profile_missing nel DB) e la percentuale. */
export function missingFields(p, instruments) {
  const m = [];
  if (!p.first_name?.trim()) m.push("first_name");
  if (!p.last_name?.trim()) m.push("last_name");
  if (!p.email?.trim()) m.push("email");
  if (!p.phone?.trim()) m.push("phone");
  if (!p.city?.trim()) m.push("city");
  if (!(instruments || []).some((i) => i.is_primary)) m.push("instrument");
  if (!p.consent_privacy_version) m.push("consent");
  return m;
}
export const FIELD_LABEL = { first_name: "nome", last_name: "cognome", email: "email", phone: "telefono", city: "città", instrument: "strumento principale", consent: "consenso privacy" };

/* Percentuale di completamento: le voci obbligatorie pesano di più, le facoltative completano. */
export function completion(p, instruments, files) {
  const req = 7 - missingFields(p, instruments).length;   // su 7
  const opt = [p.province, p.bio, p.education, p.years_experience != null ? "x" : "", (p.genres || []).length ? "x" : "", p.rehearsal_availability,
    (instruments || []).length > 1 ? "x" : "", (files || []).some((f) => f.kind === "cv") ? "x" : "", p.audio_url || p.video_url || (files || []).some((f) => f.kind === "audio") ? "x" : "",
    p.exp_orchestral || p.exp_pop || p.exp_live || p.exp_studio || p.exp_theatre ? "x" : ""].filter((x) => x && String(x).trim()).length;   // su 10
  return Math.round((req / 7) * 70 + (opt / 10) * 30);
}
