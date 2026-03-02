// designer.js
import { LS_KEYS, DEFAULTS } from "./app-config.js";
import { loadJSON, saveJSON, mmToPx, setStatus } from "./utils.js";
import { ensureSampleTemplate, renderTemplateToDataURL } from "./template.js";

const $ = (s) => document.querySelector(s);
const Konva = window.Konva;

let settings = loadJSON(LS_KEYS.SETTINGS, DEFAULTS.settings);
let label = settings.label;

let stage, layer, tr, selected;

// ----- vars inputs -----
const SAMPLE = {
  name: "Thịt bò",
  weight_g: 560,
  weight_kg: 0.56,
  amount: 5600,
  barcode: "123456T056",
  indo: "Daging sapi",
  myanma: "",
  japan: "牛肉",
  english: "Beef",
};

// ---- helpers ----
function updateBadges() {
  $("#lblSize").textContent = `${label.width_mm}×${label.height_mm}mm`;
  $("#lblDpi").textContent = `${label.dpi} DPI`;
}

function buildStage() {
  const w = mmToPx(label.width_mm, label.dpi);
  const h = mmToPx(label.height_mm, label.dpi);

  $("#stage").innerHTML = "";
  stage = new Konva.Stage({ container: "stage", width: w, height: h });

  layer = new Konva.Layer();
  stage.add(layer);

  tr = new Konva.Transformer({
    rotateEnabled: true,
    enabledAnchors: ["top-left", "top-right", "bottom-left", "bottom-right"],
    boundBoxFunc: (oldBox, newBox) => {
      if (newBox.width < 20 || newBox.height < 20) return oldBox;
      return newBox;
    },
  });
  layer.add(tr);
  layer.draw();

  // events
  stage.on("click tap", (e) => {
    if (e.target === stage) return select(null);
    select(e.target);
  });

  stage.on("dblclick dbltap", (e) => {
    const node = e.target;
    if (!node || node.className !== "Text") return;
    const cur = node.getAttr("_tpl") ?? node.text();
    const next = prompt("Sửa text template (vd: {{name}} / ¥{{amount}} ...):", cur);
    if (next === null) return;
    node.setAttr("_tpl", next);
    node.text(next);
    layer.draw();
    if (selected === node) $("#txtProps").value = JSON.stringify(node.attrs, null, 2);
  });
}

function select(node) {
  selected = node;
  tr.nodes(node ? [node] : []);
  layer.draw();
  $("#txtProps").value = node ? JSON.stringify(node.attrs, null, 2) : "";
}

function getTemplateJsonClean() {
  // store only 1 layer, remove transformer
  const json = stage.toJSON();

  const tmpDiv = document.createElement("div");
  tmpDiv.style.position = "absolute";
  tmpDiv.style.left = "-99999px";
  tmpDiv.style.top = "-99999px";
  document.body.appendChild(tmpDiv);

  const tmpStage = Konva.Node.create(json, tmpDiv);
  tmpStage.find("Transformer").forEach((t) => t.destroy());

  // keep layer with most children
  const layers = tmpStage.getChildren().filter((n) => n.className === "Layer");
  layers.sort((a, b) => b.getChildren().length - a.getChildren().length);
  const keep = layers[0];
  layers.forEach((l) => {
    if (l !== keep) l.destroy();
  });

  const clean = tmpStage.toJSON();
  tmpStage.destroy();
  tmpDiv.remove();
  return clean;
}

function saveTemplate() {
  const clean = getTemplateJsonClean();
  localStorage.setItem(LS_KEYS.TEMPLATE_JSON, clean);
  $("#txtTemplate").value = clean;
  setStatus($("#status"), "ok", "Đã lưu template.");
}

function loadTemplate() {
  const json = localStorage.getItem(LS_KEYS.TEMPLATE_JSON);
  if (!json) return false;

  try {
    // rebuild stage, import nodes
    buildStage();

    const tmpDiv = document.createElement("div");
    tmpDiv.style.position = "absolute";
    tmpDiv.style.left = "-99999px";
    tmpDiv.style.top = "-99999px";
    document.body.appendChild(tmpDiv);

    const tmpStage = Konva.Node.create(json, tmpDiv);
    tmpStage.find("Transformer").forEach((t) => t.destroy());

    const layers = tmpStage.getChildren().filter((n) => n.className === "Layer");
    layers.sort((a, b) => b.getChildren().length - a.getChildren().length);
    const best = layers[0];

    if (best) {
      best.getChildren().forEach((n) => {
        if (typeof n.draggable === "function") n.draggable(true);
        layer.add(n);
      });
    }

    layer.add(tr);
    layer.draw();

    tmpStage.destroy();
    tmpDiv.remove();

    $("#txtTemplate").value = json;
    setStatus($("#status"), "ok", "Đã load template từ localStorage.");
    return true;
  } catch (e) {
    setStatus($("#status"), "err", "Load template lỗi: " + e.message);
    return false;
  }
}

