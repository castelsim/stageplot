// supabase/functions/bgl-prenota/index.ts
//
// BIGLIETTERIA — la prenotazione dei posti dalla pagina pubblica stageplot.it/biglietteria/. Pubblica
// (verify_jwt = false): chi prenota può non avere un account; se entra con Google, il token lo controlla la
// funzione. Tutta la logica sta in `_shared/bgl-prenota.ts`, provata con `deno test`; qui solo i collegamenti
// veri (database con la chiave di servizio, Supabase Auth per il token, Resend).

import { createClient } from "jsr:@supabase/supabase-js@2.108.2";
import { gestisciPrenota } from "../_shared/bgl-prenota.ts";
import { inviaMail } from "../_shared/bgl-mail.ts";
import { serviceRoleKey } from "../_shared/service-role-key.ts";
import { utenteDa } from "../_shared/bgl-utente.ts";

const supabase = createClient(Deno.env.get("SUPABASE_URL")!, serviceRoleKey(Deno.env), {
  auth: { persistSession: false, autoRefreshToken: false },
});

Deno.serve((req) =>
  gestisciPrenota(req, {
    rpc: async (fn, args) => {
      const { data, error } = await supabase.rpc(fn, args);
      return { data, error: error ? { message: error.message } : null };
    },
    invia: (a) => inviaMail(a),
    env: Deno.env,
    // accesso Google: il token si verifica con Supabase Auth (getUser), mai fidandosi del corpo
    utente: utenteDa((t) => supabase.auth.getUser(t)),
  })
);
