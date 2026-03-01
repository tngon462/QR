// IN/web/assets/js/designer.js
import { LS_KEYS, DEFAULTS } from "./app-config.js";
import { loadJSON, saveJSON, mmToPx, setStatus } from "./utils.js";
import { ensureSampleTemplate, substituteTextNodes, setBarcodeImage } from "./template.js";

const $ = (s) => document.querySelector(s);
const Konva = window.Konva;

let settings = loadJSON(LS_KEYS.SETTINGS, DEFAULTS.settings);
let label = settings.label;

let stage, layer, tr, selected;

// preview sample
const SAMPLE_A = { name: "Thịt bò", grams: 560, price: 10000, base: "123456" };
const SAMPLE_B = { name: "Nem chua", grams: 500, price: 8400, base: "123456" };
let sample = SAMPLE_A;

// ----- business helpers (local for designer preview) -----
function gramsToSuffix(grams){
  const n = Math.round(Number(grams)/10);
  return String(n).padStart(3,"0");
}
function calcAmount(pricePerKg, grams){
  const raw = Math.round(Number(pricePerKg) * Number(grams) / 1000);
  return Math.round(raw/10)*10;
}

function updateLabelBadges(){
  $("#lblSize").textContent = `${label.width_mm}×${label.height_mm}mm`;
  $("#lblDpi").textContent  = `${label.dpi} DPI`;
}

function buildFreshStage(){
  const w = mmToPx(label.width_mm, label.dpi);
  const h = mmToPx(label.height_mm, label.dpi);

  const container = $("#stage");
  container.innerHTML = "";

  stage = new Konva.Stage({ container: "stage", width: w, height: h });
  layer = new Konva.Layer();
  stage.add(layer);

  tr = new Konva.Transformer({
    rotateEnabled: true,
    enabledAnchors: ["top-left","top-right","bottom-left","bottom-right"],
    boundBoxFunc: (oldBox, newBox) => {
      if(newBox.width < 20 || newBox.height < 20) return oldBox;
      return newBox;
    }
  });
  layer.add(tr);
  layer.draw();

  bindInteractions();
}

function bindInteractions(){
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
      const current = node.getAttr("_tpl") ?? node.text();
      const next = prompt("Sửa text (có thể dùng {{name}}...):", current);
      if(next !== null){
        node.setAttr("_tpl", next);
        node.text(next); // will be substituted in preview
        node.getLayer().draw();
        if(selected === node) $("#txtProps").value = JSON.stringify(node.attrs, null, 2);
        refreshPreview().catch(()=>{});
      }
    }
  });
}

function selectNode(node){
  selected = node;
  tr.nodes(node ? [node] : []);
  layer.draw();
  $("#txtProps").value = node ? JSON.stringify(node.attrs, null, 2) : "";
}

function getAllDesignNodes(){
  return layer.getChildren().filter(n => n.className !== "Transformer");
}

function stageHasDesignNodes(s){
  // Đếm tất cả node "thật" trên mọi layer (không tính Stage/Layer/Transformer)
  const nodes = s.find((n) => {
    const cn = n.className;
    return cn !== "Stage" && cn !== "Layer" && cn !== "Transformer";
  });
  return nodes.length > 0;
}

function sanitizeStageForSave(srcStage){
  const json = srcStage.toJSON();

  const tmpDiv = document.createElement("div");
  tmpDiv.style.position = "absolute";
  tmpDiv.style.left = "-99999px";
  tmpDiv.style.top = "-99999px";
  document.body.appendChild(tmpDiv);

  const tmpStage = Konva.Node.create(json, tmpDiv);

  // Xóa Transformer ở TẤT CẢ layer (ko chỉ layer đầu tiên)
  tmpStage.find("Transformer").forEach(t => t.destroy());

  const cleanJson = tmpStage.toJSON();
  tmpStage.destroy();
  tmpDiv.remove();

  return cleanJson;
}

function saveTemplate(){
  if(!stageHasDesignNodes(stage)){
    setStatus($("#status"), "err", "Template rỗng. Bấm Reset Sample rồi thiết kế lại.");
    return;
  }
  const clean = sanitizeStageForSave(stage);
  localStorage.setItem(LS_KEYS.TEMPLATE_JSON, clean);
  $("#txtTemplate").value = clean;
  setStatus($("#status"), "ok", "Đã lưu template.");
}

