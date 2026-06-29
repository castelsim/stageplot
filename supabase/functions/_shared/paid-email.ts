function esc(s: string | null | undefined): string {
  return (s ?? "—").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]!));
}

const PRODUCT_LABEL: Record<string, string> = {
  "pro-review": "Stage Plot Pro Review",
  "production-pack": "Production Pack",
};

export function buildPaidEmail(a: {
  name: string | null; email: string | null; product: string | null;
  amount: number | null; viewUrl: string;
}): { subject: string; html: string } {
  const label = a.product ? (PRODUCT_LABEL[a.product] ?? a.product) : "—";
  const eur = a.amount != null ? (a.amount / 100).toFixed(2) + " €" : "—";
  const subject = `Nuova consulenza pagata — ${label} — ${a.name || a.email || "cliente"}`;
  const html =
    `<h2>Consulenza pagata</h2>` +
    `<p><strong>Contatto:</strong> ${esc(a.name)} &lt;${esc(a.email)}&gt;</p>` +
    `<p><strong>Pacchetto:</strong> ${esc(label)} — <strong>Importo:</strong> ${esc(eur)}</p>` +
    `<p><strong>Link vivo (sessione):</strong> <a href="${a.viewUrl}">${a.viewUrl}</a></p>`;
  return { subject, html };
}
