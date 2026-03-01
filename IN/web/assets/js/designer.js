import { LS_KEYS, DEFAULTS } from "./app-config.js";
import {
  loadJSON, saveJSON, mmToPx, setStatus,
  gramsToSuffix, calcAmount
} from "./utils.js";
import {
  ensureSampleTemplate, substituteTextNodes, setBarcodeImage
} from "./template.js";

const $ = (s) => document.querySelector(s);
const Konva = window.Konva;

let settings = loadJSON(LS_KEYS.SETTINGS, DEFAULTS.settings);
let label = settings.label;

let stage = null;
let layer = null;
let tr = null;
let selected = null;

// ---------- Preview sample toggles ----------
const SAMPLE_A = { name: "Thịt bò", grams: 560, price: 10000, base: "123456" };
const SAMPLE_B = { name: "Nem chua", grams: 500, price: 8400, base: "123456" };
let sample = SAMPLE_A;

// ---------- Helpers ----------
function updateLabelBadges(){
  $("#lblSize").textContent = `${label.width_mm}×${label.height_mm}mm`;
  $("#lblDpi").textContent  = `${label.dpi} DPI`;
}

function buildFreshStage(){
  const w = mmToPx(label.width_mm, label.dpi);
  const h = mmToPx(label.height_mm, label.dpi);

  const container = document.getElementById("stage");
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
      const current = node.text();
      const next = prompt("Sửa text:", current);
      if(next !== null){
        node.text(next);
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
    fontSize: 24,
    fill: "#ffffff",
    draggable: true
  });
  layer.add(t);
  layer.draw();
  selectNode(t);
}

function addBarcode(){
  const stageW = stage.width();
  const stageH = stage.height();

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

function getAllDesignNodes(){
  // all nodes except transformer
  return layer.getChildren().filter(n => n.className !== "Transformer");
}

function applyNewLabel(newLabel, scaleObjects){
  // keep old stage size for scaling reference
  const oldW = stage.width();
  const oldH = stage.height();

  label = { ...newLabel };
  settings.label = { ...newLabel };
  saveJSON(LS_KEYS.SETTINGS, settings);
  updateLabelBadges();

  const nodes = getAllDesignNodes().map(n => n); // capture existing
  const jsonBefore = stage.toJSON(); // for safety

  // rebuild stage
  buildFreshStage();

  // re-add nodes (optionally scale)
  const newW = stage.width();
  const newH = stage.height();

  const sx = newW / oldW;
  const sy = newH / oldH;

  nodes.forEach(n => {
    if(scaleObjects){
      // scale position + size-ish
      n.x(n.x() * sx);
      n.y(n.y() * sy);

      // for shapes/text/images, scale width/height or fontSize via scale
      // simplest: apply node.scaleX/Y multiplier
      const curSX = n.scaleX ? n.scaleX() : 1;
      const curSY = n.scaleY ? n.scaleY() : 1;
      if(typeof n.scaleX === "function") n.scaleX(curSX * sx);
      if(typeof n.scaleY === "function") n.scaleY(curSY * sy);

      // Some nodes might have explicit width/height (Text uses width sometimes)
      if(typeof n.width === "function" && n.width() > 0) n.width(n.width() * sx);
      if(typeof n.height === "function" && n.height() > 0) n.height(n.height() * sy);

      // Text: fontSize scale nicer
      if(n.className === "Text" && typeof n.fontSize === "function"){
        n.fontSize(Math.max(8, Math.round(n.fontSize() * ((sx+sy)/2))));
        // reset scale for text to avoid double scaling look
        if(typeof n.scaleX === "function") n.scaleX(1);
        if(typeof n.scaleY === "function") n.scaleY(1);
      }
    }

    // ensure draggable
    if(typeof n.draggable === "function") n.draggable(true);
    layer.add(n);
  });

  layer.add(tr);
  layer.draw();

  // update template box + save to local
  $("#txtTemplate").value = stage.toJSON();
  localStorage.setItem(LS_KEYS.TEMPLATE_JSON, stage.toJSON());

  setStatus($("#status"), "ok",
    `Đã đổi size → ${label.width_mm}×${label.height_mm}mm @${label.dpi}dpi` +
    (scaleObjects ? " (scaled objects)" : "")
  );

  refreshPreview().catch(()=>{});
}

function parsePreset(v){
  // "50x30@203"
  const m = String(v).match(/^(\d+)x(\d+)@(\d+)$/);
  if(!m) return null;
  return { width_mm: Number(m[1]), height_mm: Number(m[2]), dpi: Number(m[3]) };
}


    function sanitizeStageForSave(srcStage){
  const json = srcStage.toJSON();

  const tmpDiv = document.createElement("div");
  tmpDiv.style.position = "absolute";
  tmpDiv.style.left = "-99999px";
  tmpDiv.style.top = "-99999px";
  document.body.appendChild(tmpDiv);

  const tmpStage = Konva.Node.create(json, tmpDiv);

  tmpStage.find("Transformer").forEach(t => t.destroy());

  const cleanJson = tmpStage.toJSON();
  tmpStage.destroy();
  tmpDiv.remove();

  return cleanJson;
}

function stageHasDesignNodes(s){
  const layer = s.getChildren().find(n => n.className === "Layer");
  if(!layer) return false;
  const nodes = layer.getChildren().filter(n => n.className !== "Transformer");
  return nodes.length > 0;
}

function saveTemplate(){
  if(!stageHasDesignNodes(stage)){
    setStatus($("#status"), "err", "Template đang rỗng (chỉ có Transformer).");
    return;
  }

  const cleanJson = sanitizeStageForSave(stage);
  localStorage.setItem(LS_KEYS.TEMPLATE_JSON, cleanJson);
  $("#txtTemplate").value = cleanJson;

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

    return stageHasDesignNodes(stage);
  }catch(e){
    setStatus($("#status"), "err", "Load template lỗi: " + e.message);
    return false;
  }
}

