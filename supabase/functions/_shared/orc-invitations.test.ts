import { assertEquals, assertMatch, assertStringIncludes } from "jsr:@std/assert@1";
import { areaUrl, buildInviteEmail, buildStatusEmail, fmtDate, hashToken, idempotencyKey, isPlausibleToken, isReservedAddress, parseAnswer, responseUrl } from "./orc-invitations.ts";

const inv = {
  id: "11111111-1111-4111-8111-111111111111",
  notification_kind: "invite" as const,
  notification_attempts: 0,
  deadline: "2026-10-01T22:00:00Z",
  note_admin: "Prove obbligatorie",
  musician_first_name: "Anna",
  musician_email: "anna@example.invalid",
  organization: "Orchestra Demo",
  production_title: "Morricone in concerto 2026",
  production_venue: "Teatro Remondini, Bassano del Grappa",
  production_conductor: "M. Fantasia",
  production_fee_note: "cachet standard",
  role_name: "Violini primi",
  dates: [
    { kind: "rehearsal", starts_at: "2026-10-15T13:00:00Z", ends_at: "2026-10-15T17:00:00Z", venue: "Teatro Remondini" },
    { kind: "concert", starts_at: "2026-10-17T19:00:00Z", ends_at: "2026-10-17T21:00:00Z" },
  ],
};

Deno.test("l'email dell'invito ha tutto quello che serve per decidere, e il link col token", () => {
  const { subject, html, text } = buildInviteEmail(inv, "a".repeat(48));
  assertEquals(subject, "Orchestra Demo: Morricone in concerto 2026, Violini primi");
  assertStringIncludes(html, "Ciao Anna");
  assertStringIncludes(html, "Violini primi");
  assertStringIncludes(html, "M. Fantasia");
  assertStringIncludes(html, "cachet standard");
  assertStringIncludes(html, "Prove obbligatorie");
  assertStringIncludes(html, "Prova: gio 15/10/2026, 15:00 → 19:00 · Teatro Remondini");
  assertStringIncludes(html, "Concerto: sab 17/10/2026, 21:00 → 23:00");
  assertStringIncludes(html, "Rispondi entro ven 02/10/2026, 00:00");   // 22:00Z del 1° = mezzanotte del 2 a Roma (CEST)
  assertStringIncludes(html, "https://stageplot.it/orchestre/rispondi/?t=" + "a".repeat(48));
  assertStringIncludes(text, "Rispondi qui: https://stageplot.it/orchestre/rispondi/?t=");
  assertEquals(html.includes("anna@example.invalid"), false, "l'email del destinatario non va nel corpo");
});

Deno.test("il promemoria cambia oggetto e attacco, e ripete il link", () => {
  const { subject, html } = buildInviteEmail({ ...inv, notification_kind: "reminder" }, "b".repeat(48));
  assertMatch(subject, /^Promemoria:/);
  assertStringIncludes(html, "non abbiamo ancora la tua risposta");
  assertStringIncludes(html, "?t=" + "b".repeat(48));
});

Deno.test("i testi si neutralizzano: niente HTML iniettato dal titolo", () => {
  const { html } = buildInviteEmail({ ...inv, production_title: "<img src=x onerror=alert(1)>" }, "c".repeat(48));
  assertEquals(html.includes("<img"), false);
  assertStringIncludes(html, "&lt;img");
});

Deno.test("fmtDate: stesso giorno mostra solo l'ora di fine; giorni diversi tutta la data", () => {
  assertEquals(fmtDate({ kind: "travel", starts_at: "2026-10-16T06:00:00Z", ends_at: "2026-10-17T22:00:00Z" }), "Viaggio: ven 16/10/2026, 08:00 → dom 18/10/2026, 00:00");
  assertEquals(fmtDate({ kind: "rehearsal", starts_at: "2026-10-15T13:00:00Z", ends_at: "2026-10-15T17:00:00Z" }), "Prova: gio 15/10/2026, 15:00 → 19:00");
});

