import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { ambienteLocale, BGL_FROM, BGL_REPLY_TO, dataBreve, dataLunga, esc, inviaMail, mailConferma, postiInParole } from "./bgl-mail.ts";
import { RESEND_TIMEOUT_MS } from "./tenta-invio.ts";

// Biglietteria: la mail di conferma. Dati inventati.
const dati = () => ({ nome: "Mario", titolo: "Concerto di prova", inizio: "2026-10-09T19:00:00Z", luogo: "Teatro di prova, Città",
  posti: ["Platea|A|6", "Platea|A|5"], codice: "K7M4QX", link: "https://stageplot.it/biglietteria/?e=k3m9x2p7qa&c=3f9a0000000000000000000000000000" });

Deno.test("data e ora all'italiana, nel fuso di Roma (anche col cambio d'ora)", () => {
  assertEquals(dataLunga("2026-10-09T19:00:00Z"), "venerdì 9 ottobre 2026, ore 21:00");
  assertEquals(dataLunga("2026-12-31T23:30:00Z"), "venerdì 1 gennaio 2027, ore 00:30");
  assertEquals(dataLunga("2026-11-06T20:00:00Z"), "venerdì 6 novembre 2026, ore 21:00", "a novembre l'ora solare: +1");
  assertEquals(dataBreve("2026-10-09T19:00:00Z"), "ven 9 ottobre");
});

Deno.test("posti raggruppati per fila, in ordine; il settore solo se serve", () => {
  assertEquals(postiInParole(["Platea|A|6", "Platea|A|5"]), ["Fila A, posti 5 e 6"]);
  assertEquals(postiInParole(["Platea|B|3"]), ["Fila B, posto 3"]);
  assertEquals(postiInParole(["Platea|A|10", "Platea|A|9", "Platea|A|2"]), ["Fila A, posti 2, 9 e 10"], "ordine numerico, non alfabetico");
  assertEquals(postiInParole(["Platea|B|1", "Platea|A|7"]), ["Fila A, posto 7", "Fila B, posto 1"]);
  assertEquals(postiInParole(["Platea|10|1", "Platea|9|1"]), ["Fila 9, posto 1", "Fila 10, posto 1"]);
  assertEquals(postiInParole(["Galleria|B|3"]), ["Galleria, fila B, posto 3"], "un solo settore che non è Platea");
  assertEquals(postiInParole(["Platea|A|1", "Galleria|A|1"]), ["Galleria, fila A, posto 1", "Platea, fila A, posto 1"], "più settori");
});

Deno.test("la mail ha tutto: saluto, evento, data, luogo, posti, codice, link per disdire, privacy", () => {
  const m = mailConferma(dati());
  assertEquals(m.subject, "Prenotazione confermata — Concerto di prova, ven 9 ottobre");
  for (const t of [m.html, m.text]) {
    assertStringIncludes(t, "Ciao Mario,");
    assertStringIncludes(t, "Concerto di prova");
    assertStringIncludes(t, "venerdì 9 ottobre 2026, ore 21:00");
    assertStringIncludes(t, "Teatro di prova, Città");
    assertStringIncludes(t, "Fila A, posti 5 e 6");
    assertStringIncludes(t, "K7M4QX");
    assertStringIncludes(t, "di' il tuo cognome o mostra questo codice");
    assertStringIncludes(t, "privacy/#biglietteria");
  }
  assertStringIncludes(m.text, "Disdici qui e libera i posti per altri: https://stageplot.it/biglietteria/?e=k3m9x2p7qa&c=3f9a0000000000000000000000000000");
  assertStringIncludes(m.html, 'href="https://stageplot.it/biglietteria/?e=k3m9x2p7qa&amp;c=3f9a0000000000000000000000000000"');
  assert(!m.text.includes("<"), "il testo semplice non ha HTML");
});

Deno.test("tutto il testo dell'utente e dell'organizzatore è escapato", () => {
  const cattivo = '<script>alert("x")</script>&\'';
  const m = mailConferma({ ...dati(), nome: cattivo, titolo: cattivo, luogo: cattivo });
  assert(!m.html.includes("<script>"), "nessun tag passa");
  assert(!m.html.includes('"x"'), "nessuna virgoletta nuda");
  assertStringIncludes(m.html, "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;&amp;&#39;");
  assertEquals(esc(`<a href='x'>&"`), "&lt;a href=&#39;x&#39;&gt;&amp;&quot;");
  const s = mailConferma({ ...dati(), titolo: "Prova\r\nBcc: tutti@example.invalid" }).subject;
  assert(!/[\r\n]/.test(s), "l'oggetto è una riga sola");
});

Deno.test("ambiente locale: in prova la mail non parte mai", () => {
  for (const u of ["http://127.0.0.1:54321", "http://localhost:54321", "http://kong:8000", undefined, "", "non un url"]) {
    assertEquals(ambienteLocale(u), true, String(u));
  }
  assertEquals(ambienteLocale("https://abcdefghijklmnopqrst.supabase.co"), false);
});

Deno.test("invio: mittente della biglietteria, risposte a info@, testo semplice, timeout", async () => {
  let url = "", init: RequestInit | undefined;
  const finto = ((u: string | URL | Request, i?: RequestInit) => {
    url = String(u); init = i;
    return Promise.resolve(new Response("{}", { status: 200 }));
  }) as typeof fetch;
  const r = await inviaMail({ apiKey: "chiave-finta", to: "mario.rossi@example.invalid", subject: "S", html: "<p>H</p>", text: "T" }, finto);
  assertEquals(r, { ok: true, status: 200 });
  assertEquals(url, "https://api.resend.com/emails");
  const body = JSON.parse(String(init!.body));
  assertEquals(body, { from: BGL_FROM, to: ["mario.rossi@example.invalid"], reply_to: BGL_REPLY_TO, subject: "S", html: "<p>H</p>", text: "T" });
  assertEquals(BGL_FROM, "Biglietteria StagePlot <feedback@stageplot.it>");
  assertEquals((init!.headers as Record<string, string>)["Authorization"], "Bearer chiave-finta");
  assert(init!.signal instanceof AbortSignal, "c'è un timeout");
  assert(RESEND_TIMEOUT_MS > 0);
  const ko = await inviaMail({ apiKey: "k", to: "a@b.it", subject: "S", html: "H", text: "T" },
    (() => Promise.resolve(new Response("no", { status: 422 }))) as typeof fetch);
  assertEquals(ko, { ok: false, status: 422 });
});
