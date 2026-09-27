/* Il codice VERO dell'app (app.js) in un sandbox node, con uno stub DOM che ingoia tutto.
   Stessa tecnica di engines.test.mjs, qui separata per le suite che la riusano (collaudo.test.mjs).
   ⚠️ Nel DOM finto `nextElementSibling` e `firstChild` non finiscono mai: niente cicli su quelli. */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import vm from "node:vm";

export const root = join(dirname(fileURLToPath(import.meta.url)), "..");

export function loadApp({ silenzio = true } = {}) {
  const appjs = readFileSync(join(root, "app.js"), "utf8");
  const mkU = () => { const f = function () { return U; }; const U = new Proxy(f, {
    get: (t, k) => { if (k === Symbol.toPrimitive) return () => 0; if (k === "length") return 0; return U; },
    apply: () => U, construct: () => U, set: () => true, has: () => true }); return U; };
  const U = mkU();
  const muto = { log() {}, warn() {}, error() {}, info() {}, debug() {} };
  const ctx = {
    console: silenzio ? muto : console,
    navigator: { serviceWorker: { register: () => ({ then: () => ({ catch: () => {} }) }) }, userAgent: "node" },
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    matchMedia: () => ({ matches: false, addEventListener: () => {}, addListener: () => {} }),
    setTimeout: () => 0, clearTimeout: () => {}, setInterval: () => 0, clearInterval: () => {}, requestAnimationFrame: () => 0,
    addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => true,
    Event: function () {}, CustomEvent: function () {},
    fetch: () => Promise.reject(new Error("no net")),
    location: { search: "", href: "http://localhost/", pathname: "/" },
    performance: { now: () => 0 }, atob: (s) => s, btoa: (s) => s,
    URL, URLSearchParams, XMLSerializer: function () { this.serializeToString = () => ""; },
  };
  ctx.document = new Proxy({}, { get: () => U });
  ctx.window = new Proxy(ctx, { get: (t, k) => (k in t ? t[k] : U), set: (t, k, v) => { t[k] = v; return true; } });
  ctx.self = ctx.window; ctx.globalThis = ctx;
  vm.createContext(ctx);
  try { vm.runInContext(appjs, ctx, { timeout: 20000 }); } catch (e) { /* il boot tocca il DOM finto: i motori sono già definiti */ }
  if (typeof ctx.TYPES !== "object" || typeof ctx.importProject !== "function") throw new Error("Sandbox non caricato: app.js è cambiato? (node build.mjs)");
  return ctx;
}
