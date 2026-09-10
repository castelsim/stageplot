/* Home: due porte, «chi sei» prima di «cos'è» — chi gestisce l'orchestra entra dal pulsante in alto.
   Chi ha già una sessione non deve rileggere come funziona: la sua porta lo porta dritto nella sua area. */
import { BASE } from "../config.js";
import { getSession } from "../auth.js";

(async () => {
  const session = await getSession();
  if (!session) return;

  /* senza sessione la porta del musicista spiega (pagina pubblica); con la sessione porta alla sua area */
  const mus = document.getElementById("pMusicista");
  if (mus) {
    mus.href = BASE + "/musicista/";
    const vai = document.getElementById("pMusicistaVai");
    if (vai) vai.textContent = "La mia area →";
  }
  const top = document.getElementById("topLogin");
  if (top) { top.href = BASE + "/admin/"; top.textContent = "La tua area"; }
})();
