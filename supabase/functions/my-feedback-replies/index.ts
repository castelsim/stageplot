// supabase/functions/my-feedback-replies/index.ts
//
// «C'è una risposta per me?» — l'app lo chiede a ogni avvio di un utente loggato, e segna letta
// quella che ha mostrato.
//
// PERCHÉ ESISTE. Il box «Cosa manca?» non chiede la mail: quella che abbiamo arriva dall'account
// Google e non è stata lasciata per essere ricontattati. La home però promette «il box arriva a me,
// e rispondo io». Questo è il canale di quella promessa: la risposta si legge dentro il prodotto,
// quando quella persona rientra, e a nessun altro.
//
// L'IDENTITÀ VIENE DAL JWT, mai dal corpo della richiesta. Chi chiede con un token valido vede le
// PROPRIE segnalazioni: `user_id` non si accetta come parametro, si ricava. Senza questa regola
// bastherebbe un id altrui per leggere le risposte di un altro.
//
// La tabella `feedback` ha RLS senza policy: al database si arriva solo con la service_role. Perciò
// la function fa lei il controllo di identità, e per la scrittura chiama una funzione SQL che ha il
// permesso scritto dentro (feedback_segna_risposta_letta: solo la propria riga, solo quella colonna).
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { serviceRoleKey } from "../_shared/service-role-key.ts";
import { risposteDaMostrare } from "../_shared/feedback-replies.ts";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization") ?? "";
  const jwt = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  // La anon key è un Bearer valido per il gateway ma non è una persona: chi non ha fatto login
  // non ha segnalazioni proprie da leggere.
  if (!jwt || jwt === Deno.env.get("SUPABASE_ANON_KEY")) return json({ risposte: [] });

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, serviceRoleKey(Deno.env));

  const { data: u } = await supabase.auth.getUser(jwt);
  const utente = u?.user?.id;
  if (!utente) return json({ risposte: [] });

  const body = await req.json().catch(() => ({}));

  // «l'ho letta»: si segna e basta, la risposta non serve rimandarla indietro.
  if (body && typeof body.letta === "string") {
    await supabase.rpc("feedback_segna_risposta_letta", { p_id: body.letta, p_user: utente });
    return json({ ok: true });
  }

  // Le colonne si elencano una per una: `select("*")` farebbe uscire mail, note del triage e il
  // pezzo di progetto allegato, e il giorno che qualcuno aggiunge una colonna uscirebbe pure quella.
  const { data, error } = await supabase
    .from("feedback")
    .select("id,message,risposta,risposta_il,risposta_letta_il")
    .eq("user_id", utente)
    .not("risposta", "is", null)
    .is("risposta_letta_il", null)
    .order("risposta_il", { ascending: false })
    .limit(10);

  if (error) return json({ risposte: [] });
  return json({ risposte: risposteDaMostrare(data) });
});
