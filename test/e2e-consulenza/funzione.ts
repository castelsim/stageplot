// Una Edge Function su una porta di questo Mac, SENZA l'edge runtime condiviso dello stack locale (altri agenti lo usano).
// Uso: deno run -A test/e2e-consulenza/funzione.ts <file della function> <porta> <file della posta>
// · Deno.serve viene legato a 127.0.0.1:<porta>;
// · fetch verso api.resend.com NON parte: la mail finisce, come JSON per riga, nel file della posta;
// · ogni altro indirizzo fuori da 127.0.0.1/localhost è rifiutato (mai produzione, mai Stripe).
const [modulo, porta, posta] = Deno.args;
if (!modulo || !porta || !posta || porta === "8931") throw new Error("uso: funzione.ts <function> <porta≠8931> <posta>");

const fetchVero = globalThis.fetch;
globalThis.fetch = (async (input: Request | URL | string, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (url.startsWith("https://api.resend.com/")) {
    const corpo = init?.body ? String(init.body) : await (input as Request).text();
    await Deno.writeTextFile(posta, corpo.replace(/\n/g, " ") + "\n", { append: true });
    return new Response(JSON.stringify({ id: "finto" }), { status: 200, headers: { "Content-Type": "application/json" } });
  }
  if (!/^https?:\/\/(127\.0\.0\.1|localhost)[:/]/.test(url)) throw new Error("rete esterna bloccata nelle prove: " + url);
  return fetchVero(input, init);
}) as typeof fetch;

const serveVero = Deno.serve.bind(Deno);
// deno-lint-ignore no-explicit-any
(Deno as any).serve = (a: unknown, b?: unknown) =>
  serveVero({ port: Number(porta), hostname: "127.0.0.1", onListen() {} }, (typeof a === "function" ? a : b) as Deno.ServeHandler);

await import(new URL(modulo, `file://${Deno.cwd()}/`).href);
console.log("pronta su " + porta);
