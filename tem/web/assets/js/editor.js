// editor.js
import { getTemplate, saveTemplate, listTemplateNames, deleteTemplate } from "./templates.js";
import { getLast, setLast } from "./storage.js";
import {
  exportStageToTemplateJSON,
  stageFromTemplateJSON,
  enforceWhiteBackground,
  mmToPx,
  fitStageToContainer,
  setKonvaImageFromDataURL,
} from "./render.js";
import { downloadJSON, readFileAsDataURL, readFileAsText } from "./utils.js";

let stage = null;
let label = { width_mm: 50, height_mm: 30, dpi: 203 };
let currentTemplateName = "";

let inspectorEl = null;
let editorWrap = null;
let selected = null;

export function getEditorStage() {
  return stage;
}

export function getLabelSetting() {
  return { ...label };
}

export function getCurrentTemplateName() {
  return currentTemplateName;
}

export function initEditor(ctx) {
  inspectorEl = ctx.inspectorEl;
  editorWrap = ctx.editorWrap;

  bindUI(ctx);
  bootDefaultStage();
  refreshTemplateDropdown(ctx.tplSelect);
}

function bindUI(ctx) {
  ctx.btnApplyLabel.addEventListener("click", () => {
    label.width_mm = Number(ctx.labelWmm.value || 50);
    label.height_mm = Number(ctx.labelHmm.value || 30);
    label.dpi = Number(ctx.labelDpi.value || 203);
    rebuildStage(); // rebuild blank stage with new size
  });

  ctx.btnResetTemplate.addEventListener("click", () => {
    currentTemplateName = "";
    ctx.tplName.value = "";
    bootDefaultStage();
    ctx.templateInfo.textContent = "Template: (none)";
  });

  ctx.btnSaveTemplate.addEventListener("click", () => {
    const name = String(ctx.tplName.value || "").trim();
    if (!name) return alert("Nhập Template name");

    const tpl = { label: { ...label }, konva: exportStageToTemplateJSON(stage) };
    saveTemplate(name, tpl);
    currentTemplateName = name;
    ctx.templateInfo.textContent = `Template: ${name}`;
    refreshTemplateDropdown(ctx.tplSelect);

    const last = getLast();
    last.templateName = name;
    setLast(last);
  });

  ctx.btnLoadTemplate.addEventListener("click", async () => {
    const name = ctx.tplSelect.value;
    if (!name) return;
    await loadTemplateIntoEditor(name, ctx);
  });

  ctx.btnDeleteTemplate.addEventListener("click", () => {
    const name = ctx.tplSelect.value;
    if (!name) return;
    if (!confirm(`Delete template "${name}" ?`)) return;
    deleteTemplate(name);
    refreshTemplateDropdown(ctx.tplSelect);
    currentTemplateName = "";
    ctx.tplName.value = "";
    bootDefaultStage();
    ctx.templateInfo.textContent = "Template: (none)";
  });

  ctx.btnExportTemplate.addEventListener("click", () => {
    const name = currentTemplateName || ctx.tplSelect.value;
    if (!name) return alert("Chưa có template để export");
    const tpl = getTemplate(name);
    if (!tpl) return alert("Template not found");
    downloadJSON(`template.${name}.json`, { name, ...tpl });
  });

  ctx.btnImportTemplate.addEventListener("click", () => ctx.tplImportPicker.click());
  ctx.tplImportPicker.addEventListener("change", async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;

    try {
      const txt = await readFileAsText(f);
      const obj = JSON.parse(txt);
      const name = obj.name || `import_${Date.now()}`;

      if (!obj?.label || !obj?.konva) throw new Error("Invalid template JSON");
      saveTemplate(name, { label: obj.label, konva: obj.konva });

      await loadTemplateIntoEditor(name, ctx);
      refreshTemplateDropdown(ctx.tplSelect);
      alert(`Imported: ${name}`);
    } catch (err) {
      alert(String(err?.message || err));
    } finally {
      ctx.tplImportPicker.value = "";
    }
  });

  // Toolbox
  ctx.addText.addEventListener("click", () => addText("Text"));
  ctx.addVarText.addEventListener("click", () => addText("{{name_vi}}"));
  ctx.addPrice.addEventListener("click", () => addText("¥{{amount}}"));
  ctx.addWeight.addEventListener("click", () => addText("{{weight_kg}}kg"));
  ctx.addBarcode.addEventListener("click", () => addBarcodePlaceholder());

  ctx.addImage.addEventListener("click", () => ctx.imagePicker.click());
  ctx.imagePicker.addEventListener("change", async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const dataUrl = await readFileAsDataURL(f);
    await addImage(dataUrl);
    ctx.imagePicker.value = "";
  });

  window.addEventListener("resize", () => {
    if (!stage) return;
    const labelPxW = mmToPx(label.width_mm, label.dpi);
    const labelPxH = mmToPx(label.height_mm, label.dpi);
    fitStageToContainer(stage, labelPxW, labelPxH, editorWrap);
  });
}

