/* Anti-clickjacking per le pagine di Orchestre. Script CLASSICO, non modulo, e primo nella <head>: deve
   girare prima che la pagina si disegni.

   Perché serve: tutte le pagine dichiarano `frame-ancestors 'none'` nella CSP, ma dentro un <meta> quella
   direttiva il browser la IGNORA (vale solo come header HTTP, e GitHub Pages non ne manda). Fino
   all'11/09/2026 nessuna pagina di Orchestre aveva altra difesa: un sito qualsiasi poteva incorniciare
   l'area admin o /rispondi/ — dove un convocato accetta o rifiuta un ingaggio — e far cliccare a chi
   guarda un bottone che non vede.

   Cosa fa:
   - non incorniciata, o incorniciata da una pagina nostra (stessa origine): niente;
   - incorniciata da un altro sito: si NASCONDE subito, poi prova a uscire dal frame. Si nasconde PRIMA
     di provare, non dopo un'eccezione: in Chrome l'uscita bloccata lancia (provato l'11/09, sia dentro un
     <iframe sandbox> sia in un iframe normale di un'altra origine), ma un browser che la rifiutasse in
     silenzio lascerebbe la pagina visibile e cliccabile. Nascondersi prima non costa niente.
   Stili via CSSOM (element.style), che la CSP senza 'unsafe-inline' permette; testo via textContent. */
(function () {
  var w = window;
  if (w.self === w.top) return;
  var stessaOrigine = false;
  try { stessaOrigine = w.top.location.origin === w.location.origin; } catch { stessaOrigine = false; }
  if (stessaOrigine) return;
  var d = w.document;
  d.documentElement.style.visibility = "hidden";
  d.addEventListener("DOMContentLoaded", function () {
    var p = d.createElement("p");
    /* la pagina resta nascosta: le pagine di Orchestre disegnano anche DOPO (toast, dati dalla rete), e
       riaccendere tutto riaccenderebbe anche quello. Si vede solo questo paragrafo — visibility si
       eredita, ma un figlio può riaccenderla per sé. */
    p.style.cssText = "visibility:visible;font:16px/1.5 system-ui,sans-serif;padding:24px;max-width:34em";
    p.textContent = "StagePlot Orchestre non si apre dentro la pagina di un altro sito. ";
    var a = d.createElement("a");
    a.href = w.location.href;
    a.target = "_top";
    a.rel = "noopener";
    a.textContent = "Aprila da sola";
    p.appendChild(a);
    d.body.replaceChildren(p);
  });
  try { w.top.location.replace(w.location.href); } catch { /* sandbox: resta nascosta */ }
})();
