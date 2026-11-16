/* CSV → righe per orc_import_musicians. Puro: testato in Node.
   Formato (intestazioni in italiano, come il modello scaricabile):
   nome,cognome,email,telefono,citta,provincia,area,auto,km_max,trasferte,tournee,stato,strumenti,competenze,repertorio,tag,note
   - liste separate da ";" — strumenti "violino:5:principale;viola:3:doubling", competenze "click:2",
     repertorio "composer:Nicola Piovani:history" (kind:nome[:source]), tag "prima parte;affidabile"
   - sì/no accettano si, sì, s, yes, y, true, 1 / no, n, false, 0, vuoto */

/* Il separatore lo decide la riga delle intestazioni (fuori dalle virgolette): Excel italiano salva con «;», altri con tab. */
export function detectDelimiter(text) {
  const s = String(text || "").replace(/^\uFEFF/, "");
  const count = { ",": 0, ";": 0, "\t": 0 };
  let quoted = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '"') quoted = !quoted;
    else if (!quoted && (c === "\n" || c === "\r")) { if (count[","] + count[";"] + count["\t"] > 0) break; }
    else if (!quoted && c in count) count[c]++;
  }
  const best = [";", "\t", ","].sort((a, b) => count[b] - count[a])[0];
  return count[best] > 0 ? best : ",";
}

export function parseCsv(text, delim = ",") {
  const rows = [];
  let row = [], field = "", quoted = false;
  const s = String(text || "").replace(/^﻿/, "");
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c === '"') { if (s[i + 1] === '"') { field += '"'; i++; } else quoted = false; }
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === delim) { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((x) => x.trim() !== "")) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((x) => x.trim() !== "")) rows.push(row);
  return rows;
}

