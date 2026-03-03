import { getPresets, getSettings, getLast, setLast } from "./storage.js";
import { makeBarcode, gramsToKg, roundTo10, uuidv4, clamp } from "./utils.js";
import { getTemplate } from "./templates.js";
import { stageFromTemplateJSON, enforceWhiteBackground, mmToPx, fitStageToContainer, applyJobToStage } from "./render.js";
import { hubPrintViaBridge } from "./hub.js";

let previewStage = null;
let previewLabelPx = { w: 0, h: 0 };
let lastJobPayload = null;

export function initRun(ctx) {
  ctx.presetSelect.addEventListener("change", () => {
    const last = getLast();
    last.presetId = ctx.presetSelect.value;
    setLast(last);
    refreshGrid(ctx);
  });

  ctx.snapStep.addEventListener("change", () => {
    if (ctx.snapStep.checked) ctx.exactGram.checked = false;
  });
  ctx.exactGram.addEventListener("change", () => {
    if (ctx.exactGram.checked) ctx.snapStep.checked = false;
  });

  ctx.btnQuickPrint.addEventListener("click", async () => {
    const grams = Number(ctx.quickGram.value || 0);
    if (!grams) return;
    await doPrintByGrams(ctx, grams);
  });

  ctx.btnPrintAgain.addEventListener("click", async () => {
    if (!lastJobPayload) return alert("Chưa có job trước đó");
    await sendToHub(ctx, lastJobPayload, true);
  });

  bootPresets(ctx);
  refreshGrid(ctx);

  window.addEventListener("resize", () => {
    if (!previewStage) return;
    fitStageToContainer(previewStage, previewLabelPx.w, previewLabelPx.h, ctx.previewWrap);
  });
}

