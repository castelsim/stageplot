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
