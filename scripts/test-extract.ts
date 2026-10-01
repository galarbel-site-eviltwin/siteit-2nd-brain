import { zipSync, strToU8 } from "fflate";
import { extractText } from "../src/lib/ingest/extract";

// Minimal DOCX: just enough parts for a reader.
const docx = zipSync({
  "[Content_Types].xml": strToU8(`<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`),
  "_rels/.rels": strToU8(`<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="r1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`),
  "word/document.xml": strToU8(`<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>הצעת מחיר לשלב א: 12,900 ש"ח</w:t></w:r></w:p><w:p><w:r><w:t>noga-studio.co.il</w:t></w:r></w:p></w:body></w:document>`),
});

// Minimal one-page PDF with a line of text.
function pdf(text: string) {
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 144] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    "", "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  const stream = `BT /F1 12 Tf 20 100 Td (${text}) Tj ET`;
  objs[3] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
  let out = "%PDF-1.4\n"; const offs: number[] = [];
  objs.forEach((o, i) => { offs.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const x = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offs.map((o) => String(o).padStart(10, "0") + " 00000 n \n").join("");
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${x}\n%%EOF`;
  return strToU8(out);
}

(async () => {
  const d = await extractText(docx, "offer.docx");
  console.log("docx:", d.kind, d.kind === "text" ? JSON.stringify(d.text.trim()) : d);
  const p = await extractText(pdf("Proposal v3 for noga-studio.co.il - 12,900 ILS"), "offer.pdf");
  console.log("pdf:", p.kind, p.kind === "text" ? JSON.stringify(p.text.trim()) : p);
  console.log("audio:", (await extractText(new Uint8Array([1, 2]), "note.m4a")).kind);
})();
