import { mmToPx } from "./utils.js";

/**
 * Template strategy:
 * - Store Konva Stage JSON (stage.toJSON()) in localStorage.
 * - When rendering, Konva.Node.create(json, container)
 * - Then substitute variables in Text nodes: {{name}}, {{amount}}, {{weight_g}}, {{weight_kg}}, {{barcode}}
 * - Barcode: we generate CODE128 image via JsBarcode into an Image node that has name "barcode_img"
 */

export function ensureSampleTemplate(stage, label){
  // If stage is empty, create a basic sample label.
  // stage: Konva.Stage
  // label: { width_mm, height_mm, dpi }
  const layer = stage.findOne("Layer");
  if(!layer) return;

  const hasAny = layer.getChildren().length > 0;
  if(hasAny) return;

  const Konva = window.Konva;
  const w = mmToPx(label.width_mm, label.dpi);
  const h = mmToPx(label.height_mm, label.dpi);

  // Border (optional)
  layer.add(new Konva.Rect({
    x: 2, y: 2, width: w-4, height: h-4,
    stroke: "rgba(255,255,255,0.15)",
    strokeWidth: 2,
    cornerRadius: 6,
    name: "border_rect",
    draggable: true,
  }));

  layer.add(new Konva.Text({
    x: 16, y: 10,
    text: "{{name}}",
    fontSize: 28,
    fontStyle: "bold",
    fill: "#ffffff",
    name: "txt_name",
    draggable: true,
  }));

  layer.add(new Konva.Text({
    x: 16, y: 44,
    text: "{{weight_kg}}kg",
    fontSize: 20,
    fill: "rgba(255,255,255,0.85)",
    name: "txt_weight",
    draggable: true,
  }));

  layer.add(new Konva.Text({
    x: 16, y: 70,
    text: "¥{{amount}}",
    fontSize: 34,
    fontStyle: "bold",
    fill: "#ffffff",
    name: "txt_amount",
    draggable: true,
  }));

  // Placeholder barcode image box
  layer.add(new Konva.Rect({
    x: 16, y: h - 70,
    width: w - 32,
    height: 56,
    stroke: "rgba(255,255,255,0.15)",
    strokeWidth: 2,
    cornerRadius: 6,
    name: "barcode_box",
    draggable: true,
  }));

  layer.add(new Konva.Image({
    x: 22, y: h - 66,
    width: w - 44,
    height: 48,
    name: "barcode_img",
    draggable: true,
  }));

  layer.add(new Konva.Text({
    x: 16, y: h - 18,
    text: "{{barcode}}",
    fontSize: 14,
    fill: "rgba(255,255,255,0.75)",
    name: "txt_barcode_value",
    draggable: true,
  }));

  layer.draw();
}

export function substituteTextNodes(stage, vars){
  const texts = stage.find("Text");
  texts.forEach(t => {
    const raw = t.text();
    if(!raw || raw.indexOf("{{") === -1) return;
    t.text(applyVars(raw, vars));
  });
}

export function applyVars(str, vars){
  return String(str)
    .replaceAll("{{name}}", vars.name ?? "")
    .replaceAll("{{amount}}", String(vars.amount ?? ""))
    .replaceAll("{{weight_g}}", String(vars.weight_g ?? ""))
    .replaceAll("{{weight_kg}}", String(vars.weight_kg ?? ""))
    .replaceAll("{{barcode}}", String(vars.barcode ?? ""));
}

export async function setBarcodeImage(stage, barcodeValue){
  // Use JsBarcode to render CODE128 into a canvas, then set Konva.Image
  const node = stage.findOne(".barcode_img");
  if(!node) return;

  const canvas = document.createElement("canvas");
  canvas.width = 800;
  canvas.height = 200;

  window.JsBarcode(canvas, barcodeValue, {
    format: "CODE128",
    displayValue: false,
    margin: 0,
    height: 80,
  });

  const img = new Image();
  img.src = canvas.toDataURL("image/png");
  await new Promise((res, rej) => {
    img.onload = () => res();
    img.onerror = rej;
  });

  node.image(img);
  const layer = node.getLayer();
  if(layer) layer.draw();
}
