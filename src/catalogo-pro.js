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
  "x32":{"kind":"console","brand":"Behringer","model":"X32","famiglia":"X32","mm":[900.0,528.0,200.0],"kg":20.6,"W":120,"in":32,"out":16,"proto":["aes50"],"src":"Behringer X32 QuickStartGuide, p.25","look":{"f":[16,8,1],"s":1}},
  "p10t":{"kind":"iem","brand":"Shure","model":"P10T (PSM1000)","famiglia":"PSM1000","mm":[483.0,343.0,44.0],"kg":4.7,"rackU":1,"proto":[],"src":"Shure PSM1000 UserGuide, p.24/7/28/29/9","Wunit":"A","ch":2,"rfW":[10,50,100],"bande":[["G10",470,542],["G10E",470,542],["G10J",470,542],["G11",479,542],["G62",510,530],["H8Z",518,582],["H22",518,584],["J8",554,626],["J8A",554,608,614,616],["J8E",554,626],["J8J",554,626],["K10E",596,668],["L8",626,698],["L8A",653,657,657,663],["L8E",626,698],["L8J",626,698],["L9E",670,742],["L11J",670,714],["M19",694,703],["P8",710,790],["Q12",748,758],["Q21",710,787],["Q22E",750,822],["R27",794,806],["X1",944,952],["X7",925,937.5],["X55",941,960]]},
  "p9t":{"kind":"iem","brand":"Shure","model":"P9T (PSM900)","famiglia":"PSM900","mm":[197.0,177.0,42.0],"kg":0.85,"proto":[],"src":"Shure PSM900 UserGuide, p.22/6/25/8","Wunit":"mA","ch":1,"rfW":[10,50,100],"bande":[["G6",470,506],["G6E",470,506],["G6J",470,506],["G14",506,542],["G14J",506,542],["G62",510,530],["G7",506,542],["G7E",506,542],["G7Z",518,542],["H21",542,578],["K1",596,632],["K1E",596,632],["K1J",596,632],["L6",656,692],["L6E",656,692],["L6J",656,692],["P7",702,742],["Q12",748,758],["Q15",750,790],["R21",794,806],["X7",925,937.5],["X1",944,952],["X55",941,960]],"mezzoRack":1},
  "p3t":{"kind":"iem","brand":"Shure","model":"P3T (PSM300)","famiglia":"PSM300","mm":[198.0,172.0,43.0],"kg":0.783,"proto":[],"src":"Shure PSM300 UserGuide, p.25/5/14/27/7","Wunit":"mA","ch":1,"rfW":[10,20,30],"bande":[["G20",488,512],["H8E",518,542],["H20",518,542],["H62",518,530],["J10",584,608],["J13",566,590],["JB",806,810],["K3E",606,630],["K12",614,638],["L18",630,654],["L19",630,654],["M16",686,710],["M18",686,710],["Q12",748,758],["Q25",742,766],["R12",794,806],["S8",823,832],["T11",863,865],["X7",925,937.5]],"mezzoRack":1},
  "srg4":{"kind":"iem","brand":"Sennheiser","model":"SR IEM G4 (ew IEM G4)","famiglia":"","mm":[202.0,212.0,43.0],"kg":0.98,"proto":[],"src":"Sennheiser ewIEM-G4 InstructionManual, p.113/112/15/58","Wunit":"mA","ch":1,"rfW":[10,30,50],"bande":[["A1",470,516],["A",516,558],["AS",520,558],["G",566,608],["GB",606,648],["B",626,668],["C",734,776],["C-TH",748.2,757.8],["D",780,822],["E",823,865]],"mezzoRack":1,"verifica":1},
  "sr2050":{"kind":"iem","brand":"Sennheiser","model":"SR 2050 IEM","famiglia":"","mm":[483.0,217.0,43.0],"kg":2.7,"rackU":1,"proto":[],"src":"Sennheiser SR2000IEM Manual, p.27/7/8","Wunit":"A","ch":2,"rfW":[10,30,50],"bande":[["",516,558],["",558,626],["",626,698],["",718,790],["",790,865],["",606,678]]},
  "mtk952":{"kind":"iem","brand":"Wisycom","model":"MTK952","famiglia":"","mm":[483.0,407.0,43.8],"kg":3.8,"rackU":1,"proto":[],"src":"Wisycom MTK952 Datasheet, p.3/1","ch":2,"rfW":[10,20,50,100,200],"bande":[["",470,800]]},
  "pa821b":{"kind":"rfdist","brand":"Shure","model":"PA821B","famiglia":"","mm":[401.0,365.0,43.0],"kg":4.8,"W":143,"rackU":1,"proto":[],"src":"Shure PA821B UserGuide, p.10/11/5 + Shure PA821B Datasheet, p.1","ch":8,"ruolo":"combiner","bande":[["PA821B",470,865],["PA821BX",865,960]]},
  "ac3200ii":{"kind":"rfdist","brand":"Sennheiser","model":"AC 3200-II","famiglia":"","mm":[436.0,215.0,44.0],"kg":4,"W":90,"rackU":1,"proto":[],"src":"Sennheiser AC3200-II Manual, p.15/7","ch":8,"ruolo":"combiner","bande":[["",500,870]],"verifica":1},
  "ac41":{"kind":"rfdist","brand":"Sennheiser","model":"AC 41 (ew IEM G4)","famiglia":"","mm":[212.0,168.0,43.0],"kg":1.47,"proto":[],"src":"Sennheiser ewIEM-G4 InstructionManual, p.114/100","Wunit":"A","ch":4,"ruolo":"combiner","bande":[["AC",470,870],["AC",470,609]],"mezzoRack":1,"verifica":1},
  "csi16t2":{"kind":"rfdist","brand":"Wisycom","model":"CSI16T2","famiglia":"","mm":[483.0,349.0,43.8],"kg":3.2,"rackU":1,"proto":[],"src":"Wisycom CSI16T2 Datasheet, p.1","Wunit":"A","ch":16,"ruolo":"combiner","bande":[["",400,1300]]},
  "axt630":{"kind":"rfdist","brand":"Shure","model":"AXT630","famiglia":"Axient Digital","mm":[483.0,366.0,44.0],"kg":4.6,"rackU":1,"proto":[],"src":"Shure AXT630 SystemGuide, p.6/1/7","Wunit":"A","ch":4,"ruolo":"splitter","bande":[["AXT630",470,698],["AXT631",606,814],["AXT632",470,787],["",470,698,470,530,518,578,578,638,638,698]]},
  "ua845uwb":{"kind":"rfdist","brand":"Shure","model":"UA845UWB","famiglia":"","mm":[482.6,295.3,44.5],"kg":3.32,"W":14.1,"rackU":1,"proto":[],"src":"Shure UA845UWB UserGuide, p.11/4/10","ch":4,"ruolo":"splitter","bande":[["Band",174,216],["Band",470,960],["Band",1240,1260],["Band",1492,1525],["Band",1785,1805]]},
  "asa1":{"kind":"rfdist","brand":"Sennheiser","model":"ASA 1","famiglia":"","mm":[212.0,168.0,43.0],"kg":1.09,"proto":[],"src":"Sennheiser ASA1 Manual, p.23/6/8","Wunit":"mA","ch":8,"ruolo":"splitter","bande":[["ASA",470,870],["ASA",1,1,1785,1805]],"mezzoRack":1,"verifica":1},
  "asa214":{"kind":"rfdist","brand":"Sennheiser","model":"ASA 214","famiglia":"","mm":[212.0,168.0,43.0],"kg":1.09,"proto":[],"src":"Sennheiser ASA214 Spec, p.2/1","Wunit":"mA","ch":8,"ruolo":"splitter","bande":[["ASA",214,1,1785,1800]],"mezzoRack":1,"verifica":1},
  "ewdasa":{"kind":"rfdist","brand":"Sennheiser","model":"EW-D ASA","famiglia":"EW-D","mm":[212.1,168.0,43.0],"kg":1.1,"proto":[],"src":"Sennheiser EW-D-ASA Spec, p.2/3","Wunit":"mA","ch":8,"ruolo":"splitter","bande":[["",470,694],["",470,694],["",694,1075],["",1240,1260],["",1350,1805]],"mezzoRack":1,"verifica":1},
  "ua874":{"kind":"ant","brand":"Shure","model":"UA874","famiglia":"","mm":[359.0,36.0,316.0],"kg":0.317,"proto":[],"src":"Shure UA874 UserGuide, p.3/1","Wunit":"mA","ant":{"tipo":"direttiva","gain":"7.5 dBi","ang":70,"range":"470–900 MHz (UA874WB; altre varianti in band)","attiva":true},"bande":[["UA874US",470,698],["UA874E",470,790],["UA874WB",470,900],["UA874Z16",1240,1260],["UA874Z17",1492,1525],["UA874Z18",1785,1805],["UA874X",925,952],["UA874XA",902,960]],"verifica":1},
  "pa805z2rsma":{"kind":"ant","brand":"Shure","model":"PA805Z2-RSMA","famiglia":"","mm":[164.0,27.5,105.0],"kg":0.071,"proto":[],"src":"Shure PA805Z2-RSMA UserGuide, p.3/1/4","ant":{"tipo":"direttiva","gain":"8 dBi","ang":100,"range":"2050–2700 MHz","attiva":false},"bande":[["",2050,2700]]},
  "pa805swb":{"kind":"ant","brand":"Shure","model":"PA805SWB","famiglia":"","mm":[378.0,27.0,334.0],"kg":0.319,"proto":[],"src":"Shure PA805Z UserGuide, p.2/1","ant":{"tipo":"direttiva","gain":"6.5 dBi","ang":100,"range":"470–952 MHz","attiva":false},"bande":[["PA805SWB",470,952]]},
  "ua860swb":{"kind":"ant","brand":"Shure","model":"UA860SWB","famiglia":"","mm":[39.0,39.0,284.0],"kg":0.275,"proto":[],"src":"Shure UA860SWB UserGuide, p.1","ant":{"tipo":"omni","range":"470–1100 MHz","attiva":false},"bande":[["",470,1100]]},
  "ad3700":{"kind":"ant","brand":"Sennheiser","model":"AD 3700","famiglia":"","mm":[329.0,23.0,322.0],"kg":0.625,"proto":[],"src":"Sennheiser AD3700 Manual, p.2","Wunit":"mA","ant":{"tipo":"direttiva","gain":"approx. 3 dB","ang":100,"range":"470–866 MHz","attiva":true},"bande":[["",470,866]],"verifica":1},
  "a5000cp":{"kind":"ant","brand":"Sennheiser","model":"A 5000-CP","famiglia":"","mm":[356.0,140.0,356.0],"kg":1.41,"proto":[],"src":"Sennheiser A5000-CP Manual, p.2","ant":{"tipo":"elicoidale","gain":"min 8 dBi (@650 MHz)","ang":80,"range":"450–970 MHz","attiva":false},"bande":[["",450,970]]},
  "gc10i":{"kind":"rete","brand":"Luminex","model":"GigaCore 10i","famiglia":"GigaCore","mm":[220.0,296.4,43.2],"kg":2.2,"W":350,"proto":["dante","avb"],"src":"Luminex GigaCore10i SpecSheet, p.5/7/6/2","ports":{"rj45":8,"sfp":2,"poe":8},"mezzoRack":1},
  "gc16i":{"kind":"rete","brand":"Luminex","model":"GigaCore 16i","famiglia":"GigaCore","mm":[220.0,296.4,43.2],"W":700,"proto":["dante","avb"],"src":"Luminex GigaCore16i SpecSheet, p.5/7/6/2","ports":{"rj45":12,"sfp":4,"poe":12},"mezzoRack":1},
  "gc26i":{"kind":"rete","brand":"Luminex","model":"GigaCore 26i","famiglia":"GigaCore","mm":[482.0,270.3,44.0],"kg":4.0,"W":400,"rackU":1,"proto":["dante","avb"],"src":"Luminex GigaCore26i UserManual, p.28/7/5/21/10","ports":{"rj45":24,"sfp":6}},
  "gc30i":{"kind":"rete","brand":"Luminex","model":"GigaCore 30i","famiglia":"GigaCore","mm":[482.0,283.1,43.2],"kg":3.92,"W":1050,"rackU":1,"proto":["dante"],"src":"Luminex GigaCore30i 1G SpecSheet, p.4/6/2/5","ports":{"rj45":24,"sfp":6,"poe":24}},
  "swp18":{"kind":"rete","brand":"Yamaha","model":"SWP1-8","famiglia":"SWP","mm":[480.0,362.0,44.0],"kg":4.2,"W":11,"rackU":1,"proto":["dante"],"src":"Yamaha SWP1 OwnersManual, p.17/9","ports":{"rj45":8,"sfp":2}},
  "swp18mmf":{"kind":"rete","brand":"Yamaha","model":"SWP1-8MMF","famiglia":"SWP","mm":[480.0,362.0,44.0],"kg":4.2,"W":11,"rackU":1,"proto":["dante"],"src":"Yamaha SWP1 OwnersManual, p.17/9","ports":{"rj45":8,"sfp":2,"fibra":1}},
  "swp116mmf":{"kind":"rete","brand":"Yamaha","model":"SWP1-16MMF","famiglia":"SWP","mm":[480.0,362.0,44.0],"kg":4.6,"W":16,"rackU":1,"proto":["dante"],"src":"Yamaha SWP1 OwnersManual, p.17/9","ports":{"rj45":16,"sfp":2,"fibra":1}},
  "swp210mmf":{"kind":"rete","brand":"Yamaha","model":"SWP2-10MMF","famiglia":"SWP","mm":[480.0,362.0,44.0],"kg":4.5,"W":21,"rackU":1,"proto":["dante"],"src":"Yamaha SWP2 OwnersManual zh, p.17/9","ports":{"rj45":10,"sfp":2,"fibra":2}},
  "swr2311p":{"kind":"rete","brand":"Yamaha","model":"SWR2311P-10G","famiglia":"SWR","mm":[220.0,294.0,42.4],"kg":2.3,"W":280,"proto":["dante"],"src":"Yamaha SWR2311P-10G OwnersManual, p.36/10","ports":{"rj45":10,"sfp":2,"poe":8},"mezzoRack":1},
  "m425010g2f":{"kind":"rete","brand":"Netgear","model":"M4250-10G2F-PoE+ (GSM4212P)","famiglia":"M4250","mm":[440.0,200.0,43.2],"kg":2.85,"W":163.9,"rackU":1,"proto":["avb","dante"],"src":"Netgear M4250 Datasheet, p.19/59/58/9/12","ports":{"rj45":10,"sfp":2,"poe":8}},
  "m425026g4f":{"kind":"rete","brand":"Netgear","model":"M4250-26G4F-PoE+ (GSM4230P)","famiglia":"M4250","mm":[440.0,257.0,43.2],"kg":4.3,"W":401,"rackU":1,"proto":["avb","dante"],"src":"Netgear M4250 Datasheet, p.24/58/59/9/12","ports":{"rj45":26,"sfp":4,"poe":24}},
  "dd4mr":{"kind":"fibra","brand":"Optocore","model":"DD4MR-FX","famiglia":"Optocore","mm":[483.0,200.0,44.0],"kg":2.7,"rackU":1,"proto":["optocore","madi"],"src":"Optocore DD4MR-FX Datasheet, p.6/4/2","Wunit":"VA","ports":{"rj45":4,"fibra":2}},
  "dd32r":{"kind":"fibra","brand":"Optocore","model":"DD32R-FX","famiglia":"Optocore","mm":[483.0,200.0,44.0],"kg":2.7,"W":12,"rackU":1,"proto":["optocore"],"src":"Optocore DD32R-FX Datasheet, p.4/3","ports":{"rj45":4,"sfp":2,"fibra":2}},
  "x6rfx":{"kind":"fibra","brand":"Optocore","model":"X6R-FX","famiglia":"Optocore","mm":[483.0,200.0,44.0],"kg":2.7,"W":12,"rackU":1,"proto":["optocore"],"src":"Optocore X6R-FX Datasheet, p.6/5","ports":{"rj45":4,"sfp":2,"fibra":2}},
  "ad4d":{"kind":"rx","brand":"Shure","model":"AD4D","famiglia":"Axient Digital","mm":[483.0,333.0,44.0],"kg":4.6,"W":23,"rackU":1,"proto":[],"src":"Shure AD4D UserGuide, p.45/1/46/5/6","ch":2,"bande":[["A",470,636],["B",606,810],["C",750,960]]},
  "ad4q":{"kind":"rx","brand":"Shure","model":"AD4Q","famiglia":"Axient Digital","mm":[483.0,333.0,44.0],"kg":4.8,"W":31,"rackU":1,"proto":[],"src":"Shure AD4Q UserGuide, p.44/45/4/46/5","ch":4,"bande":[["A",470,636],["B",606,810],["C",750,960]]},
  "ulxd4":{"kind":"rx","brand":"Shure","model":"ULXD4","famiglia":"ULX-D","mm":[197.0,171.0,42.0],"kg":0.913,"proto":[],"src":"Shure ULXD4 UserGuide, p.47/49/44/48/40/1","Wunit":"A","ch":1,"bande":[["G50",470,534],["G51",470,534],["G52",479,534],["G53",470,510],["G62",510,530],["H50",534,598],["H51",534,598],["H52",534,565],["J50",572,636],["J51",572,636],["K51",606,670],["L50",632,696],["L51",632,696],["L53",632,714],["M19",694,703],["P51",710,782],["R51",800,810],["Q12",748,758],["Q51",794,806],["V50",174,216],["V51",174,216],["V52",174,210],["X50",925,932],["X51",925,937.5],["X52",902,928],["X53",902,907.5,915,928],["X54",915,928],["Z16",1240,1260],["Z17",1492,1525],["Z18",1785,1805],["Z19",1785,1800],["Z20",1790,1805]],"mezzoRack":1},
  "ulxd4d":{"kind":"rx","brand":"Shure","model":"ULXD4D","famiglia":"ULX-D","mm":[482.0,274.0,44.0],"kg":3.36,"rackU":1,"proto":[],"src":"Shure ULXD4D-ULXD4Q UserGuide, p.63/4/68/64","Wunit":"A","ch":2,"bande":[["G50",470,534],["G51",470,534],["G52",479,534],["G53",470,510],["G54",479,565],["G55",470,608,614,636],["G56",470,636],["G57",470,608],["G62",510,530],["G65",470,606],["G66",487,606],["H50",534,598],["H51",534,598],["H52",534,565],["H54",520,636],["J50",572,636],["J50A",572,608],["J51",572,636],["K51",606,670],["L50",632,696],["L51",632,696],["L53",632,714],["M19",694,703],["P51",710,782],["R51",800,810],["AB",770,810],["Q12",748,758],["Q51",794,806],["V50",174,216],["V51",174,216],["V52",174,210],["X50",925,932],["X51",925,937.5],["X52",902,928],["X53",902,907.5,915,928],["X54",915,928],["Z16",1240,1260],["Z17",1492,1525],["Z18",1785,1805],["Z19",1785,1800],["Z20",1790,1805]]},
  "ulxd4q":{"kind":"rx","brand":"Shure","model":"ULXD4Q","famiglia":"ULX-D","mm":[482.0,274.0,44.0],"kg":3.45,"rackU":1,"proto":[],"src":"Shure ULXD4D-ULXD4Q UserGuide, p.63/5/68/64","Wunit":"A","ch":4,"bande":[["G50",470,534],["G51",470,534],["G52",479,534],["G53",470,510],["G54",479,565],["G55",470,608,614,636],["G56",470,636],["G57",470,608],["G62",510,530],["G65",470,606],["G66",487,606],["H50",534,598],["H51",534,598],["H52",534,565],["H54",520,636],["J50",572,636],["J50A",572,608],["J51",572,636],["K51",606,670],["L50",632,696],["L51",632,696],["L53",632,714],["M19",694,703],["P51",710,782],["R51",800,810],["AB",770,810],["Q12",748,758],["Q51",794,806],["V50",174,216],["V51",174,216],["V52",174,210],["X50",925,932],["X51",925,937.5],["X52",902,928],["X53",902,907.5,915,928],["X54",915,928],["Z16",1240,1260],["Z17",1492,1525],["Z18",1785,1805],["Z19",1785,1800],["Z20",1790,1805]]},
  "slxd4":{"kind":"rx","brand":"Shure","model":"SLXD4","famiglia":"SLX-D","mm":[197.0,152.0,42.0],"kg":0.816,"proto":[],"src":"Shure SLX-D UserGuide, p.43/44/4/53/7/45/5","Wunit":"A","ch":1,"bande":[["G58",470,514],["G59",470,514],["G60",470,510],["G61",479,523],["G62",510,530],["H55",514,558],["H56",518,562],["H57",520,564],["J52",558,602],["J53",562,606],["J54",562,606],["JB",806,810],["K59",606,650],["L55",646,690],["L56",650,694],["L57",650,694],["L58",630,674],["L59",654,698],["M55",694,703,748,758],["S50",823,865],["X51",925,937.5]],"mezzoRack":1},
  "slxd4d":{"kind":"rx","brand":"Shure","model":"SLXD4D","famiglia":"SLX-D","mm":[393.0,152.0,42.0],"kg":1.451,"rackU":1,"proto":[],"src":"Shure SLX-D UserGuide, p.43/44/4/53/45","Wunit":"A","ch":2,"bande":[["G58",470,514],["G59",470,514],["G60",470,510],["G61",479,523],["G62",510,530],["H55",514,558],["H56",518,562],["H57",520,564],["J52",558,602],["J53",562,606],["J54",562,606],["JB",806,810],["K59",606,650],["L55",646,690],["L56",650,694],["L57",650,694],["L58",630,674],["L59",654,698],["M55",694,703,748,758],["S50",823,865],["X51",925,937.5]],"verifica":1},
  "qlxd4":{"kind":"rx","brand":"Shure","model":"QLXD4","famiglia":"QLX-D","mm":[197.0,151.0,41.0],"kg":0.777,"proto":[],"src":"Shure QLX-D UserGuide, p.47/2/51/48/5","Wunit":"A","ch":1,"bande":[["G50",470,534],["G51",470,534],["G52",479,534],["G53",470,510],["G62",510,530],["H50",534,598],["H51",534,598],["H52",534,565],["H53",534,598],["J50",572,636],["J51",572,636],["JB",806,810],["K51",606,670],["K52",606,670],["L50",632,696],["L51",632,696],["L52",632,694],["L53",632,714],["M19",694,703],["P51",710,782],["P52",710,782],["Q12",748,758],["Q51",794,806],["S50",823,832,863,865],["V50",174,216],["V51",174,216],["V52",174,210],["X51",925,937.5],["X52",902,928],["X53",902,907.5,915,928],["X54",915,928],["Z17",1492,1525],["Z18",1785,1805],["Z19",1785,1800],["Z20",1790,1805]],"mezzoRack":1},
  "em6000":{"kind":"rx","brand":"Sennheiser","model":"EM 6000","famiglia":"Digital 6000","mm":[483.0,373.0,44.0],"kg":5.2,"W":35,"rackU":1,"proto":[],"src":"Sennheiser Digital6000 Manual, p.250/249/247/57","ch":2,"bande":[["",470,714]]},
  "em100g4":{"kind":"rx","brand":"Sennheiser","model":"EM 100 G4 (ew 100 G4)","famiglia":"ew G4","mm":[212.0,190.0,43.0],"kg":0.98,"proto":[],"src":"Sennheiser ew100G4 Manual, p.134/133/27","Wunit":"A","ch":1,"bande":[["A1",470,516],["A",516,558],["AS",520,558],["G",566,608],["GB",606,648],["B",626,668],["C",734,776],["D",780,822],["TH",794,806],["E",823,865],["JB",806,810],["K+",925,937.5],["1G8",1785,1800]],"mezzoRack":1,"verifica":1},
  "ewdxem2":{"kind":"rx","brand":"Sennheiser","model":"EW-DX EM 2","famiglia":"EW-DX","mm":[212.0,189.0,44.0],"kg":1.0,"W":12,"proto":[],"src":"Sennheiser EW-DX EM2 ProductSpecification v1.5, p.1 + Sennheiser EW-DX EM2 SystemDrawings, p.1","ch":2,"bande":[["Q1-9",470.2,550],["R1-9",520,607.8],["S1-10",606.2,693.8],["S2-10",614.2,693.8],["S4-10",630,693.8],["U1/5",823.2,831.8,863.2,864.8],["V3-4",925.2,937.3],["V5-7",941.7,951.8,953.05,956.05,956.65,959.65],["W5-6",1240.1,1251.875,1253.125,1259.9],["Y1-3",1785.2,1799.8]],"mezzoRack":1},
  "ewdxem4dante":{"kind":"rx","brand":"Sennheiser","model":"EW-DX EM 4 Dante","famiglia":"EW-DX","mm":[483.0,373.0,44.0],"kg":4.56,"W":37,"rackU":1,"proto":[],"src":"Sennheiser EW-DX EM4Dante ProductSpecification v1.2, p.1 + Sennheiser EW-DX EM4Dante SystemDrawings, p.1","ch":4,"bande":[["Q1-9",470.2,550],["R1-9",520,607.8],["S1-10",606.2,693.8],["S2-10",614.2,693.8],["S4-10",630,693.8],["U1/5",823.2,831.8,863.2,864.8],["V3-4",925.2,937.3],["V5-7",941.7,951.8,953.05,956.05,956.65,959.65],["W5-6",1240.1,1251.875,1253.125,1259.9],["Y1-3",1785.2,1799.8]]},
  "ewdem":{"kind":"rx","brand":"Sennheiser","model":"EW-D EM","famiglia":"EW-D","mm":[212.0,189.0,44.0],"kg":1.0,"proto":[],"src":"Sennheiser EW-D EM ProductSpecification v1.4, p.1/4","Wunit":"A","ch":1,"bande":[["Q1-6",470.2,526],["R1-6",520,576],["R4-9",552,607.8],["S1-7",606.2,662],["S4-7",630,662],["S7-10",662,693.8],["T1/7",694.5,702.7,748.3,757.7],["T12",806.125,809.75],["T13-14",819.2,823],["U1/5",823.2,831.8,863.2,864.8],["V3-4",925.2,937.3],["Y1-3",1785.2,1799.8]],"mezzoRack":1,"verifica":1},
  "mrk960":{"kind":"rx","brand":"Wisycom","model":"MRK960","famiglia":"MRK","mm":[482.6,370.0,44.5],"rackU":1,"proto":[],"src":"Wisycom MRK960 UserManual, p.24/20/21 + Wisycom MRK960 Brochure, p.1/2","Wunit":"VA","ch":2},
  "klotz_st0800":{"kind":"subsnake","brand":"Klotz","model":"StraightLink 8x XLR 3p F - RMP 25p M (ST0800M)","famiglia":"Klotz","mm":[306.5,75.0,68.0],"in":8,"out":0,"proto":[],"src":"Klotz st0800m-1 pagina.html, p.1","connettore":"RMP 25p M (round multipin)"},
  "klotz_st0804":{"kind":"subsnake","brand":"Klotz","model":"StraightLink 8/4 XLR 3p - RMP 37p M (ST0804M)","famiglia":"Klotz","mm":[418.5,75.0,68.0],"in":8,"out":4,"proto":[],"src":"Klotz st0804m-1 pagina.html, p.1","connettore":"RMP 37p M (round multipin)"},
  "klotz_st1200":{"kind":"subsnake","brand":"Klotz","model":"StraightLink 12/0 XLR 3p - RMP 37p M (ST1200M)","famiglia":"Klotz","mm":[418.5,75.0,68.0],"in":12,"out":0,"proto":[],"src":"Klotz st1200m-1 pagina.html, p.1","connettore":"RMP 37p M (round multipin)"},
  "klotz_st1204":{"kind":"subsnake","brand":"Klotz","model":"StraightLink 12/4 XLR 3p - RMP 54p M (ST1204M)","famiglia":"Klotz","mm":[532.5,75.0,78.0],"in":12,"out":4,"proto":[],"src":"Klotz st1204m-1 pagina.html, p.1","connettore":"RMP 54p M (round multipin)"},
  "klotz_st1600":{"kind":"subsnake","brand":"Klotz","model":"StraightLink 16/0 XLR 3p - RMP 54p M (ST1600M)","famiglia":"Klotz","mm":[532.5,75.0,78.0],"in":16,"out":0,"proto":[],"src":"Klotz st1600m-1 pagina.html, p.1","connettore":"RMP 54p M (round multipin)"},
  "klotz_tl1608":{"kind":"subsnake","brand":"Klotz","model":"TrueLink Pro 16/8 XLR 3p - RMP 85p M (T1B1608V-E)","famiglia":"Klotz","mm":[410.0,245.0,100.0],"in":16,"out":8,"proto":[],"src":"Klotz t1b1608v-e-1 pagina.html, p.1","connettore":"RMP 85p M (round multipin)"},
  "klotz_ks1212":{"kind":"subsnake","brand":"Klotz","model":"K-Sub 12x XLR 3p F||M - RMP 37p M (KS1212ME)","famiglia":"Klotz","mm":[457.0,112.0,68.0],"in":12,"out":12,"proto":[],"src":"Klotz ks1212me-1 pagina.html, p.1","connettore":"RMP 37p M (round multipin)"},
  "sssnake_mts164sb":{"kind":"subsnake","brand":"the sssnake","model":"MTS 164 - SB","famiglia":"the sssnake","mm":[253.0,139.0,56.0],"in":16,"out":4,"proto":[],"src":"Thomann sssnake mts 164 sb pagina.html, p.1","connettore":"Multipin a 72 poli (tipo non specificato)","verifica":1}
};
/* </dati> */