async function refreshPreview(){
  try{
    if(!stageHasDesignNodes(stage)){
      setStatus($("#status"), "err", "Template rỗng.");
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

    const dataUrl = tmpStage.toDataURL({ pixelRatio: 2 });
    $("#previewImg").src = dataUrl;

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

  // Set current preset selection if matches
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

    // default: scale objects when changing preset
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

$("#btnSave").onclick = () => {
  saveTemplate();
  refreshPreview().catch(()=>{});
};

$("#btnLoad").onclick = () => {
  const json = $("#txtTemplate").value.trim();
  if(!json) return setStatus($("#status"), "err", "Box JSON trống.");
  localStorage.setItem(LS_KEYS.TEMPLATE_JSON, json);
  const ok = loadTemplateFromLocal();
  if(!ok) resetSample();
  refreshPreview().catch(()=>{});
};

$("#btnReset").onclick = () => {
  resetSample();
  refreshPreview().catch(()=>{});
};

$("#btnPreview").onclick = () => refreshPreview();

$("#btnPreviewAlt").onclick = () => {
  sample = (sample === SAMPLE_A) ? SAMPLE_B : SAMPLE_A;
  $("#pv_name").value = sample.name;
  $("#pv_grams").value = sample.grams;
  $("#pv_price").value = sample.price;
  $("#pv_base").value = sample.base;
  refreshPreview().catch(()=>{});
};

// ---------- Init ----------
function init(){
  // Ensure UI values from last time
  $("#pv_name").value = sample.name;
  $("#pv_grams").value = sample.grams;
  $("#pv_price").value = sample.price;
  $("#pv_base").value = sample.base;

  updateLabelBadges();
  buildFreshStage();

  // Load template
  const ok = loadTemplateFromLocal();
  if(!ok){
    resetSample();
  }

  // If template loaded but empty (chỉ transformer)
  const hasRealNodes = getAllDesignNodes().length > 0;
  if(!hasRealNodes){
    resetSample();
  }

  initSizeUI();
  refreshPreview().catch(()=>{});
}

init();
