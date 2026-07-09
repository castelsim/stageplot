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

var CACHE = "stageplot-v1";
var PRECACHE = [
  "/",
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
      return Promise.all(keys.filter(function (k) { return k !== CACHE; })
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
            cache.put(key, res.clone());
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
