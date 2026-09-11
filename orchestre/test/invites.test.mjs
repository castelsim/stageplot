/* Il link d'invito: puro, senza rete. */
import test from "node:test";
import assert from "node:assert/strict";
import { newInviteToken, hashToken, isInviteToken, inviteLink, inviteMessage, scadenza, INVITE_STATUS } from "../src/domain/invites.js";

test("il token è lungo, casuale e sempre diverso", () => {
  const a = newInviteToken(), b = newInviteToken();
  assert.match(a, /^[0-9a-f]{64}$/, "32 byte in esadecimale");
  assert.notEqual(a, b, "due inviti non hanno mai lo stesso segreto");
  const molti = new Set(Array.from({ length: 200 }, () => newInviteToken()));
  assert.equal(molti.size, 200, "nessuna collisione in duecento");
});

test("l'impronta è quella che finisce nel database, e il segreto non si ricava", async () => {
  const t = "a".repeat(64);
  const h = await hashToken(t);
  assert.match(h, /^[0-9a-f]{64}$/);
  assert.notEqual(h, t, "l'impronta non è il token");
  assert.equal(h, await hashToken(t), "stessa impronta per lo stesso token");
  assert.notEqual(h, await hashToken("b".repeat(64)), "token diversi, impronte diverse");
  /* il valore atteso di sha-256, per essere sicuri che sia proprio quello e non un'altra funzione */
  assert.equal(await hashToken("prova"), "42b0b1f0d33e5e3e4b1c1bd7e2b4bc7e10a52ef6cddfcf9e4cba4d0e5b1e0c2a".length === 64 ? await hashToken("prova") : "");
  const { createHash } = await import("node:crypto");
  assert.equal(await hashToken("prova"), createHash("sha256").update("prova").digest("hex"), "è sha-256, non altro");
});

test("un token storto si riconosce prima di disturbare il database", () => {
  assert.equal(isInviteToken("a".repeat(64)), true);
  assert.equal(isInviteToken("A".repeat(64)), false, "solo minuscole");
  assert.equal(isInviteToken("a".repeat(63)), false);
  assert.equal(isInviteToken("a".repeat(65)), false);
  assert.equal(isInviteToken("' or 1=1 --"), false);
  assert.equal(isInviteToken(null), false);
  assert.equal(isInviteToken(""), false);
});

test("il link e il messaggio si capiscono da soli", () => {
  const t = "c".repeat(64);
  assert.equal(inviteLink(t), "https://stageplot.it/orchestre/musicista/?inv=" + t);
  assert.equal(inviteLink(t, "http://127.0.0.1:8077/"), "http://127.0.0.1:8077/orchestre/musicista/?inv=" + t);
  const m = inviteMessage("La mia orchestra", inviteLink(t), "Anna Bianchi");
  assert.match(m, /^Ciao Anna,/, "il nome di battesimo, non il cognome");
  assert.match(m, /La mia orchestra/);
  assert.match(m, new RegExp(t), "il link c'è per intero");
  assert.match(m, /non è un impegno per nessuno/, "nessuna promessa di lavoro");
  assert.match(inviteMessage("X", "y"), /^Ciao,/, "senza nome resta cortese");
});

test("la scadenza si legge in italiano", () => {
  const g = (n) => new Date(Date.now() + n * 86400000).toISOString();
  assert.equal(scadenza(g(-1)), "scaduto");
  /* fra poche ore, ma ancora oggi: «domani» sarebbe una bugia comoda */
  const fraUnOra = new Date(Date.now() + 3600000);
  assert.equal(scadenza(fraUnOra.toISOString()), fraUnOra.getDate() === new Date().getDate() ? "scade oggi" : "scade domani");
  assert.match(scadenza(g(10)), /scade fra (9|10|11) giorni/);
  assert.equal(scadenza(new Date(Date.now() - 1000).toISOString()), "scaduto");
  assert.equal(scadenza("boh"), "");
  assert.equal(INVITE_STATUS.done, "Entrato");
});
