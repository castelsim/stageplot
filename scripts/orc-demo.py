#!/usr/bin/env python3
"""Genera i dati DIMOSTRATIVI di Orchestre: 40 musicisti inventati, con strumenti, competenze,
repertorio eseguito e tag. Nomi e recapiti sono di fantasia (email @example.invalid, telefoni 3xx 000…):
il repo è pubblico, qui non entra nessuna persona vera.

Produce:
  supabase/seed.sql                       per il Supabase LOCALE (db reset): org demo + utente demo + roster
  orchestre/demo/musicisti-demo.csv       lo stesso roster nel formato dell'import CSV (per la produzione)

Deterministico (seed fisso): rigenerarlo dà lo stesso file. Uso: python3 scripts/orc-demo.py
"""
import csv, io, json, random, os

random.seed(20260904)
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")

NOMI_F = ["Giulia", "Chiara", "Francesca", "Elena", "Silvia", "Martina", "Beatrice", "Irene", "Laura", "Sara", "Valentina", "Eleonora", "Anna", "Marta", "Federica", "Giorgia", "Alice", "Camilla", "Noemi", "Lucia"]
NOMI_M = ["Marco", "Luca", "Andrea", "Matteo", "Davide", "Francesco", "Alessandro", "Simone", "Giovanni", "Paolo", "Stefano", "Riccardo", "Tommaso", "Lorenzo", "Enrico", "Nicola", "Pietro", "Filippo", "Emanuele", "Gabriele"]
COGNOMI = ["Rossini", "Bellante", "Ferraro", "Conti", "Marangon", "Zanella", "De Luca", "Fabbri", "Moretti", "Pavan", "Galliera", "Serafin", "Bordin", "Rigoni", "Tessari", "Carraro", "Vianello", "Bonetti", "Sartori", "Dal Molin", "Furlan", "Pellizzari", "Marchetto", "Trevisan", "Baldan", "Corrà", "Lazzarin", "Munari", "Scarpa", "Toniolo", "Zorzi", "Bettin", "Gasparini", "Rampazzo", "Ceccato", "Miotto", "Ravagnan", "Stocco", "Bison", "Dall'Igna"]
CITTA = [("Padova", "PD"), ("Vicenza", "VI"), ("Treviso", "TV"), ("Venezia", "VE"), ("Verona", "VR"), ("Bassano del Grappa", "VI"), ("Castelfranco Veneto", "TV"), ("Rovigo", "RO"), ("Mestre", "VE"), ("Conegliano", "TV"), ("Schio", "VI"), ("Cittadella", "PD")]

# organico tipo di un'orchestra ritmico-sinfonica: (strumento, quanti, famiglia)
ORGANICO = [("violino", 8), ("viola", 4), ("violoncello", 4), ("contrabbasso", 2), ("arpa", 1),
            ("flauto", 2), ("oboe", 1), ("clarinetto", 2), ("fagotto", 1), ("sax_alto", 1), ("sax_tenore", 1),
            ("corno", 2), ("tromba", 2), ("trombone", 2), ("timpani", 1), ("percussioni", 1), ("batteria", 1),
            ("pianoforte", 1), ("tastiere", 1), ("chitarra_elettrica", 1), ("basso_elettrico", 1)]
DOUBLING = {"flauto": "ottavino", "oboe": "corno_inglese", "clarinetto": "clarinetto_basso", "sax_alto": "sax_soprano",
            "sax_tenore": "clarinetto", "pianoforte": "celesta", "tastiere": "organo_hammond", "percussioni": "timpani",
            "violino": "viola", "chitarra_elettrica": "chitarra_acustica", "basso_elettrico": "contrabbasso"}
SKILLS = ["lettura_prima_vista", "lettura_partitura", "con_direttore", "click", "sequenze", "in_ear", "improvvisazione",
          "esp_orchestrale", "esp_pop", "esp_live", "esp_studio", "esp_teatro_musical"]