AUDIO_PROTO.twinlane = AUDIO_PROTO.twinlane || "TWINLANe";
AUDIO_PROTO.hypermac = AUDIO_PROTO.hypermac || "HyperMAC";
AUDIO_PROTO.slink = AUDIO_PROTO.slink || "SLink";

/* misura in pianta (cm) = fronte × profondità della scheda, al millimetro (17/11/2026, Simone: «le dimensioni
   reali devono essere perfette»): prima era arrotondata al centimetro (fino a 5 mm di scarto, Rio 36,75 → 37). */
function proDimsCm(m){ if(!m || !m.mm) return null; var w=Math.round(+m.mm[0]*10)/100, d=Math.round(+m.mm[1]*10)/100;   /* al decimo di mm, come la scheda (17/11, lotto 2: GigaCore 296,4 mm) */
  return (w>0 && d>0) ? {w:w, d:d} : null; }
function proCmTesto(v){ return String(Math.round(v*10)/10).replace(".", ","); }
function proNome(m){ return m ? (m.brand+" "+m.model) : ""; }
/* il modello di un elemento, solo se è del tipo giusto (una stage box non può avere l'id di una console) */
function proModelOf(it){
  if(!it || !it.hw || !Object.prototype.hasOwnProperty.call(PRO_DB, it.hw)) return null;
  var m=PRO_DB[it.hw];
  if(m.kind==="stagebox") return (it.type==="stagebox" || it.type==="substg") ? m : null;
  if(m.kind==="console") return (it.type==="mixer" || it.type===m.tipo) ? m : null;
  return (it.type===proTipoDi(m)) ? m : null;   /* lotto 2: ogni kind ha il suo tipo (un ricevitore non può avere l'id di uno switch) */
}
/* LOTTO 2 (17/11/2026): rete, fibra, radio, in-ear, antenne, sub-snake analogici. Ogni modello entra nel tipo che il
   motore ha già (switch, rack TX in-ear, ricevitore, splitter, antenna, sub-stagebox) o in due tipi nuovi solo da
   catalogo (nodo fibra, combiner): niente strada nuova, i motori di rete e RF li leggono come sempre. */
