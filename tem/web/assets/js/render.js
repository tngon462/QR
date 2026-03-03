// render.js
import { gramsToKg } from "./utils.js";

/**
 * Create Konva stage from saved JSON and restore images
 */
export async function stageFromTemplateJSON(container, konvaJson) {
  container.innerHTML = "";
  const stage = Konva.Node.create(konvaJson, container);

  // restore images from __src
  const imgs = stage.find("Image");
  await Promise.all(
    imgs.map(async (imgNode) => {
      const src = imgNode?.attrs?.__src;
      if (!src) return;
      await setKonvaImageFromDataURL(imgNode, src);
    })
  );

  return stage;
}

/**
 * Force a white background rect named "__bg" at the bottom.
 * Also forces container background to white to avoid "black" illusions.
 */
export function enforceWhiteBackground(stage, labelPxW, labelPxH) {
  // Ensure at least 1 layer exists
  let layer = stage.findOne("Layer");
  if (!layer) {
    layer = new Konva.Layer();
    stage.add(layer);
  }

  // Find background rect by name
  let bg = stage.findOne(".__bg");
  if (!bg) {
    bg = new Konva.Rect({
      x: 0,
      y: 0,
      width: labelPxW,
      height: labelPxH,
      fill: "white",
      listening: false,
    });
    bg.name("__bg");
    layer.add(bg);
  } else {
    bg.position({ x: 0, y: 0 });
    bg.size({ width: labelPxW, height: labelPxH });
    bg.fill("white");
    bg.listening(false);
  }

  // Must be bottom-most
  bg.moveToBottom();

  // Make sure the HTML container doesn't render dark background
  try {
    stage.container().style.background = "white";
  } catch {}
}

export async function setKonvaImageFromDataURL(imgNode, dataUrl) {
  await new Promise((resolve) => {
    const im = new Image();
    im.onload = () => {
      imgNode.image(im);
      resolve();
    };
    im.src = dataUrl;
  });
}

export function generateBarcodeDataURL(barcodeValue) {
  const canvas = document.createElement("canvas");
  canvas.width = 800;
  canvas.height = 240;
  window.JsBarcode(canvas, barcodeValue, {
    format: "CODE128",
    displayValue: false,
    margin: 0,
    height: 180,
  });
  return canvas.toDataURL("image/png");
}

export async function applyJobToStage(stage, job) {
  // Replace variables in all Text nodes
  const texts = stage.find("Text");
  texts.forEach((t) => {
    const raw = String(t.text() ?? "");
    const replaced = substituteVars(raw, job);
    if (replaced !== raw) t.text(replaced);
  });

  // Update barcode image node (name: "barcode_img")
  const barcodeImg =
    stage.findOne(".barcode_img") ||
    stage.findOne((n) => n.getClassName?.() === "Image" && n.name?.() === "barcode_img");

  if (barcodeImg) {
    const url = generateBarcodeDataURL(job.barcode);
    await setKonvaImageFromDataURL(barcodeImg, url);
    barcodeImg.setAttr("__src", url);
  }

  stage.draw();
}

export function substituteVars(text, job) {
  const map = {
    "{{name_vi}}": job.name_vi ?? "",
    "{{name_indo}}": job.name_indo ?? "",
    "{{name_myanma}}": job.name_myanma ?? "",
    "{{name_en}}": job.name_en ?? "",
    "{{name_jp}}": job.name_jp ?? "",
    "{{amount}}": String(job.amount ?? ""),
    "{{weight_g}}": String(job.weight_g ?? ""),
    "{{weight_kg}}": String(job.weight_kg ?? gramsToKg(job.weight_g || 0)),
    "{{barcode}}": String(job.barcode ?? ""),
  };

  let out = String(text);
  for (const [k, v] of Object.entries(map)) out = out.split(k).join(v);
  return out;
}

/**
 * Export a stage to JSON (template content).
 * Ensure Image nodes keep __src so reload can restore.
 */
export function exportStageToTemplateJSON(stage) {
  stage.find("Image").forEach((imgNode) => {
    // If we already stored __src, keep it.
    // If not, try to store current image src (may be blob url)
    if (!imgNode.attrs.__src) {
      const im = imgNode.image?.();
      if (im?.src) imgNode.setAttr("__src", im.src);
    }
  });

  return stage.toJSON();
}

export function mmToPx(mm, dpi) {
  return Math.round((Number(mm) * Number(dpi)) / 25.4);
}

export function mmToPt(mm) {
  return (Number(mm) * 72) / 25.4;
}

/**
 * Fit stage to container width for display.
 * Note: scaling is for view only. Export should use scale=1 when needed.
 */
export function fitStageToContainer(stage, labelPxW, labelPxH, containerEl) {
  const maxW = Math.max(10, (containerEl?.clientWidth || labelPxW) - 16);
  const scale = maxW > 0 ? Math.min(1, maxW / labelPxW) : 1;

  stage.width(labelPxW * scale);
  stage.height(labelPxH * scale);
  stage.scale({ x: scale, y: scale });
  stage.draw();

  return scale;
}
