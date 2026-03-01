const fs = require("fs");
const path = require("path");
const express = require("express");
const cors = require("cors");

const { PrintQueue } = require("./queue");
const { ensureDir, pngToPdfFile, doPrintPdf, listPrinters } = require("./print_engine");

function loadConfig(){
  const cfgPath = path.join(__dirname, "hub.config.json");
  const exPath  = path.join(__dirname, "hub.config.json.example");

  if(!fs.existsSync(cfgPath)){
    console.log("[hub] Missing hub.config.json. Copy from hub.config.json.example and edit.");
    console.log("[hub] Example:", exPath);
    process.exit(1);
  }
  const raw = fs.readFileSync(cfgPath, "utf-8");
  return JSON.parse(raw);
}

const cfg = loadConfig();
ensureDir(path.join(__dirname, cfg.tempDir || "./_tmp"));

const app = express();
app.use(cors());
app.use(express.json({ limit: "15mb" })); // PNG base64 có thể to
const q = new PrintQueue();

app.get("/health", (req,res) => {
  res.type("text").send("OK");
});

app.get("/printers", async (req,res) => {
  try{
    const printers = await listPrinters();
    res.json({ printers });
  }catch(e){
    res.status(500).json({ error: e.message });
  }
});

app.post("/print", async (req,res) => {
  const body = req.body || {};

  try{
    // Validate token
    if(!body.token || body.token !== cfg.token){
      return res.status(401).json({ error: "Invalid token" });
    }

    // Validate label/job/image
    const label = body.label || {};
    if(!label.width_mm || !label.height_mm){
      return res.status(400).json({ error: "Missing label.width_mm/height_mm" });
    }
    if(!body.image_png_base64){
      return res.status(400).json({ error: "Missing image_png_base64" });
    }

    const printer = body.printer || cfg.defaultPrinter || "";
    const copies = body.copies || 1;

    const job = body.job || {};
    const jobId = `${Date.now()}_${Math.random().toString(16).slice(2)}`;

    const tempDir = path.join(__dirname, cfg.tempDir || "./_tmp");
    const pdfPath = path.join(tempDir, `label_${jobId}.pdf`);

    const queueSizeBefore = q.size();

    const result = await q.push(async () => {
      if(cfg.logJobs){
        console.log("[hub] Print job", jobId, { printer, copies, job });
      }

      await pngToPdfFile({
        imageDataUrl: body.image_png_base64,
        outPdfPath: pdfPath,
        width_mm: label.width_mm,
        height_mm: label.height_mm
      });

      await doPrintPdf(pdfPath, printer, copies);

      // Cleanup pdf (optional)
      try{ fs.unlinkSync(pdfPath); }catch{}

      return { ok:true, jobId };
    });

    res.json({ ok:true, jobId: result.jobId, queueSizeBefore });
  }catch(e){
    res.status(500).json({ error: e.message });
  }
});

const port = cfg.port || 8787;
app.listen(port, "0.0.0.0", () => {
  console.log(`[hub] Listening on http://0.0.0.0:${port}`);
});