REPERTORIO = [("composer", "Ennio Morricone"), ("composer", "Nino Rota"), ("composer", "John Williams"), ("composer", "Hans Zimmer"),
              ("program", "Morricone in concerto"), ("program", "Pooh in sinfonia"), ("program", "Le colonne sonore del cinema italiano"),
              ("program", "Rock sinfonico"), ("genre", "Colonne sonore"), ("genre", "Pop sinfonico"), ("genre", "Musical"), ("genre", "Jazz")]
TAGS = ["prima parte", "affidabile", "nuovo", "lettura veloce", "disponibile weekend", "tournée ok", "click ok", "in-ear ok"]

def musicista(i, strumento):
    femmina = random.random() < 0.5
    nome = random.choice(NOMI_F if femmina else NOMI_M)
    cognome = COGNOMI[i % len(COGNOMI)]
    citta, prov = random.choice(CITTA)
    slug = (nome + "." + cognome).lower().replace(" ", "").replace("'", "")
    instr = [{"code": strumento, "primary": True, "level": random.choice([3, 4, 4, 5, 5]), "doubling": False}]
    if strumento in DOUBLING and random.random() < 0.45:
        instr.append({"code": DOUBLING[strumento], "primary": False, "level": random.choice([2, 3, 4]), "doubling": True})
    skills = []
    for s in SKILLS:
        p = {"esp_orchestrale": 0.85, "con_direttore": 0.9, "lettura_partitura": 0.7, "lettura_prima_vista": 0.75,
             "click": 0.55, "sequenze": 0.4, "in_ear": 0.5, "improvvisazione": 0.25, "esp_pop": 0.6, "esp_live": 0.9,
             "esp_studio": 0.4, "esp_teatro_musical": 0.35}[s]
        if random.random() < p:
            skills.append({"code": s, "level": random.choice([1, 2, 2, 3, 3])})
    rep = []
    # circa metà ha già fatto Morricone (storico), un terzo i Pooh, il resto sparso
    if random.random() < 0.5:
        rep.append({"kind": "composer", "name": "Ennio Morricone", "source": "history"})
        rep.append({"kind": "program", "name": "Morricone in concerto", "source": "history"})
    if random.random() < 0.35:
        rep.append({"kind": "program", "name": "Pooh in sinfonia", "source": "history"})
    for kind, name in random.sample(REPERTORIO, random.randint(0, 3)):
        if not any(x["name"] == name for x in rep):
            rep.append({"kind": kind, "name": name, "source": random.choice(["declared", "declared", "verified"])})
    tags = random.sample(TAGS, random.randint(0, 3))
    return {
        "first_name": nome, "last_name": cognome,
        "email": f"{slug}@example.invalid",
        "phone": f"3{random.randint(20, 99)} 000 {random.randint(1000, 9999)}",
        "city": citta, "province": prov, "area": "Veneto",
        "has_car": random.random() < 0.8, "max_distance_km": random.choice([50, 80, 100, 150, 200, 300]),
        "travel_ok": random.random() < 0.85, "tour_ok": random.random() < 0.4,
        "status": random.choice(["active"] * 8 + ["reserve"]),
        "bio": "", "notes_private": "",
        "instruments": instr, "skills": skills, "repertoire": rep, "tags": tags,
    }

rows, i = [], 0
for strumento, n in ORGANICO:
    for _ in range(n):
        rows.append(musicista(i, strumento)); i += 1
assert len(rows) == 40, len(rows)

# ---- CSV (formato dell'import): liste con ';' e coppie con ':'
def csv_rows(rows):
    out = io.StringIO()
    w = csv.writer(out)
    w.writerow(["nome", "cognome", "email", "telefono", "citta", "provincia", "area", "auto", "km_max", "trasferte", "tournee", "stato",
                "strumenti", "competenze", "repertorio", "tag", "note"])
    for r in rows:
        w.writerow([r["first_name"], r["last_name"], r["email"], r["phone"], r["city"], r["province"], r["area"],
                    "si" if r["has_car"] else "no", r["max_distance_km"], "si" if r["travel_ok"] else "no", "si" if r["tour_ok"] else "no", r["status"],
                    ";".join(f"{x['code']}:{x['level']}" + (":principale" if x["primary"] else "") + (":doubling" if x["doubling"] else "") for x in r["instruments"]),
                    ";".join(f"{x['code']}:{x['level']}" for x in r["skills"]),
                    ";".join(f"{x['kind']}:{x['name']}:{x['source']}" for x in r["repertoire"]),
                    ";".join(r["tags"]), r["notes_private"]])
    return out.getvalue()

