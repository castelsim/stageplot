/* Configurazione pubblica di Orchestre. La anon key è pubblica per costruzione (sta già nell'editor e
   in consulenza/): la sicurezza è nella RLS del database, non qui. */
export const SB_URL = "https://vsodplqkuvnsdiikvmjb.supabase.co";
export const SB_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZzb2RwbHFrdXZuc2RpaWt2bWpiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI2MTkyNjksImV4cCI6MjA5ODE5NTI2OX0.rZmZSvOnrNY3cC2JQ8XnbMTKIfjP5WmtbCtQ6l8zPrc";
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
