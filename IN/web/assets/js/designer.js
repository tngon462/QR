import { LS_KEYS, DEFAULTS } from "./app-config.js";
import { loadJSON, saveJSON, mmToPx, setStatus } from "./utils.js";
import { ensureSampleTemplate } from "./template.js";

const $ = (s) => document.querySelector(s);

const settings = loadJSON(LS_KEYS.SETTINGS, DEFAULTS.settings);
const label = settings.label;

$("#lblSize").textContent = `${label.width_mm}×${label.height_mm}mm`;
$("#lblDpi").textContent  = `${label.dpi} DPI`;

const stageW = mmToPx(label.width_mm, label.dpi);
const stageH = mmToPx(label.height_mm, label.dpi);

const Konva = window.Konva;

const stage = new Konva.Stage({
  container: "stage",
  width: stageW,
  height: stageH
});
const layer = new Konva.Layer();
stage.add(layer);

const tr = new Konva.Transformer({
  rotateEnabled: true,
  enabledAnchors: ["top-left","top-right","bottom-left","bottom-right"],
  boundBoxFunc: (oldBox, newBox) => {
    // prevent too small
    if(newBox.width < 20 || newBox.height < 20) return oldBox;
    return newBox;
  }
});
layer.add(tr);
layer.draw();

let selected = null;

function selectNode(node){
  selected = node;
  tr.nodes(node ? [node] : []);
  layer.draw();

  if(!node){
    $("#txtProps").value = "";
    return;
  }
  $("#txtProps").value = JSON.stringify(node.attrs, null, 2);
}

stage.on("click tap", (e) => {
  if(e.target === stage){
    selectNode(null);
    return;
  }
  selectNode(e.target);
});

stage.on("dblclick dbltap", (e) => {
  const node = e.target;
  if(node && node.className === "Text"){
    const current = node.text();
    const next = prompt("Sửa text:", current);
    if(next !== null){
      node.text(next);
      node.getLayer().draw();
      if(selected === node){
        $("#txtProps").value = JSON.stringify(node.attrs, null, 2);
      }
    }
  }
});

function addText(text){
  const t = new Konva.Text({
    x: 16, y: 16,
    text,
    fontSize: 24,
    fill: "#ffffff",
    draggable: true
  });
  layer.add(t);
  layer.draw();
  selectNode(t);
}

function addBarcode(){
  // Just add placeholder image node, real barcode image generated at print-time.
  const r = new Konva.Rect({
    x: 16, y: stageH - 70,
    width: stageW - 32,
    height: 56,
    stroke: "rgba(255,255,255,0.15)",
    strokeWidth: 2,
    cornerRadius: 6,
    name: "barcode_box",
    draggable: true
  });
  layer.add(r);

  const imgNode = new Konva.Image({
    x: 22, y: stageH - 66,
    width: stageW - 44,
    height: 48,
    name: "barcode_img",
    draggable: true
  });
  layer.add(imgNode);

  const v = new Konva.Text({
    x: 16, y: stageH - 18,
    text: "{{barcode}}",
    fontSize: 14,
    fill: "rgba(255,255,255,0.75)",
    name: "txt_barcode_value",
    draggable: true
  });
  layer.add(v);

  layer.draw();
  selectNode(imgNode);
}

function loadFromLocal(){
  const json = localStorage.getItem(LS_KEYS.TEMPLATE_JSON);
  if(!json) return false;
  try{
    stage.destroyChildren();
    const node = Konva.Node.create(json, "stage");
    // Node.create returns a Stage (root)
    // Replace current stage content by swapping:
    const newStage = node;
    // Hack: we re-bind by copying children
    const children = newStage.getChildren();
    children.each(ch => stage.add(ch));
    newStage.destroy();

    // Ensure transformer exists on top layer:
    const topLayer = stage.getChildren().find(n => n.className === "Layer") || new Konva.Layer();
    if(!topLayer.getParent()) stage.add(topLayer);
    topLayer.add(tr);

    stage.draw();
    setStatus($("#status"), "ok", "Đã load template từ localStorage.");
    return true;
  }catch(e){
    setStatus($("#status"), "err", "Load template lỗi: " + e.message);
    return false;
  }
}

function saveToLocal(){
  const json = stage.toJSON();
  localStorage.setItem(LS_KEYS.TEMPLATE_JSON, json);
  $("#txtTemplate").value = json;
  setStatus($("#status"), "ok", "Đã lưu template vào localStorage.");
}

function resetSample(){
  stage.find("Layer").forEach(l => l.destroy());
  const l = new Konva.Layer();
  stage.add(l);
  l.add(tr);

  ensureSampleTemplate(stage, label);
  saveToLocal();
  setStatus($("#status"), "ok", "Reset về template mẫu.");
}

$("#btnAddText").onclick = () => addText("Text...");
$("#btnAddPrice").onclick = () => addText("¥{{amount}}");
$("#btnAddWeight").onclick = () => addText("{{weight_kg}}kg");
$("#btnAddBarcode").onclick = () => addBarcode();

$("#btnDelete").onclick = () => {
  if(!selected) return;
  // remove transformer first
  selectNode(null);
  selected.destroy();
  layer.draw();
};

$("#btnApplyProps").onclick = () => {
  if(!selected) return;
  try{
    const obj = JSON.parse($("#txtProps").value || "{}");
    selected.setAttrs(obj);
    selected.getLayer().draw();
    setStatus($("#status"), "ok", "Applied attrs.");
  }catch(e){
    setStatus($("#status"), "err", "JSON attrs sai: " + e.message);
  }
};

$("#btnBringFront").onclick = () => {
  if(!selected) return;
  selected.moveToTop();
  selected.getLayer().draw();
};
$("#btnSendBack").onclick = () => {
  if(!selected) return;
  selected.moveToBottom();
  selected.getLayer().draw();
};

$("#btnSave").onclick = saveToLocal;
$("#btnLoad").onclick = () => {
  const json = $("#txtTemplate").value.trim();
  if(!json) return setStatus($("#status"), "err", "Box JSON trống.");
  try{
    localStorage.setItem(LS_KEYS.TEMPLATE_JSON, json);
    loadFromLocal();
  }catch(e){
    setStatus($("#status"), "err", "Không lưu được: " + e.message);
  }
};
$("#btnReset").onclick = resetSample;

// init
const saved = localStorage.getItem(LS_KEYS.TEMPLATE_JSON);
if(saved){
  $("#txtTemplate").value = saved;
  loadFromLocal();
} else {
  ensureSampleTemplate(stage, label);
  $("#txtTemplate").value = stage.toJSON();
  saveToLocal();
}