function loadTemplateFromLocal(){
  const json = localStorage.getItem(LS_KEYS.TEMPLATE_JSON);
  if(!json) return false;

  try{
    buildFreshStage();

    const tmpDiv = document.createElement("div");
    tmpDiv.style.position = "absolute";
    tmpDiv.style.left = "-99999px";
    tmpDiv.style.top = "-99999px";
    document.body.appendChild(tmpDiv);

    const tmpStage = Konva.Node.create(json, tmpDiv);
    const tmpLayer = tmpStage.getChildren().find(n => n.className === "Layer");

    if(tmpLayer){
      tmpLayer.getChildren().forEach(n => {
        if(n.className === "Transformer") return;
        if(typeof n.draggable === "function") n.draggable(true);
        layer.add(n);
      });
      layer.add(tr);
      layer.draw();
    }

    tmpStage.destroy();
    tmpDiv.remove();

    $("#txtTemplate").value = json;

    if(getAllDesignNodes().length === 0){
      setStatus($("#status"), "err", "Template lưu đang rỗng. Reset Sample rồi Save lại.");
      return false;
    }
    return true;
  }catch(e){
    setStatus($("#status"), "err", "Load template lỗi: " + e.message);
    return false;
  }
}

function resetSample(){
  buildFreshStage();
  ensureSampleTemplate(stage, label);
  saveTemplate();
  setStatus($("#status"), "ok", "Reset mẫu xong (kéo-thả được).");
}

function addText(text){
  const t = new Konva.Text({
    x: 16, y: 16,
    text,
    fontSize: 22,
    fill: "#ffffff",
    draggable: true
  });
  t.setAttr("_tpl", text);
  layer.add(t);
  layer.draw();
  selectNode(t);
}

function addBarcode(){
  // just call sample-template add: create minimal barcode group
  const stageW = stage.width();
  const stageH = stage.height();

  const r = new Konva.Rect({
    x: 10, y: stageH - 70,
    width: stageW - 20,
    height: 60,
    stroke: "rgba(255,255,255,0.18)",
    strokeWidth: 2,
    cornerRadius: 10,
    name: "barcode_box",
    draggable: true
  });
  layer.add(r);

  const imgNode = new Konva.Image({
    x: 18, y: stageH - 62,
    width: stageW - 36,
    height: 40,
    name: "barcode_img",
    draggable: true
  });
  layer.add(imgNode);

  const v = new Konva.Text({
    x: 18, y: stageH - 20,
    text: "{{barcode}}",
    fontSize: 12,
    fill: "rgba(255,255,255,0.70)",
    name: "txt_barcode_value",
    draggable: true
  });
  v.setAttr("_tpl", "{{barcode}}");
  layer.add(v);

  layer.draw();
  selectNode(imgNode);
}

function parsePreset(v){
  const m = String(v).match(/^(\d+)x(\d+)@(\d+)$/);
  if(!m) return null;
  return { width_mm: Number(m[1]), height_mm: Number(m[2]), dpi: Number(m[3]) };
}

function applyNewLabel(newLabel, scaleObjects){
  const oldW = stage.width();
  const oldH = stage.height();
  const nodes = getAllDesignNodes().map(n => n);

  label = { ...newLabel };
  settings.label = { ...newLabel };
  saveJSON(LS_KEYS.SETTINGS, settings);
  updateLabelBadges();

  buildFreshStage();

  const newW = stage.width();
  const newH = stage.height();
  const sx = newW / oldW;
  const sy = newH / oldH;

  nodes.forEach(n => {
    if(scaleObjects){
      n.x(n.x() * sx);
      n.y(n.y() * sy);

      if(typeof n.scaleX === "function") n.scaleX((n.scaleX() || 1) * sx);
      if(typeof n.scaleY === "function") n.scaleY((n.scaleY() || 1) * sy);

      if(n.className === "Text" && typeof n.fontSize === "function"){
        n.fontSize(Math.max(8, Math.round(n.fontSize() * ((sx+sy)/2))));
        n.scaleX(1); n.scaleY(1);
      }
    }
    if(typeof n.draggable === "function") n.draggable(true);
    layer.add(n);
  });

  layer.add(tr);
  layer.draw();

  // save sanitized template after resize
  saveTemplate();
  refreshPreview().catch(()=>{});
}

async function refreshPreview(){
  try{
    if(getAllDesignNodes().length === 0){
      setStatus($("#status"), "err", "Template rỗng. Bấm Reset Sample rồi thiết kế lại.");
      return;
    }

    const name = $("#pv_name").value.trim();
    const grams = Number($("#pv_grams").value || 0);
    const price = Number($("#pv_price").value || 0);
    const base  = $("#pv_base").value.trim() || "123456";

    const suffix = gramsToSuffix(grams);
    const barcode = `${base}T${suffix}`;
    const amount = calcAmount(price, grams);

    const vars = {
      name,
      weight_g: grams,
      weight_kg: Number((grams/1000).toFixed(2)),
      amount,
      barcode
    };

    const cleanJson = sanitizeStageForSave(stage);

    const container = document.getElementById("previewStage");
    container.innerHTML = "";

    const tmpStage = Konva.Node.create(cleanJson, "previewStage");
    substituteTextNodes(tmpStage, vars);
    await setBarcodeImage(tmpStage, vars.barcode);
    tmpStage.draw();

    $("#previewImg").src = tmpStage.toDataURL({ pixelRatio: 2 });

    tmpStage.destroy();
    container.innerHTML = "";

    setStatus($("#status"), "ok", `Preview OK: ${barcode}`);
  }catch(e){
    setStatus($("#status"), "err", "Preview lỗi: " + e.message);
  }
}

