// supabase/functions/bgl-account/index.ts — «Elimina il mio account» (biglietteria). verify_jwt = false: il token lo
// controlla la funzione. Tutta la logica in _shared/bgl-account.ts; qui l'Admin API vera (D3).
import { createClient } from "jsr:@supabase/supabase-js@2.108.2";
import { gestisciAccount } from "../_shared/bgl-account.ts";
import { utenteDa } from "../_shared/bgl-utente.ts";
import { serviceRoleKey } from "../_shared/service-role-key.ts";

const supabase = createClient(Deno.env.get("SUPABASE_URL")!, serviceRoleKey(Deno.env), {
  auth: { persistSession: false, autoRefreshToken: false },
});

Deno.serve((req) =>
  gestisciAccount(req, {
    utente: utenteDa((t) => supabase.auth.getUser(t)),
    rpc: async (fn, args) => {
      const { data, error } = await supabase.rpc(fn, args);
      return { data, error: error ? { message: error.message } : null };
    },
    elimina: async (uid) => {
      const { error } = await supabase.auth.admin.deleteUser(uid);
      return { error: error ? { message: error.message } : null };
    },
    env: Deno.env,
  })
);
