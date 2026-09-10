// Le due email di «Richiedi musicisti»: quella che avvisa la società e quella che conferma al cliente.
// Testo puro, senza rete: si prova in Node senza mandare niente a nessuno.

export type ClientRequestRow = {
  id: string;
  contact_name: string;
  contact_company: string;
  contact_email: string;
  contact_phone: string;
  event_kind: string;
  event_title: string;
  event_when: string;
  event_place: string;
  schedule: string;
  repertoire: string;
  budget: string;
  notes: string;
  created_at: string;
  snapshot: Record<string, unknown> | null;
  slots?: Array<{ label: string; instrument_code: string | null; qty: number; covered: boolean }>;
  org_name?: string;
};

const KIND: Record<string, string> = {
  concerto: "Concerto",
  matrimonio: "Matrimonio o cerimonia",
  evento: "Evento aziendale",
  teatro: "Teatro o musical",
  registrazione: "Registrazione",
  tour: "Più date",
  altro: "Altro",
};

export function esc(s: string): string {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/* Quanti musicisti sta chiedendo davvero: la somma dei posti non coperti, non il numero di righe. */
export function needed(row: ClientRequestRow): number {
  return (row.slots ?? []).reduce((n, s) => n + (s.covered ? 0 : Number(s.qty) || 0), 0);
}

function righe(row: ClientRequestRow): string[] {
  return (row.slots ?? []).filter((s) => !s.covered).map((s) => `${s.label || s.instrument_code || "posto"} — ${s.qty === 1 ? "1 posto" : s.qty + " posti"}`);
}

/* L'email alla società: deve bastare per decidere se si può fare, senza aprire niente. */
export function buildInternalEmail(row: ClientRequestRow, base: string): { subject: string; html: string; text: string } {
  const n = needed(row);
  const chi = [row.contact_name, row.contact_company].filter(Boolean).join(" · ");
  const quando = [row.event_when, row.event_place].filter(Boolean).join(" · ");
  const subject = `${n === 1 ? "1 musicista" : n + " musicisti"} — ${row.event_title}${row.event_when ? " (" + row.event_when + ")" : ""}`;
  const lista = righe(row);
  const coperti = (row.slots ?? []).filter((s) => s.covered).length;
  const campi: Array<[string, string]> = [
    ["Chi", chi],
    ["Contatti", [row.contact_email, row.contact_phone].filter(Boolean).join(" · ")],
    ["Evento", `${KIND[row.event_kind] ?? row.event_kind}: ${row.event_title}`],
    ["Quando e dove", quando],
    ["Orari e impegno", row.schedule],
    ["Repertorio", row.repertoire],
    ["Budget", row.budget],
    ["Note", row.notes],
  ];
  const snap = row.snapshot ?? {};
  const palco = snap.palco as { larghezza_cm?: number; profondita_cm?: number } | null | undefined;
  if (palco?.larghezza_cm) campi.push(["Palco", `${palco.larghezza_cm / 100} × ${palco.profondita_cm ? palco.profondita_cm / 100 : "?"} m`]);
  const html = `<div style="font-family:system-ui,sans-serif;max-width:600px">
<h2 style="margin:0 0 4px">${esc(row.event_title)}</h2>
<p style="margin:0 0 16px;color:#555">${esc(n === 1 ? "1 musicista da trovare" : n + " musicisti da trovare")}${coperti ? esc(` · ${coperti} ${coperti === 1 ? "posto coperto" : "posti coperti"} dal cliente`) : ""}</p>
<table style="border-collapse:collapse;width:100%">${campi.filter(([, v]) => v).map(([k, v]) => `<tr><td style="padding:4px 12px 4px 0;color:#666;vertical-align:top;white-space:nowrap">${esc(k)}</td><td style="padding:4px 0">${esc(v).replace(/\n/g, "<br>")}</td></tr>`).join("")}</table>
${lista.length ? `<h3 style="margin:20px 0 6px">Posti da coprire</h3><ul style="margin:0;padding-left:20px">${lista.map((r) => `<li>${esc(r)}</li>`).join("")}</ul>` : ""}
<p style="margin:20px 0 0"><a href="${esc(base)}/orchestre/admin/richieste/?id=${esc(row.id)}" style="background:#0d9488;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none;display:inline-block">Apri la richiesta</a></p>
<p style="margin:16px 0 0;color:#888;font-size:12px">Il cliente aspetta una risposta entro un giorno lavorativo: gliel'abbiamo scritto nella conferma.</p>
</div>`;
  const text = [`${row.event_title} — ${n === 1 ? "1 musicista" : n + " musicisti"}`, "",
    ...campi.filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`), "",
    ...(lista.length ? ["Posti da coprire:", ...lista.map((r) => "- " + r), ""] : []),
    `${base}/orchestre/admin/richieste/?id=${row.id}`].join("\n");
  return { subject, html, text };
}

/* La conferma al cliente: dice cosa succede e in quanto tempo, e non promette prezzi. */
export function buildClientEmail(row: ClientRequestRow, _base?: string): { subject: string; html: string; text: string } {
  const n = needed(row);
  const org = row.org_name || "StagePlot";
  const subject = `Richiesta ricevuta — ${row.event_title}`;
  const html = `<div style="font-family:system-ui,sans-serif;max-width:600px">
<h2 style="margin:0 0 8px">Richiesta ricevuta</h2>
<p style="margin:0 0 16px">Ciao ${esc(row.contact_name.split(" ")[0] || "")}, ${esc(org)} ha ricevuto la tua richiesta per <b>${esc(row.event_title)}</b>${row.event_when ? " (" + esc(row.event_when) + ")" : ""}, con la copia del palco che hai disegnato: ${esc(n === 1 ? "un musicista" : n + " musicisti")} da trovare.</p>
<p style="margin:0 0 16px">Ti rispondiamo <b>entro un giorno lavorativo</b> con i nomi e il preventivo. Disponibilità e prezzo si confermano lì: adesso non è ancora impegnativo per nessuno.</p>
<p style="margin:0 0 8px;color:#555">Se hai materiale da allegare (scaletta, riferimenti, planimetria del luogo), rispondi a questa email.</p>
<p style="margin:16px 0 0;color:#888;font-size:12px">Il progetto che continui a modificare non cambia la richiesta già mandata: quello che è arrivato resta com'era.</p>
</div>`;
  const text = [`Richiesta ricevuta — ${row.event_title}`, "",
    `${org} ha ricevuto la tua richiesta${row.event_when ? " per " + row.event_when : ""}: ${n === 1 ? "un musicista" : n + " musicisti"} da trovare.`,
    "Ti rispondiamo entro un giorno lavorativo con i nomi e il preventivo. Disponibilità e prezzo si confermano lì.",
    "", "Se hai materiale da allegare, rispondi a questa email."].join("\n");
  return { subject, html, text };
}

/* Una chiave per non spedire due volte la stessa cosa se il worker ritenta. */
export function requestKey(id: string, kind: "internal" | "client", attempt: number): string {
  return `orc-req-${kind}-${id}-${attempt}`;
}

/* Indirizzi che non esistono per costruzione: nei dati di prova non devono partire email vere. */
export function isReservedAddress(email: string): boolean {
  const e = String(email || "").toLowerCase().trim();
  return /\.(invalid|test|example|localhost)$/.test(e.split("@")[1] ?? "") || /@example\.(com|org|net)$/.test(e);
}
