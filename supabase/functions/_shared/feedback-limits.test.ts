import { assertEquals } from "jsr:@std/assert@1";
import { clientIp, corpoTroppoGrande, GLOBAL_MAX_PER_HOUR, MAX_BODY_BYTES, META_MAX_CHARS, metaPulito, oraPiena } from "./feedback-limits.ts";

// 16/09, verifica di sicurezza: il limite di submit-feedback si aggirava con un IP inventato.

Deno.test("l'IP viene dalla fonte che il client non scrive, se c'è", () => {
  assertEquals(clientIp(new Headers({ "x-forwarded-for": "6.6.6.6, 1.2.3.4", "cf-connecting-ip": "1.2.3.4" })), "1.2.3.4");
  assertEquals(clientIp(new Headers({ "x-forwarded-for": "6.6.6.6", "x-real-ip": "5.5.5.5" })), "5.5.5.5");
  assertEquals(clientIp(new Headers({ "x-forwarded-for": " 9.9.9.9 , 8.8.8.8" })), "9.9.9.9");
  assertEquals(clientIp(new Headers()), "");
});

Deno.test("meta: solo i campi noti, solo stringhe, tagliate", () => {
  const m = metaPulito({ user_agent: "x".repeat(20_000_000), page_url: { a: 1 }, language: "it", altro: "no" });
  assertEquals(m.user_agent.length, META_MAX_CHARS);
  assertEquals("page_url" in m, false);
  assertEquals(m.language, "it");
  assertEquals("altro" in m, false);
  assertEquals(metaPulito(null), {});
});

Deno.test("corpo oltre il tetto", () => {
  assertEquals(corpoTroppoGrande(MAX_BODY_BYTES), false);
  assertEquals(corpoTroppoGrande(MAX_BODY_BYTES + 1), true);
  assertEquals(corpoTroppoGrande(NaN), false);
});

Deno.test("ora piena: il tetto globale regge anche con IP falsi", () => {
  assertEquals(oraPiena(GLOBAL_MAX_PER_HOUR - 1), false);
  assertEquals(oraPiena(GLOBAL_MAX_PER_HOUR), true);
  assertEquals(oraPiena(null), false);
});

import { ADMIN_USER_ID, ANON_MAX_PER_HOUR, limiteInvio, oltreLimite, USER_MAX_PER_HOUR } from "./feedback-limits.ts";

Deno.test("limite per chi invia: anonimo 5, utente 30, admin nessuno", () => {
  assertEquals(limiteInvio(null, "1.2.3.4"), { kind: "ip", key: "1.2.3.4", max: ANON_MAX_PER_HOUR });
  assertEquals(ANON_MAX_PER_HOUR, 5);
  assertEquals(limiteInvio("abc", "1.2.3.4"), { kind: "user", key: "u:abc", max: USER_MAX_PER_HOUR });
  assertEquals(USER_MAX_PER_HOUR, 30);
  assertEquals(limiteInvio(ADMIN_USER_ID, "1.2.3.4"), { kind: "admin" });
  assertEquals(limiteInvio(null, ""), null);
  // l'utente con accesso non dipende dall'IP
  assertEquals(limiteInvio("abc", "")?.kind, "user");
});

Deno.test("oltre il limite: la 6ª anonima e la 31ª utente", () => {
  assertEquals(oltreLimite(5, ANON_MAX_PER_HOUR), false);
  assertEquals(oltreLimite(6, ANON_MAX_PER_HOUR), true);
  assertEquals(oltreLimite(30, USER_MAX_PER_HOUR), false);
  assertEquals(oltreLimite(31, USER_MAX_PER_HOUR), true);
  assertEquals(oltreLimite(null, 5), false);
});

import { ADMIN_USER_ID as ADM, FILTRO_SENZA_ADMIN, soggettoAlTettoGlobale } from "./feedback-limits.ts";

Deno.test("admin: oltre il tetto globale passa; gli altri no", () => {
  assertEquals(oraPiena(GLOBAL_MAX_PER_HOUR + 10) && soggettoAlTettoGlobale(ADM), false); // admin passa
  assertEquals(soggettoAlTettoGlobale("abc"), true);
  assertEquals(soggettoAlTettoGlobale(null), true);
  assertEquals(FILTRO_SENZA_ADMIN, `user_id.is.null,user_id.neq.${ADM}`);
});
