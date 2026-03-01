// IN/web/assets/js/template.js
// Requires Konva + JsBarcode loaded globally in pages that use it.
const Konva = window.Konva;

function getFirstLayer(stage){
  const layer = stage.getChildren().find(n => n.className === "Layer");
  if(layer) return layer;
  const l = new Konva.Layer();
  stage.add(l);
  return l;
}

function makeText(x,y,text,fontSize,name,fill="rgba(255,255,255,0.92)",bold=false){
  const t = new Konva.Text({
    x,y,
    text,
    fontSize,
    fontStyle: bold ? "bold" : "normal",
    fill,
    draggable: true,
    name
  });
  // store template text so preview substitution is stable
  t.setAttr("_tpl", text);
  return t;
}

export function ensureSampleTemplate(stage, label){
  const layer = getFirstLayer(stage);
  const w = stage.width();
  const h = stage.height();

  // Clear old nodes (except Transformer if already added later)
  layer.getChildren().forEach(n => {
    if(n.className !== "Transformer") n.destroy();
  });

  // Background (dark)
  const bg = new Konva.Rect({
    x:0, y:0, width:w, height:h,
    fill: "#111318",
    cornerRadius: 10,
    name: "bg",
    draggable: false
  });
  layer.add(bg);

  // Header name
  const name = makeText(16, 14, "{{name}}", Math.max(16, Math.round(h*0.22)), "txt_name", "rgba(255,255,255,0.95)", true);
  layer.add(name);

  // Weight
  const weight = makeText(16, Math.round(h*0.48), "{{weight_kg}}kg", Math.max(14, Math.round(h*0.18)), "txt_weight", "rgba(255,255,255,0.88)", false);
  layer.add(weight);

  // Amount (price)
  const amount = makeText(Math.round(w*0.55), Math.round(h*0.44), "¥{{amount}}", Math.max(18, Math.round(h*0.24)), "txt_amount", "rgba(255,255,255,0.96)", true);
  amount.align("right");
  amount.width(Math.round(w*0.40));
  layer.add(amount);

  // Barcode area box
  const boxH = Math.max(52, Math.round(h*0.30));
  const boxY = h - boxH - 10;

  const box = new Konva.Rect({
    x: 10, y: boxY,
    width: w - 20,
    height: boxH,
    stroke: "rgba(255,255,255,0.18)",
    strokeWidth: 2,
    cornerRadius: 10,
    name: "barcode_box",
    draggable: true
  });
  layer.add(box);

  const img = new Konva.Image({
    x: 18,
    y: boxY + 8,
    width: w - 36,
    height: boxH - 24,
    name: "barcode_img",
    draggable: true
  });
  layer.add(img);

  const codeTxt = makeText(18, boxY + boxH - 18, "{{barcode}}", 12, "txt_barcode_value", "rgba(255,255,255,0.70)", false);
  layer.add(codeTxt);

  layer.draw();
}

/**
 * Replace placeholders inside Text nodes, using stored _tpl for stability.
 */
export function substituteTextNodes(stage, vars){
  stage.find("Text").forEach(t => {
    const tpl = t.getAttr("_tpl") ?? t.text();
    const out = tpl.replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (_,k) => {
      const v = vars[k];
      return (v === undefined || v === null) ? "" : String(v);
    });
    t.text(out);
  });
}

function makeBarcodeCanvas(value, widthPx){
  const canvas = document.createElement("canvas");
  // JsBarcode will size it
  window.JsBarcode(canvas, value, {
    format: "CODE128",
    displayValue: false,
    margin: 0,
    height: 60
  });

  // scale to fit widthPx
  if(widthPx && canvas.width){
    const scale = widthPx / canvas.width;
    if(scale > 0 && scale !== 1){
      const c2 = document.createElement("canvas");
      c2.width = Math.max(1, Math.round(canvas.width * scale));
      c2.height = Math.max(1, Math.round(canvas.height * scale));
      const ctx = c2.getContext("2d");
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(canvas, 0, 0, c2.width, c2.height);
      return c2;
    }
  }
  return canvas;
}

export async function setBarcodeImage(stage, barcodeValue){
  const node = stage.findOne(".barcode_img") || stage.findOne("#barcode_img") || stage.findOne(n => n.name && n.name()==="barcode_img");
  if(!node) return;

  const targetW = (typeof node.width === "function") ? node.width() : 300;

  const canvas = makeBarcodeCanvas(barcodeValue, targetW);
  const url = canvas.toDataURL("image/png");

  await new Promise((resolve,reject)=>{
    const img = new Image();
    img.onload = () => {
      node.image(img);
      resolve();
    };
    img.onerror = reject;
    img.src = url;
  });
}
