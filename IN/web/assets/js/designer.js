import { LS_KEYS, DEFAULTS } from "./app-config.js";
import { loadJSON, saveJSON, mmToPx, setStatus, gramsToSuffix, calcAmount } from "./utils.js";
import { ensureSampleTemplate, substituteTextNodes, setBarcodeImage } from "./template.js";

const $ = (s) => document.querySelector(s);
const Konva = window.Konva;

let settings = loadJSON(LS_KEYS.SETTINGS, DEFAULTS.settings);
let label = settings.label;

let stage = null;
let designLayer = null;   // layer dùng để thiết kế
let tr = null;
let selected = null;

const SAMPLE_A = { name:"Thịt bò", grams:560, price:10000, base:"123456" };
const SAMPLE_B = { name:"Nem chua", grams:500, price:8400,  base:"123456" };
let sample = SAMPLE_A;

// ===== Utilities that DO NOT depend on "designLayer" =====
function getBestLayerFromStage(stg){
  const layers = stg.getChildren().filter(n => n.className === "Layer");
  if(layers.length === 0) return null;
  // chọn layer có nhiều children nhất
  layers.sort((a,b) => (b.getChildren().length - a.getChildren().length));
  return layers[0];
}

function stageHasDesignNodes(stg){
  const nodes = stg.find((n) => {
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

  // XÓA transformer ở mọi layer
  tmpStage.find("Transformer").forEach(t => t.destroy());

  // Nếu có nhiều layer, chỉ giữ layer có nhiều children nhất
  const best = getBestLayerFromStage(tmpStage);
  const layers = tmpStage.getChildren().filter(n => n.className === "Layer");
  layers.forEach(l => { if(l !== best) l.destroy(); });

  const cleanJson = tmpStage.toJSON();
  tmpStage.destroy();
  tmpDiv.remove();
  return cleanJson;
}

function updateLabelBadges(){
  $("#lblSize").textContent = `${label.width_mm}×${label.height_mm}mm`;
  $("#lblDpi").textContent  = `${label.dpi} DPI`;
}

function buildFreshStage(){
  const w = mmToPx(label.width_mm, label.dpi);
  const h = mmToPx(label.height_mm, label.dpi);

  $("#stage").innerHTML = "";

  stage = new Konva.Stage({ container: "stage", width: w, height: h });

  designLayer = new Konva.Layer();
  stage.add(designLayer);

  tr = new Konva.Transformer({
    rotateEnabled: true,
    enabledAnchors: ["top-left","top-right","bottom-left","bottom-right"],
    boundBoxFunc: (oldBox, newBox) => {
      if(newBox.width < 20 || newBox.height < 20) return oldBox;
      return newBox;
    }
  });
  designLayer.add(tr);
  designLayer.draw();

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
      const next = prompt("Sửa template text (có thể dùng {{name}}...):", current);
      if(next !== null){
        node.setAttr("_tpl", next);
        node.text(next);
        node.getLayer().draw();
        if(selected === node) $("#txtProps").value = JSON.stringify(node.attrs, null, 2);
        renderLiveIfNeeded().catch(()=>{});
      }
    }
  });

  // kéo-thả xong -> nếu live đang bật thì render lại ngay
  stage.on("dragend transformend", () => {
    renderLiveIfNeeded().catch(()=>{});
  });
}

function selectNode(node){
  selected = node;
  tr.nodes(node ? [node] : []);
  designLayer.draw();
  $("#txtProps").value = node ? JSON.stringify(node.attrs, null, 2) : "";
}