os.makedirs(os.path.join(ROOT, "orchestre", "demo"), exist_ok=True)
with open(os.path.join(ROOT, "orchestre", "demo", "musicisti-demo.csv"), "w", newline="") as f:
    f.write(csv_rows(rows))

DEMO_USER = "00000000-0000-4000-8000-00000000d3a0"
DEMO_ORG = "00000000-0000-4000-8000-00000000d3a1"

# ---- produzioni passate (storico) e una aperta
def by_instr(parts):
    """partecipanti → sezioni per famiglia, ruoli per strumento principale"""
    FAM = {"violino":"Archi","viola":"Archi","violoncello":"Archi","contrabbasso":"Archi","arpa":"Archi",
           "flauto":"Legni","oboe":"Legni","clarinetto":"Legni","fagotto":"Legni","sax_alto":"Legni","sax_tenore":"Legni",
           "corno":"Ottoni","tromba":"Ottoni","trombone":"Ottoni","timpani":"Percussioni","percussioni":"Percussioni","batteria":"Percussioni",
           "pianoforte":"Ritmica","tastiere":"Ritmica","chitarra_elettrica":"Ritmica","basso_elettrico":"Ritmica"}
    NAMES = {"violino":"Violini","viola":"Viole","violoncello":"Violoncelli","contrabbasso":"Contrabbassi","arpa":"Arpa","flauto":"Flauti","oboe":"Oboe",
             "clarinetto":"Clarinetti","fagotto":"Fagotto","sax_alto":"Sax alto","sax_tenore":"Sax tenore","corno":"Corni","tromba":"Trombe","trombone":"Tromboni",
             "timpani":"Timpani","percussioni":"Percussioni","batteria":"Batteria","pianoforte":"Pianoforte","tastiere":"Tastiere","chitarra_elettrica":"Chitarra","basso_elettrico":"Basso"}
    order = ["Archi","Legni","Ottoni","Percussioni","Ritmica"]
    secs = {}
    for r in parts:
        code = r["instruments"][0]["code"]
        secs.setdefault(FAM[code], {}).setdefault(code, []).append(r["email"])
    return [(sec, [(code, NAMES[code], emails) for code, emails in secs[sec].items()]) for sec in order if sec in secs]

