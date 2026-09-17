import { assertEquals } from "jsr:@std/assert@1";
import { RESEND_TIMEOUT_MS, tentaInvio } from "./tenta-invio.ts";
import { send } from "./orc-send.ts";
import { sendEmail } from "./email.ts";

// 17/09, verifica di resilienza: una chiamata a Resend che lancia non deve lasciare righe «in spedizione».

Deno.test("un invio che lancia vale «non spedito», senza eccezioni", async () => {
  assertEquals(await tentaInvio(() => Promise.reject(new Error("rete giù"))), false);
  assertEquals(await tentaInvio(() => Promise.resolve({ ok: true })), true);
  assertEquals(await tentaInvio(() => Promise.resolve({ ok: false })), false);
});

Deno.test("le chiamate a Resend hanno un timeout", async () => {
  const orig = globalThis.fetch;
  const segnali: Array<AbortSignal | null | undefined> = [];
  globalThis.fetch = ((_u: string | URL | Request, init?: RequestInit) => {
    segnali.push(init?.signal);
    return Promise.resolve(new Response("{}", { status: 200 }));
  }) as typeof fetch;
  try {
    await send("k", "a@esempio.it", "s", "<p>h</p>", "t", "chiave");
    await sendEmail({ apiKey: "k", to: "a@esempio.it", subject: "s", html: "<p>h</p>" });
  } finally {
    globalThis.fetch = orig;
  }
  assertEquals(segnali.length, 2);
  assertEquals(segnali.every((s) => s instanceof AbortSignal), true);
  assertEquals(RESEND_TIMEOUT_MS <= 30_000, true);
});
