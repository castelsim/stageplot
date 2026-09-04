/* Funzioni pure di Orchestre: si provano in Node senza browser né rete. */
import test from "node:test";
import assert from "node:assert/strict";
import { esc, roleLabel, isStaff, fmtDate, errMsg } from "../src/ui.js";
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

test("errMsg estrae il messaggio da un errore PostgREST o da una stringa", () => {
  assert.equal(errMsg({ message: "non autorizzato", code: "42501" }), "non autorizzato");
  assert.equal(errMsg("secco"), "secco");
  assert.equal(errMsg(null), "Qualcosa non ha risposto. Riprova.");
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
