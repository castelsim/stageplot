#!/usr/bin/env node
/* Abilita (o disabilita) un account StagePlot alla biglietteria — specifica area §6: «abilitato lo mette Simone (script
   in ops/, nessuna interfaccia per ora)». Scrive SOLO public.bgl_organizzatori, con la chiave di servizio.
   Uso:  SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node ops/bgl-abilita.mjs <email> [--no] [--si] [--produzione]
   Senza --si dice cosa farebbe e non scrive. Verso un indirizzo che non è localhost/127.0.0.1 serve anche --produzione. */
const args = process.argv.slice(2);
const email = (args.find((a) => !a.startsWith("--")) || "").trim().toLowerCase();
const togli = args.includes("--no"), scrivi = args.includes("--si"), prod = args.includes("--produzione");
const BASE = (process.env.SUPABASE_URL || "").replace(/\/+$/, ""), KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
function esci(msg) { console.error(msg); process.exit(1); }
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) esci("Uso: node ops/bgl-abilita.mjs <email> [--no] [--si] [--produzione]");
if (!BASE || !KEY) esci("Servono SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY nell'ambiente.");
if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(BASE) && !prod)
  esci("Questo non è lo stack locale (" + BASE + "): per scrivere in produzione aggiungi --produzione.");
const h = { apikey: KEY, Authorization: "Bearer " + KEY, "Content-Type": "application/json" };
async function trova() {
  for (let pagina = 1; pagina <= 50; pagina++) {
    const r = await fetch(`${BASE}/auth/v1/admin/users?page=${pagina}&per_page=200`, { headers: h });
    if (!r.ok) esci("Elenco degli account: HTTP " + r.status);
    const utenti = (await r.json()).users || [];
    const u = utenti.find((x) => (x.email || "").toLowerCase() === email);
    if (u) return u;
    if (utenti.length < 200) return null;
  }
  return null;
}
const u = await trova();
if (!u) esci("Nessun account con l'email " + email + ": deve aver fatto almeno un accesso a StagePlot.");
const riga = { user_id: u.id, abilitato: !togli };
if (!scrivi) { console.log("Farei: " + (togli ? "disabilitare " : "abilitare ") + email + ". Aggiungi --si per farlo."); process.exit(0); }
const r = await fetch(`${BASE}/rest/v1/bgl_organizzatori?on_conflict=user_id`, { method: "POST",
  headers: { ...h, Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify(riga) });
if (!r.ok) esci("Scrittura: HTTP " + r.status + " " + (await r.text()));
console.log((togli ? "Disabilitato: " : "Abilitato: ") + email);