def has_hist(r, name): return any(x["name"] == name and x["source"] == "history" for x in r["repertoire"])
morricone = [r for r in rows if has_hist(r, "Ennio Morricone")]
pooh = [r for r in rows if has_hist(r, "Pooh in sinfonia")]
random.shuffle(morricone)
PRODS = [
    dict(title="Morricone in concerto", client="Comune di Vicenza", conductor="M. Fantasia", venue="Teatro Comunale, Vicenza", status="done",
         dates=[("rehearsal","2024-06-13 15:00","2024-06-13 19:00"),("rehearsal","2024-06-14 15:00","2024-06-14 19:00"),("concert","2024-06-14 21:00","2024-06-14 23:00")],
         rep=[("composer","Ennio Morricone"),("program","Morricone in concerto"),("genre","Colonne sonore")], parts=morricone[: int(len(morricone) * 0.8)]),
    dict(title="Morricone in concerto", client="Festival d'estate", conductor="M. Fantasia", venue="Arena, Padova", status="done",
         dates=[("rehearsal","2025-07-03 15:00","2025-07-03 19:00"),("concert","2025-07-04 21:15","2025-07-04 23:15")],
         rep=[("composer","Ennio Morricone"),("program","Morricone in concerto"),("genre","Colonne sonore")], parts=morricone),
    dict(title="Pooh in sinfonia", client="Teatro Nuovo", conductor="M. Immaginario", venue="Teatro Nuovo, Treviso", status="done",
         dates=[("rehearsal","2025-11-20 14:00","2025-11-20 18:00"),("rehearsal","2025-11-21 14:00","2025-11-21 18:00"),("concert","2025-11-21 21:00","2025-11-21 23:30")],
         rep=[("program","Pooh in sinfonia"),("genre","Pop sinfonico")], parts=pooh),
    dict(title="Morricone in concerto 2026", client="Comune di Bassano del Grappa", conductor="M. Fantasia", venue="Teatro Remondini, Bassano del Grappa", status="planning",
         dates=[("rehearsal","2026-10-15 15:00","2026-10-15 19:00"),("rehearsal","2026-10-16 15:00","2026-10-16 19:00"),("concert","2026-10-17 21:00","2026-10-17 23:00")],
         rep=[("composer","Ennio Morricone"),("program","Morricone in concerto"),("genre","Colonne sonore")], parts=None),
]
TEMPLATE_RS = [  # = TEMPLATES.ritmico_sinfonica in orchestre/src/domain/staffing.js
    {"section":"Archi","roles":[{"instrument":"violino","name":"Violini primi","seats":6,"part":"principal"},{"instrument":"violino","name":"Violini secondi","seats":5},{"instrument":"viola","name":"Viole","seats":4},{"instrument":"violoncello","name":"Violoncelli","seats":3},{"instrument":"contrabbasso","name":"Contrabbassi","seats":2},{"instrument":"arpa","name":"Arpa","seats":1}]},
    {"section":"Legni","roles":[{"instrument":"flauto","name":"Flauti","seats":2},{"instrument":"oboe","name":"Oboe","seats":1},{"instrument":"clarinetto","name":"Clarinetti","seats":2},{"instrument":"fagotto","name":"Fagotto","seats":1},{"instrument":"sax_alto","name":"Sax alto","seats":1},{"instrument":"sax_tenore","name":"Sax tenore","seats":1}]},
    {"section":"Ottoni","roles":[{"instrument":"corno","name":"Corni","seats":2},{"instrument":"tromba","name":"Trombe","seats":2},{"instrument":"trombone","name":"Tromboni","seats":2}]},
    {"section":"Percussioni","roles":[{"instrument":"timpani","name":"Timpani","seats":1},{"instrument":"percussioni","name":"Percussioni","seats":1},{"instrument":"batteria","name":"Batteria","seats":1}]},
    {"section":"Ritmica","roles":[{"instrument":"pianoforte","name":"Pianoforte","seats":1},{"instrument":"tastiere","name":"Tastiere","seats":1},{"instrument":"chitarra_elettrica","name":"Chitarra","seats":1},{"instrument":"basso_elettrico","name":"Basso","seats":1}]},
]

def q(s): return "'" + str(s).replace("'", "''") + "'"

def prod_sql(pr):
    out = [f"  insert into public.orc_productions (org_id, title, client, kind, conductor, venue, status, created_by) values (org, {q(pr['title'])}, {q(pr['client'])}, 'concerto', {q(pr['conductor'])}, {q(pr['venue'])}, {q(pr['status'])}, '{DEMO_USER}') returning id into pid;"]
    for kind, a, b in pr["dates"]:
        out.append(f"  insert into public.orc_production_dates (production_id, kind, starts_at, ends_at, venue) values (pid, '{kind}', '{a}+02', '{b}+02', {q(pr['venue'])});")
    for kind, name in pr["rep"]:
        out.append(f"  select x.id into rep from public.orc_repertoire x where x.org_id = org and x.kind = '{kind}' and lower(x.name) = lower({q(name)});")
        out.append(f"  if rep is null then insert into public.orc_repertoire (org_id, kind, name) values (org, '{kind}', {q(name)}) returning id into rep; end if;")
        out.append("  insert into public.orc_production_repertoire (production_id, repertoire_id) values (pid, rep) on conflict do nothing;")
    if pr["parts"] is None:
        out.append(f"  perform public.orc_apply_staffing_template(pid, {q(json.dumps(TEMPLATE_RS))}::jsonb);")
        return out
    for si, (sec, roles) in enumerate(by_instr(pr["parts"]), 1):
        out.append(f"  insert into public.orc_staffing_sections (production_id, name, sort) values (pid, {q(sec)}, {si}) returning id into sid;")
        for ri, (code, name, emails) in enumerate(roles, 1):
            part = 'principal' if code == 'violino' else 'tutti'
            out.append(f"  insert into public.orc_staffing_roles (production_id, section_id, instrument_code, name, seats, part, sort) values (pid, sid, '{code}', {q(name)}, {len(emails)}, '{part}', {si * 100 + ri}) returning id into rid;")
            for em in emails:
                out.append(f"  select m.id into mid from public.orc_musicians m where m.org_id = org and m.email = {q(em)};")
                out.append("  perform public.orc_assign_slot((select s.id from public.orc_staffing_slots s where s.role_id = rid and s.status = 'open' order by s.seat_no limit 1), mid, 'storico importato');")
    return out

