import { LS_KEYS, DEFAULTS } from "./app-config.js";
import { loadJSON, setStatus, gramsToSuffix, calcAmount } from "./utils.js";
import { substituteTextNodes, setBarcodeImage } from "./template.js";

const $ = (s) => document.querySelector(s);
const Konva = window.Konva;

// ====== CONFIG: PC + Printer ======
const PRINT_HUB_IP = "192.168.68.112";
const PRINT_HUB_PORT = 5055;
const PRINTER_NAME = "Munbyn ITPP130(2)";

// Match với Python
const PRINT_TOKEN = "6868-XYZ-2026";

// Label size (mm) đúng khổ sếp in
const LABEL_MM = { w_mm: 60, h_mm: 40, gap_mm: 2, x: 0, y: 0 };

// Web app settings (để dành nếu cần)
const settings = loadJSON(LS_KEYS.SETTINGS, DEFAULTS.settings);

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
  if (!templateJson) throw new Error("Chưa có template. Vào Designer → Save Template trước.");

  const { stg, div } = makeTempStageFromTemplate(templateJson);

  substituteTextNodes(stg, vars);
  await setBarcodeImage(stg, vars.barcode);

  stg.draw();

  // PNG để in (lossless). pixelRatio tăng độ nét
  const dataUrl = stg.toDataURL({ pixelRatio: 2, mimeType: "image/png" });

  stg.destroy();
  div.remove();
  return dataUrl;
}

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

function openBridgeAndSend(pngDataUrl, vars) {
  const bridgeOrigin = `http://${PRINT_HUB_IP}:${PRINT_HUB_PORT}`;
  const bridgeUrl = `${bridgeOrigin}/bridge?printer=${encodeURIComponent(PRINTER_NAME)}`;

  // NOTE: window.open phải chạy trực tiếp trong click handler mới ít bị popup-block
  const w = window.open(bridgeUrl, "_blank");
  if (!w) {
    throw new Error("Popup bị chặn. Cho phép pop-up cho trang này rồi thử lại.");
  }

  const msg = {
    type: "PRINT_PNG",
    token: PRINT_TOKEN,
    printer_name: PRINTER_NAME,
    png_base64: pngDataUrl, // data:image/png;base64,...
    label: LABEL_MM,
    meta: {
      barcode: vars.barcode,
      name: vars.name,
      amount: vars.amount,
      weight_g: vars.weight_g,
    },
  };

  // Gửi nhiều lần vài nhịp để chắc chắn bridge đã load xong
  let tries = 0;
  const timer = setInterval(() => {
    tries++;
    try {
      w.postMessage(msg, bridgeOrigin);
    } catch (_) {}

    if (tries >= 20) clearInterval(timer); // ~6s
  }, 300);
}

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
  if (minGram <= 0 || maxGram <= 0 || stepGram <= 0) return setStatus($("#status"), "err", "min/max/step phải > 0.");
  if (minGram > maxGram) return setStatus($("#status"), "err", "minGram > maxGram.");

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
        setStatus($("#status"), "ok", `Đang render PNG ${vars.barcode}...`);
        const png = await renderLabelToPng(vars);
        setStatus($("#status"), "ok", `Mở Print Bridge → in ${vars.barcode}...`);
        openBridgeAndSend(png, vars);
        setStatus($("#status"), "ok", `Đã gửi lệnh in: ${vars.barcode}. (Xem cửa sổ Bridge)`);
      } catch (e) {
        setStatus($("#status"), "err", "In lỗi: " + (e?.message || e));
      }
    };

    const btnPrev = document.createElement("button");
    btnPrev.className = "btnMini";
    btnPrev.textContent = "Xem trước";
    btnPrev.onclick = async () => {
      try {
        setStatus($("#status"), "ok", "Đang render preview PNG...");
        const png = await renderLabelToPng(vars);
        showModal(`${vars.barcode} • ${vars.weight_kg.toFixed(2)}kg • ¥${vars.amount}`, png);
        setStatus($("#status"), "ok", "Preview OK.");
      } catch (e) {
        setStatus($("#status"), "err", "Preview lỗi: " + e.message);
      }
    };

    row.appendChild(btnMain);
    row.appendChild(btnPrev);
    grid.appendChild(row);
  }

  setStatus($("#status"), "ok", `Generate xong. In qua hub: ${PRINT_HUB_IP} | Printer: ${PRINTER_NAME}`);
}

$("#btnGen").onclick = buildButtons;

// auto generate once
buildButtons();
