/* ===== CATALOGO PRO (16/11/2026) — console digitali e stage rack con le misure delle schede =====
   Richiesta di Simone (16/11): «un catalogo professionale di stage box e mixing desk digitali».
   Un registro solo, PRO_DB: ogni modello porta misura in pianta, peso, consumo, U rack, I/O e la FONTE
   (documento del costruttore, pagina, frase copiata). Niente dato senza fonte: null = la scheda non lo
   dice, mai stimato. Il motore continua a leggere STAGEBOX_DB e MIXER_DB: qui sotto i modelli nuovi ci
   entrano, quelli già presenti ricevono solo misure, peso, consumo e fonte (I/O e protocolli restano).

   Sul palco un modello è il tipo di sempre (stagebox, mixer, o la console che ha già un'icona) con
   hw:"<id>" e pro:1. pro:1 vuol dire «posato dal catalogo pro»: solo allora peso e consumo vengono dal
   modello (wattFonte «targa»). Un progetto salvato prima con lo stesso hw non cambia numeri riaprendolo
   (come le scale salvate del 16/11): il rider già mandato al teatro resta quello.

   Icone: disegnate a codice dalle misure (metodo ibrido approvato, memoria stageplot_icone_da_foto):
   stage box = pannello connettori di sbDraw nella misura vera; console = superficie con schermi,
   manopole, banchi di fader e appoggiapolsi dalla parte di chi mixa (in basso, come le icone dell'app).
   Il numero dei fader e degli schermi viene dalla scheda quando la scheda lo dice (look.f, look.s);
   la loro posizione esatta è indicativa: conta l'ingombro. Solo rect/circle/line: passa da svg2pdf.

   I dati stanno fra i marcatori <dati> e </dati>, generati da
   STAGEPLOT/analisi/2026-11-16_CATALOGO_PRO/genera_pro_db.py (fuori dal repo pubblico) partendo dal JSON
   verificato sulle schede. Non modificarli a mano senza aggiornare il JSON. */
