import { assertEquals } from "jsr:@std/assert@1";
import { insertFeedbackRow } from "./feedback-insert.ts";

/* Un client finto che risponde come PostgREST: registra le righe che riceve e restituisce, in
   ordine, le risposte preparate. */
function clientFinto(risposte: Array<{ data?: unknown; error?: unknown }>) {
  const righe: Array<Record<string, unknown>> = [];
  let i = 0;
  const client = {
    from(_t: string) {
      return {
        insert(r: Record<string, unknown>) {
          righe.push(r);
          const risp = risposte[Math.min(i++, risposte.length - 1)];
          return { select: () => ({ single: () => Promise.resolve({ data: risp.data ?? null, error: risp.error ?? null }) }) };
        },
      };
    },
  };
  return { client, righe };
}

Deno.test("una segnalazione legata a un progetto che non esiste si salva lo stesso, senza il progetto", async () => {
  const { client, righe } = clientFinto([
    { error: { code: "23503", message: "violates foreign key constraint feedback_project_id_fkey" } },
    { data: { id: "nuova" } },
  ]);
  const r = await insertFeedbackRow(client, { message: "ciao", project_id: "00000000-0000-4000-8000-000000000000" });
  assertEquals(r, { id: "nuova", error: null, projectDropped: true });
  assertEquals(righe.length, 2);
  assertEquals(righe[1].project_id, null, "il secondo tentativo non porta il progetto");
  assertEquals(righe[1].message, "ciao", "e il messaggio resta quello");
});

Deno.test("senza problemi si salva al primo colpo, col progetto", async () => {
  const { client, righe } = clientFinto([{ data: { id: "uno" } }]);
  const r = await insertFeedbackRow(client, { message: "ciao", project_id: "p1" });
  assertEquals(r, { id: "uno", error: null, projectDropped: false });
  assertEquals(righe.length, 1);
});

Deno.test("un altro errore non si nasconde dietro un secondo tentativo", async () => {
  const { client, righe } = clientFinto([{ error: { code: "42501", message: "permission denied" } }]);
  const r = await insertFeedbackRow(client, { message: "ciao", project_id: "p1" });
  assertEquals(r.error, "permission denied");
  assertEquals(r.id, null);
  assertEquals(righe.length, 1, "niente secondo tentativo: non era il progetto");
});

Deno.test("senza progetto il vincolo non c'entra: niente secondo tentativo", async () => {
  const { client, righe } = clientFinto([{ error: { code: "23503", message: "altro vincolo" } }]);
  const r = await insertFeedbackRow(client, { message: "ciao", project_id: null });
  assertEquals(r.error, "altro vincolo");
  assertEquals(righe.length, 1);
});

Deno.test("se anche il secondo tentativo fallisce, l'errore arriva", async () => {
  const { client } = clientFinto([
    { error: { code: "23503", message: "fk" } },
    { error: { code: "XX000", message: "giu'" } },
  ]);
  const r = await insertFeedbackRow(client, { message: "ciao", project_id: "p1" });
  assertEquals(r, { id: null, error: "giu'", projectDropped: false });
});
