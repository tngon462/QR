// template.js
// Requires Konva + JsBarcode in page.
const Konva = window.Konva;

export function ensureSampleTemplate(stage, label) {
  const layer = stage.getChildren().find((n) => n.className === "Layer") || new Konva.Layer();
  if (!stage.getChildren().includes(layer)) stage.add(layer);

  // background
  const bg = new Konva.Rect({
    x: 0,
    y: 0,
    width: stage.width(),
    height: stage.height(),
    fill: "#111827",
    name: "bg",
    listening: false,
  });
  layer.add(bg);

  const title = new Konva.Text({
    x: 14,
    y: 10,
    text: "{{name}}",
    fontSize: 22,
    fontStyle: "bold",
    fill: "#ffffff",
    draggable: true,
    name: "txt_name",
  });
  title.setAttr("_tpl", "{{name}}");
  layer.add(title);

  const sub = new Konva.Text({
    x: 14,
    y: 38,
    text: "{{english}}",
    fontSize: 12,
    fill: "rgba(255,255,255,0.85)",
    draggable: true,
    name: "txt_english",
  });
  sub.setAttr("_tpl", "{{english}}");
  layer.add(sub);

  const price = new Konva.Text({
    x: 14,
    y: 54,
    text: "¥{{amount}}",
    fontSize: 20,
    fontStyle: "bold",
    fill: "#ffffff",
    draggable: true,
    name: "txt_amount",
  });
  price.setAttr("_tpl", "¥{{amount}}");
  layer.add(price);

  const wt = new Konva.Text({
    x: stage.width() - 110,
    y: 14,
    text: "{{weight_kg}}kg",
    fontSize: 14,
    fill: "rgba(255,255,255,0.8)",
    draggable: true,
    name: "txt_weight",
  });
  wt.setAttr("_tpl", "{{weight_kg}}kg");
  layer.add(wt);

  // barcode box + image + value
  const box = new Konva.Rect({
    x: 10,
    y: stage.height() - 72,
    width: stage.width() - 20,
    height: 62,
    stroke: "rgba(255,255,255,0.18)",
    strokeWidth: 2,
    cornerRadius: 10,
    draggable: true,
    name: "barcode_box",
  });
  layer.add(box);

  const img = new Konva.Image({
    x: 18,
    y: stage.height() - 64,
    width: stage.width() - 36,
    height: 40,
    draggable: true,
    name: "barcode_img",
  });
  layer.add(img);

  const bv = new Konva.Text({
    x: 18,
    y: stage.height() - 22,
    text: "{{barcode}}",
    fontSize: 11,
    fill: "rgba(255,255,255,0.75)",
    draggable: true,
    name: "txt_barcode_value",
  });
  bv.setAttr("_tpl", "{{barcode}}");
  layer.add(bv);

  layer.draw();
}

function replaceVars(str, vars) {
  return String(str).replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, k) => {
    const v = vars[k];
    return v === undefined || v === null ? "" : String(v);
  });
}

export function applyVarsToStage(stage, vars) {
  // Text nodes: use _tpl if exists, else current text
  stage.find("Text").forEach((t) => {
    const tpl = t.getAttr("_tpl");
    const base = tpl !== undefined && tpl !== null ? tpl : t.text();
    t.text(replaceVars(base, vars));
  });
}

export async function setBarcodeImage(stage, barcodeValue) {
  const imgNode =
    stage.findOne((n) => n.className === "Image" && n.name && n.name() === "barcode_img") ||
    stage.findOne(".barcode_img");

  if (!imgNode) return;

  const canvas = document.createElement("canvas");
  // will be scaled by konva image size anyway
  canvas.width = 800;
  canvas.height = 220;

  try {
    window.JsBarcode(canvas, barcodeValue, {
      format: "CODE128",
      displayValue: false,
      margin: 0,
      height: 160,
    });
  } catch (e) {
    // if JsBarcode missing, just skip
    return;
  }

  const dataUrl = canvas.toDataURL("image/png");
  await new Promise((resolve) => {
    const im = new Image();
    im.onload = () => {
      imgNode.image(im);
      resolve();
    };
    im.src = dataUrl;
  });
}

/** Render PNG (dataURL) from a template JSON without touching the live designer stage */
export async function renderTemplateToDataURL(templateJson, label, vars, pixelRatio = 2) {
  const tmpDiv = document.createElement("div");
  tmpDiv.style.position = "absolute";
  tmpDiv.style.left = "-99999px";
  tmpDiv.style.top = "-99999px";
  document.body.appendChild(tmpDiv);

  let stage;
  try {
    stage = Konva.Node.create(templateJson, tmpDiv);
    // safety: remove transformer if stored
    stage.find("Transformer").forEach((t) => t.destroy());

    // ensure size correct (in case json had old size)
    stage.width(stage.width());
    stage.height(stage.height());

    applyVarsToStage(stage, vars);
    await setBarcodeImage(stage, vars.barcode);

    stage.draw();
    const url = stage.toDataURL({ pixelRatio });
    return url;
  } finally {
    try {
      stage && stage.destroy();
    } catch {}
    tmpDiv.remove();
  }
}