/* <dati> */
var PRO_DB = {
  "x32c":{"kind":"console","brand":"Behringer","model":"X32 COMPACT","famiglia":"X32","mm":[625.0,510.0,215.0],"kg":15.4,"W":120,"in":16,"out":8,"proto":["aes50"],"src":"Behringer X32-COMPACT Manual, p.68/67/1","look":{"f":[16,1],"s":1},"usb":{"in":32,"out":32,"port":"scheda X-USB"}},
  "x32p":{"kind":"console","brand":"Behringer","model":"X32 PRODUCER","famiglia":"X32","mm":[490.0,506.0,163.0],"kg":11.4,"W":70,"in":16,"out":8,"proto":["aes50"],"src":"Behringer X32-PRODUCER Manual, p.68/67/1","look":{"f":[16,1],"s":1},"usb":{"in":32,"out":32,"port":"scheda X-USB"}},
  "x32r":{"kind":"console","brand":"Behringer","model":"X32 RACK","famiglia":"X32","mm":[483.0,287.0,132.0],"kg":6.5,"W":60,"rackU":3,"in":16,"out":8,"proto":["aes50"],"src":"Behringer X32-RACK Manual, p.59/58","look":{"rack":1},"usb":{"in":32,"out":32,"port":"scheda X-USB"}},
  "wing":{"kind":"console","brand":"Behringer","model":"WING","famiglia":"WING","mm":[870.0,575.0,201.0],"kg":24,"W":130,"in":8,"out":8,"proto":["aes50"],"src":"Behringer WING-series UserManual, p.167/11/10/13","look":{"f":[12,8,4],"s":1},"usb":{"in":48,"out":48,"port":"USB-B"}},
  "wingc":{"kind":"console","brand":"Behringer","model":"WING COMPACT","famiglia":"WING","mm":[453.0,574.0,225.0],"kg":15.4,"W":130,"in":24,"out":8,"proto":["aes50"],"src":"Behringer WING-series UserManual, p.167/11/10/13","look":{"f":[12,1],"s":1},"usb":{"in":48,"out":48,"port":"USB-B"}},
  "wingr":{"kind":"console","brand":"Behringer","model":"WING RACK","famiglia":"WING","mm":[486.0,326.0,183.0],"kg":15.4,"W":130,"rackU":4,"in":24,"out":8,"proto":["aes50"],"src":"Behringer WING-series UserManual, p.167/11 + Behringer WING-RACK QuickStartGuide, p.105","look":{"rack":1},"usb":{"in":48,"out":48,"port":"USB-B"}},
  "m32":{"kind":"console","brand":"Midas","model":"M32","famiglia":"M32","mm":[891.0,612.0,256.0],"kg":24.5,"W":120,"in":32,"out":22,"proto":["aes50"],"src":"Midas M32 Manual, p.47/46","look":{"f":[8,8,8,1],"s":1,"c":"blu"}},
  "m32r":{"kind":"console","brand":"Midas","model":"M32R LIVE","famiglia":"M32","mm":[478.0,617.0,208.0],"kg":14.3,"W":70,"in":16,"out":8,"proto":["aes50"],"src":"Midas M32R Manual, p.53/52","look":{"f":[8,8,1],"s":1,"c":"blu"},"usb":{"in":32,"out":32,"port":"scheda DN32-USB"}},
  "m32c":{"kind":"console","brand":"Midas","model":"M32C","famiglia":"M32","mm":[483.0,300.0,50.0],"kg":3.5,"W":40,"proto":["aes50"],"src":"Midas M32C QuickStart, p.17/6","look":{"rack":1,"c":"blu"},"usb":{"in":32,"out":32,"port":"scheda DN32-USB"}},
  "hd9624":{"kind":"console","brand":"Midas","model":"HD96-24-CC-TP","famiglia":"","mm":[1028.0,719.0,352.0],"kg":43.2,"in":8,"out":8,"proto":["hypermac"],"src":"Midas HD96-24-CC-TP QuickStart, p.128/127/8","Wunit":"W (2 x 650 W)","tipo":"hd96"},
  "tf5":{"kind":"console","brand":"Yamaha","model":"TF5","famiglia":"TF","mm":[866.0,599.0,225.0],"kg":20.0,"W":120,"in":32,"out":16,"proto":[],"src":"Yamaha TF Series brochure, p.13/12/8","look":{"f":[16,16,1],"s":1},"usb":{"in":34,"out":34,"port":"USB TO HOST"}},
  "tf3":{"kind":"console","brand":"Yamaha","model":"TF3","famiglia":"TF","mm":[716.0,599.0,225.0],"kg":17.0,"W":110,"in":24,"out":16,"proto":[],"src":"Yamaha TF Series brochure, p.13/12/8","look":{"f":[24,1],"s":1},"usb":{"in":34,"out":34,"port":"USB TO HOST"}},
  "tf1":{"kind":"console","brand":"Yamaha","model":"TF1","famiglia":"TF","mm":[510.0,599.0,225.0],"kg":13.5,"W":100,"in":16,"out":16,"proto":[],"src":"Yamaha TF Series brochure, p.13/12/8","look":{"f":[16,1],"s":1},"usb":{"in":34,"out":34,"port":"USB TO HOST"}},
  "tfrack":{"kind":"console","brand":"Yamaha","model":"TF-RACK","famiglia":"TF","mm":[480.0,409.0,132.0],"kg":9.2,"W":85,"rackU":3,"in":16,"out":16,"proto":[],"src":"Yamaha TF Series brochure, p.13","look":{"rack":1},"usb":{"in":34,"out":34,"port":"USB TO HOST"}},
  "csr5":{"kind":"console","brand":"Yamaha","model":"CS-R5 (RIVAGE PM5)","famiglia":"RIVAGE PM","mm":[1444.0,643.0,414.0],"kg":42,"in":8,"out":8,"proto":["twinlane","dante"],"src":"Yamaha RIVAGE-PM Series Brochure, p.10/4","tipo":"csr5"},
  "csr3":{"kind":"console","brand":"Yamaha","model":"CS-R3 (RIVAGE PM3)","famiglia":"RIVAGE PM","mm":[1145.0,650.0,385.0],"kg":38,"in":8,"out":8,"proto":["twinlane","dante"],"src":"Yamaha RIVAGE-PM Series Brochure, p.11/4","tipo":"csr3"},
  "csr10":{"kind":"console","brand":"Yamaha","model":"CS-R10 (RIVAGE PM10)","famiglia":"RIVAGE PM","mm":[1549.0,848.0,417.0],"kg":85,"in":8,"out":8,"proto":["twinlane","dante"],"src":"Yamaha RIVAGE-PM Series Brochure, p.10/4","tipo":"csr10"},
  "csd7":{"kind":"console","brand":"Yamaha","model":"CSD-R7 (RIVAGE PM7)","famiglia":"","mm":[1549.0,848.0,417.0],"kg":94,"in":8,"out":8,"proto":["twinlane","dante"],"src":"Yamaha RIVAGE-PM Series Brochure, p.10/4","look":{"f":[12,12,12,2],"s":3,"c":"nero"}},
  "cl5":{"kind":"console","brand":"Yamaha","model":"CL5","famiglia":"CL","mm":[1053.0,667.0,299.0],"kg":36,"W":170,"proto":["dante"],"src":"Yamaha CL5 OwnerManual EN, p.56/17","look":{"f":[16,8,8,2],"s":1,"c":"nero"}},
  "ql5":{"kind":"console","brand":"Yamaha","model":"QL5","famiglia":"QL","mm":[828.4,563.0,272.0],"kg":21.8,"W":200,"in":32,"out":16,"proto":["dante"],"src":"Yamaha QL5 ReferenceManual EN, p.20/14 + Yamaha QL5 QL1 OwnerManual EN, p.51","look":{"f":[16,16,2],"s":1,"c":"nero"}},
  "qu5":{"kind":"console","brand":"Allen & Heath","model":"Qu-5","famiglia":"Qu","mm":[440.0,476.0,213.0],"kg":10,"W":70,"in":16,"out":14,"proto":["dsnake"],"src":"AllenHeath Qu-5 Qu-5D TechnicalDatasheet, p.9/8/2","look":{"f":[16,1],"s":1},"usb":{"in":32,"out":32,"port":"USB-C"},"dante":false},
  "qu6":{"kind":"console","brand":"Allen & Heath","model":"Qu-6","famiglia":"Qu","mm":[609.0,476.0,213.0],"kg":13.5,"W":90,"in":24,"out":18,"proto":["dsnake"],"src":"AllenHeath Qu-6 Qu-6D TechnicalDatasheet, p.9/8/2","look":{"f":[24,1],"s":1},"usb":{"in":32,"out":32,"port":"USB-C"},"dante":false},
  "qu7":{"kind":"console","brand":"Allen & Heath","model":"Qu-7","famiglia":"Qu","mm":[800.0,476.0,213.0],"kg":16.7,"W":105,"in":32,"out":22,"proto":["dsnake"],"src":"AllenHeath Qu-7 Qu-7D TechnicalDatasheet, p.9/8/2","look":{"f":[32,1],"s":1},"usb":{"in":32,"out":32,"port":"USB-C"},"dante":false},
  "sq6":{"kind":"console","brand":"Allen & Heath","model":"SQ-6","famiglia":"SQ","mm":[638.0,514.9,198.0],"kg":14.5,"W":90,"in":24,"out":16,"proto":["dsnake","gigaace"],"src":"AllenHeath SQ-6 TechnicalDatasheet, p.6/1","look":{"f":[12,12,1],"s":1}},
  "sq7":{"kind":"console","brand":"Allen & Heath","model":"SQ-7","famiglia":"SQ","mm":[804.0,514.9,198.0],"kg":17.8,"W":110,"in":32,"out":18,"proto":["dsnake","gigaace"],"src":"AllenHeath SQ-7 TechnicalDatasheet, p.6/1/2","tipo":"sq7","usb":{"in":32,"out":32,"port":"USB-B"}},
  "cq12t":{"kind":"console","brand":"Allen & Heath","model":"CQ-12T","famiglia":"CQ","mm":[291.0,242.0,89.0],"kg":2.4,"W":35,"in":10,"out":8,"proto":[],"src":"AllenHeath CQ-12T TechnicalDatasheet, p.5/4/1","look":{"tablet":1},"usb":{"in":16,"out":16,"port":"USB-B"}},
  "cq18t":{"kind":"console","brand":"Allen & Heath","model":"CQ-18T","famiglia":"CQ","mm":[346.0,242.0,89.0],"kg":3.0,"W":35,"in":16,"out":8,"proto":[],"src":"AllenHeath CQ-18T TechnicalDatasheet, p.5/4/1","look":{"tablet":1},"usb":{"in":24,"out":22,"port":"USB-B"}},
  "cq20b":{"kind":"console","brand":"Allen & Heath","model":"CQ-20B","famiglia":"CQ","mm":[372.0,154.0,134.0],"kg":2.6,"W":45,"in":16,"out":10,"proto":[],"src":"AllenHeath CQ-20B TechnicalDatasheet, p.5/4/1","look":{"rack":1},"usb":{"in":24,"out":24,"port":"USB-B"}},
  "dlc1500":{"kind":"console","brand":"Allen & Heath","model":"dLive C1500","famiglia":"dLive","mm":[485.0,665.0,325.0],"kg":18,"proto":[],"src":"AllenHeath dLive-C1500 WeightsAndDims, p.1","look":{"f":[12],"s":1,"c":"nero"}},
  "dlc2500":{"kind":"console","brand":"Allen & Heath","model":"dLive C2500","famiglia":"dLive","mm":[775.0,665.0,325.0],"kg":24.5,"W":110,"in":6,"out":6,"proto":["gigaace"],"src":"AllenHeath dLive-C2500 Datasheet, p.2/1","look":{"f":[12,8],"s":1,"c":"nero"}},
  "dlc3500":{"kind":"console","brand":"Allen & Heath","model":"dLive C3500","famiglia":"dLive","mm":[885.0,665.0,325.0],"kg":28,"W":110,"in":6,"out":6,"proto":["gigaace"],"src":"AllenHeath dLive-C3500 Datasheet, p.2/1","look":{"f":[12,12],"s":2,"c":"nero"}},
  "dlives5":{"kind":"console","brand":"Allen & Heath","model":"dLive S5000","famiglia":"dLive","mm":[1115.0,728.0,413.0],"kg":35,"W":300,"in":8,"out":8,"proto":["gigaace"],"src":"AllenHeath dLive-S5000 Datasheet, p.4/3/1","tipo":"dlives5"},
  "q225":{"kind":"console","brand":"DiGiCo","model":"Quantum 225","famiglia":"Quantum","mm":[1124.0,801.0,436.0],"kg":43,"in":8,"out":8,"proto":["madi"],"src":"DiGiCo Quantum-225 DataSheet, p.5/2","look":{"f":[12,12],"s":1,"c":"nero"}},
  "q338":{"kind":"console","brand":"DiGiCo","model":"Quantum 338","famiglia":"Quantum","mm":[1595.0,805.0,482.0],"kg":70,"in":8,"out":8,"proto":["madi"],"src":"DiGiCo Quantum-338 DataSheet, p.5/2","tipo":"q338"},
  "q7":{"kind":"console","brand":"DiGiCo","model":"Quantum 7","famiglia":"Quantum","mm":[1496.0,875.0,503.0],"kg":112,"in":12,"out":12,"proto":["optocore","madi"],"src":"DiGiCo Quantum-7 DataSheet, p.5/2/1","look":{"f":[12,12,12,2],"s":3,"c":"nero"}},
  "sd7":{"kind":"console","brand":"DiGiCo","model":"SD7","famiglia":"SD","mm":[1496.0,875.0,503.0],"kg":107,"in":12,"out":12,"proto":["optocore","madi"],"src":"DiGiCo SD7 DataSheet, p.5/2/1","look":{"f":[12,12,12,2],"s":3,"c":"nero"}},
  "sd9":{"kind":"console","brand":"DiGiCo","model":"SD9","famiglia":"SD","mm":[878.0,785.0,262.0],"kg":36,"W":208,"in":8,"out":8,"proto":["madi"],"src":"DiGiCo SD9 DataSheet, p.3/4/2","Wunit":"W (232 VA)","look":{"f":[8,8,8,2],"s":1,"c":"nero"}},
  "s6l24c":{"kind":"console","brand":"Avid","model":"VENUE S6L-24C","famiglia":"VENUE S6L","mm":[989.0,787.0,205.0],"kg":38,"in":8,"out":10,"proto":["avb"],"src":"Avid VENUE S6L ArchitecturalSpecs, p.3 + Avid VENUE S6L ProductSpecs, p.2","look":{"f":[8,8,8],"s":3,"c":"nero"}},
  "s6l24d":{"kind":"console","brand":"Avid","model":"VENUE S6L-24D","famiglia":"VENUE S6L","mm":[989.0,787.0,388.0],"kg":54,"in":8,"out":10,"proto":["avb"],"src":"Avid VENUE S6L ArchitecturalSpecs, p.2 + Avid VENUE S6L ProductSpecs, p.2","look":{"f":[8,8,8],"s":4,"c":"nero"}},
  "s6l32d":{"kind":"console","brand":"Avid","model":"VENUE S6L-32D","famiglia":"VENUE S6L","mm":[1304.0,787.0,388.0],"kg":70,"in":8,"out":10,"proto":["avb"],"src":"Avid VENUE S6L ArchitecturalSpecs, p.2 + Avid VENUE S6L ProductSpecs, p.2","look":{"f":[8,8,8,8],"s":5,"c":"nero"}},
  "s6l48d":{"kind":"console","brand":"Avid","model":"VENUE S6L-48D","famiglia":"VENUE S6L","mm":[1934.0,787.0,388.0],"kg":108,"in":8,"out":10,"proto":["avb"],"src":"Avid VENUE S6L ArchitecturalSpecs, p.1 + Avid VENUE S6L ProductSpecs, p.2","look":{"f":[8,8,8,8,8,8],"s":7,"c":"nero"}},
  "s6l16c":{"kind":"console","brand":"Avid","model":"VENUE S6L-16C","famiglia":"VENUE S6L","mm":[671.0,787.0,205.0],"kg":32,"in":1,"out":3,"proto":["avb"],"src":"Avid VENUE S6L ArchitecturalSpecs, p.3 + Avid VENUE S6L ProductSpecs, p.2","look":{"f":[8,8],"s":2,"c":"nero"}},
  "e6l":{"kind":"console","brand":"Avid","model":"VENUE E6L (engine E6L-112/144/192, E6LX-256)","famiglia":"","mm":[483.0,537.0,218.7],"kg":33.5,"rackU":5,"proto":[],"src":"Avid VENUE S6L ArchitecturalSpecs, p.4","look":{"rack":1,"c":"nero"}},
  "stage16":{"kind":"stagebox","brand":"Avid","model":"Stage 16","famiglia":"Stage","mm":[483.0,309.8,175.2],"kg":9.5,"rackU":4,"in":16,"out":8,"proto":["avb"],"src":"Avid VENUE S6L ArchitecturalSpecs, p.6 + Avid VENUE S6L ProductSpecs, p.5"},
  "stage64":{"kind":"stagebox","brand":"Avid","model":"Stage 64","famiglia":"Stage","mm":[483.0,309.8,444.5],"kg":31.2,"rackU":10,"in":48,"out":8,"proto":["avb","madi"],"src":"Avid VENUE S6L ArchitecturalSpecs, p.6 + Avid VENUE S6L ProductSpecs, p.4"},
  "tio1608d":{"kind":"stagebox","brand":"Yamaha","model":"Tio1608-D","famiglia":"Tio","mm":[480.0,364.0,88.0],"kg":5.7,"W":50,"in":16,"out":8,"proto":["dante"],"src":"Yamaha Tio1608-D datasheet, p.2/1"},
  "tio1608d2":{"kind":"stagebox","brand":"Yamaha","model":"Tio1608-D2","famiglia":"Tio","mm":[480.0,364.0,88.0],"kg":5.7,"W":50,"rackU":2,"in":16,"out":8,"proto":["dante"],"src":"Yamaha Tio1608-D2 OwnerManual, p.20/19/8"},
  "rio1608d2":{"kind":"stagebox","brand":"Yamaha","model":"Rio1608-D2","famiglia":"Rio","mm":[480.0,367.5,132.0],"kg":9.6,"W":72,"rackU":3,"in":16,"out":8,"proto":["dante"],"src":"Yamaha Rio3224-D2 OwnerManual, p.31 + Yamaha RIVAGE-PM Series Brochure, p.11"},
  "rio3224d2":{"kind":"stagebox","brand":"Yamaha","model":"Rio3224-D2","famiglia":"Rio","mm":[480.0,367.5,220.0],"kg":13.5,"W":120,"rackU":5,"in":32,"out":16,"proto":["dante"],"src":"Yamaha Rio3224-D2 OwnerManual, p.31 + Yamaha RIVAGE-PM Series Brochure, p.11"},
  "dldm48":{"kind":"stagebox","brand":"Allen & Heath","model":"dLive DM48 (MixRack)","famiglia":"DL","mm":[482.6,313.0,369.0],"kg":17.5,"W":300,"rackU":9,"in":48,"out":24,"proto":["gigaace"],"src":"AllenHeath dLive-DM48 Datasheet, p.5/1"},
  "dx168":{"kind":"stagebox","brand":"Allen & Heath","model":"DX168","famiglia":"DX","mm":[410.0,190.0,185.0],"kg":4.6,"W":35,"in":16,"out":8,"proto":[],"src":"AllenHeath DX168 Datasheet, p.3/1"},
  "s16":{"kind":"stagebox","brand":"Behringer","model":"S16","famiglia":"S-series","mm":[482.0,225.0,89.0],"kg":4.7,"W":45,"rackU":2,"in":16,"out":8,"proto":["aes50"],"src":"Behringer S16 QuickStart, p.67"},
  "s32":{"kind":"stagebox","brand":"Behringer","model":"S32","famiglia":"S-series","mm":[483.0,242.0,138.0],"kg":5.6,"W":55,"rackU":3,"in":32,"out":16,"proto":["aes50"],"src":"Behringer S32 QuickStart, p.13"},
  "sd16":{"kind":"stagebox","brand":"Behringer","model":"SD16","famiglia":"SD","mm":[333.0,149.0,140.0],"kg":3.2,"W":45,"in":16,"out":8,"proto":["aes50"],"src":"Behringer SD16-SD8 QuickStart, p.23"},
  "sd8":{"kind":"stagebox","brand":"Behringer","model":"SD8","famiglia":"SD","mm":[333.0,149.0,95.0],"kg":2.5,"W":35,"in":8,"out":8,"proto":["aes50"],"src":"Behringer SD16-SD8 QuickStart, p.23"},
  "dl16":{"kind":"stagebox","brand":"Midas","model":"DL16","famiglia":"DL","mm":[482.0,225.0,89.0],"kg":4.7,"W":45,"rackU":2,"in":16,"out":8,"proto":["aes50"],"src":"Midas DL16 QuickStart, p.67"},
  "dl32":{"kind":"stagebox","brand":"Midas","model":"DL32","famiglia":"DL","mm":[483.0,242.0,138.0],"kg":5.7,"W":55,"rackU":3,"in":32,"out":16,"proto":["aes50"],"src":"Midas DL32 QuickStart, p.13"},
  "sdrack":{"kind":"stagebox","brand":"DiGiCo","model":"SD-Rack","famiglia":"SD","mm":[482.7,371.0,443.7],"kg":26,"rackU":10,"proto":["madi"],"src":"DiGiCo SD-Rack DataSheet, p.3/4/1/2","Wunit":"A (85-264 VAC, 4 A max)"},
  "drack":{"kind":"stagebox","brand":"DiGiCo","model":"D-Rack","famiglia":"D-Rack","mm":[412.0,179.0,310.0],"kg":10,"in":32,"out":8,"proto":["madi"],"src":"DiGiCo D-Rack DataSheet, p.3/4/2","Wunit":"A (88-264 VAC, 2.8 A max)"},
  "d2rack":{"kind":"stagebox","brand":"DiGiCo","model":"D2-Rack","famiglia":"D-Rack","mm":[482.6,248.0,399.2],"kg":13,"rackU":9,"in":48,"out":16,"proto":["madi"],"src":"DiGiCo D2-Rack DataSheet, p.3/4/2","Wunit":"VA (100-240 VAC, 200 VA max)"},
  "ql1":{"kind":"console","brand":"Yamaha","model":"QL1","famiglia":"QL","mm":[468.0,562.0,272.0],"kg":14.7,"W":135,"in":16,"out":8,"proto":["dante"],"src":"Yamaha QL5 QL1 OwnerManual EN, p.51/16/10","look":{"f":[16,2],"s":1,"c":"nero"}},
  "x32":{"kind":"console","brand":"Behringer","model":"X32","famiglia":"X32","mm":[900.0,528.0,200.0],"kg":20.6,"W":120,"in":32,"out":16,"proto":["aes50"],"src":"Behringer X32 QuickStartGuide, p.25","look":{"f":[16,8,1],"s":1}}
};
/* </dati> */

