/* © 2026 stageplot.it — Simone Castellan. Tutti i diritti riservati (vedi LICENSE).
 *
 * Service worker di StagePlot (audit A2): rende VERA la promessa offline del tool.
 *
 * Strategia: stale-while-revalidate, senza versioning manuale della cache.
 *  - Prima visita: precache della shell (index single-file + vendor + icone).
 *  - Visite successive: risposta ISTANTANEA dalla cache; in background si scarica
 *    la versione fresca e si aggiorna la cache → la prossima apertura è aggiornata.
 *    Ogni visita online rinfresca tutto: nessun utente resta bloccato su una
 *    versione vecchia (il classico bug dei service worker).
 *  - Offline: si serve l'ultima versione cachata. Editing e export PDF funzionano;
 *    login/cloud/condivisione richiedono rete (per natura).
 *  - Cross-origin (Supabase API/WSS): MAI intercettato né cachato.
 */
"use strict";

/* audit L-02: cache namespaced sotto un prefisso. La pulizia in `activate` tocca SOLO le cache
   con questo prefisso (mai le cache di altre app sulla stessa origine). La versione è un lever
   manuale: bump = precache pulito su una release. La freschezza a ogni visita è già garantita
   dallo stale-while-revalidate sotto, quindi non serve versionare a ogni commit. */
var CACHE_PREFIX = "stageplot-";
var CACHE = CACHE_PREFIX + "v2";
var PRECACHE = [
  "/",
  "/app.js",                   /* bundle JS dell'app (caricato defer) — serve offline */
  "/icons.js",                 /* libreria icone estratta dal monolite (caricata async) — serve offline */
  "/vendor/pdf.min.js",
  "/vendor/supabase.min.js",
  "/vendor/qrcode.min.js",
  "/favicon.svg",
  "/manifest.webmanifest"
];

self.addEventListener("install", function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) { return c.addAll(PRECACHE); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener("activate", function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k.indexOf(CACHE_PREFIX) === 0 && k !== CACHE; })
        .map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function (e) {
  var req = e.request;
  if (req.method !== "GET") return;                        /* POST/beacon: rete pura */
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;         /* Supabase ecc.: rete pura */

  /* Le navigazioni verso la home (anche /?view=…, /?utm_source=pwa) usano la stessa
     shell cachata sotto la chiave "/": il single-file è l'app intera. */
  var key = (req.mode === "navigate" && (url.pathname === "/" || url.pathname === "/index.html"))
    ? "/" : req;

  e.respondWith(
    caches.open(CACHE).then(function (cache) {
      return cache.match(key).then(function (cached) {
        var fresh = fetch(req).then(function (res) {
          /* si cacha solo una risposta piena e sana (no opache, no errori, no 206) */
          if (res && res.ok && res.type === "basic" && res.status === 200) {
            /* toast "nuova versione" (UX-c1): se il refresh in background della shell scarica
               una versione DIVERSA da quella appena servita dalla cache, avvisa le pagine aperte.
               Confronto per header (ETag → Last-Modified → Content-Length): zero costo, niente body. */
            /* key è la stringa "/" per le navigazioni, ma un Request per gli asset → si confronta il pathname */
            var kPath = (typeof key === "string") ? key : new URL(key.url).pathname;
            var isShell = (kPath === "/" || kPath === "/app.js" || kPath === "/icons.js");
            var changed = false;
            if (cached && isShell) {
              var a = cached.headers.get("etag") || cached.headers.get("last-modified") || cached.headers.get("content-length");
              var b = res.headers.get("etag") || res.headers.get("last-modified") || res.headers.get("content-length");
              changed = !!(a && b && a !== b);
            }
            var putP = cache.put(key, res.clone());
            if (changed) {
              /* dopo il put: al click su "Ricarica" la cache è già aggiornata → basta 1 reload */
              putP.then(function () {
                return self.clients.matchAll({ type: "window" });
              }).then(function (cs) {
                cs.forEach(function (c) { c.postMessage({ type: "sp-updated" }); });
              }).catch(function () {});
            }
          }
          return res;
        });
        if (cached) {
          /* SWR: risposta subito dalla cache, refresh in background (senza far fallire l'evento) */
          e.waitUntil(fresh.catch(function () {}));
          return cached;
        }
        return fresh.catch(function () {
          /* offline e mai cachato: per le navigazioni si ripiega sulla shell */
          if (req.mode === "navigate") return cache.match("/");
          return Response.error();
        });
      });
    })
  );
});
