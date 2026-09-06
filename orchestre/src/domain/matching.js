/* Il motore di matching: deterministico, configurabile, spiegabile. Puro: nessun accesso a rete o DOM.
   Input: i fatti raccolti da orc_matching_candidates (contesto + candidati) e i pesi.
   Fase A: requisiti obbligatori → eleggibile o no, con l'elenco di quel che manca.
   Fase B: punteggio 0-100 = 50 (neutro) + somma dei contributi pesati, ognuno saturato.
   Chi non ha storico resta al neutro sulle voci di storico: l'assenza di dati non è una bocciatura.
   Nessun evento singolo pesa più di un fattore. Ogni contributo porta la sua spiegazione. */

export const ENGINE_VERSION = "1";

export const DEFAULT_WEIGHTS = {
  same_series: 20,        // ha già fatto questa stessa produzione (stesso titolo, altre edizioni)
  same_repertoire: 15,    // ha eseguito in produzioni concluse questo repertorio
  same_composer: 12,      // esperienza sul compositore, anche altrove (dichiarata vale metà)
  same_conductor: 8,
  same_client: 5,
  same_kind: 5,           // stessa tipologia (concerto, registrazione…)
  collabs: 10,            // collaborazioni concluse con l'org, satura a 5
  skills: 6,              // competenze preferenziali del ruolo (o lettura, se il ruolo non ne indica)
  withdrawals: -8,        // ogni rinuncia dopo conferma; dimezzata dopo 24 mesi; tetto a 2 rinunce
  recent_load: -3,        // impegni confermati negli ultimi/prossimi 60 giorni, satura a 3
  rotation: 3,            // un nuovo musicista idoneo riceve una piccola spinta per entrare
  reserve: -4,            // stato «riserva»
  level: 6,               // livello sullo strumento del ruolo oltre il minimo
};

export const WEIGHT_LABELS = {
  same_series: "Stessa produzione (altre edizioni)", same_repertoire: "Stesso repertorio", same_composer: "Stesso compositore",
  same_conductor: "Stesso direttore", same_client: "Stesso cliente", same_kind: "Stessa tipologia", collabs: "Collaborazioni concluse",
  skills: "Competenze richieste", withdrawals: "Rinunce dopo conferma (per ciascuna)", recent_load: "Carico recente",
  rotation: "Rotazione: nuovi musicisti", reserve: "Stato riserva", level: "Livello sullo strumento",
};

const sat = (n, cap) => Math.min(Math.max(Number(n) || 0, 0), cap) / cap;
const POSITIVE = ["same_series", "same_repertoire", "same_composer", "same_conductor", "same_client", "same_kind", "collabs", "skills", "level", "rotation"];
/* Quanti punti grezzi vale il massimo possibile: la scala del punteggio. */
export function maxPositive(W) { return POSITIVE.reduce((a, k) => a + Math.max(0, Number(W[k]) || 0), 0) || 1; }
const months = (a, b) => (b - a) / (1000 * 60 * 60 * 24 * 30.44);

/* Fase A. Restituisce {eligible, missing:[{code,label}]} */
export function checkRequirements(cand, ctx) {
  const missing = [];
  const role = ctx.role;
  if (cand.in_production) missing.push({ code: "in_production", label: "Ha già un posto in questa produzione" });
  if (cand.status === "suspended") missing.push({ code: "suspended", label: "Sospeso" });
  if (Array.isArray(cand.excluded) && cand.excluded.length) missing.push({ code: "excluded", label: "Escluso" + (cand.excluded[0] ? ": " + cand.excluded[0] : "") });
  if (cand.conflict) missing.push({ code: "conflict", label: "Conflitto di calendario con un'altra produzione" });
  const inst = role.instrument_code ? (cand.instruments || []).find((i) => i.code === role.instrument_code) : null;
  if (role.instrument_code && !inst) missing.push({ code: "instrument", label: "Non suona questo strumento" });
  if (inst && role.min_level && inst.level && inst.level < role.min_level) missing.push({ code: "level", label: `Livello ${inst.level}/5, richiesto ${role.min_level}` });
  for (const q of role.requirements || []) {
    if (!q.required) continue;
    const s = (cand.skills || []).find((x) => x.code === q.skill_code);
    if (!s || s.level < (q.min_level ?? 1)) missing.push({ code: "skill:" + q.skill_code, label: "Manca: " + (ctx.skillNames?.[q.skill_code] || q.skill_code) });
  }
  return { eligible: missing.length === 0, missing };
}

