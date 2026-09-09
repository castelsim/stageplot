/* Il motore di matching: puro, deterministico, spiegabile. La «regola Morricone» della SPEC è il caso
   di prova: stessa produzione > stesso repertorio > compositore altrove > tipologia compatibile >
   altri idonei > nuovi (con rotazione). */
import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_WEIGHTS, maxPositive, checkRequirements, scoreCandidate, rankCandidates, applyOverrides, explain } from "../src/domain/matching.js";

/* punti grezzi → punteggio 0-100 con la scala dei pesi di default */
const pts = (raw, W = DEFAULT_WEIGHTS) => Math.round(50 + (50 * raw) / maxPositive(W));

const NOW = new Date("2026-09-05T10:00:00Z");
const base = (over) => ({
  id: "x", name: "Prova Uno", status: "active", instruments: [{ code: "violino", level: 4, primary: true }], skills: [{ code: "lettura_prima_vista", level: 2 }],
  repertoire: [], tags: [], n_collab: 0, n_same_series: 0, n_same_repertoire: 0, n_same_composer_prod: 0, composer_declared: [], n_same_conductor: 0,
  n_same_client: 0, n_same_kind: 0, last_engagement: null, withdrawals: [], recent_load: 0, conflict: false, in_production: false, excluded: [], ...over,
});
const ctx = {
  production: { id: "p", title: "Morricone in concerto 2026", series: "morricone in concerto", conductor: "M. Fantasia", client: "Comune", kind: "concerto",
    repertoire: [{ id: "r1", kind: "composer", name: "Ennio Morricone" }, { id: "r2", kind: "program", name: "Morricone in concerto" }] },
  role: { id: "ro", name: "Violini primi", instrument_code: "violino", part: "principal", min_level: null, requirements: [] },
};

test("regola Morricone: l'ordine della SPEC esce dal punteggio", () => {
  const data = { ...ctx, candidates: [
    base({ id: "nuovo", name: "F Nuovo" }),
    base({ id: "altri", name: "E Altri", n_collab: 2, n_same_kind: 2 }),
    base({ id: "compat", name: "D Compatibile", n_collab: 3, n_same_kind: 3, composer_declared: ["declared"] }),
    base({ id: "comp", name: "C Compositore", n_collab: 2, n_same_kind: 2, n_same_composer_prod: 1, composer_declared: ["history"] }),
    base({ id: "rep", name: "B Repertorio", n_collab: 3, n_same_kind: 3, n_same_repertoire: 2, n_same_composer_prod: 2, composer_declared: ["history"] }),
    base({ id: "serie", name: "A Serie", n_collab: 3, n_same_kind: 3, n_same_series: 2, n_same_repertoire: 2, n_same_composer_prod: 2, n_same_conductor: 2, composer_declared: ["history"] }),
  ] };
  const r = rankCandidates(data, DEFAULT_WEIGHTS, NOW);
  assert.deepEqual(r.map((x) => x.musician_id), ["serie", "rep", "comp", "compat", "altri", "nuovo"]);
  assert.ok(r[0].score > r[1].score && r[1].score > r[2].score && r[2].score > r[3].score && r[3].score > r[4].score && r[4].score > r[5].score, r.map((x) => x.score).join(","));
  assert.ok(r.every((x) => x.eligible));
  assert.deepEqual(r.map((x) => x.rank), [1, 2, 3, 4, 5, 6]);
});

test("cold start: senza storico il punteggio è neutro, non zero, e la rotazione dà una piccola spinta", () => {
  const s = scoreCandidate(base({ skills: [] }), ctx, DEFAULT_WEIGHTS, NOW);
  assert.equal(s.score, pts(DEFAULT_WEIGHTS.rotation + DEFAULT_WEIGHTS.level * 0.5), "50 neutro + rotazione + livello 4 su base 3, in scala");
  assert.ok(s.score > 50 && s.score < 60, "vicino al neutro: " + s.score);
  assert.ok(s.warnings.includes("Nessuno storico con l'organizzazione"));
  const zero = scoreCandidate(base({ skills: [], instruments: [{ code: "violino", level: null }] }), ctx, { ...DEFAULT_WEIGHTS, rotation: 0 }, NOW);
  assert.equal(zero.score, 50);
});

