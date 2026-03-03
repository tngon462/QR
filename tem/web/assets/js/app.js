import { getSettings, setSettings, getPresets, setPresets, getLast } from "./storage.js";
import { hubHealth, hubPrinters } from "./hub.js";
import { initEditor, getCurrentTemplateName } from "./editor.js";
import { initRun, bootPresets, refreshGrid } from "./run.js";
import { addPreset, updatePreset, deletePreset, exportPresets, importPresetsFromFile, listPresets } from "./presets.js";

const $ = (id) => document.getElementById(id);

const els = {
  // tabs
  tabBtns: Array.from(document.querySelectorAll(".tabbtn")),
  tabSettings: $("tab-settings"),
  tabDesign: $("tab-design"),

  // settings
  hubUrl: $("hubUrl"),
  hubToken: $("hubToken"),
  defaultPrinter: $("defaultPrinter"),
  btnTest: $("btnTest"),
  btnSave: $("btnSave"),
  hubDot: $("hubDot"),
  hubStatusText: $("hubStatusText"),

  // design
  modeRun: $("modeRun"),
  modeEdit: $("modeEdit"),
  runMode: $("runMode"),
  editMode: $("editMode"),
  hubDot2: $("hubDot2"),
  hubStatusText2: $("hubStatusText2"),
  templateInfo: $("templateInfo"),

  // run
  presetSelect: $("presetSelect"),
  quickGram: $("quickGram"),
  snapStep: $("snapStep"),
  exactGram: $("exactGram"),
  btnQuickPrint: $("btnQuickPrint"),
  btnPrintAgain: $("btnPrintAgain"),
  grid: $("grid"),
  previewWrap: $("previewWrap"),
  runMsg: $("runMsg"),

  // edit
  labelWmm: $("labelWmm"),
  labelHmm: $("labelHmm"),
  labelDpi: $("labelDpi"),
  btnApplyLabel: $("btnApplyLabel"),
  addText: $("addText"),
  addVarText: $("addVarText"),
  addPrice: $("addPrice"),
  addWeight: $("addWeight"),
  addBarcode: $("addBarcode"),
  addImage: $("addImage"),
  imagePicker: $("imagePicker"),
  editorWrap: $("editorWrap"),
  nodeInspector: $("nodeInspector"),

  btnResetTemplate: $("btnResetTemplate"),
  btnSaveTemplate: $("btnSaveTemplate"),
  tplName: $("tplName"),
  tplSelect: $("tplSelect"),
  btnLoadTemplate: $("btnLoadTemplate"),
  btnDeleteTemplate: $("btnDeleteTemplate"),
  btnExportTemplate: $("btnExportTemplate"),
  btnImportTemplate: $("btnImportTemplate"),
  tplImportPicker: $("tplImportPicker"),

  btnAddPreset: $("btnAddPreset"),
  btnExportPresets: $("btnExportPresets"),
  btnImportPresets: $("btnImportPresets"),
  presetsImportPicker: $("presetsImportPicker"),
  presetList: $("presetList"),

  busy: $("busy"),
};

function setDot(dotEl, status) {
  dotEl.classList.remove("ok", "warn", "bad");
  if (status === "ok") dotEl.classList.add("ok");
  else if (status === "warn") dotEl.classList.add("warn");
  else if (status === "bad") dotEl.classList.add("bad");
}

function switchTab(name) {
  els.tabBtns.forEach((b) => b.classList.toggle("active", b.dataset.tab === name));
  els.tabSettings.classList.toggle("active", name === "settings");
  els.tabDesign.classList.toggle("active", name === "design");
}

function switchMode(mode) {
  els.modeRun.classList.toggle("primary", mode === "run");
  els.modeEdit.classList.toggle("primary", mode === "edit");
  els.runMode.classList.toggle("active", mode === "run");
  els.editMode.classList.toggle("active", mode === "edit");
}

function loadSettingsUI() {
  const s = getSettings();
  els.hubUrl.value = s.hubUrl || "";
  els.hubToken.value = s.token || "";
}

