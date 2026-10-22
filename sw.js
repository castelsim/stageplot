/* © 2026 stageplot.it — Simone Castellan. Tutti i diritti riservati (vedi LICENSE).
 *
 * Service worker di StagePlot (audit A2): rende VERA la promessa offline del tool.
 *
 * Strategia (13/10/2026, Simone: «sistemami la cache di stageplot così si aggiorna subito»):
 *  - La SHELL dell'editor (/app/, /app.js, /icons.js): PRIMA LA RETE. A ogni apertura si chiede al
 *    server la versione corrente con `cache: "no-cache"`, cioè scavalcando i 10 minuti di max-age di
 *    GitHub Pages (se il file non è cambiato il server risponde 304 e non si riscarica niente). Così
 *    un aggiornamento pubblicato si vede alla prima apertura o ricarica, non alla seconda né dopo
 *    10 minuti. Se la rete manca o non risponde entro RETE_ATTESA_MS si usa la copia salvata: in un
 *    locale senza campo l'editor si apre lo stesso. Se poi la rete arriva, la copia si aggiorna e la
 *    pagina riceve l'avviso «nuova versione».
 *    Prima (stale-while-revalidate) la shell arrivava SEMPRE dalla cache e il rinfresco in background
 *    passava dalla cache HTTP del browser: per 10 minuti tornava la stessa versione vecchia, e anche
 *    l'avviso «nuova versione» non partiva.
 *  - Il resto (vendor, icone, favicon…): stale-while-revalidate come prima — cambia di rado.
 *  - Offline: si serve l'ultima versione salvata. Editing e export PDF funzionano;
 *    login/cloud/condivisione richiedono rete (per natura).
 *  - Cross-origin (Supabase API/WSS): MAI intercettato né cachato.
 */
"use strict";

/* audit L-02: cache namespaced sotto un prefisso. La pulizia in `activate` tocca SOLO le cache
   con questo prefisso (mai le cache di altre app sulla stessa origine). La versione è un lever
   manuale: bump = precache pulito su una release. La freschezza della shell è garantita dalla
   rete-prima sotto, quindi non serve versionare a ogni commit. */
var CACHE_PREFIX = "stageplot-";
/* v3: l'editor è passato da "/" a "/app/". Il bump è OBBLIGATORIO, non cosmetico — senza, la cache v2
   continuerebbe a servire la vecchia shell dell'app sotto la chiave "/", dove ora c'è la landing. */
var CACHE = CACHE_PREFIX + "v3";
var PRECACHE = [
  "/app/",                     /* shell dell'editor (la root è la landing, servita dalla rete) */
  "/app.js",                   /* bundle JS dell'app (caricato defer) — serve offline */
  "/icons.js",                 /* libreria icone estratta dal monolite (caricata async) — serve offline */
  "/vendor/pdf.min.js",
  "/vendor/supabase.min.js",
  "/vendor/qrcode.min.js",
  "/vendor/clipper.min.js",    /* Unisci/Sottrai/Interseca di «Crea elemento» (20/10/2026): si carica al primo uso, offline dopo la prima visita */
  "/favicon.svg",
  "/manifest.webmanifest"
];
/* i file che SONO l'editor: devono essere sempre quelli pubblicati per ultimi */
var SHELL = { "/app/": 1, "/app.js": 1, "/icons.js": 1 };
/* quanto si aspetta la rete prima di aprire la copia salvata (rete lenta, locale senza campo) */
var RETE_ATTESA_MS = 4000;

self.addEventListener("install", function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) {
      /* cache:"reload": il precache scarica dal server, non dalla cache HTTP del browser
         (che per 10 minuti avrebbe ridato la versione di prima) */
      return c.addAll(PRECACHE.map(function (u) { return new Request(u, { cache: "reload" }); }));
    }).then(function () { return self.skipWaiting(); })
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

/* risposta da tenere: piena e sana (no opache, no errori, no 206) */
function sana(res) { return !!(res && res.ok && res.type === "basic" && res.status === 200); }

/* toast "nuova versione" (UX-c1): la copia salvata e quella appena scaricata sono DIVERSE?
   Confronto per header (ETag → Last-Modified → Content-Length): zero costo, niente body. */
function diversa(cached, res) {
  if (!cached) return false;
  var a = cached.headers.get("etag") || cached.headers.get("last-modified") || cached.headers.get("content-length");
  var b = res.headers.get("etag") || res.headers.get("last-modified") || res.headers.get("content-length");
  return !!(a && b && a !== b);
}
function avvisaPagine() {
  return self.clients.matchAll({ type: "window" }).then(function (cs) {
    cs.forEach(function (c) { c.postMessage({ type: "sp-updated" }); });
  }).catch(function () {});
}