var PRO_KIND_TIPO={ stagebox:"stagebox", rete:"netswitch", fibra:"nodofibra", iem:"iemant", rx:"rxrf", ant:"rfant", subsnake:"substg" };
function proTipoDi(m){
  if(!m) return null;
  if(m.kind==="console") return (m.tipo && TYPES[m.tipo]) ? m.tipo : "mixer";
  if(m.kind==="rfdist") return m.ruolo==="combiner" ? "rfcomb" : "rfsplit";
  return PRO_KIND_TIPO[m.kind]||null;
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
  if(m.kind==="subsnake"){ o.ch=m.in||8; o.outCh=m.out||0; }   /* sub-snake analogico: i canali del box vero (cabBoxCap/cabBoxCapOut li leggono da qui) */
  if(m.kind==="rete"){ var np=proPorte(m); if(np) o.swPorts=Math.max(4, Math.min(48, np)); }   /* porte dello switch per il conto della rete */
  return o;
}
function proTipo(id){ return proTipoDi(PRO_DB[id]); }
function proPorte(m){ var P=m && m.ports; if(!P) return 0; return (+P.rj45||0)+(+P.sfp||0); }
var PRO_ANT_TIPO={ direttiva:"direttiva", omni:"omnidirezionale", elicoidale:"elicoidale" };
/* la riga corta che descrive il modello nella ricerca e nelle liste (canali, porte, antenna…) */
function proRuoloTesto(m){
  if(!m) return "";
  switch(m.kind){
    case "rx": return m.ch ? m.ch+(m.ch===1?" canale":" canali") : "";
    case "iem": return m.ch ? (m.ch===1 ? "1 trasmettitore" : m.ch+" trasmettitori") : "";
    case "rfdist": return m.ruolo==="combiner" ? (m.ch ? m.ch+" ingressi TX" : "combiner") : (m.ch ? "1→"+m.ch+" ricevitori" : "splitter");
    case "ant": var a=m.ant||{}; return [PRO_ANT_TIPO[a.tipo]||"antenna", a.attiva===true?"attiva":"", a.gain||""].filter(Boolean).join(" ");
    case "rete": case "fibra": var P=m.ports||{}, q=[];
      if(P.rj45) q.push(P.rj45+" RJ45"); if(P.sfp) q.push(P.sfp+" SFP"); if(P.fibra) q.push(P.fibra+" fibra"); if(P.poe) q.push(P.poe+" PoE");
      return q.join(" · ");
    case "subsnake": return (m.in||0)+" in / "+(m.out||0)+" out"+(m.connettore ? " · "+m.connettore : "");
  }
  return "";
}
function proDimTesto(m){
  var p=[], rt=(m.kind==="console"||m.kind==="stagebox") ? "" : proRuoloTesto(m);
  if(rt) p.push(rt);
  else if(m.in!=null || m.out!=null) p.push((m.in||0)+" in / "+(m.out||0)+" out");
  var dm=proDimsCm(m); if(dm) p.push(proCmTesto(dm.w)+"×"+proCmTesto(dm.d)+" cm");
  if(m.rackU) p.push(m.rackU+"U");
  return p.join(" · ");
}
/* voci per la ricerca e per il gruppo «Modelli»: marca, modello, famiglia, protocollo. Le parole
   generiche (stage box, console, mixer, rack, dante…) restano alle voci di sempre (qaCede): chi scrive
   «stage box» trova prima «Stage box 8/16/24», chi scrive «rio» o «x32» trova il modello. */