// ---------- UI wiring ----------
function initSizeUI(){
  updateLabelBadges();

  const presetStr = `${label.width_mm}x${label.height_mm}@${label.dpi}`;
  const presetEl = $("#sizePreset");
  const options = Array.from(presetEl.options).map(o => o.value);

  if(options.includes(presetStr)){
    presetEl.value = presetStr;
    $("#customSizeBox").style.display = "none";
  }else{
    presetEl.value = "custom";
    $("#customSizeBox").style.display = "block";
  }

  $("#wmm").value = label.width_mm;
  $("#hmm").value = label.height_mm;
  $("#dpi").value = label.dpi;

  presetEl.onchange = () => {
    const v = presetEl.value;
    if(v === "custom"){
      $("#customSizeBox").style.display = "block";
      return;
    }
    $("#customSizeBox").style.display = "none";
    const nl = parsePreset(v);
    if(!nl) return;
    applyNewLabel(nl, true);
  };

  $("#btnApplySize").onclick = () => {
    const nl = {
      width_mm: Number($("#wmm").value || 50),
      height_mm: Number($("#hmm").value || 30),
      dpi: Number($("#dpi").value || 203),
    };
    applyNewLabel(nl, false);
  };

  $("#btnScaleToNew").onclick = () => {
    const nl = {
      width_mm: Number($("#wmm").value || 50),
      height_mm: Number($("#hmm").value || 30),
      dpi: Number($("#dpi").value || 203),
    };
    applyNewLabel(nl, true);
  };
}

function init(){
  $("#pv_name").value = sample.name;
  $("#pv_grams").value = sample.grams;
  $("#pv_price").value = sample.price;
  $("#pv_base").value = sample.base;

  buildFreshStage();

  const ok = loadTemplateFromLocal();
  if(!ok){
    resetSample();
  }

  initSizeUI();
  refreshPreview().catch(()=>{});
}

$("#btnAddText").onclick   = () => { addText("Text..."); refreshPreview().catch(()=>{}); };
$("#btnAddPrice").onclick  = () => { addText("¥{{amount}}"); refreshPreview().catch(()=>{}); };
$("#btnAddWeight").onclick = () => { addText("{{weight_kg}}kg"); refreshPreview().catch(()=>{}); };
$("#btnAddBarcode").onclick= () => { addBarcode(); refreshPreview().catch(()=>{}); };

$("#btnDelete").onclick = () => {
  if(!selected) return;
  const n = selected;
  selectNode(null);
  n.destroy();
  layer.draw();
  refreshPreview().catch(()=>{});
};

$("#btnApplyProps").onclick = () => {
  if(!selected) return;
  try{
    const obj = JSON.parse($("#txtProps").value || "{}");
    selected.setAttrs(obj);
    // if user edited text via props, keep _tpl in sync
    if(selected.className === "Text" && obj.text !== undefined){
      selected.setAttr("_tpl", obj.text);
    }
    layer.draw();
    setStatus($("#status"), "ok", "Applied attrs.");
    refreshPreview().catch(()=>{});
  }catch(e){
    setStatus($("#status"), "err", "JSON attrs sai: " + e.message);
  }
};

$("#btnBringFront").onclick = () => {
  if(!selected) return;
  selected.moveToTop();
  layer.add(tr);
  layer.draw();
  refreshPreview().catch(()=>{});
};

$("#btnSendBack").onclick = () => {
  if(!selected) return;
  selected.moveToBottom();
  layer.add(tr);
  layer.draw();
  refreshPreview().catch(()=>{});
};

$("#btnSave").onclick = () => { saveTemplate(); refreshPreview().catch(()=>{}); };

$("#btnLoad").onclick = () => {
  const json = $("#txtTemplate").value.trim();
  if(!json) return setStatus($("#status"), "err", "Box JSON trống.");
  localStorage.setItem(LS_KEYS.TEMPLATE_JSON, json);
  const ok = loadTemplateFromLocal();
  if(!ok) resetSample();
  refreshPreview().catch(()=>{});
};

$("#btnReset").onclick = () => { resetSample(); refreshPreview().catch(()=>{}); };
$("#btnPreview").onclick = () => refreshPreview();

$("#btnPreviewAlt").onclick = () => {
  sample = (sample === SAMPLE_A) ? SAMPLE_B : SAMPLE_A;
  $("#pv_name").value = sample.name;
  $("#pv_grams").value = sample.grams;
  $("#pv_price").value = sample.price;
  $("#pv_base").value = sample.base;
  refreshPreview().catch(()=>{});
};

init();
