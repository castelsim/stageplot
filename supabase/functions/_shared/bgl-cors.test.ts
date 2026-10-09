import { assertEquals } from "jsr:@std/assert@1";
import { bglCors } from "./bgl-cors.ts";

const origine = (o: string | null, dev: boolean) => bglCors(o, dev)["Access-Control-Allow-Origin"];

Deno.test("stageplot.it sempre", () => {
  assertEquals(origine("https://stageplot.it", false), "https://stageplot.it");
  assertEquals(origine("https://stageplot.it", true), "https://stageplot.it");
  assertEquals(origine(null, false), "https://stageplot.it");
});

Deno.test("localhost e 127.0.0.1 solo con il flag delle prove", () => {
  assertEquals(origine("http://localhost:5173", true), "http://localhost:5173");
  assertEquals(origine("http://127.0.0.1:8123", true), "http://127.0.0.1:8123");
  assertEquals(origine("http://localhost:5173", false), "https://stageplot.it", "senza flag: la pagina locale non legge la risposta");
  assertEquals(origine("http://127.0.0.1:8123", false), "https://stageplot.it");
});

Deno.test("un'origine qualsiasi mai, nemmeno con il flag", () => {
  for (const o of ["https://evil.example.invalid", "http://localhost.evil.example.invalid", "https://localhost:5173",
    "http://localhost:5173/x", "https://stageplot.it.evil.example.invalid", "http://stageplot.it", "null"]) {
    assertEquals(origine(o, true), "https://stageplot.it", o);
  }
});

Deno.test("metodi e intestazioni", () => {
  const h = bglCors("https://stageplot.it", false);
  assertEquals(h["Access-Control-Allow-Methods"], "POST, OPTIONS");
  assertEquals(h["Vary"], "Origin");
});