/* Le intestazioni si confrontano senza maiuscole, accenti e punteggiatura: «E-mail», «Città», «Km max» valgono come «email», «citta», «km_max». */
export const norm = (h) => String(h || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
const HEAD = {
  nome: "first_name", cognome: "last_name", email: "email", e_mail: "email", mail: "email", posta_elettronica: "email",
  telefono: "phone", cellulare: "phone", tel: "phone", citta: "city", comune: "city",
  provincia: "province", prov: "province", area: "area", auto: "has_car", automunito: "has_car", km_max: "max_distance_km", km: "max_distance_km",
  trasferte: "travel_ok", tournee: "tour_ok", stato: "status", strumenti: "instruments", strumento: "instruments",
  competenze: "skills", repertorio: "repertoire", tag: "tags", note: "notes_private", bio: "bio",
};
/* Colonne che contengono nome e cognome insieme: non si spezzano (l'ordine «Rossi Mario» / «Mario Rossi» è ambiguo), si chiede due colonne. */
const NOME_UNICO = new Set(["nominativo", "nome_e_cognome", "nome_cognome", "cognome_nome", "nome_completo", "musicista", "nome_e_cognome_"]);
const STATI = { attivo: "active", active: "active", riserva: "reserve", reserve: "reserve", sospeso: "suspended", suspended: "suspended", archiviato: "archived", archived: "archived" };

export function yesNo(v, dflt = false) {
  const s = String(v == null ? "" : v).trim().toLowerCase();
  if (s === "") return dflt;
  return ["si", "sì", "s", "yes", "y", "true", "1", "x"].includes(s);
}

/* Dentro una cella le liste si separano con «;» (o «|»). In un file che usa «;» come separatore di colonna la lista non può usarlo: vale anche la virgola. */
const listOf = (delim) => (v) => String(v || "").split(delim === ";" ? /[;|,]/ : /[;|]/).map((x) => x.trim()).filter(Boolean);

/* Trasforma le righe del CSV in oggetti per la RPC. Restituisce {rows, errors, ignored, delimiter}: errors sono i
   problemi (intestazione mancante, riga senza nome, doppioni, valori non validi) con il numero di riga umano e il nome
   della persona; ignored sono le colonne dell'intestazione che non si capiscono (restano fuori, ma si dice quali). */
export function csvToRows(text, { instruments = null, skills = null } = {}) {
  const delimiter = detectDelimiter(text);
  const list = listOf(delimiter);
  const table = parseCsv(text, delimiter);
  if (!table.length) return { rows: [], errors: ["File vuoto."], ignored: [], delimiter };
  const heads = table[0].map((h) => h.trim());
  const head = heads.map((h) => HEAD[norm(h)] || null);
  const ignored = heads.filter((h, i) => h && !head[i]);
  const errors = [];
  if (!head.includes("first_name") || !head.includes("last_name")) {
    const unico = heads.find((h) => NOME_UNICO.has(norm(h)));
    errors.push(unico
      ? `La colonna «${unico}» contiene nome e cognome insieme: servono due colonne separate, «nome» e «cognome».`
      : "Servono le colonne «nome» e «cognome»." + (heads.filter(Boolean).length ? " Nel file ci sono: " + heads.filter(Boolean).join(", ") + "." : ""));
  }
  const rows = [], seen = new Map();
  for (let n = 1; n < table.length; n++) {
    const raw = {};
    table[n].forEach((v, i) => { if (head[i]) raw[head[i]] = v.trim(); });
    const r = {
      first_name: raw.first_name || "", last_name: raw.last_name || "", email: (raw.email || "").toLowerCase(),
      phone: raw.phone || "", city: raw.city || "", province: (raw.province || "").toUpperCase(), area: raw.area || "",
      has_car: yesNo(raw.has_car, false), travel_ok: yesNo(raw.travel_ok, true), tour_ok: yesNo(raw.tour_ok, false),
      max_distance_km: raw.max_distance_km && /^\d+$/.test(raw.max_distance_km) ? Number(raw.max_distance_km) : null,
      status: STATI[(raw.status || "").toLowerCase()] || "active",
      bio: raw.bio || "", notes_private: raw.notes_private || "",
      instruments: [], skills: [], repertoire: [], tags: list(raw.tags),
    };
    const chi = (r.first_name || r.last_name) ? `${r.first_name} ${r.last_name}`.trim() : (r.email || "");
    const rif = `Riga ${n + 1}` + (chi ? ` (${chi})` : "");
    if (!r.first_name || !r.last_name) { errors.push(`${rif}: manca nome o cognome, la riga resta fuori.`); continue; }
    if (r.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.email)) { errors.push(`${rif}: email non valida «${r.email}», la tolgo; il resto della riga entra.`); r.email = ""; }
    if (raw.status && !STATI[raw.status.toLowerCase()]) errors.push(`${rif}: stato «${raw.status}» non riconosciuto, entra come attivo.`);
    for (const [k, item] of list(raw.instruments).entries()) {
      const [code, level, ...flags] = item.split(":").map((x) => x.trim().toLowerCase());
      if (instruments && !instruments.has(code)) { errors.push(`${rif}: strumento sconosciuto «${code}», lo tolgo.`); continue; }
      if (level && !/^[1-5]$/.test(level) && !["principale", "doubling"].includes(level)) errors.push(`${rif}: livello «${level}» di ${code} fuori scala (da 1 a 5), lo ignoro.`);
      const lvl = /^[1-5]$/.test(level) ? Number(level) : null, fl = ["principale", "doubling"].includes(level) ? [level, ...flags] : flags;
      r.instruments.push({ code, level: lvl, primary: fl.includes("principale") || (k === 0 && !fl.includes("doubling")), doubling: fl.includes("doubling") });
    }
    for (const item of list(raw.skills)) {
      const [code, level] = item.split(":").map((x) => x.trim().toLowerCase());
      if (skills && !skills.has(code)) { errors.push(`${rif}: competenza sconosciuta «${code}», la tolgo.`); continue; }
      r.skills.push({ code, level: /^[0-3]$/.test(level) ? Number(level) : 1 });
    }
    for (const item of list(raw.repertoire)) {
      const parts = item.split(":").map((x) => x.trim());
      const kind = (parts[0] || "").toLowerCase();
      if (!["composer", "work", "program", "genre"].includes(kind) || !parts[1]) { errors.push(`${rif}: repertorio «${item}» non nel formato tipo:nome (composer, work, program, genre), lo tolgo.`); continue; }
      const source = (parts[2] || "declared").toLowerCase();
      r.repertoire.push({ kind, name: parts[1], source: ["declared", "verified", "history"].includes(source) ? source : "declared" });
    }
    /* La stessa persona due volte nel file: conta una volta sola, vale l'ultima riga. */
    const key = r.email || (r.first_name + "|" + r.last_name).toLowerCase();
    if (seen.has(key)) {
      const { riga, idx } = seen.get(key);
      errors.push(`${rif}: è la stessa persona della riga ${riga}${r.email ? " (stessa email)" : " (stesso nome)"}: conta una volta sola, vale questa.`);
      rows[idx] = null;
    }
    seen.set(key, { riga: n + 1, idx: rows.length });
    rows.push(r);
  }
  return { rows: rows.filter(Boolean), errors, ignored, delimiter };
}