function resetSample() {
  buildStage();
  ensureSampleTemplate(stage, label);
  saveTemplate();
  setStatus($("#status"), "ok", "Reset mẫu xong (kéo-thả trực tiếp).");
}

function addText(tpl) {
  const t = new Konva.Text({
    x: 16,
    y: 16,
    text: tpl,
    fontSize: 20,
    fill: "#ffffff",
    draggable: true,
  });
  t.setAttr("_tpl", tpl);
  layer.add(t);
  layer.draw();
  select(t);
}

function addBarcodeBlock() {
  const stageW = stage.width();
  const stageH = stage.height();

  const r = new Konva.Rect({
    x: 10,
    y: stageH - 72,
    width: stageW - 20,
    height: 62,
    stroke: "rgba(255,255,255,0.18)",
    strokeWidth: 2,
    cornerRadius: 10,
    draggable: true,
    name: "barcode_box",
  });
  layer.add(r);

  const img = new Konva.Image({
    x: 18,
    y: stageH - 64,
    width: stageW - 36,
    height: 40,
    draggable: true,
    name: "barcode_img",
  });
  layer.add(img);

  const v = new Konva.Text({
    x: 18,
    y: stageH - 22,
    text: "{{barcode}}",
    fontSize: 11,
    fill: "rgba(255,255,255,0.75)",
    draggable: true,
    name: "txt_barcode_value",
  });
  v.setAttr("_tpl", "{{barcode}}");
  layer.add(v);

  layer.draw();
  select(img);
}

function parsePreset(v) {
  const m = String(v).match(/^(\d+)x(\d+)@(\d+)$/);
  if (!m) return null;
  return { width_mm: Number(m[1]), height_mm: Number(m[2]), dpi: Number(m[3]) };
}

function applyNewLabel(newLabel, scaleObjects) {
  const oldW = stage.width();
  const oldH = stage.height();

  const clean = getTemplateJsonClean();

  label = { ...newLabel };
  settings.label = { ...newLabel };
  saveJSON(LS_KEYS.SETTINGS, settings);

  updateBadges();
  buildStage();

  // import nodes from clean, optionally scale
  const tmpDiv = document.createElement("div");
  tmpDiv.style.position = "absolute";
  tmpDiv.style.left = "-99999px";
  tmpDiv.style.top = "-99999px";
  document.body.appendChild(tmpDiv);

  const tmpStage = Konva.Node.create(clean, tmpDiv);
  const layers = tmpStage.getChildren().filter((n) => n.className === "Layer");
  layers.sort((a, b) => b.getChildren().length - a.getChildren().length);
  const best = layers[0];

  if (best) {
    const sx = stage.width() / oldW;
    const sy = stage.height() / oldH;

    best.getChildren().forEach((n) => {
      if (scaleObjects) {
        if (typeof n.x === "function") n.x(n.x() * sx);
        if (typeof n.y === "function") n.y(n.y() * sy);

        if (typeof n.scaleX === "function") n.scaleX((n.scaleX() || 1) * sx);
        if (typeof n.scaleY === "function") n.scaleY((n.scaleY() || 1) * sy);

        if (n.className === "Text" && typeof n.fontSize === "function") {
          n.fontSize(Math.max(8, Math.round(n.fontSize() * ((sx + sy) / 2))));
          n.scaleX(1);
          n.scaleY(1);
        }
      }

      if (typeof n.draggable === "function") n.draggable(true);
      layer.add(n);
    });
  }

  tmpStage.destroy();
  tmpDiv.remove();

  layer.add(tr);
  layer.draw();

  saveTemplate();
}

function getVarsFromUI() {
  const name = ($("#pv_name").value || "").trim();
  const indo = ($("#pv_indo").value || "").trim();
  const myanma = ($("#pv_myanma").value || "").trim();
  const japan = ($("#pv_japan").value || "").trim();
  const english = ($("#pv_english").value || "").trim();

  const base = ($("#pv_base").value || "123456").trim() || "123456";
  const grams = Number($("#pv_grams").value || 560);
  const pricePerKg = Number($("#pv_price").value || 10000);

  // generate barcode + amount
  const suffix = String(Math.round(grams / 10)).padStart(3, "0");
  const barcode = `${base}T${suffix}`;
  const amount = Math.round((pricePerKg * grams) / 1000 / 10) * 10;

  return {
    name,
    indo,
    myanma,
    japan,
    english,
    weight_g: grams,
    weight_kg: Number((grams / 1000).toFixed(2)),
    amount,
    barcode,
  };
}

