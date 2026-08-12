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
    n = subprocess.run(["pdfinfo", os.path.join(BASE, f)], capture_output=True, text=True, errors="replace").stdout
    m = re.search(r"Pages:\s+(\d+)", n)
    tot = int(m.group(1)) if m else 1
    # I manuali multilingua mettono le «Technische Daten» in fondo: fermarsi a pagina 12 faceva
    # perdere la scheda del C535 EB e del MKE 600, che pure ce l'hanno.
    for p in range(1, min(tot, 40) + 1):
        t = subprocess.run(["pdftotext", "-layout", "-f", str(p), "-l", str(p),
                            os.path.join(BASE, f), "-"], capture_output=True, text=True, errors="replace").stdout
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
    if testo and piatto(testo)[:6] not in piatto(q):
        print("  ⚠ citazione che non prova il valore («%s»): %s" % (testo, q[:80]), file=sys.stderr)
        return None
    o = {"value": valore, "unit_orig": None, "reliability": "official",
         "source": {"doc": doc, "page": p, "quote": q}}
    if nota:
        o["note"] = nota
    return o

# Le chiavi si confrontano SENZA spazi né trattini: «Super Cardioid», «super-cardioid» e
# «supercardioid» sono la stessa figura scritta in tre modi (il Heil PR 30 usa il primo).
# In coda i termini tedeschi: i manuali AKG storici sono in tedesco e la scheda dice «Niere».
POLARI = [("supercardioid", "supercardioid"), ("hypercardioid", "hypercardioid"),
          ("hyper-cardioid", "hypercardioid"), ("super-cardioid", "supercardioid"),
          ("half-cardioid", "half-cardioid"), ("semi-cardioid", "half-cardioid"),
          ("omnidirectional", "omni"), ("bidirectional", "figure-8"),
          ("figure-of-eight", "figure-8"), ("figure of eight", "figure-8"),
          ("cardioid", "cardioid"),
          ("superniere", "supercardioid"), ("hyperniere", "hypercardioid"),
          ("nierenformig", "cardioid"), ("niere", "cardioid"),
          ("kugel", "omni"), ("acht", "figure-8")]

def piatto(x):
    return re.sub(r"[\s\-]", "", str(x).lower()).replace("ö", "o").replace("ü", "u").replace("ä", "a")

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

    # Figura polare. Due trappole imparate a spese mie:
    # 1. cercare «pattern» ovunque pesca la PROSA, non la scheda: sul Heil PR 30 aveva agganciato
    #    «…producing a very linear cardioid pattern» per un microfono che a targa è supercardioide.
    #    Quindi prima si guardano solo le righe con l'ETICHETTA vera, e la prosa viene dopo.
    # 2. il valore che scriviamo non è sempre la parola del documento: «figure-8» dove c'è scritto
    #    «bidirectional», «multi» dove sono elencate quattro figure. Sono classificazioni legittime,
    #    ma vanno DICHIARATE in nota — non spacciate per citazione letterale.
    pol = voce.get("polar")
    if pol:
        alternative = "|".join(k for k, _ in POLARI)
        ETICH = r"polar pattern|polar patterns|pick-?up pattern|directional pattern|directional characteristic|Richtcharakteristik|polar:"
        SINONIMI = {"figure-8": ["bidirectional", "figure-of-eight", "figure of eight"],
                    "omni": ["omnidirectional"], "half-cardioid": ["semi-cardioid", "hemispherical"]}
        nota = voce.get("polar_note")
        trovata = None
        if pol == "multi":
            # per un multipattern la prova è la MOLTEPLICITÀ: due figure sulla stessa riga, o la
            # parola che dice che si commuta. Una figura sola non dimostrerebbe niente.
            tutte_m = list(righe(pg))
            for i, (p, r0) in enumerate(tutte_m):
                if not re.search(ETICH + r"|selectable|switchable|patterns", r0, re.I):
                    continue
                # le figure possono stare sulla riga dell'etichetta o subito sotto, una per riga
                # (VP88: «Polar Pattern ⏎ Mid Cartridge Cardioid ⏎ Side Cartridge Bidirectional»)
                seguito = [tutte_m[j][1] for j in range(i + 1, min(i + 4, len(tutte_m)))
                           if tutte_m[j][0] == p]
                r = " ⏎ ".join([r0] + seguito) if seguito else r0
                figure = {en for chiave, en in POLARI if piatto(chiave) in piatto(r)}
                # «nine, selectable» sotto l'etichetta polare è prova di molteplicità anche senza
                # che le figure siano nominate (è il caso del C414)
                if re.search(ETICH, r0, re.I) and re.search(r"\bnine\b|selectable|switchable|multiple", r, re.I):
                    figure = figure | {"dichiarate", "molteplici"}
                # «switchable» da solo non prova niente: sul VP88 la riga commutabile era quella del
                # FILTRO passa-alto, non delle figure. La parola vale solo se la riga parla di polari.
                commuta = (re.search(r"selectable|switchable|nine|multi-?pattern|variable", r, re.I)
                           and re.search(r"polar|pattern", r, re.I) and figure)
                if len(figure) >= 2 or commuta:
                    m = re.search(r"\b(" + alternative + r"|selectable|switchable)\b", r, re.I)
                    trovata = (r.strip()[:0] or "multi", p, finestra(r, m) if m else r[:300])
                    nota = nota or ("Il documento elenca le figure una per una: qui è classificato «multi».")
                    break
        else:
            attese = [pol] + SINONIMI.get(pol, [])
            tutte = list(righe(pg))
            # passata 1: solo le righe con l'etichetta della scheda (la figura può stare lì o subito
            # sotto — le guide Shure la scrivono a capo). Passata 2: il resto del documento.
            for passata in (ETICH, r"polar|pattern|directional"):
                for i, (p, r) in enumerate(tutte):
                    if not re.search(passata, r, re.I):
                        continue
                    blocco = [r] + [tutte[j][1] for j in range(i + 1, min(i + 4, len(tutte)))
                                    if tutte[j][0] == p]
                    for k, testo in enumerate(blocco):
                        for chiave, en in POLARI:
                            if piatto(chiave) in piatto(testo) and (en == pol or chiave in attese):
                                unita = r if k == 0 else (r + " ⏎ " + testo)
                                # la riga può scriverla spaziata: si ricostruisce il punto esatto
                                m = (re.search(re.escape(chiave), unita, re.I)
                                     or re.search(r"[\s\-]*".join(map(re.escape, chiave)), unita, re.I))
                                trovata = (chiave, p, finestra(unita, m) if m else unita[:300])
                                if chiave != pol:
                                    nota = nota or ("Il documento scrive «%s»: è la stessa figura." % chiave)
                                break
                        if trovata:
                            break
                    if trovata:
                        break
                if trovata:
                    break
        if trovata:
            _, p, q = trovata
            d["polar"] = {"value": pol, "unit_orig": None, "reliability": "official",
                          "source": {"doc": doc, "page": p, "quote": q}}
            if nota:
                d["polar"]["note"] = nota

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
