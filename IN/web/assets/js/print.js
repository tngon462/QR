// IN/web/assets/js/print.js
// FINAL-STABLE v2: multi-template + READY handshake + use template NAME as selector

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

console.log("PRINT JS VERSION FINAL-STABLE-v2");

const $ = (s) => document.querySelector(s);
const Konva = window.Konva;

const BG_NAME = "__bg_white";

// ================= SETTINGS =================
const settings = loadJSON(LS_KEYS.SETTINGS, DEFAULTS.settings);

const HUB_URL = (settings?.hub?.url || "").trim();
const HUB_TOKEN = (settings?.hub?.token || "").trim();
const HUB_PRINTER = settings?.hub?.printer || "";
const COPIES = Number(settings?.copies || 1);

const LABEL_RUNTIME = {
  gap_mm: settings?.label?.gap_mm ?? 2,
  threshold: settings?.label?.threshold ?? 180,
};

function getHubOrigin() {
  if (!HUB_URL) throw new Error("Chưa cấu hình Hub URL trong Settings.");
  const u = new URL(HUB_URL);
  return `${u.protocol}//${u.host}`;
}

// ================= TEMPLATE DROPDOWN =================

function refreshTemplateDropdown() {
  const sel = $("#tplSelect");
  const idx = listTemplates() || [];

  sel.innerHTML = "";

  if (idx.length === 0) {
    const opt = document.createElement("option");
    opt.textContent = "(no templates)";
    opt.value = "";
    sel.appendChild(opt);
    return;
  }

  // IMPORTANT: use template "name" as value
  idx.forEach((it) => {
    const opt = document.createElement("option");
    opt.value = it.name || "";
    opt.textContent = it.name || "(unnamed)";
    sel.appendChild(opt);
  });

  const last = getLastUsed();
  if (last) sel.value = last;
}

function getSelectedName() {
  return ($("#tplSelect")?.value || "").trim();
}

// ================= TEMPLATE RENDER =================

function ensureWhiteBackground(stg) {
  const w = stg.width();
  const h = stg.height();

  // Find existing bg rect by name
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

    // Put bg into first layer if possible, else into stage
    const layers = stg.getChildren();
    if (layers && layers.length) {
      layers[0].add(bg);
    } else {
      stg.add(bg);
    }
  }

  bg.width(w);
  bg.height(h);
  bg.moveToBottom();
}

function makeTempStageFromTemplate(templateJson) {
  const div = document.createElement("div");
  div.style.position = "absolute";
  div.style.left = "-99999px";
  div.style.top = "-99999px";
  document.body.appendChild(div);

  const stg = Konva.Node.create(templateJson, div);
  return { stg, div };
}