test("fase A: strumento, livello minimo, requisiti obbligatori, esclusioni, conflitti, già in produzione", () => {
  const roleReq = { ...ctx.role, min_level: 4, requirements: [{ skill_code: "click", required: true, min_level: 2 }, { skill_code: "in_ear", required: false, min_level: 1 }] };
  const c2 = { ...ctx, role: roleReq, skillNames: { click: "Esecuzione a click" } };
  assert.equal(checkRequirements(base({ instruments: [{ code: "viola", level: 5 }] }), c2).missing[0].code, "instrument");
  assert.equal(checkRequirements(base({ instruments: [{ code: "violino", level: 3 }] }), c2).missing[0].code, "level");
  const m = checkRequirements(base({ skills: [] }), c2).missing;
  assert.ok(m.some((x) => x.code === "skill:click" && x.label.includes("Esecuzione a click")));
  assert.ok(checkRequirements(base({ skills: [{ code: "click", level: 2 }] }), c2).eligible);
  assert.equal(checkRequirements(base({ excluded: ["litigio col direttore"] }), ctx).missing[0].label, "Escluso: litigio col direttore");
  assert.equal(checkRequirements(base({ conflict: true }), ctx).missing[0].code, "conflict");
  assert.equal(checkRequirements(base({ in_production: true }), ctx).missing[0].code, "in_production");
  assert.equal(checkRequirements(base({ status: "suspended" }), ctx).missing[0].code, "suspended");
  assert.ok(checkRequirements(base(), { ...ctx, role: { ...ctx.role, instrument_code: null } }).eligible, "un ruolo senza strumento accetta tutti");
});

test("rinunce: pesano, si dimezzano dopo 24 mesi, mai più di due; nessun evento singolo vale più di un fattore", () => {
  const fresh = scoreCandidate(base({ withdrawals: ["2026-03-01T00:00:00Z"] }), ctx, DEFAULT_WEIGHTS, NOW);
  const old = scoreCandidate(base({ withdrawals: ["2023-01-01T00:00:00Z"] }), ctx, DEFAULT_WEIGHTS, NOW);
  const many = scoreCandidate(base({ withdrawals: ["2026-03-01T00:00:00Z", "2026-02-01T00:00:00Z", "2026-01-01T00:00:00Z", "2025-12-01T00:00:00Z"] }), ctx, DEFAULT_WEIGHTS, NOW);
  const none = scoreCandidate(base(), ctx, DEFAULT_WEIGHTS, NOW);
  const scale = 50 / maxPositive(DEFAULT_WEIGHTS);
  assert.ok(Math.abs((none.score - fresh.score) - 8 * scale) <= 1, "una rinuncia recente: −8 in scala");
  assert.ok(Math.abs((none.score - old.score) - 4 * scale) <= 1, "una rinuncia vecchia: dimezzata");
  assert.ok(Math.abs((none.score - many.score) - 16 * scale) <= 1, "tetto a due rinunce");
  assert.ok(none.score - many.score > none.score - fresh.score, "due rinunce pesano più di una");
  assert.ok(Math.abs(fresh.reasons.find((r) => r.code === "withdrawals").points) <= Math.abs(DEFAULT_WEIGHTS.same_series));
});

test("saturazioni e neutralità: cinque collaborazioni valgono come cinquanta; i pesi si possono cambiare", () => {
  const five = scoreCandidate(base({ n_collab: 5 }), ctx, DEFAULT_WEIGHTS, NOW).score;
  const fifty = scoreCandidate(base({ n_collab: 50 }), ctx, DEFAULT_WEIGHTS, NOW).score;
  assert.equal(five, fifty);
  const noRep = scoreCandidate(base({ n_same_repertoire: 3 }), ctx, { ...DEFAULT_WEIGHTS, same_repertoire: 0 }, NOW).score;
  const yesRep = scoreCandidate(base({ n_same_repertoire: 3 }), ctx, DEFAULT_WEIGHTS, NOW).score;
  assert.ok(Math.abs((yesRep - noRep) - 15 * (50 / maxPositive(DEFAULT_WEIGHTS))) <= 1, "il peso del repertorio si sente in scala");
  const reserve = scoreCandidate(base({ status: "reserve" }), ctx, DEFAULT_WEIGHTS, NOW);
  assert.ok(reserve.warnings.includes("Stato: riserva"));
});

test("scala: il candidato perfetto sfiora 100, la riserva resta sotto anche in cima, niente ammucchiata", () => {
  const perfect = base({ n_same_series: 2, n_same_repertoire: 3, n_same_composer_prod: 3, composer_declared: ["history"], n_same_conductor: 2, n_same_client: 2, n_same_kind: 3, n_collab: 5, skills: [{ code: "lettura_prima_vista", level: 3 }, { code: "lettura_partitura", level: 3 }], instruments: [{ code: "violino", level: 5, primary: true }], n_feedback: 3, avg_overall: 5, n_invites: 4, reply_rate: 1 });
  const s = scoreCandidate(perfect, ctx, DEFAULT_WEIGHTS, NOW).score;
  assert.ok(s >= 95 && s <= 100, "perfetto: " + s);
  const reserve = scoreCandidate({ ...perfect, status: "reserve" }, ctx, DEFAULT_WEIGHTS, NOW).score;
  assert.ok(reserve < s, "la riserva si vede anche in cima: " + reserve + " < " + s);
  const withdrew = scoreCandidate({ ...perfect, withdrawals: ["2026-05-01T00:00:00Z"] }, ctx, DEFAULT_WEIGHTS, NOW).score;
  assert.ok(withdrew < s - 2, "la rinuncia si vede anche in cima: " + withdrew);
});

