import { mmToPx } from "./utils.js";

/**
 * Template strategy:
 * - Store Konva Stage JSON (stage.toJSON()) in localStorage.
 * - When rendering, Konva.Node.create(json, container)
 * - Then substitute variables in Text nodes:
 *   {{name}}, {{amount}}, {{weight_g}}, {{weight_kg}}, {{barcode}}
 * - Barcode: generate CODE128 image via JsBarcode into Image node name "barcode_img"
 *
 * IMPORTANT FIX:
 * - Do NOT treat Transformer as "template content".
 * - Some flows add Transformer by default, which made stage "non-empty" => sample never created.
 */

function isMeaningfulNode(node) {
  if (!node) return false;
  // Konva nodes have: className, name()
  const cls = node.className || "";
  if (cls === "Transformer") return false;

  const nm = typeof node.name === "function" ? node.name() : (node.attrs?.name ?? "");
  // Ignore helper / border nodes if you want to treat them as not content
  if (nm === "border_rect") return false;
  if (nm === "barcode_box") return false;

  return true;
}

function layerHasRealContent(layer) {
  if (!layer) return false;
  const kids = layer.getChildren?.() || [];
  return kids.some(isMeaningfulNode);
}

export function ensureSampleTemplate(stage, label) {
  // If stage is empty (ignoring Transformer), create a basic sample label.
  const layer = stage.findOne("Layer");
  if (!layer) return;

  // ✅ FIX: only count meaningful nodes (ignore Transformer)
  const hasAny = layerHasRealContent(layer);
  if (hasAny) return;

  const Konva = window.Konva;
  if (!Konva) return;

  const w = mmToPx(label.width_mm, label.dpi);
  const h = mmToPx(label.height_mm, label.dpi);

  // Border (optional) — keep it very light so it doesn't affect printing
  layer.add(
    new Konva.Rect({
      x: 2,
      y: 2,
      width: w - 4,
      height: h - 4,
      stroke: "rgba(0,0,0,0.12)",
      strokeWidth: 2,
      cornerRadius: 6,
      name: "border_rect",
      draggable: true,
    })
  );

  // Name
  layer.add(
    new Konva.Text({
      x: 16,
      y: 10,
      text: "{{name}}",
      fontSize: Math.max(18, Math.round(w * 0.09)), // responsive-ish
      fontStyle: "bold",
      fill: "#111111",
      name: "txt_name",
      draggable: true,
    })
  );

  // Weight
  layer.add(
    new Konva.Text({
      x: 16,
      y: 44,
      text: "{{weight_kg}}kg",
      fontSize: Math.max(12, Math.round(w * 0.06)),
      fill: "#111111",
      name: "txt_weight",
      draggable: true,
    })
  );

  // Amount
  layer.add(
    new Konva.Text({
      x: 16,
      y: 70,
      text: "¥{{amount}}",
      fontSize: Math.max(18, Math.round(w * 0.11)),
      fontStyle: "bold",
      fill: "#111111",
      name: "txt_amount",
      draggable: true,
    })
  );

  // Barcode placeholder box (optional)
  const boxY = Math.max(0, h - 70);
  layer.add(
    new Konva.Rect({
      x: 16,
      y: boxY,
      width: w - 32,
      height: 56,
      stroke: "rgba(0,0,0,0.12)",
      strokeWidth: 2,
      cornerRadius: 6,
      name: "barcode_box",
      draggable: true,
    })
  );

  // Barcode image node (will be filled by setBarcodeImage)
  layer.add(
    new Konva.Image({
      x: 22,
      y: boxY + 4,
      width: w - 44,
      height: 48,
      name: "barcode_img",
      draggable: true,
    })
  );

  // Barcode value
  layer.add(
    new Konva.Text({
      x: 16,
      y: Math.max(0, h - 18),
      text: "{{barcode}}",
      fontSize: 14,
      fill: "#111111",
      name: "txt_barcode_value",
      draggable: true,
    })
  );

  layer.draw();
}

export function substituteTextNodes(stage, vars) {
  const texts = stage.find("Text");
  texts.forEach((t) => {
    const raw = t.text();
    if (!raw || raw.indexOf("{{") === -1) return;
    t.text(applyVars(raw, vars));
  });
}

export function applyVars(str, vars) {
  return String(str)
    .replaceAll("{{name}}", vars?.name ?? "")
    .replaceAll("{{amount}}", String(vars?.amount ?? ""))
    .replaceAll("{{weight_g}}", String(vars?.weight_g ?? ""))
    .replaceAll("{{weight_kg}}", String(vars?.weight_kg ?? ""))
    .replaceAll("{{barcode}}", String(vars?.barcode ?? ""));
}

export async function setBarcodeImage(stage, barcodeValue) {
  // Use JsBarcode to render CODE128 into a canvas, then set Konva.Image
  const node = stage.findOne(".barcode_img") || stage.findOne("#barcode_img");
  if (!node) return;

  if (!window.JsBarcode) {
    // JsBarcode not loaded
    return;
  }

  const canvas = document.createElement("canvas");
  canvas.width = 800;
  canvas.height = 200;

  window.JsBarcode(canvas, String(barcodeValue ?? ""), {
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
  if (layer) layer.draw();
}
