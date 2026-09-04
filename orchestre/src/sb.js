import { SB_URL, SB_ANON } from "./config.js";
/* Un solo client per pagina. supabase-js è self-hosted (vendor/supabase.min.js) e caricato dalla shell
   PRIMA di questo modulo: qui si trova in window.supabase. PKCE come nell'editor e in /consulenza/. */
const lib = globalThis.supabase || null;
export const sb = lib && lib.createClient
  ? lib.createClient(SB_URL, SB_ANON, { auth: { detectSessionInUrl: true, persistSession: true, autoRefreshToken: true, flowType: "pkce" } })
  : null;