test("determinismo e parità: stesso input → stesso output; a parità di punteggio vince l'ordine alfabetico", () => {
  const data = { ...ctx, candidates: [base({ id: "b", name: "Zeta B" }), base({ id: "a", name: "Alfa A" })] };
  const r1 = rankCandidates(data, DEFAULT_WEIGHTS, NOW), r2 = rankCandidates(data, DEFAULT_WEIGHTS, NOW);
  assert.deepEqual(r1, r2);
  assert.deepEqual(r1.map((x) => x.musician_id), ["a", "b"]);
  const ne = rankCandidates({ ...ctx, candidates: [base({ id: "no", name: "Aaa", conflict: true, n_same_series: 3 }), base({ id: "si", name: "Zzz" })] }, DEFAULT_WEIGHTS, NOW);
  assert.deepEqual(ne.map((x) => x.musician_id), ["si", "no"], "un non idoneo va in fondo anche col punteggio più alto");
});

test("override: chi è messo a mano in posizione 1 ci sta, gli altri scalano", () => {
  const rs = [{ id: 1, rank: 1 }, { id: 2, rank: 2 }, { id: 3, rank: 3, override_rank: 1 }, { id: 4, rank: 4 }];
  assert.deepEqual(applyOverrides(rs).map((r) => r.id), [3, 1, 2, 4]);
});

test("explain produce la frase per l'amministratore", () => {
  const data = { ...ctx, candidates: [base({ id: "x", name: "Marco Prova", n_same_repertoire: 3, n_same_conductor: 2, n_collab: 4, withdrawals: ["2026-01-01T00:00:00Z"] })] };
  const s = explain(rankCandidates(data, DEFAULT_WEIGHTS, NOW)[0]);
  assert.match(s, /^Marco Prova — \d+\/100\./);
  assert.match(s, /questo repertorio in 3 produzioni/);
  assert.match(s, /Attenzione: 1 rinuncia dopo conferma/);
  const no = explain(rankCandidates({ ...ctx, candidates: [base({ id: "y", name: "Anna Prova", conflict: true })] }, DEFAULT_WEIGHTS, NOW)[0]);
  assert.match(no, /Non idoneo: conflitto di calendario/);
});

test("storico e affidabilità: valutazione (3 neutro, una sola pesa meno), assenze, tasso di risposta da 3 inviti", () => {
  const scale = 50 / maxPositive(DEFAULT_WEIGHTS);
  const none = scoreCandidate(base(), ctx, DEFAULT_WEIGHTS, NOW).score;
  const top = scoreCandidate(base({ n_feedback: 3, avg_overall: 5 }), ctx, DEFAULT_WEIGHTS, NOW).score;
  const mid = scoreCandidate(base({ n_feedback: 3, avg_overall: 3 }), ctx, DEFAULT_WEIGHTS, NOW).score;
  const low = scoreCandidate(base({ n_feedback: 3, avg_overall: 1 }), ctx, DEFAULT_WEIGHTS, NOW).score;
  const one = scoreCandidate(base({ n_feedback: 1, avg_overall: 5 }), ctx, DEFAULT_WEIGHTS, NOW);
  assert.ok(Math.abs((top - none) - 8 * scale) <= 1, "5/5 su tre = +8 in scala");
  assert.equal(mid, none, "3/5 è neutro");
  assert.ok(low < none, "1/5 pesa in negativo");
  assert.ok(one.score < top && one.warnings.includes("Una sola valutazione: pesa meno"));
  const absent = scoreCandidate(base({ n_absent: 1 }), ctx, DEFAULT_WEIGHTS, NOW);
  assert.ok(Math.abs((none - absent.score) - 8 * scale) <= 1); assert.ok(absent.warnings.some((w) => /saltato/.test(w)));
  const twoAbs = scoreCandidate(base({ n_absent: 5 }), ctx, DEFAULT_WEIGHTS, NOW).score;
  assert.ok(Math.abs((none - twoAbs) - 16 * scale) <= 1, "tetto a due assenze");
  const fewInv = scoreCandidate(base({ n_invites: 2, reply_rate: 0 }), ctx, DEFAULT_WEIGHTS, NOW).score;
  assert.equal(fewInv, none, "sotto tre inviti il tasso di risposta non si giudica");
  const good = scoreCandidate(base({ n_invites: 4, reply_rate: 1 }), ctx, DEFAULT_WEIGHTS, NOW).score;
  const bad = scoreCandidate(base({ n_invites: 4, reply_rate: 0.25 }), ctx, DEFAULT_WEIGHTS, NOW);
  assert.ok(good > none && bad.score < none); assert.ok(bad.warnings.some((w) => /non risponde/.test(w)));
  const inv = checkRequirements(base({ invited_here: true }), ctx);
  assert.equal(inv.missing[0].code, "invited");
  assert.equal(checkRequirements(base({ declined_here: true }), ctx).missing[0].code, "declined");
});
