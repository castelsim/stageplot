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

# ---- seed.sql per il locale
DEMO_USER = "00000000-0000-4000-8000-00000000d3a0"
DEMO_ORG = "00000000-0000-4000-8000-00000000d3a1"
def q(s): return "'" + str(s).replace("'", "''") + "'"
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
"""
with open(os.path.join(ROOT, "supabase", "seed.sql"), "w") as f:
    f.write(seed)
print(f"ok: {len(rows)} musicisti → supabase/seed.sql e orchestre/demo/musicisti-demo.csv")
