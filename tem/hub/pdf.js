// pdf.js — PNG(base64) -> PDF with exact mm sizing using PDFKit

const fs = require("fs");
const path = require("path");
const os = require("os");
const PDFDocument = require("pdfkit");

function mmToPt(mm) {
  return (mm * 72) / 25.4;
}

/**
 * Create a temp PDF file for printing.
 * @returns {string} pdfPath
 */
async function pngBase64ToPdfFile({ pngBase64, width_mm, height_mm }) {
  const pdfW = mmToPt(Number(width_mm));
  const pdfH = mmToPt(Number(height_mm));

  const tmpDir = path.join(os.tmpdir(), "tngon_print_hub");
  fs.mkdirSync(tmpDir, { recursive: true });

  const pdfPath = path.join(tmpDir, `label_${Date.now()}_${Math.random().toString(16).slice(2)}.pdf`);

  const doc = new PDFDocument({
    size: [pdfW, pdfH],
    margin: 0,
    autoFirstPage: true,
  });

  const out = fs.createWriteStream(pdfPath);
  doc.pipe(out);

  const buf = Buffer.from(pngBase64, "base64");
  // Cover whole page exactly
  doc.image(buf, 0, 0, { width: pdfW, height: pdfH });

  doc.end();

  await new Promise((res, rej) => {
    out.on("finish", res);
    out.on("error", rej);
  });

  return pdfPath;
}

module.exports = { pngBase64ToPdfFile };
