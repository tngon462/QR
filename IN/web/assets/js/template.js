// template.js (ES module)
// Requires Konva + JsBarcode in page global.
const Konva = window.Konva;

export async function setBarcodeImage(stage, barcodeValue) {
  const imgNode =
    stage.findOne((n) => n.className === "Image" && typeof n.name === "function" && n.name() === "barcode_img") ||
    stage.findOne(".barcode_img"); // Konva selector: ".name"

  if (!imgNode) return;

  const canvas = document.createElement("canvas");
  canvas.width = 800;
  canvas.height = 220;

  try {
    window.JsBarcode(canvas, barcodeValue, {
      format: "CODE128",
      displayValue: false,
      margin: 0,
      height: 160,
    });
  } catch {
    return; // JsBarcode missing or invalid input
  }

  const dataUrl = canvas.toDataURL("image/png");

  await new Promise((resolve) => {
    const im = new Image();
    im.onload = () => {
      imgNode.image(im);
      // draw layer quickly
      const layer = imgNode.getLayer?.();
      layer?.batchDraw?.();
      resolve();
    };
    im.src = dataUrl;
  });
}

/**
 * Render PNG (dataURL) from a template JSON without touching the live designer stage
 * label: { width_mm, height_mm, dpi }
 */
export async function renderTemplateToDataURL(templateJson, label, vars, pixelRatio = 2) {
  const tmpDiv = document.createElement("div");
  tmpDiv.style.position = "absolute";
  tmpDiv.style.left = "-99999px";
  tmpDiv.style.top = "-99999px";
  document.body.appendChild(tmpDiv);

  let stage = null;

  try {
    stage = Konva.Node.create(templateJson, tmpDiv);

    // safety: remove transformer if stored
    stage.find("Transformer").forEach((t) => t.destroy());

    // force size from label (mm/dpi) if provided
    if (label?.width_mm && label?.height_mm && label?.dpi) {
      const mmToPx = (mm, dpi) => Math.round((mm / 25.4) * dpi);
      const w = mmToPx(label.width_mm, label.dpi);
      const h = mmToPx(label.height_mm, label.dpi);

      stage.width(w);
      stage.height(h);

      // if you have a background rect named "bg", keep it full size
      const bg = stage.findOne((n) => n.className === "Rect" && typeof n.name === "function" && n.name() === "bg");
      if (bg) {
        bg.width(w);
        bg.height(h);
      }
    }

    // apply vars then barcode
    applyVarsToStage(stage, vars);
    await setBarcodeImage(stage, vars.barcode);

    stage.draw();
    return stage.toDataURL({ pixelRatio });
  } finally {
    try {
      stage?.destroy();
    } catch {}
    tmpDiv.remove();
  }
}