AUDIO_PROTO.twinlane = AUDIO_PROTO.twinlane || "TWINLANe";
AUDIO_PROTO.hypermac = AUDIO_PROTO.hypermac || "HyperMAC";
AUDIO_PROTO.slink = AUDIO_PROTO.slink || "SLink";

/* misura in pianta (cm) = fronte × profondità della scheda, al millimetro (17/11/2026, Simone: «le dimensioni
   reali devono essere perfette»): prima era arrotondata al centimetro (fino a 5 mm di scarto, Rio 36,75 → 37). */
function proDimsCm(m){ if(!m || !m.mm) return null; var w=Math.round(+m.mm[0])/10, d=Math.round(+m.mm[1])/10;
  return (w>0 && d>0) ? {w:w, d:d} : null; }
function proCmTesto(v){ return String(Math.round(v*10)/10).replace(".", ","); }
function proNome(m){ return m ? (m.brand+" "+m.model) : ""; }
/* il modello di un elemento, solo se è del tipo giusto (una stage box non può avere l'id di una console) */
function proModelOf(it){
  if(!it || !it.hw || !Object.prototype.hasOwnProperty.call(PRO_DB, it.hw)) return null;
  var m=PRO_DB[it.hw];
  if(m.kind==="stagebox") return (it.type==="stagebox" || it.type==="substg") ? m : null;
  return (it.type==="mixer" || it.type===m.tipo) ? m : null;
}
/* peso e consumo del modello: solo per gli elementi posati dal catalogo pro (pro:1), vedi sopra */
function proKg(it){ var m=(it && it.pro) ? proModelOf(it) : null; return (m && m.kg!=null && isFinite(m.kg)) ? +m.kg : null; }
function proWatt(it){ var m=(it && it.pro) ? proModelOf(it) : null; return (m && m.W!=null && isFinite(m.W)) ? Math.round(+m.W) : null; }
function proRackU(id){ var m=PRO_DB[id]; return (m && m.rackU>0) ? m.rackU : null; }
/* Applica il modello a un elemento già sul palco (pannello «Modello»): misura vera solo se la misura
   attuale non l'ha scelta l'utente (quella di partenza del tipo o una misura generata da noi). */
