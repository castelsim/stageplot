/* Configurazione pubblica di Orchestre. La anon key è pubblica per costruzione (sta già nell'editor e
   in consulenza/): la sicurezza è nella RLS del database, non qui. */
export const SB_URL = "https://vsodplqkuvnsdiikvmjb.supabase.co";
export const SB_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
export const BASE = "/orchestre";
export const ROLES = {
  owner: "Proprietario",
  admin: "Amministratore",
  artistic: "Responsabile artistico",
  production: "Responsabile di produzione",
  section: "Coordinatore di sezione",
  viewer: "Visualizzatore",
};
/* Chi entra nell'area admin. section e viewer esistono nel modello ma non hanno ancora una pagina. */
export const STAFF = ["owner", "admin", "artistic", "production"];