function resetSample(){
  buildFreshStage();
  ensureSampleTemplate(stage, label); // tạo bg/text/barcode node
  saveTemplate();
  setStatus($("#status"), "ok", "Reset mẫu xong. Kéo-thả trực tiếp trên khung.");
  renderLiveIfNeeded().catch(()=>{});
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

    const bestLayer = getBestLayerFromStage(tmpStage);
    if(bestLayer){
      bestLayer.getChildren().forEach(n => {
        if(n.className === "Transformer") return;
        if(typeof n.draggable === "function") n.draggable(true);
        designLayer.add(n);
      });
    }

    designLayer.add(tr);
    designLayer.draw();

    tmpStage.destroy();
    tmpDiv.remove();

    $("#txtTemplate").value = json;

    return stageHasDesignNodes(stage);
  }catch(e){
    setStatus($("#status"), "err", "Load template lỗi: " + e.message);
    return false;
  }
}

function parsePreset(v){
  const m = String(v).match(/^(\d+)x(\d+)@(\d+)$/);
  if(!m) return null;
  return { width_mm: Number(m[1]), height_mm: Number(m[2]), dpi: Number(m[3]) };
}

function applyNewLabel(newLabel, scaleObjects){
  const oldW = stage.width();
  const oldH = stage.height();

  // Lấy sạch template hiện tại (để scale ổn định)
  const clean = sanitizeStageForSave(stage);

  label = { ...newLabel };
  settings.label = { ...newLabel };
  saveJSON(LS_KEYS.SETTINGS, settings);
  updateLabelBadges();

  buildFreshStage();

  // load lại từ clean json
  const tmp = Konva.Node.create(clean, document.createElement("div"));
  const l = getBestLayerFromStage(tmp);
  if(l){
    const nodes = l.getChildren().filter(n => n.className !== "Transformer");
    const sx = stage.width() / oldW;
    const sy = stage.height() / oldH;

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
      designLayer.add(n);
    });
  }

  tmp.destroy();

  designLayer.add(tr);
  designLayer.draw();

  saveTemplate();
  renderLiveIfNeeded().catch(()=>{});
}

// ===== LIVE PREVIEW on the SAME canvas =====
// Ý tưởng: giữ _tpl là template gốc. Khi live bật -> set text = substituted.
// Tắt live -> trả về _tpl. Barcode_img thì set theo barcode thực.
function getVarsFromUI(){
  const name = ($("#pv_name").value || "").trim() || "Thịt bò";
  const grams = Number($("#pv_grams").value || 560);
  const price = Number($("#pv_price").value || 10000);
  const base  = ($("#pv_base").value || "").trim() || "123456";

  const suffix = gramsToSuffix(grams);
  const barcode = `${base}T${suffix}`;
  const amount = calcAmount(price, grams);

  return {
    name,
    weight_g: grams,
    weight_kg: Number((grams/1000).toFixed(2)),
    amount,
    barcode
  };
}

function restoreTemplateText(){
  stage.find("Text").forEach(t => {
    const tpl = t.getAttr("_tpl");
    if(tpl !== undefined && tpl !== null){
      t.text(String(tpl));
    }
  });
}

async function renderLive(){
  if(!stageHasDesignNodes(stage)) return;

  const vars = getVarsFromUI();

  // thay text theo vars
  substituteTextNodes(stage, vars);

  // set barcode image
  await setBarcodeImage(stage, vars.barcode);

  stage.draw();
  setStatus($("#status"), "ok", `Live Preview: ${vars.barcode}`);
}

async function renderLiveIfNeeded(){
  const on = $("#chkLive").checked;
  if(on){
    await renderLive();
  }else{
    restoreTemplateText();
    stage.draw();
    setStatus($("#status"), "ok", "Đang ở chế độ thiết kế (template).");
  }
}

// ===== Export PNG =====
function exportPNG(){
  try{
    const dataUrl = stage.toDataURL({ pixelRatio: 2 });
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = "label.png";
    a.click();
  }catch(e){
    setStatus($("#status"), "err", "Export lỗi: " + e.message);
  }
}

// ===== UI wiring =====
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

function addText(text){
  const t = new Konva.Text({
    x: 16, y: 16,
    text,
    fontSize: 22,
    fill: "#ffffff",
    draggable: true
  });
  t.setAttr("_tpl", text);
  designLayer.add(t);
  designLayer.draw();
  selectNode(t);
}