async function renderLabelToPng(vars) {
  const name = getSelectedName();
  if (!name) throw new Error("Chưa chọn template.");

  // IMPORTANT: pass NAME to template-store (it handles slug/key internally)
  const tpl = getTemplate(name);
  if (!tpl) throw new Error(`Template không tồn tại: ${name}`);

  setLastUsed(name);

  const { stg, div } = makeTempStageFromTemplate(tpl.templateJson);

  // Always white background for printing
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

// ================= PRINT (READY HANDSHAKE) =================

function openBridgeAndSend(pngDataUrl, tpl) {
  const origin = getHubOrigin();

  const bridgeUrl =
    `${origin}/bridge?printer=` + encodeURIComponent(HUB_PRINTER || "");

  const w = window.open(bridgeUrl, "_blank");
  if (!w) throw new Error("Popup bị chặn. Hãy cho phép pop-up.");

  const metaLabel = tpl?.meta?.label || {};

  const payload = {
    type: "PRINT_PNG",
    token: HUB_TOKEN,
    printer_name: HUB_PRINTER,
    copies: COPIES,
    png_base64: pngDataUrl,
    label: {
      w_mm: metaLabel.width_mm || settings?.label?.width_mm || 60,
      h_mm: metaLabel.height_mm || settings?.label?.height_mm || 40,
      gap_mm: LABEL_RUNTIME.gap_mm,
      x: 0,
      y: 0,
      threshold: LABEL_RUNTIME.threshold,
    },
  };

  function onMessage(ev) {
    // Wait for bridge to confirm ready
    if (!ev.data || ev.data.type !== "BRIDGE_READY") return;
    window.removeEventListener("message", onMessage);

    try {
      w.postMessage(payload, origin);
    } catch (e) {
      console.error("postMessage failed:", e);
    }
  }

  window.addEventListener("message", onMessage);
}

// ================= BUTTON GRID =================

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

  const idx = listTemplates() || [];
  if (idx.length === 0) {
    setStatus($("#status"), "err", "Chưa có template. Vào Designer → Save Template.");
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

  if (!baseCode) return setStatus($("#status"), "err", "Thiếu baseCode.");
  if (!name) return setStatus($("#status"), "err", "Thiếu name.");
  if (!pricePerKg) return setStatus($("#status"), "err", "Thiếu giá/1kg.");
  if (minGram <= 0 || maxGram <= 0 || stepGram <= 0)
    return setStatus($("#status"), "err", "min/max/step phải > 0.");
  if (minGram > maxGram) return setStatus($("#status"), "err", "minGram > maxGram.");

  for (let g = minGram; g <= maxGram; g += stepGram) {
    const vars = getVars(baseCode, name, g, pricePerKg, extra);

    const row = document.createElement("div");
    row.className = "btnRow";

    const btnMain = document.createElement("button");
    btnMain.className = "btnMain";
    btnMain.textContent = `${vars.weight_kg.toFixed(2)}kg – ¥${vars.amount}`;

    btnMain.onclick = async () => {
      try {
        setStatus($("#status"), "ok", "Render PNG...");
        const { dataUrl, tpl } = await renderLabelToPng(vars);
        setStatus($("#status"), "ok", "Mở Print Bridge...");
        openBridgeAndSend(dataUrl, tpl);
        setStatus($("#status"), "ok", "Đã gửi lệnh in.");
      } catch (e) {
        setStatus($("#status"), "err", "In lỗi: " + e.message);
      }
    };

    // Optional preview button if your HTML has modal (keep if exists)
    const btnPrev = document.createElement("button");
    btnPrev.className = "btnMini";
    btnPrev.textContent = "Xem trước";
    btnPrev.onclick = async () => {
      try {
        const { dataUrl } = await renderLabelToPng(vars);
        // If your print.html has modal elements, show them; else download directly
        const m = $("#mask");
        const img = $("#mImg");
        const title = $("#mTitle");
        if (m && img && title) {
          title.textContent = `${vars.barcode} • ${vars.weight_kg.toFixed(2)}kg • ¥${vars.amount}`;
          img.src = dataUrl;
          m.style.display = "flex";
          const dl = $("#btnDownload");
          if (dl) {
            dl.onclick = () => {
              const a = document.createElement("a");
              a.href = dataUrl;
              a.download = "label.png";
              a.click();
            };
          }
        } else {
          const a = document.createElement("a");
          a.href = dataUrl;
          a.download = "label.png";
          a.click();
        }
        setStatus($("#status"), "ok", "Preview OK.");
      } catch (e) {
        setStatus($("#status"), "err", "Preview lỗi: " + e.message);
      }
    };

    row.appendChild(btnMain);
    row.appendChild(btnPrev);
    grid.appendChild(row);
  }

  setStatus($("#status"), "ok", "Ready.");
}

// ================= INIT =================

function init() {
  // migrate old single-template to multi-template if needed
  try {
    migrateLegacyIfNeeded({
      defaultName: "default",
      labelFromSettings: settings?.label,
    });
  } catch (e) {
    console.warn("migrateLegacyIfNeeded failed:", e);
  }

  refreshTemplateDropdown();

  $("#tplSelect")?.addEventListener("change", buildButtons);
  $("#btnGen")?.addEventListener("click", buildButtons);

  // Modal close if exists
  $("#btnClose")?.addEventListener("click", () => {
    const m = $("#mask");
    if (m) m.style.display = "none";
  });
  $("#mask")?.addEventListener("click", (e) => {
    const m = $("#mask");
    if (m && e.target === m) m.style.display = "none";
  });

  buildButtons();
}

init();
