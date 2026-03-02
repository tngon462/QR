// template.js (ES module)
// Requires Konva + JsBarcode in page global.
const Konva = window.Konva;

/** Replace {{var}} inside a string using vars object */
function substituteString(tpl, vars) {
  return String(tpl).replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key) => {
    const v = vars?.[key];
    return v === undefined || v === null ? "" : String(v);
  });
}

/** Apply variables to all Konva.Text nodes (uses each node's saved _tpl if present) */
export function substituteTextNodes(stage, vars) {
  if (!stage) return;
  stage.find("Text").forEach((t) => {
    const tpl = t.getAttr("_tpl");
    const base = (tpl !== undefined && tpl !== null) ? tpl : t.text();
    t.text(substituteString(base, vars));
  });
}

/** Generate CODE128 barcode image into Konva.Image named "barcode_img" */
export async function setBarcodeImage(stage, barcodeValue) {
  const imgNode =
    stage.findOne((n) => n.className === "Image" && typeof n.name === "function" && n.name() === "barcode_img") ||
    stage.findOne(".barcode_img");

  if (!imgNode) return;

  const canvas = document.createElement("canvas");
  canvas.width = 800;
  canvas.height = 220;

  try {
    window.JsBarcode(canvas, String(barcodeValue || ""), {
      format: "CODE128",
      displayValue: false,
      margin: 0,
      height: 160,
    });
  } catch {
    return;
  }

  const dataUrl = canvas.toDataURL("image/png");

  await new Promise((resolve) => {
    const im = new Image();
    im.onload = () => {
      imgNode.image(im);
      imgNode.getLayer?.().batchDraw?.();
      resolve();
    };
    im.src = dataUrl;
  });
}

/** Create a default sample template on empty stage */
export function ensureSampleTemplate(stage, label) {
  if (!stage) return;
  const layer = stage.getChildren().find((n) => n.className === "Layer") || new Konva.Layer();
  if (layer.getParent() !== stage) stage.add(layer);

  const w = stage.width();
  const h = stage.height();

  // Background
  const bg = new Konva.Rect({
    x: 0, y: 0,
    width: w, height: h,
    fill: "#111",
    name: "bg",
  });
  layer.add(bg);

  // Title
  const tName = new Konva.Text({
    x: 14, y: 10,
    text: "{{name}}",
    fontSize: 20,
    fill: "#fff",
    draggable: true,
  });
  tName.setAttr("_tpl", "{{name}}");
  layer.add(tName);

  // Weight + price
  const tW = new Konva.Text({
    x: 14, y: 36,
    text: "{{weight_kg}}kg",
    fontSize: 14,
    fill: "rgba(255,255,255,0.85)",
    draggable: true,
  });
  tW.setAttr("_tpl", "{{weight_kg}}kg");
  layer.add(tW);

  const tP = new Konva.Text({
    x: 14, y: 56,
    text: "¥{{amount}}",
    fontSize: 18,
    fill: "#fff",
    draggable: true,
  });
  tP.setAttr("_tpl", "¥{{amount}}");
  layer.add(tP);

  // Barcode box + image + value
  const r = new Konva.Rect({
    x: 10, y: h - 70,
    width: w - 20,
    height: 60,
    stroke: "rgba(255,255,255,0.18)",
    strokeWidth: 2,
    cornerRadius: 10,
    name: "barcode_box",
    draggable: true,
  });
  layer.add(r);

  const img = new Konva.Image({
    x: 18, y: h - 62,
    width: w - 36,
    height: 40,
    name: "barcode_img",
    draggable: true,
  });
  layer.add(img);

  const tB = new Konva.Text({
    x: 18, y: h - 20,
    text: "{{barcode}}",
    fontSize: 12,
    fill: "rgba(255,255,255,0.70)",
    name: "txt_barcode_value",
    draggable: true,
  });
  tB.setAttr("_tpl", "{{barcode}}");
  layer.add(tB);

  layer.draw();
}
