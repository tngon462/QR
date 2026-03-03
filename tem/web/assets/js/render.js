import { gramsToKg } from "./utils.js";

/**
 * Build a Konva stage from saved JSON.
 * Also restores image sources (attrs.__src) for Konva.Image.
 */
export async function stageFromTemplateJSON(container, konvaJson) {
  container.innerHTML = "";
  const stage = Konva.Node.create(konvaJson, container);

  // restore images
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

export function enforceWhiteBackground(stage, labelPxW, labelPxH) {
  // Ensure first layer has a locked white rect named "__bg"
  let layer = stage.findOne("Layer");
  if (!layer) {
    layer = new Konva.Layer();
    stage.add(layer);
  }

  let bg = stage.findOne((n) => n.className === "Rect" && n.name && n.name() === "__bg");
  if (!bg) {
    bg = new Konva.Rect({
      name: "__bg",
      x: 0,
      y: 0,
      width: labelPxW,
      height: labelPxH,
      fill: "white",
      listening: false,
    });
    // put at bottom
    layer.add(bg);
    bg.moveToBottom();
  } else {
    bg.position({ x: 0, y: 0 });
    bg.size({ width: labelPxW, height: labelPxH });
    bg.fill("white");
    bg.listening(false);
    bg.moveToBottom();
  }

  // If someone accidentally saved stage/layer black background, neutralize:
  stage.container().style.background = "white";
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
  // Replace all Text nodes variables
  const texts = stage.find("Text");
  texts.forEach((t) => {
    const raw = String(t.text() ?? "");
    const replaced = substituteVars(raw, job);
    if (replaced !== raw) t.text(replaced);
  });

  // Update barcode image nodes (name: "barcode_img")
  const barcodeImg =
    stage.findOne((n) => n.className === "Image" && n.name && n.name() === "barcode_img") ||
    stage.findOne(".barcode_img");

  if (barcodeImg) {
    const url = generateBarcodeDataURL(job.barcode);
    await setKonvaImageFromDataURL(barcodeImg, url);
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
 * Export template JSON from a stage.
 * Adds __src into Konva.Image nodes to preserve images.
 */
export function exportStageToTemplateJSON(stage) {
  // store src for each image if possible
  stage.find("Image").forEach((imgNode) => {
    const im = imgNode.image();
    // If image exists, try to keep the original src that we stored
    if (!imgNode.attrs.__src && im?.src) {
      // Note: Some browsers keep blob: URL; best is to keep dataURL when added.
      imgNode.setAttr("__src", im.src);
    }
  });

  return stage.toJSON();
}

export function mmToPx(mm, dpi) {
  return Math.round((mm * dpi) / 25.4);
}

export function mmToPt(mm) {
  return (mm * 72) / 25.4;
}

export function fitStageToContainer(stage, labelPxW, labelPxH, containerEl) {
  const maxW = containerEl.clientWidth - 16;
  const scale = maxW > 0 ? Math.min(1, maxW / labelPxW) : 1;
  stage.width(labelPxW * scale);
  stage.height(labelPxH * scale);
  stage.scale({ x: scale, y: scale });
  stage.draw();
  return scale;
}
