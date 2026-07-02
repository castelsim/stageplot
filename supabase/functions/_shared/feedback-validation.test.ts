import { assertEquals } from "jsr:@std/assert@1";
import { validateFeedback } from "./feedback-validation.ts";

Deno.test("ok con messaggio valido", () => {
  const r = validateFeedback({ message: "Manca il basso a 5 corde" });
  assertEquals(r.ok, true);
});

Deno.test("errore: messaggio troppo corto", () => {
  const r = validateFeedback({ message: "ciao" }); // 4 char
  assertEquals(r.ok, false);
});

Deno.test("errore: messaggio troppo lungo", () => {
  const r = validateFeedback({ message: "x".repeat(1001) });
  assertEquals(r.ok, false);
});

Deno.test("honeypot pieno => error 'spam'", () => {
  const r = validateFeedback({ message: "messaggio vero", honeypot: "bot" });
  assertEquals(r.ok, false);
  if (!r.ok) assertEquals(r.error, "spam");
});

Deno.test("hint fuori enum viene azzerato", () => {
  const r = validateFeedback({ message: "messaggio vero", hint: "xxx" });
  assertEquals(r.ok, true);
  if (r.ok) assertEquals(r.value.hint, null);
});

Deno.test("hint valido preservato", () => {
  const r = validateFeedback({ message: "messaggio vero", hint: "bug" });
  assertEquals(r.ok, true);
  if (r.ok) assertEquals(r.value.hint, "bug");
});

Deno.test("project_snapshot troppo grande viene scartato (il messaggio passa)", () => {
  const big = { blob: "x".repeat(1_100_000) }; // > 1 MB serializzato
  const r = validateFeedback({ message: "messaggio vero", project_snapshot: big });
  assertEquals(r.ok, true);
  if (r.ok) assertEquals(r.value.project_snapshot, null);
});

Deno.test("project_snapshot piccolo viene preservato", () => {
  const snap = { a: 1 };
  const r = validateFeedback({ message: "messaggio vero", project_snapshot: snap });
  assertEquals(r.ok, true);
  if (r.ok) assertEquals(r.value.project_snapshot, snap);
});

Deno.test("tech_context troppo grande viene azzerato", () => {
  const big: Record<string, string> = {};
  for (let i = 0; i < 5000; i++) big["k" + i] = "vvvvvvvvvv";
  const r = validateFeedback({ message: "messaggio vero", tech_context: big });
  assertEquals(r.ok, true);
  if (r.ok) assertEquals(Object.keys(r.value.tech_context).length, 0);
});

Deno.test("identità dal payload ignorata (audit S5: no spoofing)", () => {
  const r = validateFeedback({
    message: "messaggio vero",
    user_id: "attacker-controlled-id",
    user_email: "vittima@esempio.it",
  });
  assertEquals(r.ok, true);
  if (r.ok) {
    assertEquals(r.value.user_id, null);
    assertEquals(r.value.user_email, null);
  }
});