function proApplica(it){
  var m=proModelOf(it); if(!m){ if(it) delete it.pro; return false; }
  it.pro=1;
  var dm=proDimsCm(m), t=TYPES[it.type]||{};
  var auto=(it.w==null || it.d==null) || (it.w===t.w && it.d===t.d)
    || ((it.type==="stagebox"||it.type==="substg") && typeof sbIsCanonSize==="function" && sbIsCanonSize(it.w,it.d))
    || it.proDims===1;
  if(dm && auto){ it.w=dm.w; it.d=dm.d; it.proDims=1; }
  return true;
}
/* proprietà con cui un modello nasce dal catalogo (ricerca, gruppo «Modelli») */
function proOver(id){
  var m=PRO_DB[id]; if(!m) return null;
  var dm=proDimsCm(m)||{}, o={hw:id, pro:1, proDims:1, w:dm.w, d:dm.d};
  if(m.kind==="console") o.label=proNome(m);
  return o;
}
function proTipo(id){ var m=PRO_DB[id]; return m ? (m.kind==="stagebox" ? "stagebox" : (m.tipo && TYPES[m.tipo] ? m.tipo : "mixer")) : null; }
function proDimTesto(m){
  var p=[];
  if(m.in!=null || m.out!=null) p.push((m.in||0)+" in / "+(m.out||0)+" out");
  var dm=proDimsCm(m); if(dm) p.push(proCmTesto(dm.w)+"×"+proCmTesto(dm.d)+" cm");
  if(m.rackU) p.push(m.rackU+"U");
  return p.join(" · ");
}
/* voci per la ricerca e per il gruppo «Modelli»: marca, modello, famiglia, protocollo. Le parole
   generiche (stage box, console, mixer, rack, dante…) restano alle voci di sempre (qaCede): chi scrive
   «stage box» trova prima «Stage box 8/16/24», chi scrive «rio» o «x32» trova il modello. */