/* Fase B. Restituisce {score, reasons:[{code,label,points}], warnings:[]} */
export function scoreCandidate(cand, ctx, weights = DEFAULT_WEIGHTS, now = new Date()) {
  const W = { ...DEFAULT_WEIGHTS, ...(weights || {}) };
  const reasons = [], warnings = [];
  const add = (code, label, points) => { const p = Math.round(points * 10) / 10; if (p !== 0) reasons.push({ code, label, points: p }); };
  const role = ctx.role;

  if (cand.n_same_series > 0) add("same_series", `Ha già fatto questa produzione ${cand.n_same_series === 1 ? "una volta" : cand.n_same_series + " volte"}`, W.same_series);
  if (cand.n_same_repertoire > 0) add("same_repertoire", `Ha eseguito questo repertorio in ${cand.n_same_repertoire} ${cand.n_same_repertoire === 1 ? "produzione" : "produzioni"}`, W.same_repertoire * sat(cand.n_same_repertoire, 3));
  const declared = Array.isArray(cand.composer_declared) ? cand.composer_declared : [];
  const compStrong = (cand.n_same_composer_prod || 0) + declared.filter((s) => s === "history" || s === "verified").length;
  const compWeak = declared.filter((s) => s === "declared").length;
  const compScore = sat(compStrong + compWeak * 0.5, 3);
  if (ctx.production.repertoire?.some((r) => r.kind === "composer") && compScore > 0) {
    add("same_composer", compStrong > 0 ? "Esperienza sul compositore" + (cand.n_same_composer_prod ? " in " + cand.n_same_composer_prod + (cand.n_same_composer_prod === 1 ? " produzione" : " produzioni") : "") : "Dichiara esperienza sul compositore", W.same_composer * compScore);
  }
  if (cand.n_same_conductor > 0) add("same_conductor", `Ha lavorato ${cand.n_same_conductor === 1 ? "una volta" : cand.n_same_conductor + " volte"} con lo stesso direttore`, W.same_conductor * sat(cand.n_same_conductor, 2));
  if (cand.n_same_client > 0) add("same_client", "Ha già suonato per questo cliente", W.same_client * sat(cand.n_same_client, 2));
  if (cand.n_same_kind > 0) add("same_kind", "Esperienza nella stessa tipologia", W.same_kind * sat(cand.n_same_kind, 3));
  if (cand.n_collab > 0) add("collabs", `${cand.n_collab} ${cand.n_collab === 1 ? "collaborazione conclusa" : "collaborazioni concluse"}`, W.collabs * sat(cand.n_collab, 5));
  else { add("rotation", "Nuovo: nessuna collaborazione ancora", W.rotation); warnings.push("Nessuno storico con l'organizzazione"); }

  const prefs = (role.requirements || []).filter((q) => !q.required);
  const skillCodes = prefs.length ? prefs.map((q) => q.skill_code) : ["lettura_prima_vista", "lettura_partitura"];
  const levels = skillCodes.map((c) => (cand.skills || []).find((x) => x.code === c)?.level ?? 0);
  const avg = levels.reduce((a, b) => a + b, 0) / (levels.length || 1);
  if (avg > 0) add("skills", prefs.length ? "Competenze preferenziali: " + Math.round(avg * 10) / 10 + "/3" : "Lettura: " + Math.round(avg * 10) / 10 + "/3", W.skills * (avg / 3));

  const inst = role.instrument_code ? (cand.instruments || []).find((i) => i.code === role.instrument_code) : null;
  if (inst && inst.level) {
    const base = role.min_level || 3;
    const over = (inst.level - base) / 2;
    if (over !== 0) add("level", `Livello ${inst.level}/5 sullo strumento`, W.level * Math.max(-1, Math.min(1, over)));
    if (!inst.primary) warnings.push("Non è il suo strumento principale");
  }

  const wd = Array.isArray(cand.withdrawals) ? cand.withdrawals : [];
  if (wd.length) {
    let pen = 0;
    for (const at of wd.slice(0, 2)) { const m = months(new Date(at), now); pen += m > 24 ? 0.5 : 1; }
    add("withdrawals", `${wd.length} ${wd.length === 1 ? "rinuncia" : "rinunce"} dopo conferma`, W.withdrawals * pen);
    warnings.push("Ha rinunciato dopo una conferma" + (months(new Date(wd[0]), now) <= 24 ? " negli ultimi due anni" : ""));
  }
  if (cand.recent_load > 0) add("recent_load", `${cand.recent_load} ${cand.recent_load === 1 ? "impegno" : "impegni"} nei 60 giorni intorno`, W.recent_load * sat(cand.recent_load, 3));
  if (cand.status === "reserve") { add("reserve", "In riserva", W.reserve); warnings.push("Stato: riserva"); }

  /* Normalizzazione: la somma dei pesi positivi vale 50 punti. Così un candidato perfetto fa 100,
     il neutro 50, e una penalità resta visibile anche in cima (niente ammucchiata a 100). */
  const total = reasons.reduce((a, r) => a + r.points, 0);
  const score = Math.max(0, Math.min(100, Math.round(50 + (50 * total) / maxPositive(W))));
  reasons.sort((a, b) => Math.abs(b.points) - Math.abs(a.points));
  return { score, reasons, warnings };
}

