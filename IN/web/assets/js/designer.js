import { LS_KEYS, DEFAULTS } from "./app-config.js";
import { loadJSON, saveJSON, mmToPx, setStatus, gramsToSuffix, calcAmount } from "./utils.js";
import { ensureSampleTemplate, substituteTextNodes, setBarcodeImage } from "./template.js";
import {
  listTemplates,
  getTemplate,
  saveTemplate,
  deleteTemplateBySlug,
  exportTemplateFile,
  importTemplateObject,
  migrateLegacyIfNeeded,
  setLastUsed,
  getLastUsed,
} from "./template-store.js";

const $ = (s) => document.querySelector(s);
const Konva = window.Konva;

let settings = loadJSON(LS_KEYS.SETTINGS, DEFAULTS.settings);
let label = { ...settings.label, dpi: 203 }; // dpi fixed 203

let stage = null;
let designLayer = null;
let tr = null;
let selected = null;

// internal (non-user) background rect name
const BG_NAME = "__bg_white";

// current template slug loaded in designer (for dropdown state)
let currentSlug = "";

// Samples for live preview
const SAMPLE_A = { name:"Thịt bò", grams:560, price:10000, base:"123456", indo:"Daging sapi", myanma:"", japan:"牛肉", english:"Beef" };
const SAMPLE_B = { name:"Nem chua", grams:500, price:8400,  base:"123456", indo:"Nem asam", myanma:"", japan:"ネムチュア", english:"Fermented pork roll" };
let sample = SAMPLE_A;

function nowSec(){ return Math.floor(Date.now()/1000); }

