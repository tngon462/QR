const express = require("express");
const { getPrinters, print } = require("pdf-to-printer");
const { PrintQueue } = require("./printQueue");
const { validateToken, getExpectedToken } = require("./token");
const { pngBase64ToPdfFile } = require("./pdf");
const fs = require("fs");

const app = express();
app.use(express.json({ limit: "20mb" })); // labels are small; 20mb is enough

const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || "0.0.0.0";

// idempotent cache (job_id -> timestamp)
const IDEM_TTL_MS = 60_000;
const idem = new Map();

function idemSeen(jobId) {
  const now = Date.now();
  // purge opportunistically
  for (const [k, ts] of idem.entries()) {
    if (now - ts > IDEM_TTL_MS) idem.delete(k);
  }
  const ts = idem.get(jobId);
  if (!ts) return false;
  if (now - ts <= IDEM_TTL_MS) return true;
  idem.delete(jobId);
  return false;
}

function idemMark(jobId) {
  idem.set(jobId, Date.now());
}

// Queue worker: create PDF -> print -> cleanup
const queue = new PrintQueue({
  handler: async (qjob) => {
    const { printer, copies, label, image_png_base64 } = qjob;

    const pdfPath = await pngBase64ToPdfFile({
      pngBase64: image_png_base64,
      width_mm: label.width_mm,
      height_mm: label.height_mm,
    });

    try {
      const opts = {};
      if (printer) opts.printer = printer;
      // pdf-to-printer supports copies via win32 print settings on some drivers;
      // safest: loop copies.
      const n = Math.max(1, Number(copies || 1));
      for (let i = 0; i < n; i++) {
        await print(pdfPath, opts);
      }
    } finally {
      // cleanup temp pdf
      fs.unlink(pdfPath, () => {});
    }
  },
});

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    name: "T-NGON Print Hub",
    queue_len: queue.len(),
    idem_size: idem.size,
  });
});

app.get("/printers", async (req, res) => {
  try {
    const printers = await getPrinters();
    res.json({ ok: true, printers });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.post("/print", async (req, res) => {
  try {
    const body = req.body || {};

    // Validate token
    if (!validateToken(body.token)) {
      return res.status(401).json({ ok: false, error: "Invalid token" });
    }

    const client_job_id = String(body.client_job_id || "");
    if (!client_job_id) {
      return res.status(400).json({ ok: false, error: "Missing client_job_id" });
    }

    // Idempotency 60s
    if (idemSeen(client_job_id)) {
      return res.json({ ok: true, status: "duplicate", job_id: client_job_id, queued: queue.len() });
    }
    idemMark(client_job_id);

    // Validate label
    const label = body.label || {};
    const width_mm = Number(label.width_mm);
    const height_mm = Number(label.height_mm);
    const dpi = Number(label.dpi);

    if (!width_mm || !height_mm || !dpi) {
      return res.status(400).json({ ok: false, error: "Missing label width_mm/height_mm/dpi" });
    }

    const image_png_base64 = String(body.image_png_base64 || "");
    if (!image_png_base64) {
      return res.status(400).json({ ok: false, error: "Missing image_png_base64" });
    }

    const qjob = {
      client_job_id,
      printer: String(body.printer || ""),
      copies: Number(body.copies || 1),
      label: { width_mm, height_mm, dpi },
      job: body.job || {},
      image_png_base64,
    };

    const queued = queue.enqueue(qjob);
    return res.json({ ok: true, status: "queued", job_id: client_job_id, queued });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

app.listen(PORT, HOST, () => {
  console.log("=======================================");
  console.log("T-NGON Print Hub started");
  console.log(`Listen: http://${HOST}:${PORT}`);
  console.log(`Token: ${getExpectedToken()} (env HUB_TOKEN overrides)`);
  console.log("=======================================");
});