Deno.test("parseAnswer: sì e no senza date, parziale con date valide, tutto il resto rifiutato", () => {
  assertEquals(parseAnswer({ answer: "yes" }), { ok: true, answer: "yes", dates: [], note: "" });
  assertEquals(parseAnswer({ answer: "no", note: "impegno" }).ok, true);
  const p = parseAnswer({ answer: "partial", dates: [{ id: "11111111-1111-4111-8111-111111111111", available: true }, { id: "22222222-2222-4222-8222-222222222222", available: false }] });
  assertEquals(p.ok && p.dates.length, 2);
  assertEquals(parseAnswer({ answer: "partial" }), { ok: false, error: "no_dates" });
  assertEquals(parseAnswer({ answer: "partial", dates: [{ id: "x", available: true }] }), { ok: false, error: "bad_dates" });
  assertEquals(parseAnswer({ answer: "maybe" }), { ok: false, error: "bad_answer" });
  assertEquals(parseAnswer("yes"), { ok: false, error: "bad_body" });
  const long = parseAnswer({ answer: "yes", note: "x".repeat(5000) });
  assertEquals(long.ok && long.note.length, 1000);
});

Deno.test("token: 48 esadecimali; lo sha-256 è quello del database; l'idempotenza cambia col tentativo", async () => {
  assertEquals(isPlausibleToken("0123456789abcdef".repeat(3)), true);
  assertEquals(isPlausibleToken("0123456789ABCDEF".repeat(3)), false);
  assertEquals(isPlausibleToken("0123456789abcdef".repeat(2)), false);
  assertEquals(await hashToken("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  assertEquals(idempotencyKey({ id: "x", notification_kind: "invite", notification_attempts: 2 }), "orc-x-invite-2");
  assertEquals(responseUrl("t0k", "http://127.0.0.1:8077"), "http://127.0.0.1:8077/orchestre/rispondi/?t=t0k");
});

Deno.test("gli indirizzi riservati non vanno a Resend: i musicisti demo non producono errori", () => {
  assertEquals(isReservedAddress("anna.baldan@example.invalid"), true);
  assertEquals(isReservedAddress("x@example.com"), true);
  assertEquals(isReservedAddress("x@demo.test"), true);
  assertEquals(isReservedAddress("x@orchestra-example.it"), false);
  assertEquals(isReservedAddress("x@gmail.com"), false);
  assertEquals(isReservedAddress(""), false);
});

Deno.test("la conferma dice che il posto è suo, con le date, e rimanda all'area: niente token, niente compenso", () => {
  const { subject, html, text } = buildStatusEmail({ ...inv, notification_kind: "confirmed" as const });
  assertEquals(subject, "Confermato: Morricone in concerto 2026, Violini primi");
  assertStringIncludes(text, "Il posto è tuo");
  assertStringIncludes(text, "Teatro Remondini");
  assertStringIncludes(html, areaUrl());
  assertEquals(html.includes("/rispondi/") || text.includes("/rispondi/"), false, "la risposta è già data: nessun link con il token");
  assertEquals(text.includes("cachet standard"), false, "il compenso non viaggia in questa email");
});

Deno.test("la revoca lo dice, senza date e senza token", () => {
  const { subject, text, html } = buildStatusEmail({ ...inv, notification_kind: "revoked" as const });
  assertEquals(subject, "Non più confermato: Morricone in concerto 2026");
  assertStringIncludes(text, "ha ritirato la conferma");
  assertEquals(text.includes("Date:"), false);
  assertEquals(html.includes("/rispondi/"), false);
});

Deno.test("anche la conferma neutralizza i testi", () => {
  const { html } = buildStatusEmail({ ...inv, notification_kind: "confirmed" as const, production_title: "<img src=x onerror=alert(1)>" });
  assertEquals(html.includes("<img src=x"), false);
});