async function previewSticker() {
  try {
    const clean = getTemplateJsonClean();
    const vars = getVarsFromUI();
    const url = await renderTemplateToDataURL(clean, label, vars, 3);

    $("#previewImg").src = url;
    $("#previewInfo").textContent = `${label.width_mm}×${label.height_mm}mm @${label.dpi}dpi — ${vars.barcode}`;
    setStatus($("#status"), "ok", "Preview OK.");
  } catch (e) {
    setStatus($("#status"), "err", "Preview lỗi: " + e.message);
  }
}

function initSizeUI() {
  updateBadges();

  const presetStr = `${label.width_mm}x${label.height_mm}@${label.dpi}`;
  const presetEl = $("#sizePreset");
  const opts = Array.from(presetEl.options).map((o) => o.value);

  if (opts.includes(presetStr)) {
    presetEl.value = presetStr;
    $("#customSizeBox").style.display = "none";
  } else {
    presetEl.value = "custom";
    $("#customSizeBox").style.display = "block";
  }

  $("#wmm").value = label.width_mm;
  $("#hmm").value = label.height_mm;
  $("#dpi").value = label.dpi;

  presetEl.onchange = () => {
    if (presetEl.value === "custom") {
      $("#customSizeBox").style.display = "block";
      return;
    }
    $("#customSizeBox").style.display = "none";
    const nl = parsePreset(presetEl.value);
    if (!nl) return;
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

function init() {
  // fill sample
  $("#pv_name").value = SAMPLE.name;
  $("#pv_grams").value = SAMPLE.weight_g;
  $("#pv_price").value = 10000;
  $("#pv_base").value = "123456";
  $("#pv_indo").value = SAMPLE.indo;
  $("#pv_myanma").value = SAMPLE.myanma;
  $("#pv_japan").value = SAMPLE.japan;
  $("#pv_english").value = SAMPLE.english;

  buildStage();

  const ok = loadTemplate();
  if (!ok) resetSample();

  initSizeUI();

  // toolbox
  $("#btnAddText").onclick = () => addText("Text...");
  $("#btnAddPrice").onclick = () => addText("¥{{amount}}");
  $("#btnAddWeight").onclick = () => addText("{{weight_kg}}kg");
  $("#btnAddBarcode").onclick = () => addBarcodeBlock();

  $("#btnAddName").onclick = () => addText("{{name}}");
  $("#btnAddIndo").onclick = () => addText("{{indo}}");
  $("#btnAddMyanma").onclick = () => addText("{{myanma}}");
  $("#btnAddJapan").onclick = () => addText("{{japan}}");
  $("#btnAddEnglish").onclick = () => addText("{{english}}");

  $("#btnDelete").onclick = () => {
    if (!selected) return;
    const n = selected;
    select(null);
    n.destroy();
    layer.draw();
  };

  $("#btnApplyProps").onclick = () => {
    if (!selected) return;
    try {
      const obj = JSON.parse($("#txtProps").value || "{}");
      selected.setAttrs(obj);
      if (selected.className === "Text" && obj.text !== undefined) {
        selected.setAttr("_tpl", obj.text);
      }
      layer.draw();
      setStatus($("#status"), "ok", "Applied attrs.");
    } catch (e) {
      setStatus($("#status"), "err", "JSON attrs sai: " + e.message);
    }
  };

  $("#btnBringFront").onclick = () => {
    if (!selected) return;
    selected.moveToTop();
    layer.add(tr);
    layer.draw();
  };

  $("#btnSendBack").onclick = () => {
    if (!selected) return;
    selected.moveToBottom();
    layer.add(tr);
    layer.draw();
  };

  $("#btnSave").onclick = () => saveTemplate();
  $("#btnLoad").onclick = () => {
    const json = $("#txtTemplate").value.trim();
    if (!json) return setStatus($("#status"), "err", "Box JSON trống.");
    localStorage.setItem(LS_KEYS.TEMPLATE_JSON, json);
    const ok2 = loadTemplate();
    if (!ok2) resetSample();
  };
  $("#btnReset").onclick = () => resetSample();

  $("#btnPreview").onclick = () => previewSticker();

  // auto preview when inputs change
  ["pv_name","pv_grams","pv_price","pv_base","pv_indo","pv_myanma","pv_japan","pv_english"].forEach((id) => {
    $("#"+id).addEventListener("input", () => previewSticker().catch(()=>{}));
  });

  previewSticker().catch(()=>{});
}

init();