/* Tutto insieme: ordina i candidati. Eleggibili prima (per punteggio, poi nome), poi gli altri. */
export function rankCandidates(data, weights = DEFAULT_WEIGHTS, now = new Date()) {
  const ctx = { production: data.production, role: data.role, skillNames: data.skillNames || {} };
  const out = (data.candidates || []).map((c) => {
    const a = checkRequirements(c, ctx);
    const b = scoreCandidate(c, ctx, weights, now);
    return { musician_id: c.id, name: c.name, status: c.status, eligible: a.eligible, missing: a.missing, score: b.score, reasons: b.reasons, warnings: b.warnings,
      last_engagement: c.last_engagement || null, n_collab: c.n_collab || 0 };
  });
  out.sort((x, y) => (Number(y.eligible) - Number(x.eligible)) || (y.score - x.score) || x.name.localeCompare(y.name, "it"));
  out.forEach((r, i) => { r.rank = i + 1; });
  return out;
}

/* Applica gli override umani a una lista già ordinata: chi ha override_rank va in quella posizione. */
export function applyOverrides(results) {
  const fixed = results.filter((r) => r.override_rank).sort((a, b) => a.override_rank - b.override_rank);
  const rest = results.filter((r) => !r.override_rank);
  const out = [];
  let i = 0;
  for (let pos = 1; pos <= results.length; pos++) {
    const f = fixed.find((r) => r.override_rank === pos);
    if (f) out.push(f); else if (i < rest.length) out.push(rest[i++]);
  }
  for (const f of fixed) if (!out.includes(f)) out.push(f);
  return out;
}

/* La frase per l'amministratore, come nella SPEC. */
export function explain(r) {
  const top = r.reasons.filter((x) => x.points > 0).slice(0, 3).map((x) => x.label.charAt(0).toLowerCase() + x.label.slice(1));
  const neg = r.reasons.filter((x) => x.points < 0).map((x) => x.label.charAt(0).toLowerCase() + x.label.slice(1));
  let s = `${r.name} — ${r.score}/100.`;
  if (!r.eligible) return s + " Non idoneo: " + r.missing.map((m) => m.label.toLowerCase()).join("; ") + ".";
  if (top.length) s += " " + top.join(", ").replace(/^./, (c) => c.toUpperCase()) + ".";
  if (neg.length) s += " Attenzione: " + neg.join(", ") + ".";
  if (!top.length && !neg.length) s += " Nessun elemento di storico: valutazione neutra.";
  return s;
}
