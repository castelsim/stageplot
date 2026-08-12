#!/usr/bin/env python3
"""Da prodotti.json → SQL idempotente per equip_document / equip_product / equip_product_document.

USO
  MANUALI_MIC=<cartella dei PDF> python3 equip-estrai-mic.py equip-mic-voci.json prodotti.json
  MANUALI_MANIFEST=<manifest.csv> python3 equip-genera-sql-mic.py
  # prova SENZA scrivere: sostituire l'ultimo commit; con rollback; e poi
  supabase db query --linked -f equip-seed-mic-2026-08.sql
"""
import json, csv, os, sys, re, subprocess

TMP = os.path.dirname(os.path.abspath(__file__))
MAN = os.environ.get("MANUALI_MANIFEST", os.path.expanduser("~/manuali/_MANIFEST.csv"))

def vivo(url):
    """Un link che non risponde e' un dato falso: meglio NULL. Si prova col GET, non con HEAD —
       il CDN di RODE risponde 403 alle HEAD e 200 alle GET (i PDF da li' li ho scaricati davvero)."""
    if not url:
        return None
    c = subprocess.run(["curl", "-sL", "-m", "15", "-A", "Mozilla/5.0", "-o", "/dev/null",
                        "-w", "%{http_code}", "-r", "0-2048", url], capture_output=True, text=True).stdout
    return url if c.strip() in ("200", "206") else None

# URL ufficiale del documento, dove lo conosco con certezza (è quello da cui l'ho scaricato o la
# pagina del costruttore che lo pubblica). Dove non lo so, resta NULL: meglio vuoto che inventato.
AKGBASE = "https://www.akg.com/on/demandware.static/-/Sites-masterCatalog_Harman/default/dw0/pdfs/"
# il CODICE si ricava dal NOME DEL FILE, non dal modello: «Shure_BETA98AMP_Guide.pdf» → BETA98AMP,
# mentre dal modello «Beta 98AMP/C» uscirebbe BETA98AMPC, che è 404.
URL = {
 "Shure": ["https://pubs.shure.com/guide/{C}/en-US"],
 "AKG":   [AKGBASE + "{F}", AKGBASE + "AKG_{C}_Cutsheet.pdf", AKGBASE + "AKG_{C}_CutSheet.pdf",
           AKGBASE + "AKG_{C}_Manual.pdf"],
 "RODE":  ["https://cdn1.rode.com/{c}_datasheet.pdf", "https://cdn1.rode.com/{f}"],
}
URL_ESPLICITI = {
 "sennheiser-e602-ii-spec": "https://sennheiser.com/globalassets/digizuite/41668-en-sp_1203_v1.0_e_602-ii_product_specification_en.pdf",
 "audix-om5-specsheet": "https://audixusa.com/cdn/shop/files/OM5_V3_0516.pdf",
 "ev-re20-datasheet": "https://products.electrovoice.com/na/en/re20",
}

def manifest():
    out = {}
    for r in csv.reader(open(MAN), delimiter="|"):
        if r and r[0] == "microfoni":
            out[r[1]] = {"pages": r[5], "sha": r[6]}
    return out

def sq(v):
    if v is None: return "null"
    return "'" + str(v).replace("'", "''") + "'"

def main():
    # argomenti: <prodotti.json> <voci.json> <nome-del-seed.sql>
    f_prod = sys.argv[1] if len(sys.argv) > 1 else os.path.join(TMP, "prodotti.json")
    f_voci = sys.argv[2] if len(sys.argv) > 2 else os.path.join(TMP, "voci.json")
    nome   = sys.argv[3] if len(sys.argv) > 3 else "equip-seed-mic-2026-08.sql"
    prod = json.load(open(f_prod))
    voci = {v["id"]: v for v in json.load(open(f_voci))}
    man = manifest()
    righe = ["-- " + nome + " — microfoni per il campo «Modello reale» (equip_product).",
             "-- Ogni valore porta la CITAZIONE del documento da cui è stato letto (doc, pagina, frase):",
             "-- è quella che fa comparire «dati verificati» nell'app, e permette di ricontrollare senza fidarsi.",
             "-- Estratti da PDF ufficiali in MANUALI_PDF/microfoni con tmp/estrai.py, che scarta ogni valore",
             "-- che non compaia nella frase citata. Idempotente (upsert): si può rieseguire.",
             "begin;"]

    for p in prod:
        v = voci[p["id"]]
        docid = re.sub(r"[^a-z0-9]+", "-", v["doc"].lower()).strip("-")
        f = v["file"]
        info = man.get(f, {})
        tipo = "CutSheet" if "CutSheet" in f else ("Datasheet" if "Datasheet" in f else
               ("SpecSheet" if "Spec" in f else ("Manual" if "Manual" in f else "UserGuide")))
        url = vivo(URL_ESPLICITI.get(docid))
        if not url and v["brand"] in URL:
            pezzi = f.replace(".pdf", "").split("_")
            C = pezzi[1] if len(pezzi) > 1 else re.sub(r"[^A-Za-z0-9]", "", v["model"])
            for cand in URL[v["brand"]]:
                url = vivo(cand.format(C=C, c=C.lower().replace("-", ""), F=f, f=f.lower()))
                if url:
                    break
        if not url:
            print("  senza link ufficiale:", docid, file=sys.stderr)
        righe += [
          "insert into equip_document (id, brand, model_or_family, category, doc_type, language, official_url, filename, sha256, pages, source_quality)",
          "values (%s, %s, %s, 'microfono', %s, 'en', %s, %s, %s, %s, 'web-manufacturer')" % (
              sq(docid), sq(v["brand"]), sq(v["model"]), sq(tipo), sq(url), sq(f),
              sq(info.get("sha")), info.get("pages") or "null"),
          "on conflict (id) do update set official_url=excluded.official_url, filename=excluded.filename,",
          "  sha256=excluded.sha256, pages=excluded.pages, source_quality=excluded.source_quality;"]

    for p in prod:
        v = voci[p["id"]]
        docid = re.sub(r"[^a-z0-9]+", "-", v["doc"].lower()).strip("-")
        blob = json.dumps(p, ensure_ascii=False)
        assert "$eq$" not in blob, "il delimitatore comparirebbe nel testo: cambiare tag"
        righe += [
          "insert into equip_product (id, brand, model, category, commercial_status, primary_source_doc, data)",
          "values (%s, %s, %s, 'microfono', 'current', %s, $eq$%s$eq$::jsonb)" % (
              sq(p["id"]), sq(v["brand"]), sq(v["model"]), sq(docid), blob),
          "on conflict (id) do update set data=excluded.data, primary_source_doc=excluded.primary_source_doc, updated_at=now();",
          "insert into equip_product_document (product_id, document_id) values (%s, %s)" % (sq(p["id"]), sq(docid)),
          "on conflict do nothing;"]

    righe.append("commit;")
    out = os.path.join(os.path.dirname(os.path.abspath(__file__)), nome)
    open(out, "w").write("\n".join(righe) + "\n")
    print("scritto", out, "·", len(prod), "prodotti")

main()