/* offline e mai salvato: per le navigazioni dentro l'editor si ripiega sulla shell.
   La landing e le pagine di contenuto non hanno un fallback: offline mostrano l'errore
   del browser, che è la verità (non sono l'app). */
function ripiego(cache, req, url) {
  if (req.mode === "navigate" && url.pathname.indexOf("/app") === 0) {
    return cache.match("/app/").then(function (r) { return r || Response.error(); });
  }
  return Response.error();
}

/* SHELL: prima la rete (vedi in testa). */
function primaLaRete(e, cache, req, url, key) {
  var rete = fetch(req.url, { cache: "no-cache", credentials: "same-origin" });
  var salvata = rete.then(function (res) {
    if (!sana(res)) return null;
    /* la copia SUBITO, prima che la risposta vada alla pagina: dopo, il corpo è già letto e clone()
       fallisce — la cache restava alla versione vecchia e offline si apriva quella (visto in prova) */
    var copia = res.clone();
    return cache.match(key).then(function (vecchia) {
      var cambiata = diversa(vecchia, copia);
      return cache.put(key, copia).then(function () { return cambiata; });
    });
  }).catch(function () { return null; });
  e.waitUntil(salvata);
  return cache.match(key).then(function (cached) {
    if (!cached) return rete.then(function (res) { return res; }, function () { return ripiego(cache, req, url); });
    var attesa = new Promise(function (ok) { setTimeout(function () { ok(null); }, RETE_ATTESA_MS); });
    return Promise.race([rete.then(function (res) { return sana(res) ? res : null; }, function () { return null; }), attesa])
      .then(function (res) {
        if (res) return res;                                  /* la versione del server: la più recente */
        /* rete assente, lenta o in errore: la copia salvata; se la rete arriva dopo con una versione
           nuova, la cache è già aggiornata (salvata) e la pagina riceve l'avviso */
        e.waitUntil(salvata.then(function (cambiata) { if (cambiata) return avvisaPagine(); }));
        return cached;
      });
  });
}

/* RESTO: stale-while-revalidate — risposta subito dalla cache, rinfresco in background. */
function primaLaCopia(e, cache, req, url, key) {
  return cache.match(key).then(function (cached) {
    var fresh = fetch(req).then(function (res) {
      if (sana(res)) cache.put(key, res.clone());
      return res;
    });
    if (cached) {
      e.waitUntil(fresh.catch(function () {}));
      return cached;
    }
    return fresh.catch(function () { return ripiego(cache, req, url); });
  });
}

self.addEventListener("fetch", function (e) {
  var req = e.request;
  if (req.method !== "GET") return;                        /* POST/beacon: rete pura */
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;         /* Supabase ecc.: rete pura */
  /* Orchestre (/orchestre/*) è un'altra applicazione: pagine di login e dati di persone.
     Il SW dell'editor non la cacha e non la serve: rete pura, sempre fresca. */
  if (url.pathname === "/orchestre" || url.pathname.indexOf("/orchestre/") === 0) return;
  /* La biglietteria (/biglietteria/*) mostra posti liberi e occupati: sempre dalla rete, mai una copia vecchia. */
  if (url.pathname === "/biglietteria" || url.pathname.indexOf("/biglietteria/") === 0) return;
  /* Il programma di sala (/programma/*): il contenuto cambia a ogni concerto, sempre dalla rete. */
  if (url.pathname === "/programma" || url.pathname.indexOf("/programma/") === 0) return;
  /* Analisi vocale (/voce/*) è un programma separato (GPL-3, github.com/castelsim/voce):
     il SW dell'editor non la cacha, così ogni aggiornamento arriva intero e mai mescolato. */
  if (url.pathname === "/voce" || url.pathname.indexOf("/voce/") === 0) return;
  /* Il ritorno da Google (/accedi/) porta un accesso: mai da una copia vecchia. */
  if (url.pathname.indexOf("/accedi/") === 0) return;

  /* Le navigazioni verso l'editor (anche /app/?view=…, /app/?utm_source=pwa) usano la stessa
     shell salvata sotto la chiave "/app/": la shell è l'app intera. */
  var isApp = (req.mode === "navigate" && (url.pathname === "/app/" || url.pathname === "/app/index.html"));
  var key = isApp ? "/app/" : req;
  var shell = isApp || (SHELL[url.pathname] === 1 && url.pathname !== "/app/");

  e.respondWith(
    caches.open(CACHE).then(function (cache) {
      return shell ? primaLaRete(e, cache, req, url, key) : primaLaCopia(e, cache, req, url, key);
    })
  );
});
