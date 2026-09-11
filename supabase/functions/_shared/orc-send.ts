// La spedizione via Resend, una sola per tutte le Edge Function di Orchestre che mandano email.
// L'Idempotency-Key fa sì che la stessa spedizione, ritentata, non parta due volte.

export const FROM = "StagePlot Orchestre <feedback@stageplot.it>";

export async function send(apiKey: string, to: string, subject: string, html: string, text: string, key: string): Promise<{ ok: boolean; status: number }> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json", "Idempotency-Key": key },
    body: JSON.stringify({ from: FROM, to: [to], subject, html, text }),
  });
  return { ok: res.ok, status: res.status };
}
