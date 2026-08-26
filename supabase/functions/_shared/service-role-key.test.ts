import { assertEquals } from "jsr:@std/assert@1";
import { serviceRoleKey, usingLegacyKey } from "./service-role-key.ts";

function env(values: Record<string, string | undefined>) {
  return { get: (name: string) => values[name] };
}

Deno.test("senza il secret legacy resta la chiave della piattaforma: comportamento identico a prima", () => {
  const e = env({ SUPABASE_SERVICE_ROLE_KEY: "chiave-di-sistema" });
  assertEquals(serviceRoleKey(e), "chiave-di-sistema");
  assertEquals(usingLegacyKey(e), false);
});

Deno.test("col secret legacy impostato, vince quella: è il JWT statico che non può essere «emesso nel futuro»", () => {
  const e = env({
    SERVICE_ROLE_LEGACY: "chiave-legacy",
    SUPABASE_SERVICE_ROLE_KEY: "chiave-di-sistema",
  });
  assertEquals(serviceRoleKey(e), "chiave-legacy");
  assertEquals(usingLegacyKey(e), true);
});

Deno.test("un secret vuoto o fatto di spazi non conta come impostato", () => {
  /* Incollando il valore capita di lasciare uno spazio o di svuotare il secret senza rimuoverlo:
     in quel caso si deve tornare alla chiave di sistema, non parlare al database con "" . */
  for (const vuoto of ["", "   ", "\n"]) {
    const e = env({ SERVICE_ROLE_LEGACY: vuoto, SUPABASE_SERVICE_ROLE_KEY: "chiave-di-sistema" });
    assertEquals(serviceRoleKey(e), "chiave-di-sistema", `vuoto: ${JSON.stringify(vuoto)}`);
    assertEquals(usingLegacyKey(e), false);
  }
});

Deno.test("gli spazi attorno alla chiave incollata vengono tolti", () => {
  /* Il valore si copia dal dashboard: uno spazio o un a capo in coda finirebbe nell'header
     Authorization e la richiesta verrebbe rifiutata per un motivo del tutto diverso. */
  const e = env({ SERVICE_ROLE_LEGACY: "  chiave-legacy\n" });
  assertEquals(serviceRoleKey(e), "chiave-legacy");
});

Deno.test("se non c'è nessuna chiave si torna stringa vuota, senza lanciare", () => {
  /* Il chiamante decide cosa fare: meglio un 503 esplicito che un crash dentro createClient. */
  assertEquals(serviceRoleKey(env({})), "");
  assertEquals(usingLegacyKey(env({})), false);
});