var PRO_CEDE="stage box|stagebox|stage|box|console|mixer|mixer digitale|rack|stage rack|dante|digitale|yamaha|allen|midas|behringer|digico|avid|live|dlive";   /* lotto 2: «switch», «antenna», «ricevitore», «in ear» restano già alle voci generiche (nome del tipo): niente da cedere */
/* parole con cui si cerca ogni famiglia di modelli (oltre a marca, modello, famiglia e protocollo) */
var PRO_KW={
  stagebox:"stage box stagebox stage rack rack i/o preamplificatori remoti",
  console:"console mixer digitale banco regia foh monitor",
  rete:"switch rete network ethernet dante avb aes67 poe gigabit lan",
  fibra:"fibra fibra ottica optocore convertitore fiber nodo rete ottica",
  iem:"in ear in-ear inear iem trasmettitore tx monitor personal monitor rack",
  rx:"ricevitore radiomicrofono radiomicrofoni radio wireless rx rack",
  combiner:"combiner combinatore antenna trasmettitori",   /* «in ear» e «iem» portano prima ai trasmettitori */
  splitter:"splitter antenna distributore distribuzione antenne ricevitori",
  ant:"antenna antenne direttiva elicoidale omni paddle rf",
  subsnake:"sub-snake subsnake sub snake multicore stage box analogica multipolare fan-out ciabatta"
};   /* «live» e «dlive» restano del dLive S5000 (06/10/2026) */
function proCatEntries(kind){
  return Object.keys(PRO_DB).filter(function(id){ return !kind || PRO_DB[id].kind===kind; }).map(function(id){
    var m=PRO_DB[id], k=proTipo(id);
    var kw=[m.brand, m.model, m.model.replace(/[-\s]/g,""), m.famiglia||"", (m.proto||[]).map(function(p){ return AUDIO_PROTO[p]||p; }).join(" "),
      PRO_KW[m.kind==="rfdist" ? (m.ruolo==="combiner" ? "combiner" : "splitter") : m.kind]||""].join(" ");
    return {k:k, nome:proNome(m), over:proOver(id), dim:proDimTesto(m), kw:kw, qaCede:PRO_CEDE, pro:id};
  }).sort(function(a,b){ return a.nome.localeCompare(b.nome); });
}
/* entra nei registri del motore */
(function(){
  Object.keys(PRO_DB).forEach(function(id){
    var m=PRO_DB[id]; if(m.kind!=="stagebox" && m.kind!=="console") return;   /* lotto 2: rete e radio hanno i loro registri (proRegistraRF) */
    var DB=(m.kind==="stagebox") ? STAGEBOX_DB : MIXER_DB, e=DB[id];
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

/* ══ LOTTO 2 (17/11/2026) — rete, fibra, radio, in-ear, antenne, sub-snake analogici ══════════════════════════════
   Simone (16-17/11): «un catalogo professionale di stage box e mixing desk digitali e tutta l'attrezzatura che compete
   a un palco professionale», «sempre tutto in scala reale». Stesse regole del lotto 1: misura, peso, consumo, U e fonte
   dalla scheda del costruttore, null se la scheda non lo dice. */

/* I ricevitori e le antenne del catalogo entrano nei registri RF che il motore usa già (canali del ricevitore,
   angolo dell'antenna, nomi nella Lista RF). RX_DB e RF_ANT_DB sono definiti più avanti nell'app: questa funzione
   la chiama l'app subito dopo averli definiti. Le chiavi già esistenti (ulxd4d, ewdxem2…) restano le stesse:
   un progetto salvato con hw:"ulxd4d" ritrova il suo ricevitore. */
function proRegistraRF(){
  Object.keys(PRO_DB).forEach(function(id){
    var m=PRO_DB[id];
    if(m.kind==="rx" && typeof RX_DB==="object" && m.ch>=1 && m.ch<=8){
      var e=RX_DB[id]||(RX_DB[id]={brand:m.brand, model:m.model, ch:m.ch});
      e.ch=m.ch; e.mm=m.mm; e.kg=m.kg; e.W=m.W; e.src=m.src; if(m.band) e.band=m.band;
    }
    if(m.kind==="ant" && typeof RF_ANT_DB==="object"){
      var a=m.ant||{}, e2=RF_ANT_DB[id]||(RF_ANT_DB[id]={brand:m.brand, model:m.model});
      if(a.tipo==="omni") e2.ang=360; else if(a.ang>0) e2.ang=a.ang;   /* senza angolo di scheda resta quello scritto a mano (antAngOf) */
      if(a.gain) e2.gain=a.gain; if(a.range) e2.range=a.range;
      e2.tipo=a.tipo||null; e2.mm=m.mm; e2.src=m.src;
    }
  });
}
/* U rack di un elemento posato dal catalogo (solo pro:1, come peso e consumo) */
function proRackUOf(it){ var m=(it && it.pro) ? proModelOf(it) : null; return (m && m.rackU>0) ? m.rackU : null; }

/* Disegno in pianta dei modelli del lotto 2: l'icona realistica di icons-pro.js quando è arrivata; prima, e se il
   modello non ce l'ha, un'unità neutra NELLA MISURA DI SCHEDA (mai il disegno generico a misura fissa). I progetti
   salvati prima (senza pro:1) restano col disegno di sempre. */
function proUnitaDraw(it){
  var W=it.w||48, D=it.d||30, r2=function(v){ return Math.round(v*100)/100; }, m=proModelOf(it)||{};
  var s='<rect x="'+r2(-W/2)+'" y="'+r2(-D/2)+'" width="'+r2(W)+'" height="'+r2(D)+'" rx="'+r2(Math.min(1.2,W*0.04))+'" fill="#25292d" stroke="#0b0c0d" stroke-width=".12"/>';
  if(m.kind==="ant"){   /* antenna: pala o elica vista dall'alto, attacco al centro */
    s+='<rect x="'+r2(-W/2+0.6)+'" y="'+r2(-D/2+0.4)+'" width="'+r2(Math.max(0,W-1.2))+'" height="'+r2(Math.max(0,D-0.8))+'" rx="'+r2(Math.min(0.8,D*0.3))+'" fill="#3a3f45"/>';
    return s+'<circle cx="0" cy="0" r="'+r2(Math.min(1.2,D*0.35,W*0.2))+'" fill="#8a9096"/>';
  }
  var fh=Math.min(D*0.4, (m.mm && m.mm[2]) ? m.mm[2]/10 : 4.4);   /* frontale ribaltato in scala vera (convenzione dei rack del lotto 1) */
  s+='<rect x="'+r2(-W/2)+'" y="'+r2(D/2-fh)+'" width="'+r2(W)+'" height="'+r2(fh)+'" fill="#34393e" stroke="#0b0c0d" stroke-width=".08"/>';
  s+='<circle cx="'+r2(W/2-1.6)+'" cy="'+r2(D/2-fh/2)+'" r=".45" fill="#46c86a"/>';
  return s;
}
(function(){
  ["netswitch","nodofibra","iemant","rxrf","rfsplit","rfcomb","rfant"].forEach(function(tp){
    var t=TYPES[tp]; if(!t || t._proIco) return;
    var base=t.draw; t._proIco=true;
    t.draw=function(it){
      var m=(it && it.pro) ? proModelOf(it) : null; if(!m) return base(it);
      var k=proIconaDi(it); return k ? proIconaDraw(it, k) : proUnitaDraw(it);
    };
  });
})();

/* IN-EAR: un trasmettitore (un canale di un'unità TX) per ogni MIX in-ear, non per ogni beltpack: più beltpack sullo
   stesso mix ascoltano la stessa frequenza (Shure, «Selection and Operation of Personal Monitor Systems»). Vale solo
   con trasmettitori del catalogo (sanno quanti canali hanno); senza, liste e avvisi restano quelli di prima. */
function iemAssegna(){
  var tx=(state.items||[]).filter(function(x){ var m=(x.type==="iemant" && x.pro) ? proModelOf(x) : null; return !!(m && m.ch>0); });
  if(!tx.length) return null;
  var slot=[]; tx.forEach(function(x){ var m=proModelOf(x); for(var c=1;c<=m.ch;c++) slot.push({tx:x, m:m, ch:c}); });
  var R=null; try{ R=cabResult(true); }catch(_e){}
  var mixes=((R&&R.mixes)||[]).filter(function(mx){ return (mx.sinks||[]).some(function(sk){ return sk.type==="iem"; }); });
  var byMix={}, orfani=[];
  mixes.forEach(function(mx, i){ if(slot[i]) byMix[mx.key]=slot[i]; else orfani.push(mx); });
  return {byMix:byMix, orfani:orfani, mixes:mixes, slot:slot, tx:tx};
}
function iemTxTesto(a){ if(!a) return "";
  var lb=String(a.tx.label||"").trim(), def=(TYPES[a.tx.type]||{}).defLabel;
  var nm=(lb && lb!==def) ? lb : proNome(a.m);   /* l'etichetta di serie («TX IEM») non dice niente: vince il modello */
  return "TX "+nm+(a.m.ch>1 ? " ch "+a.ch : ""); }

/* LISTA MATERIALI: i modelli di rete e radio posati dal catalogo, contati per modello, con le U rack (lista dello
   Stato e PDF del cablaggio, accanto a drop box, rack convertitori e rete Dante). */
var PRO_MAT_GRUPPI=[["rx","Radio · ricevitori"],["iem","In-ear · trasmettitori"],["rfdist","Antenne · splitter e combiner"],["ant","Antenne"],["rete","Rete"],["fibra","Fibra"],["subsnake","Sub-snake analogici"]];
function proMaterialiRighe(items){
  items=items||state.items||[];
  var per={}, ord=[], u=0, mezzi=0;
  items.forEach(function(it){
    var m=it.pro ? proModelOf(it) : null; if(!m || m.kind==="console" || m.kind==="stagebox") return;
    var k=m.kind+"|"+it.hw; if(!per[k]){ per[k]={m:m, n:0}; ord.push(k); } per[k].n++;
    if(m.rackU>0) u+=m.rackU; else if(m.mezzoRack) mezzi++;
  });
  var out=[];
  PRO_MAT_GRUPPI.forEach(function(g){
    var r=ord.filter(function(k){ return per[k].m.kind===g[0]; }).map(function(k){ var o=per[k], d=[proRuoloTesto(o.m), o.m.rackU ? o.m.rackU+"U" : (o.m.mezzoRack ? "mezzo rack" : "")].filter(Boolean).join(", ");
      return o.n+"× "+proNome(o.m)+(d ? " ("+d+")" : ""); });
    if(r.length) out.push([g[1], r.join(" · ")]);
  });
  if(u || mezzi) out.push(["Rack (rete e radio)", [u ? u+"U" : "", mezzi ? mezzi+(mezzi===1?" unità":" unità")+" da mezzo rack (2 per 1U col kit)" : ""].filter(Boolean).join(" + ")]);
  return out;
}
/* scheda tecnica in una riga per i modelli del lotto 2 (pannello) */
function proSchedaL2(m){
  if(!m) return "";
  var p=[proRuoloTesto(m)];
  var bt=proBandeTesto(m); if(bt.length) p.push("bande: "+bt.slice(0,3).join(", ")+(bt.length>3 ? " (+"+(bt.length-3)+")" : ""));
  if(m.rfW) p.push((Array.isArray(m.rfW) ? m.rfW.join("/") : m.rfW)+" mW RF");
  if(m.mezzoRack) p.push("mezzo rack");
  return p.filter(Boolean).join(" · ")+" — "+proSchedaTesto(m);
}
/* BANDE di scheda del ricevitore (lotto 2): «G50», «R1-9», «A»… scritte nel campo Banda del ricevitore. Il controllo
   «frequenza fuori dalla banda» le usa come usa RF_BANDS: solo se il codice scritto coincide con una banda del modello
   (mai indovinare). Ritorna gli intervalli in MHz [[da,a],…] o null. */
function proBandaRange(it){
  var m=(it && it.type==="rxrf" && it.hw) ? (PRO_DB[it.hw]||null) : null, c=String((it&&it.band)||"").trim().toUpperCase();
  if(!m || m.kind!=="rx" || !m.bande || !c) return null;
  for(var i=0;i<m.bande.length;i++){ var b=m.bande[i]; if(String(b[0]).toUpperCase()!==c) continue;
    var r=[]; for(var j=1;j+1<b.length;j+=2) r.push([+b[j], +b[j+1]]); return r.length ? r : null; }
  return null;
}
function proBandeCodici(hw){ var m=PRO_DB[hw]; return (m && m.kind==="rx" && m.bande) ? m.bande.map(function(b){ return String(b[0]); }).filter(Boolean) : []; }
function proBandeTesto(m){ return (m && m.bande) ? m.bande.map(function(b){ var r=[]; for(var j=1;j+1<b.length;j+=2) r.push(b[j]+"–"+b[j+1]); return (b[0] ? b[0]+" " : "")+r.join(" + ")+" MHz"; }) : []; }
/* avviso: più mix in-ear dei canali dei trasmettitori del catalogo sul palco (uno per mix) */
function iemAvvisi(){
  var ia=iemAssegna(); if(!ia || !ia.orfani.length) return [];
  var n=ia.orfani.length, c=ia.slot.length;
  return [{lvl:"warn", msg:n+" mix in-ear senza trasmettitore ("+ia.orfani.map(function(m){ return m.name; }).join(", ")+"): i trasmettitori sul palco hanno "+c+" canal"+(c===1?"e":"i")+" — aggiungi un trasmettitore (uno per mix)."}];
}