var PRO_CEDE="stage box|stagebox|stage|box|console|mixer|mixer digitale|rack|stage rack|dante|digitale|yamaha|allen|midas|behringer|digico|avid|live|dlive";   /* «live» e «dlive» restano del dLive S5000 (06/10/2026) */
function proCatEntries(kind){
  return Object.keys(PRO_DB).filter(function(id){ return !kind || PRO_DB[id].kind===kind; }).map(function(id){
    var m=PRO_DB[id], k=proTipo(id);
    var kw=[m.brand, m.model, m.model.replace(/[-\s]/g,""), m.famiglia||"", (m.proto||[]).map(function(p){ return AUDIO_PROTO[p]||p; }).join(" "),
      m.kind==="stagebox" ? "stage box stagebox stage rack rack i/o preamplificatori remoti" : "console mixer digitale banco regia foh monitor"].join(" ");
    return {k:k, nome:proNome(m), over:proOver(id), dim:proDimTesto(m), kw:kw, qaCede:PRO_CEDE, pro:id};
  }).sort(function(a,b){ return a.nome.localeCompare(b.nome); });
}
/* entra nei registri del motore */
(function(){
  Object.keys(PRO_DB).forEach(function(id){
    var m=PRO_DB[id], DB=(m.kind==="stagebox") ? STAGEBOX_DB : MIXER_DB, e=DB[id];
    if(!e){
      e={brand:m.brand, model:m.model, proto:(m.proto||[]).slice(), v:true};
      if(m.in!=null) e.in=m.in;
      if(m.out!=null) e.out=m.out;
      if(m.kind==="stagebox"){ e.in=m.in||0; e.out=m.out||0; e.pre=true; e.casc=true; e.power="AC"; }
      else {
        if(m.usb) e.usb=m.usb;
        if(m.dante!=null) e.dante=m.dante;
        if(m.danteIn) e.danteIn=m.danteIn;
        if(m.danteOut) e.danteOut=m.danteOut;
        if(m.frame) e.frame=m.frame;
      }
      e.src=m.src;
      DB[id]=e;
    }
    e.mm=m.mm; e.kg=m.kg; e.W=m.W;
    if(m.kind==="stagebox" && m.rackU>0 && typeof RACK_U_HW!=="undefined") RACK_U_HW[id]=m.rackU;   /* U di scheda: corregge anche Rio1608-D2 (3U) e Rio3224-D2 (5U) */
  });
})();

