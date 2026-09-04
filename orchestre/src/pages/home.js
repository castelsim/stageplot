/* Home pubblica: se c'è già una sessione, i bottoni portano all'area invece che al login. */
import { BASE } from "../config.js";
import { getSession } from "../auth.js";

(async () => {
  const session = await getSession();
  if (!session) return;
  for (const id of ["topLogin", "ctaLogin"]) {
    const a = document.getElementById(id);
    if (!a) continue;
    a.href = BASE + "/admin/";
    a.textContent = "Vai alla tua area";
  }
})();
