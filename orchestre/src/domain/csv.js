/* CSV → righe per orc_import_musicians. Puro: testato in Node.
   Formato (intestazioni in italiano, come il modello scaricabile):
   nome,cognome,email,telefono,citta,provincia,area,auto,km_max,trasferte,tournee,stato,strumenti,competenze,repertorio,tag,note
   - liste separate da ";" — strumenti "violino:5:principale;viola:3:doubling", competenze "click:2",
     repertorio "composer:Ennio Morricone:history" (kind:nome[:source]), tag "prima parte;affidabile"
   - sì/no accettano si, sì, s, yes, y, true, 1 / no, n, false, 0, vuoto */

export function parseCsv(text) {
  const rows = [];
  let row = [], field = "", quoted = false;
  const s = String(text || "").replace(/^﻿/, "");
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c === '"') { if (s[i + 1] === '"') { field += '"'; i++; } else quoted = false; }
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
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

const HEAD = {
  nome: "first_name", cognome: "last_name", email: "email", telefono: "phone", citta: "city", "città": "city",
  provincia: "province", area: "area", auto: "has_car", km_max: "max_distance_km", trasferte: "travel_ok",
  tournee: "tour_ok", "tournée": "tour_ok", stato: "status", strumenti: "instruments", competenze: "skills",
  repertorio: "repertoire", tag: "tags", note: "notes_private", bio: "bio",
};
const STATI = { attivo: "active", active: "active", riserva: "reserve", reserve: "reserve", sospeso: "suspended", suspended: "suspended", archiviato: "archived", archived: "archived" };

export function yesNo(v, dflt = false) {
  const s = String(v == null ? "" : v).trim().toLowerCase();
  if (s === "") return dflt;
  return ["si", "sì", "s", "yes", "y", "true", "1", "x"].includes(s);
}

function list(v) { return String(v || "").split(";").map((x) => x.trim()).filter(Boolean); }

/* Trasforma le righe del CSV in oggetti per la RPC. Restituisce {rows, errors} dove errors sono
   problemi di forma (intestazione mancante, riga senza nome) con il numero di riga umano. */
export function csvToRows(text, { instruments = null, skills = null } = {}) {
  const table = parseCsv(text);
  if (!table.length) return { rows: [], errors: ["File vuoto."] };
  const head = table[0].map((h) => HEAD[h.trim().toLowerCase()] || null);
  const errors = [];
  if (!head.includes("first_name") || !head.includes("last_name")) errors.push("Servono le colonne «nome» e «cognome».");
  const rows = [];
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
    if (!r.first_name || !r.last_name) { errors.push(`Riga ${n + 1}: manca nome o cognome.`); continue; }
    if (r.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.email)) { errors.push(`Riga ${n + 1}: email non valida (${r.email}).`); continue; }
    for (const [k, item] of list(raw.instruments).entries()) {
      const [code, level, ...flags] = item.split(":").map((x) => x.trim().toLowerCase());
      if (instruments && !instruments.has(code)) { errors.push(`Riga ${n + 1}: strumento sconosciuto «${code}».`); continue; }
      r.instruments.push({ code, level: /^[1-5]$/.test(level) ? Number(level) : null, primary: flags.includes("principale") || (k === 0 && !flags.includes("doubling")), doubling: flags.includes("doubling") });
    }
    for (const item of list(raw.skills)) {
      const [code, level] = item.split(":").map((x) => x.trim().toLowerCase());
      if (skills && !skills.has(code)) { errors.push(`Riga ${n + 1}: competenza sconosciuta «${code}».`); continue; }
      r.skills.push({ code, level: /^[0-3]$/.test(level) ? Number(level) : 1 });
    }
    for (const item of list(raw.repertoire)) {
      const parts = item.split(":").map((x) => x.trim());
      const kind = (parts[0] || "").toLowerCase();
      if (!["composer", "work", "program", "genre"].includes(kind) || !parts[1]) { errors.push(`Riga ${n + 1}: repertorio «${item}» non nel formato kind:nome.`); continue; }
      const source = (parts[2] || "declared").toLowerCase();
      r.repertoire.push({ kind, name: parts[1], source: ["declared", "verified", "history"].includes(source) ? source : "declared" });
    }
    rows.push(r);
  }
  return { rows, errors };
}