/* ── icona della console in pianta ─────────────────────────────────────────────────────────────── */
var PRO_TINTE={ grigio:["#202326","#2c3034","#16191b"], blu:["#18233a","#22304d","#111a2c"], nero:["#141618","#1f2225","#0d0f10"] };
function consoleProDraw(it, m){
  var W=it.w||120, D=it.d||70, L=(m && m.look)||{}, tinta=PRO_TINTE[L.c]||PRO_TINTE.grigio;
  var r2=function(v){ return Math.round(v*100)/100; };
  function R(x,y,w,h,rx,fill,extra){ return '<rect x="'+r2(x)+'" y="'+r2(y)+'" width="'+r2(Math.max(0,w))+'" height="'+r2(Math.max(0,h))+'" rx="'+r2(rx)+'" fill="'+fill+'"'+(extra||"")+'/>'; }
  var s=R(-W/2,-D/2,W,D,Math.min(3,W*0.03),tinta[0])+R(-W/2+0.8,-D/2+0.8,W-1.6,D-1.6,Math.min(2.4,W*0.025),tinta[1]);
  var pad=Math.max(1.2, Math.min(3, W*0.025));
  if(L.rack || L.tablet){
    /* console da rack (vista dall'alto: coperchio, orecchie del rack ai lati) o da tavolo senza fader
       (schermo grande che fa da superficie): niente banchi di fader inventati */
    if(L.rack){ s+=R(-W/2-0.6, -D/2+1, 1.8, D-2, 0.4, "#3a3f44")+R(W/2-1.2, -D/2+1, 1.8, D-2, 0.4, "#3a3f44"); }
    var scW=L.tablet ? (W-2*pad)*0.62 : Math.min(W*0.3, 16), scH=L.tablet ? D*0.62 : Math.min(D*0.32, 9);
    var scX=L.tablet ? -scW/2 : -W/2+pad+1, scY=L.tablet ? -D/2+pad : D/2-pad-scH;
    s+=R(scX, scY, scW, scH, 0.8, "#0e161d");
    var nc=Math.max(3, Math.round(scW/3.4)), cw2=(scW-1.6)/nc;
    for(var c2=0;c2<nc;c2++) s+=R(scX+0.8+c2*cw2+0.2, scY+0.8, cw2-0.4, scH*0.22, 0.25, "#3b6e8c");
    var nk=Math.max(4, Math.min(16, Math.round((W-2*pad)/3.2))), kp=(W-2*pad)/nk;
    var ky=L.tablet ? D/2-pad-2.2 : -D/2+pad+2;
    for(var k2=0;k2<nk;k2++) s+='<circle cx="'+r2(-W/2+pad+(k2+0.5)*kp)+'" cy="'+r2(ky)+'" r="'+r2(Math.min(1.1,kp*0.32))+'" fill="#474c51"/>';
    s+='<circle cx="'+r2(W/2-pad-1.2)+'" cy="'+r2(-D/2+pad+1)+'" r=".55" fill="#22c55e"/>';
    return s;
  }
  var arm=Math.max(2.5, D*0.12);                       /* appoggiapolsi, dalla parte di chi mixa (y+) */
  s+=R(-W/2+pad, D/2-pad-arm, W-2*pad, arm, 1.2, tinta[2]);
  var top=-D/2+pad, zonaS=Math.max(4, D*0.3);          /* fascia degli schermi, verso il palco (y-) */
  var nS=Math.max(0, Math.min(6, L.s==null ? 1 : L.s));
  var usable=W-2*pad, gap=Math.max(1, usable*0.02);
  var sw=nS ? Math.min(usable*(nS>1?0.92:0.5)/nS, 42) : 0, sh=zonaS*0.78;
  var sx0=(L.sDx==null) ? (-(nS*sw+(nS-1)*gap)/2) : (-W/2+pad+usable*L.sDx);
  for(var i=0;i<nS;i++){
    var x=sx0+i*(sw+gap), y=top+(zonaS-sh)/2;
    s+=R(x,y,sw,sh,0.8,"#0e161d");
    var cols=Math.max(3, Math.round(sw/3.4)), cw=(sw-1.6)/cols;
    for(var c=0;c<cols;c++){ s+=R(x+0.8+c*cw+0.2, y+0.8, cw-0.4, sh*0.22, 0.25, "#3b6e8c"); s+=R(x+0.8+c*cw+0.2, y+0.8+sh*0.28, cw-0.4, sh*0.1, 0.2, "#2c5068"); }
  }
  /* manopole a sinistra degli schermi (o in riga se lo spazio non c'è) */
  var kr=Math.max(0.8, Math.min(1.5, W*0.012)), kx=-W/2+pad+kr+0.6;
  for(var q=0;q<3;q++) s+='<circle cx="'+r2(kx+q*kr*2.8)+'" cy="'+r2(top+zonaS*0.3)+'" r="'+r2(kr)+'" fill="#474c51"/>';
  /* banchi di fader */
  var fTop=top+zonaS+pad*0.6, fH=(D/2-pad-arm-pad*0.6)-fTop;
  var banchi=(L.f && L.f.length) ? L.f : [Math.max(8, Math.round(usable/3.2))];
  var tot=banchi.reduce(function(a,b){ return a+b; },0), bg=Math.max(1, usable*0.015);
  var passo=(usable-bg*(banchi.length-1))/Math.max(tot,1), bx=-W/2+pad, seme=7;
  banchi.forEach(function(nf){
    var bw=nf*passo; s+=R(bx, fTop, bw, fH, 0.8, tinta[2]);
    for(var f=0;f<nf;f++){
      var cx=bx+(f+0.5)*passo; s+='<line x1="'+r2(cx)+'" y1="'+r2(fTop+fH*0.12)+'" x2="'+r2(cx)+'" y2="'+r2(fTop+fH*0.9)+'" stroke="#3a3f44" stroke-width="'+r2(Math.max(0.15,passo*0.12))+'"/>';
      seme=(seme*37+11)%97; var cy=fTop+fH*(0.25+0.55*(seme/97));
      s+=R(cx-passo*0.32, cy-Math.max(0.5,passo*0.22), passo*0.64, Math.max(1,passo*0.44), 0.2, "#d9dcdf");
    }
    bx+=bw+bg;
  });
  /* due led di stato, come sulle icone dell'app */
  s+='<circle cx="'+r2(W/2-pad-1.2)+'" cy="'+r2(top+1)+'" r=".55" fill="#22c55e"/><circle cx="'+r2(W/2-pad-3)+'" cy="'+r2(top+1)+'" r=".55" fill="#eab308"/>';
  return s;
}
function proConsoleOf(it){ var m=proModelOf(it); return (m && m.kind==="console") ? m : null; }
(function(){
  var t=TYPES.mixer; if(!t || t._proDraw) return;
  var base=t.draw; t._proDraw=true;
  t.draw=function(it){ var m=proConsoleOf(it); if(!m) return base(it); var k=proIconaDi(it); return k ? proIconaDraw(it, k) : consoleProDraw(it, m); };
})();