function addBarcode(){
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
  designLayer.add(r);

  const imgNode = new Konva.Image({
    x: 18, y: stageH - 62,
    width: stageW - 36,
    height: 40,
    name: "barcode_img",
    draggable: true
  });
  designLayer.add(imgNode);

  const v = new Konva.Text({
    x: 18, y: stageH - 20,
    text: "{{barcode}}",
    fontSize: 12,
    fill: "rgba(255,255,255,0.70)",
    name: "txt_barcode_value",
    draggable: true
  });
  v.setAttr("_tpl", "{{barcode}}");
  designLayer.add(v);

  designLayer.draw();
  selectNode(imgNode);
}

function init(){
  // defaults
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

  // live events
  $("#chkLive").onchange = () => renderLiveIfNeeded().catch(()=>{});
  ["pv_name","pv_grams","pv_price","pv_base"].forEach(id => {
    $("#"+id).addEventListener("input", () => renderLiveIfNeeded().catch(()=>{}));
  });

  renderLiveIfNeeded().catch(()=>{});
}

// Buttons
$("#btnAddText").onclick   = () => { addText("Text..."); renderLiveIfNeeded().catch(()=>{}); };
$("#btnAddPrice").onclick  = () => { addText("¥{{amount}}"); renderLiveIfNeeded().catch(()=>{}); };
$("#btnAddWeight").onclick = () => { addText("{{weight_kg}}kg"); renderLiveIfNeeded().catch(()=>{}); };
$("#btnAddBarcode").onclick= () => { addBarcode(); renderLiveIfNeeded().catch(()=>{}); };

$("#btnDelete").onclick = () => {
  if(!selected) return;
  const n = selected;
  selectNode(null);
  n.destroy();
  designLayer.draw();
  renderLiveIfNeeded().catch(()=>{});
};

$("#btnApplyProps").onclick = () => {
  if(!selected) return;
  try{
    const obj = JSON.parse($("#txtProps").value || "{}");
    selected.setAttrs(obj);
    if(selected.className === "Text" && obj.text !== undefined){
      selected.setAttr("_tpl", obj.text);
    }
    designLayer.draw();
    setStatus($("#status"), "ok", "Applied attrs.");
    renderLiveIfNeeded().catch(()=>{});
  }catch(e){
    setStatus($("#status"), "err", "JSON attrs sai: " + e.message);
  }
};

$("#btnBringFront").onclick = () => {
  if(!selected) return;
  selected.moveToTop();
  designLayer.add(tr);
  designLayer.draw();
  renderLiveIfNeeded().catch(()=>{});
};

$("#btnSendBack").onclick = () => {
  if(!selected) return;
  selected.moveToBottom();
  designLayer.add(tr);
  designLayer.draw();
  renderLiveIfNeeded().catch(()=>{});
};

$("#btnSave").onclick = () => { saveTemplate(); };
$("#btnLoad").onclick = () => {
  const json = $("#txtTemplate").value.trim();
  if(!json) return setStatus($("#status"), "err", "Box JSON trống.");
  localStorage.setItem(LS_KEYS.TEMPLATE_JSON, json);
  const ok = loadTemplateFromLocal();
  if(!ok) resetSample();
  renderLiveIfNeeded().catch(()=>{});
};
$("#btnReset").onclick = () => resetSample();
$("#btnExportPng").onclick = () => exportPNG();

$("#btnSampleAlt").onclick = () => {
  sample = (sample === SAMPLE_A) ? SAMPLE_B : SAMPLE_A;
  $("#pv_name").value = sample.name;
  $("#pv_grams").value = sample.grams;
  $("#pv_price").value = sample.price;
  $("#pv_base").value = sample.base;
  renderLiveIfNeeded().catch(()=>{});
};

init();
