import { assertEquals, assertRejects } from "jsr:@std/assert@1";
import { LOTTO, pulisciAccount, pulisciLocandine, type PuliziaDeps } from "./bgl-pulizia.ts";

const UID = "0b8d0000-0000-4000-8000-000000000001";
const nome = (i: number) => `${UID}/${i.toString(16).padStart(32, "0")}.webp`;
function finto(orfane: unknown, errore: string | null = null) {
  const chiamate: { fn: string; args: Record<string, unknown> }[] = [], tolti: string[][] = [];
  const deps: PuliziaDeps = {
    rpc: (fn, args) => { chiamate.push({ fn, args }); return Promise.resolve(errore ? { data: null, error: { message: errore } } : { data: orfane, error: null }); },
    rimuovi: (bucket, nomi) => { tolti.push([bucket, ...nomi]); return Promise.resolve({ error: null, tolti: nomi.length }); },
  };
  return { deps, chiamate, tolti };
}

Deno.test("locandine orfane: chiede quelle più vecchie di 24 ore e le toglie a lotti di 100", async () => {
  const f = finto(Array.from({ length: 250 }, (_, i) => nome(i)));
  const r = await pulisciLocandine(f.deps, new Date("2026-10-20T03:17:00Z"));
  assertEquals(f.chiamate, [{ fn: "bgl_locandine_orfane", args: { p_prima: "2026-10-19T03:17:00.000Z" } }]);
  assertEquals(f.tolti.map((t) => [t[0], t.length - 1]), [["bgl-locandine", LOTTO], ["bgl-locandine", LOTTO], ["bgl-locandine", 50]]);
  assertEquals(r, { locandine_orfane: 250 });
});

Deno.test("locandine orfane: un nome che non è una locandina non arriva mai alla Storage API", async () => {
  const f = finto([nome(1), "../feedback-shots/2026-10-01/x.png", "altro/file.webp", `${UID}/${"a".repeat(32)}.svg`, 42, null]);
  await pulisciLocandine(f.deps, new Date());
  assertEquals(f.tolti, [["bgl-locandine", nome(1)]]);
});

Deno.test("locandine orfane: niente da togliere = nessuna chiamata; errore del database = rosso (il workflow fallisce)", async () => {
  const vuoto = finto([]);
  assertEquals(await pulisciLocandine(vuoto.deps, new Date()), { locandine_orfane: 0 });
  assertEquals(vuoto.tolti.length, 0);
  await assertRejects(() => pulisciLocandine(finto(null, "boom").deps, new Date()), Error, "locandine orfane: boom");
  const rotto = finto([nome(1)]);
  rotto.deps.rimuovi = () => Promise.resolve({ error: { message: "storage giù" }, tolti: 0 });
  await assertRejects(() => pulisciLocandine(rotto.deps, new Date()), Error, "locandine: storage giù");
});

// ───────────────────────────── account del pubblico fermi da 12 mesi (task 9, D9)
Deno.test("account: per ognuno prima la preparazione, poi la cancellazione; chi intanto usa StagePlot si salta", async () => {
  const A = "0b8d0000-0000-4000-8000-00000000000a", B = "0b8d0000-0000-4000-8000-00000000000b", C = "0b8d0000-0000-4000-8000-00000000000c";
  const ordine: string[] = [];
  const r = await pulisciAccount({
    rpc: (fn, args) => {
      ordine.push(fn);
      if (fn === "bgl_account_da_pulire") return Promise.resolve({ data: [A, B, C, "non-uuid"], error: null });
      return Promise.resolve({ data: args.p_uid === B ? { ok: false, errore: "account_in_uso" } : { ok: true }, error: null });
    },
    elimina: (uid) => { ordine.push("elimina " + uid.slice(-1)); return Promise.resolve({ error: uid === C ? { message: "x" } : null }); },
  }, 200);
  assertEquals(r, { account_puliti: 1, account_falliti: 2 });
  assertEquals(ordine, ["bgl_account_da_pulire", "bgl_account_prepara_eliminazione", "elimina a", "bgl_account_prepara_eliminazione",
    "bgl_account_prepara_eliminazione", "elimina c"]);
});
