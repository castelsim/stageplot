/* PDF SINTETICO per le prove della planimetria da PDF (19/11/2026).
   Pagine finte (rettangoli e una scritta inventata): MAI un documento vero, MAI dati reali.
   pdfSintetico({pagine:[{w,h,vuota?,rot?}], password?:false}) → Buffer di un PDF 1.4 valido, senza dipendenze. */
export function pdfSintetico(opz = {}) {
  const pagine = opz.pagine || [{ w: 842, h: 595 }];
  const og = [];   /* oggetti: indice 1-based */
  const add = (s) => { og.push(s); return og.length; };
  add("");   /* 1 catalogo (riempito dopo) */
  add("");   /* 2 pages */
  const kids = [];
  pagine.forEach((p, i) => {
    let c = "";
    if (!p.vuota) {
      c += "0 0 0 RG 3 w 40 40 " + (p.w - 80) + " " + (p.h - 80) + " re S\n";               /* cornice */
      c += "0.2 0.4 0.8 rg 80 80 " + Math.round(p.w / 3) + " " + Math.round(p.h / 4) + " re f\n";   /* «palco» finto */
      c += "BT /F1 28 Tf 90 " + (p.h - 90) + " Td (PIANTA DI PROVA " + (i + 1) + ") Tj ET\n";
    }
    const cont = add("<< /Length " + c.length + " >>\nstream\n" + c + "endstream");
    const pg = add("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 " + p.w + " " + p.h + "]" + (p.rot ? " /Rotate " + p.rot : "") +
      " /Contents " + cont + " 0 R /Resources << /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> >> >> >>");
    kids.push(pg + " 0 R");
  });
  og[0] = "<< /Type /Catalog /Pages 2 0 R >>";
  og[1] = "<< /Type /Pages /Count " + pagine.length + " /Kids [" + kids.join(" ") + "] >>";
  let out = "%PDF-1.4\n"; const off = [];
  og.forEach((s, i) => { off.push(out.length); out += (i + 1) + " 0 obj\n" + s + "\nendobj\n"; });
  const x = out.length;
  out += "xref\n0 " + (og.length + 1) + "\n0000000000 65535 f \n" + off.map((o) => String(o).padStart(10, "0") + " 00000 n \n").join("");
  out += "trailer\n<< /Size " + (og.length + 1) + " /Root 1 0 R >>\nstartxref\n" + x + "\n%%EOF\n";
  return Buffer.from(out, "latin1");
}
