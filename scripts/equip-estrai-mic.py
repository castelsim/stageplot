#!/usr/bin/env python3
# Estrae dai PDF dei costruttori i valori di targa PER equip_product, tenendo la CITAZIONE.
# Regola: ogni valore deve comparire nella riga da cui dice di essere stato preso. Se non compare,
# non e' un dato: e' una mia invenzione, e lo script lo scarta.
import re, subprocess, json, sys, os

# I manuali dei costruttori NON stanno nel repo (sono documenti loro: si conservano come fonte, non
# si ridistribuiscono). Il percorso dell'archivio si passa in MANUALI_MIC.
BASE = os.environ.get("MANUALI_MIC", os.path.expanduser("~/manuali/microfoni"))

def pagine(f):
    out = []
    n = subprocess.run(["pdfinfo", os.path.join(BASE, f)], capture_output=True, text=True).stdout
    m = re.search(r"Pages:\s+(\d+)", n)
    tot = int(m.group(1)) if m else 1
    for p in range(1, min(tot, 12) + 1):
        t = subprocess.run(["pdftotext", "-layout", "-f", str(p), "-l", str(p),
                            os.path.join(BASE, f), "-"], capture_output=True, text=True).stdout
        out.append(t)
    return out

def righe(pg):
    for i, testo in enumerate(pg, 1):
        for r in testo.split("\n"):
            r = re.sub(r"\s{2,}", "  ", r).strip()
            if r:
                yield i, r

