// supabase/functions/bgl-avvisa/index.ts
//
// BIGLIETTERIA — la mail «posti cambiati» che l'organizzatore manda dall'area dopo «Sposta». verify_jwt = false: il
// token lo controlla la funzione (la richiesta OPTIONS del browser non ne ha uno). Tutta la logica in _shared/bgl-avvisa.ts.
import { createClient } from "jsr:@supabase/supabase-js@2.108.2";
import { gestisciAvvisa } from "../_shared/bgl-avvisa.ts";
import { inviaMail } from "../_shared/bgl-mail.ts";
import { utenteDa } from "../_shared/bgl-utente.ts";
import { serviceRoleKey } from "../_shared/service-role-key.ts";

const supabase = createClient(Deno.env.get("SUPABASE_URL")!, serviceRoleKey(Deno.env), {
  auth: { persistSession: false, autoRefreshToken: false },
});

Deno.serve((req) =>
  gestisciAvvisa(req, {
    utente: utenteDa((t) => supabase.auth.getUser(t)),
    rpc: async (fn, args) => {
      const { data, error } = await supabase.rpc(fn, args);
      return { data, error: error ? { message: error.message } : null };
    },
    invia: (a) => inviaMail(a),
    env: Deno.env,
  })
);
