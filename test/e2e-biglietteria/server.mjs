/* Finto GitHub Pages per le prove (FUORI dal repo): file statici da una cartella; un percorso che non c'è → 404.html con
   stato 404 (come Pages); una cartella → il suo index.html. Uso: node server.mjs <cartella> <porta≠8931> */
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { join, normalize, extname } from "node:path";
const dir = process.argv[2], porta = +process.argv[3];
if (!dir || !porta || porta === 8931) { console.error("uso: node server.mjs <cartella> <porta≠8931>"); process.exit(1); }
const TIPI = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon", ".json": "application/json",
  ".webmanifest": "application/manifest+json", ".webp": "image/webp", ".jpg": "image/jpeg" };
createServer(async (req, res) => {
  const u = new URL(req.url, "http://x");
  let f = join(dir, normalize(decodeURIComponent(u.pathname)).replace(/^(\.\.[/\\])+/, ""));
  try {
    const s = await stat(f);
    if (s.isDirectory()) {
      if (!u.pathname.endsWith("/")) { res.writeHead(301, { location: u.pathname + "/" + u.search }); return res.end(); }
      f = join(f, "index.html");
    }
    const b = await readFile(f);
    res.writeHead(200, { "content-type": TIPI[extname(f)] || "application/octet-stream", "cache-control": "no-store" });
    res.end(b);
  } catch {
    const b = await readFile(join(dir, "404.html")).catch(() => Buffer.from("404"));
    res.writeHead(404, { "content-type": "text/html; charset=utf-8" });
    res.end(b);
  }
}).listen(porta, "127.0.0.1");