def finestra(r, m, largh=300):
    """La citazione va CENTRATA sul punto in cui il valore e' scritto. Tagliare i primi 300
       caratteri buttava via proprio la parola da dimostrare: restava una citazione che non
       provava niente (visto sull'NT1: «…USB connectivity… Po» al posto di «Polar Pattern Cardioid»)."""
    if len(r) <= largh:
        return r
    centro = (m.start() + m.end()) // 2
    ini = max(0, centro - largh // 2)
    fin = min(len(r), ini + largh)
    ini = max(0, fin - largh)
    return ("…" if ini > 0 else "") + r[ini:fin] + ("…" if fin < len(r) else "")

def cerca(pg, pattern, gruppo=1, filtro=None):
    """Prima riga che soddisfa il pattern → (valore, pagina, citazione)."""
    for p, r in righe(pg):
        m = re.search(pattern, r, re.I)
        if m:
            v = m.group(gruppo)
            if filtro and not filtro(v):
                continue
            return v.strip(), p, finestra(r, m)
    return None

def cerca_blocco(pg, etichetta, valore, avanti=3):
    """Molti datasheet mettono l'etichetta su una riga e il valore su quella dopo («Polar Pattern» ⏎
       «Cardioid»). Qui la citazione unisce le due righe: resta testo vero del documento, e senza
       l'etichetta un «Cardioid» isolato non si capirebbe da dove viene."""
    tutte = list(righe(pg))
    for i, (p, r) in enumerate(tutte):
        if not re.search(etichetta, r, re.I):
            continue
        m = re.search(valore, r, re.I)
        if m:
            return m.group(1).strip(), p, finestra(r, m)
        for j in range(i + 1, min(i + 1 + avanti, len(tutte))):
            p2, r2 = tutte[j]
            if p2 != p:
                break
            m = re.search(valore, r2, re.I)
            if m:
                unita = r + " ⏎ " + r2
                m2 = re.search(re.escape(m.group(0)), unita, re.I) or m
                return m.group(1).strip(), p, finestra(unita, m2)
    return None

def sv(trovato, conv=lambda x: x, unit=None, doc=None, nota=None):
    """SourcedValue con verifica: il valore DEVE comparire nella citazione."""
    if not trovato:
        return None
    v, p, q = trovato
    val = conv(v)
    prova = str(val).replace(".0", "")
    # il costruttore scrive «1,8 mV/Pa» e io ho letto 1.8: e' lo stesso numero, non un'invenzione
    varianti = {prova, prova.replace(".", ","), prova.replace(",", ".")}
    if not any(v in q for v in varianti):
        print("  ⚠ scartato (il valore «%s» non e' nella citazione): %s" % (val, q[:90]), file=sys.stderr)
        return None
    o = {"value": val, "unit_orig": unit, "reliability": "official",
         "source": {"doc": doc, "page": p, "quote": q}}
    if nota:
        o["note"] = nota
    return o

def testo_sv(valore, trovato, doc, nota=None):
    """Come sv() ma per valori discreti (dynamic/condenser, cardioid…): la citazione resta l'ancora,
       e deve contenere DAVVERO la parola che il valore afferma — altrimenti prova solo che qualcosa
       era scritto da qualche parte, che e' esattamente il difetto che questo campo deve impedire."""
    if not trovato:
        return None
    testo, p, q = trovato
    piatto = lambda x: re.sub(r"[\s\-]", "", x.lower())
    if testo and piatto(testo)[:6] not in piatto(q):
        print("  ⚠ citazione che non prova il valore («%s»): %s" % (testo, q[:80]), file=sys.stderr)
        return None
    o = {"value": valore, "unit_orig": None, "reliability": "official",
         "source": {"doc": doc, "page": p, "quote": q}}
    if nota:
        o["note"] = nota
    return o

POLARI = [("supercardioid", "supercardioid"), ("hypercardioid", "hypercardioid"),
          ("hyper-cardioid", "hypercardioid"), ("super-cardioid", "supercardioid"),
          ("half-cardioid", "half-cardioid"), ("semi-cardioid", "half-cardioid"),
          ("omnidirectional", "omni"), ("bidirectional", "figure-8"),
          ("figure-of-eight", "figure-8"), ("figure of eight", "figure-8"),
          ("cardioid", "cardioid")]

def estrai(voce):
    f, doc = voce["file"], voce["doc"]
    pg = pagine(f)
    d = {"id": voce["id"], "brand": voce["brand"], "model": voce["model"], "category": "microfono"}

    # principio: dinamico / condensatore / nastro
    princ = voce.get("principle")
    tr = (cerca_blocco(pg, r"transducer|cartridge type|^\s*type\b|element|principle|Wandler",
                       r"\b(ribbon|dynamic(?!\s+range)|electret condenser|condenser|pre-polarized|RF condenser)\b")
          or cerca(pg, r"^.{0,60}\b(ribbon|dynamic \(moving coil\)|dynamic(?!\s+range)|electret condenser|condenser|pre-polarized)\b.{0,120}$"))
    if princ and tr:
        d["principle"] = testo_sv(princ, tr, doc)

    # figura polare: la prima parola nota che compare in una riga che parla di pattern
    pol = voce.get("polar")
    if pol:
        alternative = "|".join(k for k, _ in POLARI)
        cerca_pol = cerca_blocco(pg, r"polar|pattern|directional|Richtcharakteristik",
                                 r"\b(" + alternative + r")\b")
        if cerca_pol:
            d["polar"] = testo_sv(pol, cerca_pol, doc)

    # phantom
    ph = voce.get("phantom")
    if ph == "required":
        tr = (cerca(pg, r"((?:\d{1,2}\s*(?:to|–|-)\s*\d{2}|\d{2})\s*V(?:dc| DC)?\s*phantom.{0,90})")
              or cerca_blocco(pg, r"powering|power requirements|power supply|Speisung",
                              r"(\d{1,2}\s*(?:to|–|-|\+/-|±)?\s*\d{0,2}\s*V.{0,80})")
              or cerca(pg, r"(phantom.{0,140})")
              or cerca(pg, r"((?:Via XLR:\s*)?P48.{0,90})"))
        if tr: d["phantom"] = testo_sv("required", tr, doc, voce.get("phantom_note"))
    elif ph == "no":
        tr = cerca(pg, r"\b(dynamic(?!\s+range)|ribbon|passive|not required|no power)\b.{0,120}")
        if tr: d["phantom"] = testo_sv("no", tr, doc, voce.get("phantom_note"))

    # risposta in frequenza  «20 to 20,000 Hz» / «20Hz-16kHz» / «50 – 18.000 Hz».
    # Shure la scrive sotto l'etichetta, non accanto: si guardano anche le righe successive.
    coppie = []
    tutte = list(righe(pg))
    for i, (p, r) in enumerate(tutte):
        if re.search(r"frequen|response|Übertragung", r, re.I):
            coppie.append((p, r))
            for j in range(i + 1, min(i + 4, len(tutte))):
                if tutte[j][0] == p:
                    coppie.append((p, r + " ⏎ " + tutte[j][1]))
    for p, r in coppie:
        m = re.search(r"(\d{2,3})\s*(?:Hz)?\s*(?:to|–|-|—)\s*(\d{1,3})[.,]?(\d{3})?\s*(k?Hz)", r, re.I)
        if m:
            lo = int(m.group(1))
            hi = int(m.group(2)) * 1000 if (m.group(4) or "").lower() == "khz" else int(m.group(2) + (m.group(3) or ""))
            if 10 <= lo <= 500 and 8000 <= hi <= 50000:
                d["freqResp_lo_hz"] = {"value": lo, "unit_orig": "Hz", "reliability": "official",
                                       "source": {"doc": doc, "page": p, "quote": r[:300]}}
                d["freqResp_hi_hz"] = {"value": hi, "unit_orig": "Hz", "reliability": "official",
                                       "source": {"doc": doc, "page": p, "quote": r[:300]}}
                break

    # sensibilita' mV/Pa e dBV
    tr = (cerca(pg, r"([\d.,]+)\s*mV\s*/\s*Pa")
          or cerca_blocco(pg, r"sensitivity|Empfindlichkeit", r"\(([\d.,]+)\s*mV\)")
          or cerca_blocco(pg, r"sensitivity|Empfindlichkeit", r"([\d.,]+)\s*mV\s*/\s*Pa"))
    s = sv(tr, lambda x: float(x.replace(",", ".")), "mV/Pa", doc)
    if s: d["sensitivity_mvpa"] = s
    tr = (cerca(pg, r"\(?(-\s?[\d.,]+)\s*dBV\s*/\s*Pa")
          or cerca_blocco(pg, r"sensitivity|Empfindlichkeit", r"\(?(-\s?[\d.,]+)\s*dBV")
          or cerca(pg, r"\(?(-\s?[\d.,]+)\s*dBV?\b"))
    s = sv(tr, lambda x: float(x.replace(" ", "").replace(",", ".")), "dBV/Pa", doc)
    if s: d["sensitivity_dbv"] = s

    # impedenza
    tr = (cerca(pg, r"(?:impedance|Impedanz)\D{0,40}?(\d{2,4})\s*(?:ohm|Ω)", 1)
          or cerca_blocco(pg, r"impedance|Impedanz", r"(\d{2,4})\s*(?:ohm|Ω)"))
    s = sv(tr, int, "Ohm", doc)
    if s: d["impedance_ohm"] = s

    # SPL massimo: il valore può stare prima o dopo la sigla, quindi due passate distinte
    tr = cerca(pg, r"(\d{3})\s*dB\b.{0,60}(?:SPL|sound pressure)") \
         or cerca(pg, r"(?:SPL|sound pressure)\D{0,60}?(\d{3})\s*dB")
    s = sv(tr, int, "dB", doc)
    if s: d["maxSPL_db"] = s

    # connettore
    tr = cerca(pg, r"\b(XLR)\b.{0,80}")
    if tr: d["connector"] = testo_sv(voce.get("connector", "XLR3M"), tr, doc, voce.get("connector_note"))

    return d

if __name__ == "__main__":
    voci = json.load(open(sys.argv[1]))
    fuori = []
    for v in voci:
        print("== " + v["id"], file=sys.stderr)
        fuori.append(estrai(v))
    json.dump(fuori, open(sys.argv[2], "w"), ensure_ascii=False, indent=1)
    print("scritti %d prodotti in %s" % (len(fuori), sys.argv[2]), file=sys.stderr)