function getBestLayerFromStage(stg){
  const layers = stg.getChildren().filter(n => n.className === "Layer");
  if(layers.length === 0) return null;
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

function ensureWhiteBackgroundLayer(stg){
  // create (or normalize) a white background rect at bottom
  const w = stg.width();
  const h = stg.height();
  let bg = stg.findOne(`.${BG_NAME}`) || stg.findOne((n)=>n.className==="Rect" && n.name && n.name()===BG_NAME);
  if(!bg){
    bg = new Konva.Rect({
      x: 0, y: 0, width: w, height: h,
      fill: "#ffffff",
      listening: false,
      draggable: false,
      name: BG_NAME,
    });
    // put into the biggest layer
    const best = getBestLayerFromStage(stg);
    if(best) best.add(bg);
    else {
      const layer = new Konva.Layer();
      stg.add(layer);
      layer.add(bg);
    }
  }else{
    bg.position({x:0,y:0});
    bg.size({width:w,height:h});
    if(typeof bg.fill === "function") bg.fill("#ffffff");
    if(typeof bg.listening === "function") bg.listening(false);
    if(typeof bg.draggable === "function") bg.draggable(false);
  }
  bg.moveToBottom();
}

function sanitizeStageForSave(srcStage){
  const json = srcStage.toJSON();

  const tmpDiv = document.createElement("div");
  tmpDiv.style.position = "absolute";
  tmpDiv.style.left = "-99999px";
  tmpDiv.style.top = "-99999px";
  document.body.appendChild(tmpDiv);

  const tmpStage = Konva.Node.create(json, tmpDiv);

  // remove transformers
  tmpStage.find("Transformer").forEach(t => t.destroy());

  // keep only the most "real" layer
  const best = getBestLayerFromStage(tmpStage);
  const layers = tmpStage.getChildren().filter(n => n.className === "Layer");
  layers.forEach(l => { if(l !== best) l.destroy(); });

  // enforce white background node exists in saved template
  ensureWhiteBackgroundLayer(tmpStage);

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

  // white background (default template requirement)
  const bg = new Konva.Rect({
    x: 0, y: 0, width: w, height: h,
    fill: "#ffffff",
    listening: false,
    draggable: false,
    name: BG_NAME,
  });
  designLayer.add(bg);
  bg.moveToBottom();

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
    // ignore background
    if(e.target && e.target.name && e.target.name() === BG_NAME) {
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

function addText(text){
  const t = new Konva.Text({
    x: 16, y: 16,
    text,
    fontSize: 22,
    fill: "#000000",      // default black
    draggable: true
  });
  t.setAttr("_tpl", text);
  designLayer.add(t);
  t.moveToTop();
  designLayer.add(tr);
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
    stroke: "rgba(0,0,0,0.25)",
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
    fill: "rgba(0,0,0,0.75)",
    name: "txt_barcode_value",
    draggable: true
  });
  v.setAttr("_tpl", "{{barcode}}");
  designLayer.add(v);

  designLayer.add(tr);
  designLayer.draw();
  selectNode(imgNode);
}

function resetSample(){
  buildFreshStage();
  ensureSampleTemplate(stage, label);

  // make sure background exists + default texts black (only if they are missing fill)
  stage.find("Text").forEach(t => {
    const fill = (typeof t.fill === "function") ? t.fill() : t.getAttr("fill");
    if(!fill || String(fill).toLowerCase() === "#ffffff") t.fill("#000000");
  });
  ensureWhiteBackgroundLayer(stage);

  // save as default template flow (prompt)
  setStatus($("#status"), "ok", "Reset mẫu xong. Kéo-thả trực tiếp trên khung.");
  renderLiveIfNeeded().catch(()=>{});
}

function validateLabel(nl){
  const w = Number(nl.width_mm);
  const h = Number(nl.height_mm);
  if(!Number.isFinite(w) || !Number.isFinite(h)) return "Size không hợp lệ.";
  if(w < 10 || h < 10) return "Min size là 10mm.";
  if(w > 150 || h > 100) return "Max size là 150×100mm.";
  return "";
}

function parsePreset(v){
  const m = String(v).match(/^(\d+)x(\d+)@(\d+)$/);
  if(!m) return null;
  return { width_mm: Number(m[1]), height_mm: Number(m[2]), dpi: 203 };
}

function applyNewLabel(newLabel, scaleObjects){
  const err = validateLabel(newLabel);
  if(err){
    setStatus($("#status"), "err", err);
    return;
  }

  const oldW = stage.width();
  const oldH = stage.height();

  const clean = sanitizeStageForSave(stage);

  label = { ...newLabel, dpi: 203 };
  settings.label = { ...settings.label, ...label };
  saveJSON(LS_KEYS.SETTINGS, settings);
  updateLabelBadges();

  buildFreshStage();

  const tmp = Konva.Node.create(clean, document.createElement("div"));
  const l = getBestLayerFromStage(tmp);
  if(l){
    const nodes = l.getChildren().filter(n => n.className !== "Transformer");
    const sx = stage.width() / oldW;
    const sy = stage.height() / oldH;

    nodes.forEach(n => {
      // never move/scale the background node
      if(n.name && n.name() === BG_NAME){
        // replace background in new stage instead
        return;
      }

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

  // keep legacy key updated for compatibility
  saveLegacyTemplateJsonFromStage();

  renderLiveIfNeeded().catch(()=>{});
}

function getVarsFromUI(){
  const name = ($("#pv_name").value || "").trim() || "Thịt bò";
  const grams = Number($("#pv_grams").value || 560);
  const price = Number($("#pv_price").value || 10000);
  const base  = ($("#pv_base").value || "").trim() || "123456";

  const indo   = ($("#pv_indo").value || "").trim();
  const myanma = ($("#pv_myanma").value || "").trim();
  const japan  = ($("#pv_japan").value || "").trim();
  const english= ($("#pv_english").value || "").trim();

  const suffix = gramsToSuffix(grams);
  const barcode = `${base}T${suffix}`;
  const amount = calcAmount(price, grams);

  return {
    name,
    weight_g: grams,
    weight_kg: Number((grams/1000).toFixed(2)),
    amount,
    barcode,
    indo,
    myanma,
    japan,
    english
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

  substituteTextNodes(stage, vars);
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

function exportPNG(){
  try{
    // always white background
    ensureWhiteBackgroundLayer(stage);
    const dataUrl = stage.toDataURL({ pixelRatio: 2, mimeType: "image/png" });
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = "label.png";
    a.click();
  }catch(e){
    setStatus($("#status"), "err", "Export lỗi: " + e.message);
  }
}

// ---------- Template Manager ----------
function refreshTemplateDropdown(){
  const sel = $("#tplSelect");
  const idx = listTemplates();

  sel.innerHTML = "";
  if(idx.length === 0){
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "(no templates)";
    sel.appendChild(opt);
    return;
  }

  idx.forEach(it => {
    const slug = (it?.name) ? it.name : "";
    const opt = document.createElement("option");
    // we use slugified name for actual storage key
    opt.value = slug;
    opt.textContent = it.name;
    sel.appendChild(opt);
  });

  // restore selection
  const lastSlug = currentSlug || getLastUsed();
  if(lastSlug){
    // lastSlug is stored as slug, but dropdown values are names; pick by slugify comparison
    const options = Array.from(sel.options);
    const found = options.find(o => o.value && window.__tplSlugify ? window.__tplSlugify(o.value) === lastSlug : false);
    // fallback: just select first
    if(found) sel.value = found.value;
    else sel.selectedIndex = 0;
  }else{
    sel.selectedIndex = 0;
  }
}

// We need slugify on client side in designer too (same logic as store)
function slugifyLocal(name){
  const base = String(name || "").trim() || "template";
  const noAcc = base.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const slug = noAcc.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0,80);
  return slug || ("tpl-" + nowSec());
}
// expose for dropdown restoration helper
window.__tplSlugify = slugifyLocal;

function getSelectedSlugFromDropdown(){
  const selVal = ($("#tplSelect").value || "").trim();
  if(!selVal) return "";
  return slugifyLocal(selVal);
}

function saveLegacyTemplateJsonFromStage(){
  if(!stageHasDesignNodes(stage)) return;
  const clean = sanitizeStageForSave(stage);
  localStorage.setItem(LS_KEYS.TEMPLATE_JSON, clean); // legacy key used previously
  $("#txtTemplate").value = clean;
}

async function actionSaveAs(){
  if(!stageHasDesignNodes(stage)){
    setStatus($("#status"), "err", "Template rỗng. Bấm Reset Sample rồi thiết kế lại.");
    return;
  }

  const defName = (() => {
    const sel = $("#tplSelect");
    if(sel && sel.value && sel.value !== "(no templates)") return sel.value;
    return "";
  })();

  const name = prompt("Nhập tên thiết kế để lưu:", defName || "");
  if(name === null) return;
  const trimmed = String(name).trim();
  if(!trimmed) return setStatus($("#status"), "err", "Tên template trống.");

  const clean = sanitizeStageForSave(stage);

  // first try without overwrite
  let res = saveTemplate({
    name: trimmed,
    label,
    templateJson: clean,
    overwrite: false,
  });

  if(!res.ok && res.reason === "exists"){
    const ok = confirm("Tên đã tồn tại. Overwrite không?");
    if(!ok) return;
    res = saveTemplate({
      name: trimmed,
      label,
      templateJson: clean,
      overwrite: true,
    });
  }

  // keep legacy key updated for compatibility
  localStorage.setItem(LS_KEYS.TEMPLATE_JSON, clean);

  currentSlug = res.slug;
  setLastUsed(res.slug);

  $("#txtTemplate").value = clean;
  setStatus($("#status"), "ok", `Đã lưu template: ${trimmed}`);
  refreshTemplateDropdown();
}

async function actionLoadSelected(){
  const slug = getSelectedSlugFromDropdown();
  if(!slug) return setStatus($("#status"), "err", "Chưa chọn template.");

  const tpl = getTemplate(slug);
  if(!tpl) return setStatus($("#status"), "err", "Không tìm thấy template này trong localStorage.");

  // apply label from template meta
  const metaLabel = tpl.meta?.label || { width_mm:50, height_mm:30, dpi:203 };
  const err = validateLabel(metaLabel);
  if(err) return setStatus($("#status"), "err", "Label size trong template không hợp lệ: " + err);

  label = { ...label, ...metaLabel, dpi: 203 };
  settings.label = { ...settings.label, ...label };
  saveJSON(LS_KEYS.SETTINGS, settings);
  updateLabelBadges();
  initSizeUI(); // sync UI preset/custom

  // rebuild stage with new size
  buildFreshStage();

  try{
    const tmpDiv = document.createElement("div");
    tmpDiv.style.position = "absolute";
    tmpDiv.style.left = "-99999px";
    tmpDiv.style.top = "-99999px";
    document.body.appendChild(tmpDiv);

    const tmpStage = Konva.Node.create(tpl.templateJson, tmpDiv);
    ensureWhiteBackgroundLayer(tmpStage);

    const bestLayer = getBestLayerFromStage(tmpStage);
    if(bestLayer){
      bestLayer.getChildren().forEach(n => {
        if(n.className === "Transformer") return;
        // skip template background rect (we already have ours)
        if(n.name && n.name() === BG_NAME) return;
        if(typeof n.draggable === "function") n.draggable(true);
        designLayer.add(n);
      });
    }

    designLayer.add(tr);
    designLayer.draw();

    tmpStage.destroy();
    tmpDiv.remove();

    // keep legacy key updated so print old path still works
    localStorage.setItem(LS_KEYS.TEMPLATE_JSON, tpl.templateJson);

    $("#txtTemplate").value = tpl.templateJson;

    currentSlug = slug;
    setLastUsed(slug);

    setStatus($("#status"), "ok", `Đã load: ${tpl.meta?.name || slug}`);
    await renderLiveIfNeeded();
  }catch(e){
    setStatus($("#status"), "err", "Load template lỗi: " + e.message);
  }
}

function actionDeleteSelected(){
  const slug = getSelectedSlugFromDropdown();
  if(!slug) return setStatus($("#status"), "err", "Chưa chọn template.");
  const tpl = getTemplate(slug);
  const name = tpl?.meta?.name || $("#tplSelect").value || slug;

  const ok = confirm(`Xóa template "${name}"?`);
  if(!ok) return;

  deleteTemplateBySlug(slug);
  if(currentSlug === slug) currentSlug = "";
  setStatus($("#status"), "ok", "Đã xóa.");
  refreshTemplateDropdown();
}

function actionDownloadSelected(){
  const slug = getSelectedSlugFromDropdown();
  if(!slug) return setStatus($("#status"), "err", "Chưa chọn template.");

  try{
    const { filename, content } = exportTemplateFile(slug);
    const blob = new Blob([content], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    setStatus($("#status"), "ok", "Đã tải file template.");
  }catch(e){
    setStatus($("#status"), "err", "Download lỗi: " + e.message);
  }
}

function actionUploadTemplate(){
  $("#tplFileInput").click();
}

async function handleFileImport(file){
  try{
    const text = await file.text();
    const obj = JSON.parse(text);

    // first attempt without overwrite; if exists => ask overwrite
    const baseName = obj?.meta?.name || file.name || "template";
    let overwrite = false;
    let res = importTemplateObject(obj, { overwrite:false, autoRename:false });

    if(!res.ok && res.reason === "exists"){
      overwrite = confirm(`Template "${baseName}" đã tồn tại. Overwrite không?\n(Nếu chọn Cancel, file sẽ được đổi tên tự động để tránh trùng)`);
      res = importTemplateObject(obj, { overwrite, autoRename: !overwrite });
    }

    refreshTemplateDropdown();

    const doLoad = confirm("Import xong. Load template này ngay không?");
    if(doLoad){
      // select by name (best effort)
      const sel = $("#tplSelect");
      const options = Array.from(sel.options);
      const found = options.find(o => slugifyLocal(o.value) === res.slug);
      if(found) sel.value = found.value;
      await actionLoadSelected();
    }else{
      setStatus($("#status"), "ok", "Import OK.");
    }
  }catch(e){
    setStatus($("#status"), "err", "Import lỗi: " + e.message);
  }finally{
    $("#tplFileInput").value = "";
  }
}

// ---------- Label size UI ----------
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
  $("#dpi").value = 203;

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
      dpi: 203,
    };
    applyNewLabel(nl, false);
  };

  $("#btnScaleToNew").onclick = () => {
    const nl = {
      width_mm: Number($("#wmm").value || 50),
      height_mm: Number($("#hmm").value || 30),
      dpi: 203,
    };
    applyNewLabel(nl, true);
  };
}

// ---------- init ----------
function init(){
  // migrate legacy single-template key (if exists)
  migrateLegacyIfNeeded({ defaultName: "default", labelFromSettings: settings.label });

  // fill sample inputs
  $("#pv_name").value = sample.name;
  $("#pv_grams").value = sample.grams;
  $("#pv_price").value = sample.price;
  $("#pv_base").value = sample.base;
  $("#pv_indo").value = sample.indo || "";
  $("#pv_myanma").value = sample.myanma || "";
  $("#pv_japan").value = sample.japan || "";
  $("#pv_english").value = sample.english || "";

  // init dropdown
  refreshTemplateDropdown();

  // build stage
  buildFreshStage();

  // auto-load last used if possible, else load legacy, else reset sample
  const lastSlug = getLastUsed();
  const idx = listTemplates();
  if(idx.length > 0){
    // try load last used
    if(lastSlug && getTemplate(lastSlug)){
      // set dropdown by matching slug and load
      const sel = $("#tplSelect");
      const found = Array.from(sel.options).find(o => slugifyLocal(o.value) === lastSlug);
      if(found) sel.value = found.value;
      actionLoadSelected().catch(()=>{});
    }else{
      // load first template
      const sel = $("#tplSelect");
      sel.selectedIndex = 0;
      actionLoadSelected().catch(()=>{});
    }
  }else{
    // no templates yet: try legacy key (for backward)
    const legacy = localStorage.getItem(LS_KEYS.TEMPLATE_JSON);
    if(legacy){
      // create 1 default template so print can use
      try{
        saveTemplate({ name:"default", label, templateJson: legacy, overwrite:true });
        refreshTemplateDropdown();
        setStatus($("#status"), "ok", "Đã migrate template cũ sang default.");
      }catch{}
    }else{
      resetSample();
    }
  }

  initSizeUI();

  $("#chkLive").onchange = () => renderLiveIfNeeded().catch(()=>{});
  [
    "pv_name","pv_grams","pv_price","pv_base",
    "pv_indo","pv_myanma","pv_japan","pv_english"
  ].forEach(id => $("#"+id).addEventListener("input", () => renderLiveIfNeeded().catch(()=>{})));

  // template manager events
  $("#btnTplSaveAs").onclick = () => actionSaveAs().catch(()=>{});
  $("#btnTplLoad").onclick = () => actionLoadSelected().catch(()=>{});
  $("#btnTplDelete").onclick = actionDeleteSelected;
  $("#btnTplDownload").onclick = actionDownloadSelected;
  $("#btnTplUpload").onclick = actionUploadTemplate;
  $("#tplFileInput").addEventListener("change", (e) => {
    const f = e.target.files && e.target.files[0];
    if(f) handleFileImport(f);
  });

  renderLiveIfNeeded().catch(()=>{});
}

// ---------- toolbox ----------
$("#btnAddText").onclick   = () => { addText("Text..."); renderLiveIfNeeded().catch(()=>{}); };
$("#btnAddPrice").onclick  = () => { addText("¥{{amount}}"); renderLiveIfNeeded().catch(()=>{}); };
$("#btnAddWeight").onclick = () => { addText("{{weight_kg}}kg"); renderLiveIfNeeded().catch(()=>{}); };
$("#btnAddBarcode").onclick= () => { addBarcode(); renderLiveIfNeeded().catch(()=>{}); };

$("#btnAddName").onclick    = () => { addText("{{name}}"); renderLiveIfNeeded().catch(()=>{}); };
$("#btnAddIndo").onclick    = () => { addText("{{indo}}"); renderLiveIfNeeded().catch(()=>{}); };
$("#btnAddMyanma").onclick  = () => { addText("{{myanma}}"); renderLiveIfNeeded().catch(()=>{}); };
$("#btnAddJapan").onclick   = () => { addText("{{japan}}"); renderLiveIfNeeded().catch(()=>{}); };
$("#btnAddEnglish").onclick = () => { addText("{{english}}"); renderLiveIfNeeded().catch(()=>{}); };

$("#btnDelete").onclick = () => {
  if(!selected) return;
  // prevent deleting background rect
  if(selected.name && selected.name() === BG_NAME) return;
  const n = selected;
  selectNode(null);
  n.destroy();
  designLayer.draw();
  renderLiveIfNeeded().catch(()=>{});
};

$("#btnApplyProps").onclick = () => {
  if(!selected) return;
  if(selected.name && selected.name() === BG_NAME) return;
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
  if(selected.name && selected.name() === BG_NAME) return;
  selected.moveToTop();
  designLayer.add(tr);
  designLayer.draw();
  renderLiveIfNeeded().catch(()=>{});
};

$("#btnSendBack").onclick = () => {
  if(!selected) return;
  if(selected.name && selected.name() === BG_NAME) return;
  selected.moveToBottom();
  // keep background at very bottom
  const bg = stage.findOne(`.${BG_NAME}`) || stage.findOne((n)=>n.className==="Rect" && n.name && n.name()===BG_NAME);
  if(bg) bg.moveToBottom();
  designLayer.add(tr);
  designLayer.draw();
  renderLiveIfNeeded().catch(()=>{});
};

// Legacy buttons keep working (but don't overwrite multi-template by accident)
$("#btnSave").onclick = () => actionSaveAs().catch(()=>{});
$("#btnLoad").onclick = () => {
  const json = $("#txtTemplate").value.trim();
  if(!json) return setStatus($("#status"), "err", "Box JSON trống.");
  // save to legacy key
  localStorage.setItem(LS_KEYS.TEMPLATE_JSON, json);
  setStatus($("#status"), "ok", "Đã lưu vào legacy key. (Khuyên dùng Save As để quản lý nhiều template)");
  // optionally load into canvas
  try{
    buildFreshStage();
    const tmpDiv = document.createElement("div");
    tmpDiv.style.position = "absolute";
    tmpDiv.style.left = "-99999px";
    tmpDiv.style.top = "-99999px";
    document.body.appendChild(tmpDiv);

    const tmpStage = Konva.Node.create(json, tmpDiv);
    ensureWhiteBackgroundLayer(tmpStage);
    const bestLayer = getBestLayerFromStage(tmpStage);

    if(bestLayer){
      bestLayer.getChildren().forEach(n => {
        if(n.className === "Transformer") return;
        if(n.name && n.name() === BG_NAME) return;
        if(typeof n.draggable === "function") n.draggable(true);
        designLayer.add(n);
      });
    }
    designLayer.add(tr);
    designLayer.draw();
    tmpStage.destroy();
    tmpDiv.remove();

    renderLiveIfNeeded().catch(()=>{});
  }catch(e){
    setStatus($("#status"), "err", "Load box lỗi: " + e.message);
  }
};
$("#btnReset").onclick = () => resetSample();
$("#btnExportPng").onclick = () => exportPNG();

$("#btnSampleAlt").onclick = () => {
  sample = (sample === SAMPLE_A) ? SAMPLE_B : SAMPLE_A;
  $("#pv_name").value = sample.name;
  $("#pv_grams").value = sample.grams;
  $("#pv_price").value = sample.price;
  $("#pv_base").value = sample.base;
  $("#pv_indo").value = sample.indo || "";
  $("#pv_myanma").value = sample.myanma || "";
  $("#pv_japan").value = sample.japan || "";
  $("#pv_english").value = sample.english || "";
  renderLiveIfNeeded().catch(()=>{});
};

init();
