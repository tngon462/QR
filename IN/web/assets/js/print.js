import { LS_KEYS, DEFAULTS } from "./app-config.js";
import { loadJSON, setStatus, gramsToSuffix, calcAmount } from "./utils.js";
import { substituteTextNodes, setBarcodeImage } from "./template.js";

const $ = (s) => document.querySelector(s);
const Konva = window.Konva;

// ================= SETTINGS =================
const settings = loadJSON(LS_KEYS.SETTINGS, DEFAULTS.settings);

// Safe access
const HUB_URL = settings?.hub?.url || DEFAULTS.settings.hub.url;
const HUB_TOKEN = settings?.hub?.token || DEFAULTS.settings.hub.token;
const HUB_PRINTER = settings?.hub?.printer || "";

const LABEL = {
  w_mm: settings?.label?.width_mm || 60,
  h_mm: settings?.label?.height_mm || 40,
  gap_mm: settings?.label?.gap_mm ?? 2,
  dpi: settings?.label?.dpi || 203,
  threshold: settings?.label?.threshold ?? 180,
};

const COPIES = settings?.copies || 1;

// Extract origin từ hub_url
function getHubOrigin() {
  try {
    const u = new URL(HUB_URL);
    return `${u.protocol}//${u.host}`;
  } catch {
    return HUB_URL;
  }
}

// ================= TEMPLATE RENDER =================

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
  const templateJson = localStorage.getItem(LS_KEYS.TEMPLATE_JSON);
  if (!templateJson)
    throw new Error("Chưa có template. Vào Designer → Save Template trước.");

  const { stg, div } = makeTempStageFromTemplate(templateJson);

  substituteTextNodes(stg, vars);
  await setBarcodeImage(stg, vars.barcode);

  stg.draw();

  const dataUrl = stg.toDataURL({
    pixelRatio: 2,
    mimeType: "image/png",
  });

  stg.destroy();
  div.remove();
  return dataUrl;
}

// ================= PRINT BRIDGE =================

function openBridgeAndSend(pngDataUrl, vars) {
  if (!HUB_URL) {
    throw new Error("Chưa cấu hình Hub URL trong Settings.");
  }

  const origin = getHubOrigin();
  const bridgeUrl = `${origin}/bridge?printer=${encodeURIComponent(
    HUB_PRINTER || ""
  )}`;

  const w = window.open(bridgeUrl, "_blank");
  if (!w) {
    throw new Error("Popup bị chặn. Cho phép pop-up rồi thử lại.");
  }

  const payload = {
    type: "PRINT_PNG",
    token: HUB_TOKEN,
    printer_name: HUB_PRINTER,
    copies: COPIES,
    png_base64: pngDataUrl,
    label: {
      w_mm: LABEL.w_mm,
      h_mm: LABEL.h_mm,
      gap_mm: LABEL.gap_mm,
      x: 0,
      y: 0,
      threshold: LABEL.threshold,
    },
    meta: {
      barcode: vars.barcode,
      name: vars.name,
      amount: vars.amount,
      weight_g: vars.weight_g,
    },
  };

  let tries = 0;
  const timer = setInterval(() => {
    tries++;
    try {
      w.postMessage(payload, origin);
    } catch (_) {}

    if (tries > 20) clearInterval(timer);
  }, 300);
}

// ================= PREVIEW MODAL =================

function showModal(title, dataUrl) {
  $("#mTitle").textContent = title;
  $("#mImg").src = dataUrl;
  $("#mask").style.display = "flex";

  $("#btnDownload").onclick = () => {
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = "label.png";
    a.click();
  };
}

function hideModal() {
  $("#mask").style.display = "none";
  $("#mImg").src = "";
}

$("#btnClose").onclick = hideModal;
$("#mask").addEventListener("click", (e) => {
  if (e.target === $("#mask")) hideModal();
});

// ================= BUILD BUTTONS =================

function buildButtons() {
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
  if (minGram > maxGram)
    return setStatus($("#status"), "err", "minGram > maxGram.");

  const grid = $("#grid");
  grid.innerHTML = "";

  for (let g = minGram; g <= maxGram; g += stepGram) {
    const vars = getVars(baseCode, name, g, pricePerKg, extra);

    const row = document.createElement("div");
    row.className = "btnRow";

    const btnMain = document.createElement("button");
    btnMain.className = "btnMain";
    btnMain.textContent = `${vars.weight_kg.toFixed(2)}kg – ¥${vars.amount}`;

    btnMain.onclick = async () => {
      try {
        setStatus($("#status"), "ok", `Render PNG ${vars.barcode}...`);
        const png = await renderLabelToPng(vars);
        setStatus($("#status"), "ok", "Mở Print Bridge...");
        openBridgeAndSend(png, vars);
        setStatus($("#status"), "ok", `Đã gửi lệnh in ${vars.barcode}`);
      } catch (e) {
        setStatus($("#status"), "err", "In lỗi: " + e.message);
      }
    };

    const btnPrev = document.createElement("button");
    btnPrev.className = "btnMini";
    btnPrev.textContent = "Xem trước";
    btnPrev.onclick = async () => {
      try {
        const png = await renderLabelToPng(vars);
        showModal(
          `${vars.barcode} • ${vars.weight_kg.toFixed(2)}kg • ¥${vars.amount}`,
          png
        );
        setStatus($("#status"), "ok", "Preview OK.");
      } catch (e) {
        setStatus($("#status"), "err", "Preview lỗi: " + e.message);
      }
    };

    row.appendChild(btnMain);
    row.appendChild(btnPrev);
    grid.appendChild(row);
  }

  setStatus(
    $("#status"),
    "ok",
    `Hub: ${HUB_URL} | Printer: ${HUB_PRINTER || "default"}`
  );
}

$("#btnGen").onclick = buildButtons;
buildButtons();