prod_block = "do $$\ndeclare org uuid := '" + DEMO_ORG + "'; pid uuid; sid uuid; rid uuid; mid uuid; rep uuid;\nbegin\n" + \
    "\n".join(line for pr in PRODS for line in prod_sql(pr)) + "\nend $$;\n"

# ---- seed.sql per il locale
DEMO_USER = "00000000-0000-4000-8000-00000000d3a0"
DEMO_ORG = "00000000-0000-4000-8000-00000000d3a1"
seed = f"""-- supabase/seed.sql — dati DIMOSTRATIVI per il Supabase LOCALE (supabase db reset li applica).
-- Generato da scripts/orc-demo.py: non modificare a mano, rigenerare. Tutto inventato.
-- Mai in produzione: là il roster si carica dalla pagina Musicisti → Importa (orchestre/demo/musicisti-demo.csv).

-- utente demo (password: Prova-1234!) — solo locale
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change_token_new, email_change)
values ('00000000-0000-0000-0000-000000000000', '{DEMO_USER}', 'authenticated', 'authenticated', 'demo@example.invalid',
  crypt('Prova-1234!', gen_salt('bf')), now(), '{{"provider":"email","providers":["email"]}}', '{{"full_name":"Demo Orchestre"}}', now(), now(), '', '', '', '')
on conflict (id) do nothing;
insert into auth.identities (id, user_id, provider_id, provider, identity_data, created_at, updated_at, last_sign_in_at)
values ('{DEMO_USER}', '{DEMO_USER}', '{DEMO_USER}', 'email',
  '{{"sub":"{DEMO_USER}","email":"demo@example.invalid","email_verified":true}}', now(), now(), now())
on conflict (provider_id, provider) do nothing;

insert into public.orc_profiles (id, display_name) values ('{DEMO_USER}', 'Demo Orchestre') on conflict do nothing;
insert into public.orc_organizations (id, name, slug, created_by) values ('{DEMO_ORG}', 'Orchestra Demo', 'orchestra-demo', '{DEMO_USER}') on conflict do nothing;
insert into public.orc_memberships (org_id, user_id, role) values ('{DEMO_ORG}', '{DEMO_USER}', 'owner') on conflict do nothing;

-- roster: passa dalla stessa RPC dell'import, così il seed prova anche quella
select set_config('request.jwt.claims', '{{"sub":"{DEMO_USER}","role":"authenticated"}}', false);
select public.orc_import_musicians('{DEMO_ORG}', {q(json.dumps(rows, ensure_ascii=False))}::jsonb);

-- produzioni: tre concluse (lo storico che alimenta il matching) e una aperta con l'organico da modello
{prod_block}"""
with open(os.path.join(ROOT, "supabase", "seed.sql"), "w") as f:
    f.write(seed)
print(f"ok: {len(rows)} musicisti, {len(PRODS)} produzioni ({len(morricone)} con storico Morricone, {len(pooh)} Pooh) → supabase/seed.sql e orchestre/demo/musicisti-demo.csv")