/* ── icone realistiche dei modelli (17/11/2026) ─────────────────────────────────────────────────────
   Simone (16-17/11): «il più leggere possibili ma con un grado di realismo che dà soddisfazione al tecnico».
   Ogni modello del catalogo pro ha un'icona SVG in pianta, in cm, con la misura esterna della scheda e
   schermi, fader, manopole e prese nelle posizioni misurate sui disegni quotati del costruttore (o sulle
   foto zenitali ufficiali): file icons-pro.js, generato fuori dal repo, chiavi "pro_<id>", 8-20 KB l'una.
   Caricamento PIGRO: icons-pro.js non sta nella pagina; si scarica la prima volta che serve disegnare un
   modello pro (sul palco, nel catalogo, nella ricerca). Finché non è arrivato resta il disegno a codice
   di sempre; quando arriva chiama __onIconsReady e la scena si ridisegna. */
var PRO_ICONE_URL="/icons-pro.js", _proIcoStato=0;   /* 0 da caricare · 1 in arrivo · 2 arrivato · 3 errore (niente tentativi a raffica) */
function proIconeCarica(){
  if(_proIcoStato) return false;
  _proIcoStato=1;
  try{
    var sc=document.createElement("script"); sc.async=true; sc.src=PRO_ICONE_URL;
    sc.onload=function(){ _proIcoStato=2; };
    sc.onerror=function(){ _proIcoStato=3; };
    (document.head||document.documentElement).appendChild(sc);
  }catch(e){ _proIcoStato=3; }
  return true;
}
/* la chiave dell'icona del modello di questo elemento, se l'icona è già arrivata; se no la chiede e dà null */
function proIconaDi(it){
  var m=(it && it.pro) ? proModelOf(it) : null; if(!m) return null;   /* solo gli elementi posati dal catalogo pro (pro:1): i progetti vecchi con lo stesso hw restano come erano */
  var k="pro_"+it.hw;
  if(typeof LIB_ICONS==="object" && LIB_ICONS && LIB_ICONS[k] && LIB_ICONS[k].vb && typeof LIB_ICONS[k].body==="string") return k;
  proIconeCarica();
  return null;
}
function proIconaDraw(it, k){ var L=LIB_ICONS[k]; return drawLibFit(k, it, L.vb[2], L.vb[3]); }
/* prese patchate sopra l'icona della stage box (come sbDraw): anello teal sugli ingressi usati, ciano sulle
   uscite, nella posizione misurata della presa (mappa "porte" dell'icona, in cm dall'angolo in alto a sinistra) */