async function loadTemplateIntoEditor(name, ctx) {
  const tpl = getTemplate(name);
  if (!tpl) return alert("Template not found");

  label = { ...tpl.label };
  ctx.labelWmm.value = label.width_mm;
  ctx.labelHmm.value = label.height_mm;
  ctx.labelDpi.value = label.dpi;

  currentTemplateName = name;
  ctx.tplName.value = name;

  await rebuildStage(tpl.konva);
  ctx.templateInfo.textContent = `Template: ${name}`;

  const last = getLast();
  last.templateName = name;
  setLast(last);
}

function refreshTemplateDropdown(selectEl) {
  const names = listTemplateNames();
  const last = getLast();

  selectEl.innerHTML =
    `<option value="">(select)</option>` +
    names.map((n) => `<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`).join("");

  if (last.templateName && names.includes(last.templateName)) {
    selectEl.value = last.templateName;
    currentTemplateName = last.templateName;
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function bootDefaultStage() {
  label = { width_mm: 50, height_mm: 30, dpi: 203 };
  rebuildStage();
}

/**
 * Rebuild stage either blank or from konvaJson.
 * Always ensures:
 * - white background rect "__bg"
 * - content layer "__content"
 * - selection handlers
 */
async function rebuildStage(konvaJson = null) {
  editorWrap.innerHTML = "";

  const labelPxW = mmToPx(label.width_mm, label.dpi);
  const labelPxH = mmToPx(label.height_mm, label.dpi);

  if (konvaJson) {
    stage = await stageFromTemplateJSON(editorWrap, konvaJson);
  } else {
    stage = new Konva.Stage({
      container: editorWrap,
      width: labelPxW,
      height: labelPxH,
    });
    stage.add(new Konva.Layer()); // base layer for bg
  }

  // Enforce background
  enforceWhiteBackground(stage, labelPxW, labelPxH);

  // Ensure content layer exists
  let contentLayer = stage.findOne(".__content");
  if (!contentLayer) {
    contentLayer = new Konva.Layer();
    contentLayer.name("__content");
    stage.add(contentLayer);
  }

  attachSelectHandlers();
  fitStageToContainer(stage, labelPxW, labelPxH, editorWrap);
  stage.draw();

  // Reset inspector prompt
  if (inspectorEl) inspectorEl.innerHTML = `<div class="hint">Chọn 1 đối tượng trên canvas để chỉnh.</div>`;
}

function attachSelectHandlers() {
  selected = null;

  // remove old listeners (rebuild stage)
  stage.off("click tap");

  stage.on("click tap", (e) => {
    const node = e.target;
    if (!node || node === stage) return;

    // ignore background
    if (node.name?.() === "__bg") return;

    const cls = node.getClassName?.();
    if (cls === "Text" || cls === "Image") {
      selected = node;
      showInspector(node);
    }
  });
}

function showInspector(node) {
  if (!inspectorEl) return;
  inspectorEl.innerHTML = "";

  const title = document.createElement("div");
  title.className = "hint";
  title.textContent = `Selected: ${node.getClassName()} ${node.name ? `(${node.name()})` : ""}`;
  inspectorEl.appendChild(title);

  // common fields
  inspectorEl.appendChild(makeNumberField("x", node.x(), (v) => node.x(v)));
  inspectorEl.appendChild(makeNumberField("y", node.y(), (v) => node.y(v)));
  inspectorEl.appendChild(makeNumberField("width", node.width(), (v) => node.width(v)));
  inspectorEl.appendChild(makeNumberField("height", node.height(), (v) => node.height(v)));

  if (node.getClassName() === "Text") {
    inspectorEl.appendChild(makeTextField("text", node.text(), (v) => node.text(v)));
    inspectorEl.appendChild(makeNumberField("fontSize", node.fontSize(), (v) => node.fontSize(v)));
    inspectorEl.appendChild(makeSelectField("align", ["left", "center", "right"], node.align(), (v) => node.align(v)));
  }

  inspectorEl.appendChild(
    makeBtn("Delete node", () => {
      node.destroy();
      stage.draw();
      inspectorEl.innerHTML = `<div class="hint">Chọn 1 đối tượng trên canvas để chỉnh.</div>`;
    })
  );

  stage.draw();
}

function makeBtn(text, onClick) {
  const b = document.createElement("button");
  b.className = "btn danger";
  b.textContent = text;
  b.addEventListener("click", onClick);
  return b;
}

function makeNumberField(label, value, onChange) {
  const wrap = document.createElement("div");
  wrap.className = "row";
  wrap.style.marginTop = "8px";

  const l = document.createElement("div");
  l.style.width = "90px";
  l.style.color = "var(--muted)";
  l.textContent = label;

  const i = document.createElement("input");
  i.type = "number";
  i.step = "1";
  i.value = String(Math.round(Number(value || 0)));
  i.addEventListener("change", () => {
    onChange(Number(i.value || 0));
    stage.draw();
  });

  wrap.appendChild(l);
  wrap.appendChild(i);
  return wrap;
}

function makeTextField(label, value, onChange) {
  const wrap = document.createElement("div");
  wrap.className = "row";
  wrap.style.marginTop = "8px";

  const l = document.createElement("div");
  l.style.width = "90px";
  l.style.color = "var(--muted)";
  l.textContent = label;

  const i = document.createElement("input");
  i.type = "text";
  i.value = String(value || "");
  i.addEventListener("change", () => {
    onChange(i.value);
    stage.draw();
  });

  wrap.appendChild(l);
  wrap.appendChild(i);
  return wrap;
}

function makeSelectField(label, options, value, onChange) {
  const wrap = document.createElement("div");
  wrap.className = "row";
  wrap.style.marginTop = "8px";

  const l = document.createElement("div");
  l.style.width = "90px";
  l.style.color = "var(--muted)";
  l.textContent = label;

  const s = document.createElement("select");
  s.innerHTML = options.map((o) => `<option value="${o}">${o}</option>`).join("");
  s.value = value || options[0];
  s.addEventListener("change", () => {
    onChange(s.value);
    stage.draw();
  });

  wrap.appendChild(l);
  wrap.appendChild(s);
  return wrap;
}

function getContentLayer() {
  const layer = stage?.findOne(".__content");
  return layer || null;
}

function addText(text) {
  const layer = getContentLayer();
  if (!layer) return alert("Missing __content layer. Bấm Apply/New rồi thử lại.");

  const t = new Konva.Text({
    x: 20,
    y: 20,
    text,
    fontSize: 26,
    fontFamily: "Arial",
    fill: "black",
    draggable: true,
    width: 400,
    align: "left",
  });

  layer.add(t);
  stage.draw();
}

function addBarcodePlaceholder() {
  const layer = getContentLayer();
  if (!layer) return alert("Missing __content layer. Bấm Apply/New rồi thử lại.");

  const imgNode = new Konva.Image({
    x: 20,
    y: 80,
    width: 520,
    height: 160,
    draggable: true,
  });
  imgNode.name("barcode_img");

  // dummy barcode
  const dummy = document.createElement("canvas");
  dummy.width = 800;
  dummy.height = 240;
  window.JsBarcode(dummy, "123456T050", { format: "CODE128", displayValue: false, margin: 0, height: 180 });

  const url = dummy.toDataURL("image/png");
  imgNode.setAttr("__src", url);

  layer.add(imgNode);
  setKonvaImageFromDataURL(imgNode, url).then(() => stage.draw());
}

async function addImage(dataUrl) {
  const layer = getContentLayer();
  if (!layer) return alert("Missing __content layer. Bấm Apply/New rồi thử lại.");

  const imgNode = new Konva.Image({
    x: 20,
    y: 20,
    width: 160,
    height: 160,
    draggable: true,
  });
  imgNode.setAttr("__src", dataUrl);

  layer.add(imgNode);
  await setKonvaImageFromDataURL(imgNode, dataUrl);
  stage.draw();
}
