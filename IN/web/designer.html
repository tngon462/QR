import { LS_KEYS, DEFAULTS } from "./app-config.js";
import { loadJSON, mmToPx, setStatus } from "./utils.js";
import { ensureSampleTemplate } from "./template.js";

const $ = (s) => document.querySelector(s);

const settings = loadJSON(LS_KEYS.SETTINGS, DEFAULTS.settings);
const label = settings.label;

$("#lblSize").textContent = `${label.width_mm}×${label.height_mm}mm`;
$("#lblDpi").textContent  = `${label.dpi} DPI`;

const Konva = window.Konva;

let stage = null;
let layer = null;
let tr = null;
let selected = null;

function bindInteractions() {
  // Click/tap select
  stage.on("click tap", (e) => {
    if (e.target === stage) {
      selectNode(null);
      return;
    }
    selectNode(e.target);
  });

  // Double click edit text
  stage.on("dblclick dbltap", (e) => {
    const node = e.target;
    if (node && node.className === "Text") {
      const current = node.text();
      const next = prompt("Sửa text:", current);
      if (next !== null) {
        node.text(next);
        node.getLayer().draw();
        if (selected === node) $("#txtProps").value = JSON.stringify(node.attrs, null, 2);
      }
    }
  });
}

function selectNode(node) {
  selected = node;
  tr.nodes(node ? [node] : []);
  layer.draw();

  $("#txtProps").value = node ? JSON.stringify(node.attrs, null, 2) : "";
}

function buildFreshStage() {
  const stageW = mmToPx(label.width_mm, label.dpi);
  const stageH = mmToPx(label.height_mm, label.dpi);

  // Clear container and create new stage (an toàn nhất)
  const container = document.getElementById("stage");
  container.innerHTML = "";

  stage = new Konva.Stage({
    container: "stage",
    width: stageW,
    height: stageH
  });

  layer = new Konva.Layer();
  stage.add(layer);

  tr = new Konva.Transformer({
    rotateEnabled: true,
    enabledAnchors: ["top-left", "top-right", "bottom-left", "bottom-right"],
    boundBoxFunc: (oldBox, newBox) => {
      if (newBox.width < 20 || newBox.height < 20) return oldBox;
      return newBox;
    }
  });

  layer.add(tr);
  layer.draw();

  bindInteractions();
}

function saveToLocal() {
  const json = stage.toJSON();
  localStorage.setItem(LS_KEYS.TEMPLATE_JSON, json);
  $("#txtTemplate").value = json;
  setStatus($("#status"), "ok", "Đã lưu template vào localStorage.");
}

function loadFromLocal() {
  const json = localStorage.getItem(LS_KEYS.TEMPLATE_JSON);
  if (!json) return false;

  try {
    // rebuild stage clean
    buildFreshStage();

    // Create a temp stage from JSON into a temp container, then move its children into our stage
    const tmpDiv = document.createElement("div");
    tmpDiv.style.position = "absolute";
    tmpDiv.style.left = "-99999px";
    tmpDiv.style.top = "-99999px";
    document.body.appendChild(tmpDiv);

    const tmpStage = Konva.Node.create(json, tmpDiv);

    // Copy layers content
    const tmpLayers = tmpStage.getChildren().filter(n => n.className === "Layer");
    if (tmpLayers.length) {
      // remove default empty layer (keep transformer on our layer)
      // We'll add nodes from first temp layer to our layer.
      const tmpLayer = tmpLayers[0];
      const nodes = tmpLayer.getChildren();
      nodes.forEach(n => {
        // skip transformer objects that may exist in saved template
        if (n.className === "Transformer") return;
        // ensure draggable true for convenience
        if (n.attrs && typeof n.attrs.draggable === "boolean") {
          // keep user's choice
        } else {
          n.draggable(true);
        }
        layer.add(n);
      });
      layer.add(tr); // keep our transformer on top
      layer.draw();
    }

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
  buildFreshStage();
  ensureSampleTemplate(stage, label);
  saveToLocal();
  setStatus($("#status"), "ok", "Reset về template mẫu (kéo-thả được ngay).");
}

function addText(text) {
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

function addBarcode() {
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

// ---- UI buttons ----
$("#btnAddText").onclick = () => addText("Text...");
$("#btnAddPrice").onclick = () => addText("¥{{amount}}");
$("#btnAddWeight").onclick = () => addText("{{weight_kg}}kg");
$("#btnAddBarcode").onclick = () => addBarcode();

$("#btnDelete").onclick = () => {
  if (!selected) return;
  const n = selected;
  selectNode(null);
  n.destroy();
  layer.draw();
};

$("#btnApplyProps").onclick = () => {
  if (!selected) return;
  try {
    const obj = JSON.parse($("#txtProps").value || "{}");
    selected.setAttrs(obj);
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

$("#btnSave").onclick = saveToLocal;

$("#btnLoad").onclick = () => {
  const json = $("#txtTemplate").value.trim();
  if (!json) return setStatus($("#status"), "err", "Box JSON trống.");
  localStorage.setItem(LS_KEYS.TEMPLATE_JSON, json);
  loadFromLocal();
};

$("#btnReset").onclick = resetSample;

// ---- init ----
buildFreshStage();

const ok = loadFromLocal();
if (!ok) {
  // nếu chưa có template hoặc template rỗng -> tạo sample
  resetSample();
}
