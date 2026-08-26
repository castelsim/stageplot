// supabase/functions/track-landing/index.ts
//
// Contatore della landing. Riceve al massimo tre parole dal browser — cosa è successo, da quale
// bottone, da quale sito si arrivava — e incrementa un contatore giornaliero. Non scrive righe
// per evento, non salva IP, non mette cookie, non risponde mai con dati.
//
// La porta che la migration 0026 aveva chiuso resta chiusa: il browser NON scrive nel database.
// Scrive questa funzione, con la service key, dopo aver ricondotto tutto a un elenco chiuso.

import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { validaColpo } from "../_shared/landing-metrics.ts";
import { serviceRoleKey } from "../_shared/service-role-key.ts";

/** Un contatore non deve MAI disturbare la pagina: qualunque cosa vada storta, esce 204. */
function fine(status = 204) {
  return new Response(null, { status, headers: corsHeaders });
}

async function impronta(ip: string, salt: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(ip + salt));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return fine(405);

  try {
    const payload = await req.json().catch(() => null);
    const v = validaColpo(payload);
    if (!v.ok) return fine(400);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      serviceRoleKey(Deno.env),
    );

    // Rate limit sull'impronta dell'IP (mai l'IP). Generoso: una persona che naviga fa una visita
    // e qualche clic; 120 in un'ora è oltre qualunque uso umano e taglia lo spam grossolano.
    const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim();
    const salt = Deno.env.get("LANDING_IP_SALT") || "";
    if (ip && salt) {
      const { data: n, error } = await supabase.rpc("landing_throttle_hit", {
        p_ip_hash: await impronta(ip, salt),
      });
      if (error) console.error("throttle landing:", error.message);
      else if (typeof n === "number" && n > 120) return fine(429);
    }

    const { error } = await supabase.rpc("landing_counter_hit", {
      p_event: v.value.event,
      p_source: v.value.source,
      p_ref: v.value.ref,
    });
    if (error) console.error("contatore landing:", error.message);
    return fine();
  } catch (e) {
    console.error("track-landing:", e);
    return fine();
  }
});
