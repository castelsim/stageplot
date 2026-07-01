import type { Brief } from "./validation.ts";

function esc(s: string | undefined): string {
  return (s ?? "—").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]!));
}

export function buildEmailHtml(
  b: Brief,
  opts: { paid: boolean; attachmentUrls: string[]; viewUrl?: string },
): { subject: string; html: string } {
  const subject = `Nuova richiesta consulenza — ${b.name}`;
  const stato = opts.paid ? "Pagato" : "Non pagato";
  const rows: [string, string | undefined][] = [
    ["Nome", b.name], ["Email", b.email], ["Tipo evento", b.event_type],
    ["Data e luogo", b.date_place], ["Organico", b.lineup],
    ["Materiali", b.materials], ["Note", b.notes],
  ];
  const body = rows.map(([k, v]) => `<p><strong>${k}:</strong> ${esc(v)}</p>`).join("");
  const links = opts.attachmentUrls.length
    ? "<p><strong>Allegati:</strong></p><ul>" +
      opts.attachmentUrls.map((u) => `<li><a href="${u}">${u}</a></li>`).join("") + "</ul>"
    : "<p><strong>Allegati:</strong> nessuno</p>";
  const view = opts.viewUrl
    ? `<p><strong>Stage plot (sempre aggiornato):</strong> <a href="${opts.viewUrl}">${opts.viewUrl}</a></p>`
    : "";
  const html = `<h2>Richiesta consulenza Stage Plot</h2><p><strong>Stato pagamento:</strong> ${stato}</p>${body}${view}${links}`;
  return { subject, html };
}

export async function sendEmail(args: {
  apiKey: string; to: string; subject: string; html: string;
}): Promise<{ ok: boolean; status: number }> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": `Bearer ${args.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: "StagePlot <feedback@stageplot.it>",
      to: [args.to], subject: args.subject, html: args.html,
    }),
  });
  return { ok: res.ok, status: res.status };
}
