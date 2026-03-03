// print.js (FINAL - multi-template + READY handshake)

import { LS_KEYS, DEFAULTS } from "./app-config.js";
import { loadJSON, setStatus, gramsToSuffix, calcAmount } from "./utils.js";
import { substituteTextNodes, setBarcodeImage } from "./template.js";
import {
  listTemplates,
  getTemplate,
  migrateLegacyIfNeeded,
  setLastUsed,
  getLastUsed,
} from "./template-store.js";

console.log("PRINT JS VERSION FINAL-STABLE");

const $ = (s) => document.querySelector(s);
const Konva = window.Konva;
const BG_NAME = "__bg_white";

// ================= SETTINGS =================
const settings = loadJSON(LS_KEYS.SETTINGS, DEFAULTS.settings);

const HUB_URL = (settings?.hub?.url || "").trim();
const HUB_TOKEN = (settings?.hub?.token || "").trim();
const HUB_PRINTER = settings?.hub?.printer || "";
const COPIES = settings?.copies || 1;

const LABEL_RUNTIME = {
  gap_mm: settings?.label?.gap_mm ?? 2,
  threshold: settings?.label?.threshold ?? 180,
};

function getHubOrigin() {
  const u = new URL(HUB_URL);
  return `${u.protocol}//${u.host}`;
}

// ================= TEMPLATE DROPDOWN =================

function refreshTemplateDropdown() {
  const sel = $("#tplSelect");
  const idx = listTemplates();

  sel.innerHTML = "";

  if (idx.length === 0) {
    const opt = document.createElement("option");
    opt.textContent = "(no templates)";
    opt.value = "";
    sel.appendChild(opt);
    return;
  }

  idx.forEach((it) => {
    const opt = document.createElement("option");
    opt.value = it.slug;   // IMPORTANT: dùng slug
    opt.textContent = it.name;
    sel.appendChild(opt);
  });

  const last = getLastUsed();
  if (last) sel.value = last;
}

function getSelectedSlug() {
  return ($("#tplSelect")?.value || "").trim();
}

// ================= TEMPLATE RENDER =================

function ensureWhiteBackground(stg) {
  const w = stg.width();
  const h = stg.height();

  let bg = stg.findOne("." + BG_NAME);
  if (!bg) {
    bg = new Konva.Rect({
      x: 0,
      y: 0,
      width: w,
      height: h,
      fill: "#ffffff",
      listening: false,
      name: BG_NAME,
    });
    const layers = stg.getChildren();
    layers.forEach(l => l.add(bg));
  }

  bg.moveToBottom();
}

function makeTempStageFromTemplate(templateJson) {
  const div = document.createElement("div");
  div.style.position = "absolute";
  div.style.left = "-99999px";
  document.body.appendChild(div);

  const stg = Konva.Node.create(templateJson, div);
  return { stg, div };
}

async function renderLabelToPng(vars) {
  const slug = getSelectedSlug();
  if (!slug) throw new Error("Chưa chọn template.");

  const tpl = getTemplate(slug);
  if (!tpl) throw new Error("Template không tồn tại.");

  setLastUsed(slug);

  const { stg, div } = makeTempStageFromTemplate(tpl.templateJson);

  ensureWhiteBackground(stg);
  substituteTextNodes(stg, vars);
  await setBarcodeImage(stg, vars.barcode);

  stg.draw();

  const dataUrl = stg.toDataURL({
    pixelRatio: 2,
    mimeType: "image/png",
  });

  stg.destroy();
  div.remove();

  return { dataUrl, tpl };
}

// ================= READY HANDSHAKE PRINT =================

function openBridgeAndSend(pngDataUrl, tpl) {
  const origin = getHubOrigin();
  const bridgeUrl =
    `${origin}/bridge?printer=` +
    encodeURIComponent(HUB_PRINTER || "");

  const w = window.open(bridgeUrl, "_blank");
  if (!w) throw new Error("Popup bị chặn.");

  const metaLabel = tpl?.meta?.label || {};

  const payload = {
    type: "PRINT_PNG",
    token: HUB_TOKEN,
    printer_name: HUB_PRINTER,
    copies: COPIES,
    png_base64: pngDataUrl,
    label: {
      w_mm: metaLabel.width_mm || 60,
      h_mm: metaLabel.height_mm || 40,
      gap_mm: LABEL_RUNTIME.gap_mm,
      x: 0,
      y: 0,
      threshold: LABEL_RUNTIME.threshold,
    },
  };

  function onMessage(ev) {
    if (!ev.data || ev.data.type !== "BRIDGE_READY") return;
    window.removeEventListener("message", onMessage);
    w.postMessage(payload, origin);
  }

  window.addEventListener("message", onMessage);
}

// ================= BUTTON BUILD =================

function getVars(baseCode, name, grams, pricePerKg, extra) {
  const suffix = gramsToSuffix(grams);
  const barcode = `${baseCode}T${suffix}`;
  const amount = calcAmount(pricePerKg, grams);

  return {
    name,
    weight_g: grams,
    weight_kg: Number((grams / 1000).toFixed(2)),
    amount,
    barcode,
    indo: extra.indo || "",
    myanma: extra.myanma || "",
    japan: extra.japan || "",
    english: extra.english || "",
  };
}

async function buildButtons() {
  const grid = $("#grid");
  grid.innerHTML = "";

  const idx = listTemplates();
  if (idx.length === 0) {
    setStatus($("#status"), "err", "Chưa có template.");
    return;
  }

  const baseCode = $("#baseCode").value.trim();
  const name = $("#name").value.trim();
  const pricePerKg = Number($("#pricePerKg").value || 0);
  const minGram = Number($("#minGram").value || 0);
  const maxGram = Number($("#maxGram").value || 0);
  const stepGram = Number($("#stepGram").value || 0);

  const extra = {
    indo: $("#indo").value.trim(),
    myanma: $("#myanma").value.trim(),
    japan: $("#japan").value.trim(),
    english: $("#english").value.trim(),
  };

  for (let g = minGram; g <= maxGram; g += stepGram) {
    const vars = getVars(baseCode, name, g, pricePerKg, extra);

    const btn = document.createElement("button");
    btn.textContent = `${vars.weight_kg.toFixed(2)}kg – ¥${vars.amount}`;

    btn.onclick = async () => {
      const { dataUrl, tpl } = await renderLabelToPng(vars);
      openBridgeAndSend(dataUrl, tpl);
    };

    grid.appendChild(btn);
  }

  setStatus($("#status"), "ok", "Ready.");
}

// ================= INIT =================

function init() {
  migrateLegacyIfNeeded({
    defaultName: "default",
    labelFromSettings: settings.label,
  });

  refreshTemplateDropdown();

  $("#tplSelect").addEventListener("change", buildButtons);
  $("#btnGen").onclick = buildButtons;

  buildButtons();
}

init();