function proPorteDraw(it, L, use){
  var P=L.porte; if(!P) return "";
  var bw=L.vb[2], bd=L.vb[3], kk=Math.min((it.w||bw)/bw, (it.d||bd)/bd), r=(P.r||1.1)*kk;
  var r2=function(v){ return Math.round(v*100)/100; }, s="";
  [["in","i","#14b8a6"],["out","o","#22d3ee"]].forEach(function(q){
    var pos=P[q[0]]||[];
    Object.keys(use[q[1]]||{}).forEach(function(ch){ var p=pos[(+ch)-1]; if(!p) return;
      s+='<circle cx="'+r2((p[0]-bw/2)*kk)+'" cy="'+r2((p[1]-bd/2)*kk)+'" r="'+r2(r*1.05)+'" fill="none" stroke="'+q[2]+'" stroke-width="'+r2(Math.max(0.35, r*0.32))+'"/>'; });
  });
  return s;
}
/* stage box e sub stage box: l'icona vera; con i cavi accesi, le prese usate sopra. Se l'icona non ha la mappa
   delle prese e ci sono prese usate, resta sbDraw: l'informazione dei cavi non si perde mai. */
(function(){
  ["stagebox","substg"].forEach(function(tp){
    var t=TYPES[tp]; if(!t || t._proIco) return;
    var base=t.draw; t._proIco=true;
    t.draw=function(it){
      var k=proIconaDi(it); if(!k) return base(it);
      var L=LIB_ICONS[k], use=(typeof sbPortUse==="function") ? sbPortUse(it) : {i:{},o:{}};
      var usate=Object.keys(use.i||{}).length+Object.keys(use.o||{}).length;
      if(usate && !L.porte) return base(it);
      return proIconaDraw(it, k)+proPorteDraw(it, L, use);
    };
  });
})();
/* modelli che hanno già un tipo con la sua illustrazione (CS-R5, SQ-7, dLive S5000, Quantum 338, HD96…): l'icona
   nuova vale solo per l'elemento posato dal catalogo pro (hw del modello); i progetti vecchi senza hw non cambiano */
(function(){
  Object.keys(PRO_DB).forEach(function(id){
    var tp=PRO_DB[id].tipo, t=tp && TYPES[tp]; if(!t || t._proIco) return;
    var base=t.draw; t._proIco=true;
    t.draw=function(it){ var k=(it && it.hw) ? proIconaDi(it) : null; return k ? proIconaDraw(it, k) : base(it); };
  });
})();
/* scheda tecnica in una riga (pannello): misura, peso, consumo, U e fonte */
function proSchedaTesto(m){
  if(!m) return "";
  var p=[]; var dm=proDimsCm(m);
  if(m.mm) p.push(m.mm[0]+"×"+m.mm[1]+(m.mm[2]?"×"+m.mm[2]:"")+" mm");
  if(m.kg!=null) p.push(String(m.kg).replace(".",",")+" kg");
  if(m.W!=null) p.push(m.W+" W");
  if(m.rackU) p.push(m.rackU+"U rack");
  return p.join(" · ")+(m.src ? " — "+m.src : "");
}
