// supabase/functions/_shared/orc-invitations.ts
//
// Le regole PURE delle convocazioni di Orchestre: il testo dell'email, la lettura della risposta del
// musicista, l'idempotenza del worker. Niente rete, niente database: si provano con `deno test`.

export type InviteDate = {
  kind: string;
  starts_at: string;
  ends_at?: string | null;
  venue?: string | null;
  note?: string | null;
};

export type InviteRow = {
  id: string;
  notification_kind: "invite" | "reminder" | "confirmed" | "revoked";
  notification_attempts: number;
  deadline?: string | null;
  note_admin?: string | null;
  musician_first_name: string;
  musician_email: string;
  organization: string;
  production_title: string;
  production_venue?: string | null;
  production_conductor?: string | null;
  production_fee_note?: string | null;
  role_name: string;
  dates: InviteDate[];
};

const KIND: Record<string, string> = {
  rehearsal: "Prova",
  concert: "Concerto",
  recording: "Registrazione",
  travel: "Viaggio",
  other: "Altro",
};

export function esc(s: unknown): string {
  return String(s ?? "").replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!),
  );
}

/** data e ora all'italiana, in Europe/Rome, senza librerie */
export function fmtWhen(iso: string, tz = "Europe/Rome"): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const date = new Intl.DateTimeFormat("it-IT", { timeZone: tz, weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" }).format(d);
  const time = new Intl.DateTimeFormat("it-IT", { timeZone: tz, hour: "2-digit", minute: "2-digit" }).format(d);
  return `${date}, ${time}`;
}

export function fmtDate(d: InviteDate): string {
  const start = fmtWhen(d.starts_at);
  let end = "";
  if (d.ends_at) {
    const dayOf = (iso: string) => new Intl.DateTimeFormat("it-IT", { timeZone: "Europe/Rome", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(iso));
    const sameDay = dayOf(d.starts_at) === dayOf(d.ends_at);   /* nel fuso di chi suona, non del server */
    end = sameDay
      ? " → " + new Intl.DateTimeFormat("it-IT", { timeZone: "Europe/Rome", hour: "2-digit", minute: "2-digit" }).format(new Date(d.ends_at))
      : " → " + fmtWhen(d.ends_at);
  }
  const where = d.venue ? ` · ${d.venue}` : "";
  const note = d.note ? ` (${d.note})` : "";
  return `${KIND[d.kind] ?? d.kind}: ${start}${end}${where}${note}`;
}

/** il link di risposta: il token vive solo qui e nel browser del musicista */
export function responseUrl(token: string, base = "https://stageplot.it"): string {
  return `${base}/orchestre/rispondi/?t=${encodeURIComponent(token)}`;
}

export function buildInviteEmail(
  inv: InviteRow,
  token: string,
  base = "https://stageplot.it",
): { subject: string; html: string; text: string } {
  const reminder = inv.notification_kind === "reminder";
  const url = responseUrl(token, base);
  const subject = reminder
    ? `Promemoria: ${inv.production_title} — ci sei?`
    : `${inv.organization}: ${inv.production_title}, ${inv.role_name}`;
  const dates = inv.dates.map(fmtDate);
  const deadline = inv.deadline ? fmtWhen(inv.deadline) : "";
  const lines: string[] = [];
  lines.push(`Ciao ${inv.musician_first_name},`);
  lines.push(reminder
    ? `non abbiamo ancora la tua risposta per «${inv.production_title}» (${inv.role_name}). Bastano due tocchi dal telefono:`
    : `${inv.organization} ti propone un posto come ${inv.role_name} in «${inv.production_title}».`);
  if (inv.production_conductor) lines.push(`Direzione: ${inv.production_conductor}.`);
  if (inv.production_venue) lines.push(`Luogo: ${inv.production_venue}.`);
  if (dates.length) lines.push("Date:\n" + dates.map((d) => "  • " + d).join("\n"));
  if (inv.production_fee_note) lines.push(`Compenso: ${inv.production_fee_note}.`);
  if (inv.note_admin) lines.push(`Nota: ${inv.note_admin}`);
  if (deadline) lines.push(`Rispondi entro ${deadline}.`);
  lines.push(`Rispondi qui: ${url}`);
  lines.push("Puoi dire sì, no, o solo alcune date. La risposta si può cambiare fino alla scadenza.");
  const text = lines.join("\n\n");
  const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:16px;line-height:1.5;color:#292620">
<p>Ciao ${esc(inv.musician_first_name)},</p>
<p>${reminder
    ? `non abbiamo ancora la tua risposta per <strong>${esc(inv.production_title)}</strong> (${esc(inv.role_name)}). Bastano due tocchi dal telefono.`
    : `<strong>${esc(inv.organization)}</strong> ti propone un posto come <strong>${esc(inv.role_name)}</strong> in <strong>${esc(inv.production_title)}</strong>.`}</p>
${inv.production_conductor ? `<p>Direzione: ${esc(inv.production_conductor)}</p>` : ""}
${inv.production_venue ? `<p>Luogo: ${esc(inv.production_venue)}</p>` : ""}
${dates.length ? `<p>Date:</p><ul>${dates.map((d) => `<li>${esc(d)}</li>`).join("")}</ul>` : ""}
${inv.production_fee_note ? `<p>Compenso: ${esc(inv.production_fee_note)}</p>` : ""}
${inv.note_admin ? `<p>Nota: ${esc(inv.note_admin)}</p>` : ""}
${deadline ? `<p><strong>Rispondi entro ${esc(deadline)}.</strong></p>` : ""}
<p style="margin:24px 0"><a href="${esc(url)}" style="display:inline-block;background:#0d9488;color:#fff;text-decoration:none;font-weight:600;padding:14px 22px;border-radius:8px">Rispondi alla convocazione</a></p>
<p style="color:#746e60;font-size:14px">Puoi dire sì, no, o solo alcune date. La risposta si può cambiare fino alla scadenza. Se il bottone non funziona: ${esc(url)}</p>
</div>`;
  return { subject, html, text };
}

/** l'area del musicista: dove ritrova convocazioni e incarichi, senza token */
export function areaUrl(base = "https://stageplot.it"): string {
  return `${base}/orchestre/musicista/?v=home`;
}

/** Com'è andata: il posto è confermato, o la conferma è stata ritirata. Niente link con token — la risposta
    è già data — ma l'area del musicista, dove l'incarico si ritrova con le sue date. */
export function buildStatusEmail(inv: InviteRow, base = "https://stageplot.it"): { subject: string; html: string; text: string } {
  const confermato = inv.notification_kind === "confirmed";
  const url = areaUrl(base);
  const subject = confermato
    ? `Confermato: ${inv.production_title}, ${inv.role_name}`
    : `Non più confermato: ${inv.production_title}`;
  const dates = inv.dates.map(fmtDate);
  const lines: string[] = [`Ciao ${inv.musician_first_name},`];
  lines.push(confermato
    ? `${inv.organization} ti conferma come ${inv.role_name} in «${inv.production_title}». Il posto è tuo.`
    : `${inv.organization} ha ritirato la conferma per «${inv.production_title}» (${inv.role_name}). Se non ti torna, scrivi a chi ti ha convocato.`);
  if (confermato && inv.production_venue) lines.push(`Luogo: ${inv.production_venue}.`);
  if (confermato && dates.length) lines.push("Date:\n" + dates.map((d) => "  • " + d).join("\n"));
  lines.push(`La tua area: ${url}`);
  const text = lines.join("\n\n");
  const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:16px;line-height:1.5;color:#292620">
<p>Ciao ${esc(inv.musician_first_name)},</p>
<p>${confermato
    ? `<strong>${esc(inv.organization)}</strong> ti conferma come <strong>${esc(inv.role_name)}</strong> in <strong>${esc(inv.production_title)}</strong>. Il posto è tuo.`
    : `<strong>${esc(inv.organization)}</strong> ha ritirato la conferma per <strong>${esc(inv.production_title)}</strong> (${esc(inv.role_name)}). Se non ti torna, scrivi a chi ti ha convocato.`}</p>
${confermato && inv.production_venue ? `<p>Luogo: ${esc(inv.production_venue)}</p>` : ""}
${confermato && dates.length ? `<p>Date:</p><ul>${dates.map((d) => `<li>${esc(d)}</li>`).join("")}</ul>` : ""}
<p style="margin:24px 0"><a href="${esc(url)}" style="display:inline-block;background:#0d9488;color:#fff;text-decoration:none;font-weight:600;padding:14px 22px;border-radius:8px">La tua area</a></p>
</div>`;
  return { subject, html, text };
}

/** chiave di idempotenza per Resend: la stessa spedizione non parte due volte */
export function idempotencyKey(inv: { id: string; notification_kind: string; notification_attempts: number }): string {
  return `orc-${inv.id}-${inv.notification_kind}-${inv.notification_attempts}`;
}

/** il corpo della risposta del musicista → {answer, dates, note} o un errore */
export function parseAnswer(body: unknown): { ok: true; answer: "yes" | "no" | "partial"; dates: { id: string; available: boolean }[]; note: string } | { ok: false; error: string } {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { ok: false, error: "bad_body" };
  const b = body as Record<string, unknown>;
  const answer = b.answer;
  if (answer !== "yes" && answer !== "no" && answer !== "partial") return { ok: false, error: "bad_answer" };
  const dates: { id: string; available: boolean }[] = [];
  if (answer === "partial") {
    if (!Array.isArray(b.dates) || b.dates.length === 0) return { ok: false, error: "no_dates" };
    for (const d of b.dates) {
      if (!d || typeof d !== "object") return { ok: false, error: "bad_dates" };
      const id = (d as Record<string, unknown>).id;
      const av = (d as Record<string, unknown>).available;
      if (typeof id !== "string" || !/^[0-9a-f-]{36}$/.test(id) || typeof av !== "boolean") return { ok: false, error: "bad_dates" };
      dates.push({ id, available: av });
    }
  }
  const note = typeof b.note === "string" ? b.note.slice(0, 1000) : "";
  return { ok: true, answer, dates, note };
}

/** dal token del link all'esadecimale sha-256: identico al DB (encode(digest(tok,'sha256'),'hex')) */
export async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** i token di orc_invite: 24 byte in esadecimale, cioè 48 caratteri [0-9a-f] */
export function isPlausibleToken(token: unknown): token is string {
  return typeof token === "string" && /^[0-9a-f]{48}$/.test(token);
}

/** indirizzi riservati (RFC 2606/6761): mai a un provider vero. Servono ai dati demo e alle prove. */
export function isReservedAddress(email: string): boolean {
  const dom = String(email || "").toLowerCase().split("@")[1] ?? "";
  return /\.(invalid|test|example|localhost)$/.test(dom) || /^example\.(com|net|org)$/.test(dom) || dom === "localhost";
}

/** messaggi per il musicista: dicono cosa fare, mai perché tecnicamente */
export const DENY_TEXT: Record<string, string> = {
  not_found: "Questo link non è valido. Chiedi a chi ti ha invitato di mandartene uno nuovo.",
  revoked: "Questa convocazione non è più attiva. Se pensi sia un errore, scrivi a chi ti ha invitato.",
  expired: "La scadenza per rispondere è passata. Se sei ancora disponibile, scrivi a chi ti ha invitato.",
  locked: "La tua disponibilità è già stata confermata: per cambiarla scrivi a chi ti ha invitato.",
};