export function bootPresets(ctx) {
  const presets = getPresets();
  const last = getLast();

  ctx.presetSelect.innerHTML =
    presets.map((p) => `<option value="${p.id}">${escapeHtml(p.name_vi || p.baseCode || p.id)}</option>`).join("") ||
    `<option value="">(no presets)</option>`;

  if (last.presetId && presets.some((p) => p.id === last.presetId)) {
    ctx.presetSelect.value = last.presetId;
  } else if (presets[0]) {
    ctx.presetSelect.value = presets[0].id;
    last.presetId = presets[0].id;
    setLast(last);
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

export function refreshGrid(ctx) {
  const preset = getSelectedPreset(ctx);
  const grid = ctx.grid;
  grid.innerHTML = "";

  if (!preset) {
    grid.innerHTML = `<div class="hint">Chưa có preset. Vào EDIT để Add preset.</div>`;
    return;
  }

  const minG = Number(preset.minGram || 0);
  const maxG = Number(preset.maxGram || 0);
  const step = Number(preset.stepGram || 50);
  const pricePerKg = Number(preset.pricePerKg || 0);

  for (let g = minG; g <= maxG; g += step) {
    const kg = gramsToKg(g);
    const amount = roundTo10((pricePerKg * g) / 1000);
    const btn = document.createElement("button");
    btn.className = "gridbtn";
    btn.innerHTML = `<div class="big">${kg.toFixed(2)}kg – ¥${amount}</div><div class="small">${g}g</div>`;
    btn.addEventListener("click", async () => doPrintByGrams(ctx, g));
    grid.appendChild(btn);
  }
}

function getSelectedPreset(ctx) {
  const presets = getPresets();
  const id = ctx.presetSelect.value;
  return presets.find((p) => p.id === id) || null;
}

async function doPrintByGrams(ctx, inputGrams) {
  const preset = getSelectedPreset(ctx);
  if (!preset) return;

  const step = Number(preset.stepGram || 50);
  const minG = Number(preset.minGram || 0);
  const maxG = Number(preset.maxGram || 0);

  let grams = Number(inputGrams || 0);
  grams = clamp(grams, minG, maxG);

  if (ctx.snapStep.checked) {
    grams = Math.round(grams / step) * step;
    grams = clamp(grams, minG, maxG);
  }

  const job = buildJobFromPreset(preset, grams);

  const tplName = getLast().templateName;
  const tpl = tplName ? getTemplate(tplName) : null;
  if (!tpl) {
    alert("Chưa có template. Vào EDIT tạo template rồi Save.");
    return;
  }

  await renderPreview(ctx, tpl, job);

  // Export PNG base64
  let pngDataUrl = "";
  try {
    pngDataUrl = previewStage?.toDataURL({ pixelRatio: 1 }) || "";
  } catch (e) {
    alert("Preview export PNG lỗi. Kiểm tra template/stage.");
    return;
  }
  const base64 = (pngDataUrl.split(",")[1] || "").trim();
  if (!base64 || base64.length < 50) {
    alert("PNG base64 rỗng/không hợp lệ. Kiểm tra template (có stage/konva json hợp lệ) và preview đã render.");
    return;
  }

  const s = getSettings();

  const payload = {
    token: s.token,
    client_job_id: uuidv4(),
    printer: (s.defaultPrinter || "").trim(),
    copies: 1,
    label: { ...tpl.label },
    job,
    image_png_base64: base64,
  };

  lastJobPayload = payload;
  const last = getLast();
  last.lastJob = payload;
  setLast(last);

  await sendToHub(ctx, payload, false);
}

function buildJobFromPreset(p, grams) {
  const pricePerKg = Number(p.pricePerKg || 0);
  const amount = roundTo10((pricePerKg * grams) / 1000);
  const barcode = makeBarcode(String(p.baseCode || ""), grams);

  return {
    barcode,
    name_vi: p.name_vi || "",
    name_indo: p.name_indo || "",
    name_myanma: p.name_myanma || "",
    name_en: p.name_en || "",
    name_jp: p.name_jp || "",
    weight_g: grams,
    weight_kg: gramsToKg(grams),
    amount,
  };
}

async function renderPreview(ctx, tpl, job) {
  const labelPxW = mmToPx(tpl.label.width_mm, tpl.label.dpi);
  const labelPxH = mmToPx(tpl.label.height_mm, tpl.label.dpi);
  previewLabelPx = { w: labelPxW, h: labelPxH };

  previewStage = await stageFromTemplateJSON(ctx.previewWrap, tpl.konva);
  previewStage.size({ width: labelPxW, height: labelPxH });
  previewStage.scale({ x: 1, y: 1 });

  enforceWhiteBackground(previewStage, labelPxW, labelPxH);
  await applyJobToStage(previewStage, job);

  fitStageToContainer(previewStage, labelPxW, labelPxH, ctx.previewWrap);

  ctx.templateInfo.textContent = `Template: ${getLast().templateName || "(none)"}`;
}

async function sendToHub(ctx, payload, isReprint) {
  const busy = ctx.busy;
  busy.classList.remove("hidden");
  ctx.runMsg.textContent = isReprint ? "Reprinting…" : "Printing…";

  try {
    ctx.btnQuickPrint.disabled = true;

    const s = getSettings();
    const printerName = (payload.printer || s.defaultPrinter || "").trim();
    if (!printerName) {
      throw new Error("Thiếu Default Printer. Vào SETTINGS dán đúng tên máy in Windows (vd: MUNBYN ITPP130B).");
    }

    const b64 = (payload.image_png_base64 || "").trim();
    if (!b64 || b64.length < 50) {
      throw new Error("png_base64 rỗng/không hợp lệ (preview export lỗi).");
    }

    // Web payload -> Python bridge message format (intem.py expects printer_name + png_base64) :contentReference[oaicite:2]{index=2}
    await hubPrintViaBridge({
      token: payload.token,
      printer_name: printerName,
      png_base64: b64,
      label: {
        w_mm: payload.label?.width_mm ?? 60,
        h_mm: payload.label?.height_mm ?? 40,
        gap_mm: payload.label?.gap_mm ?? 2,
        threshold: payload.label?.threshold ?? 180,
      },
      autoCloseMs: 1200,
    });

    ctx.runMsg.textContent = `OK • sent to Python bridge`;
  } catch (err) {
    ctx.runMsg.textContent = `ERROR: ${String(err?.message || err)}`;
  } finally {
    ctx.btnQuickPrint.disabled = false;
    busy.classList.add("hidden");
  }
}