async function refreshPrintersDropdown() {
  try {
    const data = await hubPrinters();
    const printers = data?.printers || [];
    const s = getSettings();
    els.defaultPrinter.innerHTML =
      `<option value="">(Auto)</option>` +
      printers.map((p) => `<option value="${escapeHtml(p)}">${escapeHtml(p)}</option>`).join("");
    if (s.defaultPrinter) els.defaultPrinter.value = s.defaultPrinter;
  } catch {
    // ignore
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function renderPresetList() {
  const list = listPresets();
  els.presetList.innerHTML = "";

  if (!list.length) {
    els.presetList.innerHTML = `<div class="hint">Chưa có preset. Bấm Add để tạo.</div>`;
    return;
  }

  list.forEach((p) => {
    const card = document.createElement("div");
    card.className = "presetCard";
    card.innerHTML = `
      <div class="title">${escapeHtml(p.name_vi || p.baseCode)}</div>
      <div class="sub">${escapeHtml(p.baseCode)} • ¥${p.pricePerKg}/kg • ${p.minGram}-${p.maxGram} step ${p.stepGram}g</div>
      <div class="row" style="margin-top:8px">
        <button class="btn" data-act="edit">Edit</button>
        <button class="btn danger" data-act="del">Delete</button>
      </div>
    `;

    card.querySelector('[data-act="edit"]').addEventListener("click", () => openPresetEditor(p));
    card.querySelector('[data-act="del"]').addEventListener("click", () => {
      if (!confirm(`Delete preset "${p.name_vi || p.baseCode}"?`)) return;
      deletePreset(p.id);
      bootPresets(els);
      refreshGrid(els);
      renderPresetList();
    });

    els.presetList.appendChild(card);
  });
}

function openPresetEditor(preset) {
  const p = preset || {
    id: "",
    baseCode: "",
    name_vi: "",
    name_indo: "",
    name_myanma: "",
    name_en: "",
    name_jp: "",
    pricePerKg: 0,
    minGram: 500,
    maxGram: 3000,
    stepGram: 50,
  };

  const html = `
    Base code: <input id="p_base" value="${escapeHtml(p.baseCode || "")}"><br><br>
    name_vi: <input id="p_vi" value="${escapeHtml(p.name_vi || "")}"><br>
    name_indo: <input id="p_indo" value="${escapeHtml(p.name_indo || "")}"><br>
    name_myanma: <input id="p_my" value="${escapeHtml(p.name_myanma || "")}"><br>
    name_en: <input id="p_en" value="${escapeHtml(p.name_en || "")}"><br>
    name_jp: <input id="p_jp" value="${escapeHtml(p.name_jp || "")}"><br><br>
    pricePerKg (JPY): <input id="p_price" type="number" value="${Number(p.pricePerKg || 0)}"><br>
    minGram: <input id="p_min" type="number" value="${Number(p.minGram || 0)}"><br>
    maxGram: <input id="p_max" type="number" value="${Number(p.maxGram || 0)}"><br>
    stepGram: <input id="p_step" type="number" value="${Number(p.stepGram || 50)}"><br>
  `;

  // quick modal via prompt-like window (simple & stable)
  const w = window.open("", "_blank", "width=520,height=680");
  w.document.write(`
    <title>Preset Editor</title>
    <style>
      body{font-family:system-ui;padding:16px} input{width:100%;padding:8px;margin:6px 0}
      button{padding:10px 12px;margin-right:8px}
    </style>
    <h2>Preset Editor</h2>
    <div>${html}</div>
    <div style="margin-top:12px">
      <button id="save">Save</button>
      <button id="close">Close</button>
    </div>
    <script>
      const $=id=>document.getElementById(id);
      $('close').onclick=()=>window.close();
      $('save').onclick=()=>{
        const data={
          baseCode:$('p_base').value.trim(),
          name_vi:$('p_vi').value.trim(),
          name_indo:$('p_indo').value.trim(),
          name_myanma:$('p_my').value.trim(),
          name_en:$('p_en').value.trim(),
          name_jp:$('p_jp').value.trim(),
          pricePerKg:Number($('p_price').value||0),
          minGram:Number($('p_min').value||0),
          maxGram:Number($('p_max').value||0),
          stepGram:Number($('p_step').value||50),
        };
        window.opener.postMessage({ type:'preset_save', presetId:'${p.id || ""}', data }, '*');
      };
    </script>
  `);
}

window.addEventListener("message", (ev) => {
  if (ev?.data?.type === "preset_save") {
    const { presetId, data } = ev.data;
    if (!data.baseCode) return alert("baseCode required");
    if (!presetId) {
      addPreset(data);
    } else {
      updatePreset(presetId, data);
    }
    bootPresets(els);
    refreshGrid(els);
    renderPresetList();
  }
});

async function pingLoop() {
  const s = getSettings();
  if (!s.hubUrl) {
    setDot(els.hubDot, "warn");
    setDot(els.hubDot2, "warn");
    els.hubStatusText.textContent = "Hub URL missing";
    els.hubStatusText2.textContent = "Hub URL missing";
    return;
  }
  try {
    const data = await hubHealth();
    setDot(els.hubDot, "ok");
    setDot(els.hubDot2, "ok");
    els.hubStatusText.textContent = `Online • ${data?.name || "Hub"} • queue=${data?.queue_len ?? "?"}`;
    els.hubStatusText2.textContent = `Online • ${data?.name || "Hub"} • queue=${data?.queue_len ?? "?"}`;
  } catch (e) {
    setDot(els.hubDot, "bad");
    setDot(els.hubDot2, "bad");
    els.hubStatusText.textContent = "Offline";
    els.hubStatusText2.textContent = "Offline";
  }
}

function initTabs() {
  els.tabBtns.forEach((b) =>
    b.addEventListener("click", () => switchTab(b.dataset.tab))
  );
}

function initModes() {
  els.modeRun.addEventListener("click", () => switchMode("run"));
  els.modeEdit.addEventListener("click", () => switchMode("edit"));
}

function initSettings() {
  loadSettingsUI();

  els.btnSave.addEventListener("click", () => {
    const s = getSettings();
    s.hubUrl = String(els.hubUrl.value || "").trim();
    s.token = String(els.hubToken.value || "").trim();
    s.defaultPrinter = String(els.defaultPrinter.value || "").trim();
    setSettings(s);
    alert("Saved");
  });

  els.btnTest.addEventListener("click", async () => {
    try {
      await pingLoop();
      await refreshPrintersDropdown();
      alert("OK");
    } catch (e) {
      alert(String(e?.message || e));
    }
  });
}

function ensureSamplesIfEmpty() {
  const presets = getPresets();
  if (!presets.length) {
    setPresets([
      {
        id: "p_demo",
        baseCode: "123456",
        name_vi: "Thịt demo",
        name_indo: "Daging demo",
        name_myanma: "အသား demo",
        name_en: "Demo meat",
        name_jp: "デモ肉",
        pricePerKg: 1160,
        minGram: 500,
        maxGram: 3000,
        stepGram: 50,
      },
    ]);
  }
}

function initImportsExports() {
  els.btnExportPresets.addEventListener("click", () => exportPresets());
  els.btnImportPresets.addEventListener("click", () => els.presetsImportPicker.click());
  els.presetsImportPicker.addEventListener("change", async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      await importPresetsFromFile(f);
      bootPresets(els);
      refreshGrid(els);
      renderPresetList();
      alert("Imported presets");
    } catch (err) {
      alert(String(err?.message || err));
    } finally {
      els.presetsImportPicker.value = "";
    }
  });

  els.btnAddPreset.addEventListener("click", () => openPresetEditor(null));
}

