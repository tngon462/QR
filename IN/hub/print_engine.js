const fs = require("fs");
const path = require("path");
const PDFDocument = require("pdfkit");
const { print, getPrinters } = require("pdf-to-printer");

/**
 * Convert dataURL(PNG) -> PDF đúng size mm.
 * Sau đó in qua pdf-to-printer.
 */

function ensureDir(dir){
  if(!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function stripDataUrl(dataUrl){
  // "data:image/png;base64,...."
  const m = String(dataUrl).match(/^data:image\/png;base64,(.+)$/);
  if(!m) throw new Error("image_png_base64 không đúng định dạng data:image/png;base64,...");
  return Buffer.from(m[1], "base64");
}

function mmToPt(mm){
  // PDF points: 72 pt/inch, 25.4 mm/inch
  return (Number(mm) / 25.4) * 72;
}

async function pngToPdfFile({ imageDataUrl, outPdfPath, width_mm, height_mm }){
  const pngBuf = stripDataUrl(imageDataUrl);

  const wPt = mmToPt(width_mm);
  const hPt = mmToPt(height_mm);

  await new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: [wPt, hPt], margin: 0 });
    const stream = fs.createWriteStream(outPdfPath);

    doc.pipe(stream);
    // fit image to full page
    doc.image(pngBuf, 0, 0, { width: wPt, height: hPt });
    doc.end();

    stream.on("finish", resolve);
    stream.on("error", reject);
  });

  return outPdfPath;
}

async function doPrintPdf(pdfPath, printerName, copies = 1){
  const opts = {};
  if(printerName) opts.printer = printerName;
  if(copies && Number(copies) > 1) opts.copies = Number(copies);

  await print(pdfPath, opts);
}

async function listPrinters(){
  return await getPrinters();
}

module.exports = {
  ensureDir,
  pngToPdfFile,
  doPrintPdf,
  listPrinters
};