function init() {
  ensureSamplesIfEmpty();
  initTabs();
  initModes();
  initSettings();
  initImportsExports();

  initEditor({
    inspectorEl: els.nodeInspector,
    editorWrap: els.editorWrap,
    labelWmm: els.labelWmm,
    labelHmm: els.labelHmm,
    labelDpi: els.labelDpi,
    btnApplyLabel: els.btnApplyLabel,
    addText: els.addText,
    addVarText: els.addVarText,
    addPrice: els.addPrice,
    addWeight: els.addWeight,
    addBarcode: els.addBarcode,
    addImage: els.addImage,
    imagePicker: els.imagePicker,
    btnResetTemplate: els.btnResetTemplate,
    btnSaveTemplate: els.btnSaveTemplate,
    tplName: els.tplName,
    tplSelect: els.tplSelect,
    btnLoadTemplate: els.btnLoadTemplate,
    btnDeleteTemplate: els.btnDeleteTemplate,
    btnExportTemplate: els.btnExportTemplate,
    btnImportTemplate: els.btnImportTemplate,
    tplImportPicker: els.tplImportPicker,
    templateInfo: els.templateInfo,
  });

  initRun(els);
  renderPresetList();

  // restore last template info
  const last = getLast();
  if (last.templateName) {
    els.templateInfo.textContent = `Template: ${last.templateName}`;
  }

  // auto ping 3–5s
  pingLoop();
  refreshPrintersDropdown();
  setInterval(pingLoop, 4000);
}

init();
