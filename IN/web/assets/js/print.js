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

console.log("PRINT JS VERSION 2026-TPL-MULTI");

const $ = (s) => document.querySelector(s);
const Konva = window.Konva;

const BG_NAME = "__bg_white";

// ================= LOAD SETTINGS =================
const settings = loadJSON(LS_KEYS.SETTINGS, DEFAULTS.settings);

// Hub config (đúng cấu trúc mới)
const HUB_URL = settings?.hub?.url || DEFAULTS.settings?.hub?.url || "";
const HUB_TOKEN = settings?.hub?.token || DEFAULTS.settings?.hub?.token || "";
const HUB_PRINTER = settings?.hub?.printer || "";

// Copies (nếu chưa có thì =1)
const COPIES = settings?.copies || 1;

// Label runtime (gap/threshold from settings; width/height from template meta)
const LABEL_RUNTIME = {
  gap_mm: settings?.label?.gap_mm ?? 2,
  threshold: settings?.label?.threshold ?? 180,
};

// Lấy origin http://ip:port
function getHubOrigin() {
  if (!HUB_URL) return "";
  try {
    const u = new URL(HUB_URL);
    return `${u.protocol}//${u.host}`;
  } catch {
    return HUB_URL;
  }
}

// ================= TEMPLATE UI =================
function slugifyLocal(name){
  const base = String(name || "").trim() || "template";
  const noAcc = base.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const slug = noAcc.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0,80);
  return slug || ("tpl-" + Math.floor(Date.now()/1000));
}

function refreshTemplateDropdown() {
  const sel = $("#tplSelect");
  const idx = listTemplates();

  sel.innerHTML = "";
  if (idx.length === 0) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "(no templates)";
    sel.appendChild(opt);
    return;
  }

  idx.forEach((it) => {
    const opt = document.createElement("option");
    opt.value = it.name;
    opt.textContent = it.name;
    sel.appendChild(opt);
  });

  // restore last used
  const lastSlug = getLastUsed();
  if (lastSlug) {
    const found = Array.from(sel.options).find(
      (o) => slugifyLocal(o.value) === lastSlug
    );
    if (found) sel.value = found.value;
  }
}

function getSelectedSlug() {
  const name = ($("#tplSelect")?.value || "").trim();
  if (!name) return "";
  return slugifyLocal(name);
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

function ensureWhiteBackground(stg) {
  const w = stg.width();
  const h = stg.height();
  let bg =
    stg.findOne(`.${BG_NAME}`) ||
    stg.findOne((n) => n.className === "Rect" && n.name && n.name() === BG_NAME);

  if (!bg) {
    bg = new Konva.Rect({
      x: 0,
      y: 0,
      width: w,
      height: h,
      fill: "#ffffff",
      listening: false,
      draggable: false,
      name: BG_NAME,
    });
    const layers = stg.getChildren().filter((n) => n.className === "Layer");
    const best = layers.sort((a, b) => b.getChildren().length - a.getChildren().length)[0];
    if (best) best.add(bg);
  } else {
    bg.position({ x: 0, y: 0 });
    bg.size({ width: w, height: h });
    bg.fill("#ffffff");
    bg.listening(false);
    bg.draggable(false);
  }
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

function getSelectedTemplateOrThrow() {
  const slug = getSelectedSlug();
  if (!slug) throw new Error("Chưa chọn template.");
  const tpl = getTemplate(slug);
  if (!tpl) throw new Error("Không tìm thấy template. Vào Designer → Save As... trước.");
  setLastUsed(slug);
  return tpl;
}

async function renderLabelToPng(vars) {
  const tpl = getSelectedTemplateOrThrow();

  const { stg, div } = makeTempStageFromTemplate(tpl.templateJson);

  // Always force white background in render
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

// ================= PRINT =================
function openBridgeAndSend(pngDataUrl, tpl) {
  if (!HUB_URL) {
    throw new Error("Chưa cấu hình Hub URL trong Settings.");
  }

  const origin = getHubOrigin();
  const bridgeUrl = `${origin}/bridge?printer=` + encodeURIComponent(HUB_PRINTER || "");
  const w = window.open(bridgeUrl, "_blank");
  if (!w) throw new Error("Popup bị chặn.");

  const metaLabel = tpl?.meta?.label || {};
  const w_mm = Number(metaLabel.width_mm || settings?.label?.width_mm || 60);
  const h_mm = Number(metaLabel.height_mm || settings?.label?.height_mm || 40);

  const payload = {
    type: "PRINT_PNG",
    token: HUB_TOKEN,
    printer_name: HUB_PRINTER,
    copies: COPIES,
    png_base64: pngDataUrl,
    label: {
      w_mm,
      h_mm,
      gap_mm: LABEL_RUNTIME.gap_mm,
      x: 0,
      y: 0,
      threshold: LABEL_RUNTIME.threshold,
    },
  };

  // Đợi bridge load xong rồi gửi 1 lần
  w.onload = () => {
    w.postMessage(payload, origin);
  };
}

// ================= PREVIEW =================
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
async function buildButtons() {
  const grid = $("#grid");
  grid.innerHTML = "";

  const idx = listTemplates();
  if (idx.length === 0) {
    setStatus(
      $("#status"),
      "err",
      "Chưa có template nào. Vào Designer → Save As... để tạo template trước."
    );
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

    const btnPrev = document.createElement("button");
    btnPrev.className = "btnMini";
    btnPrev.textContent = "Xem trước";

    btnPrev.onclick = async () => {
      try {
        const { dataUrl } = await renderLabelToPng(vars);
        showModal(
          `${vars.barcode} • ${vars.weight_kg.toFixed(2)}kg • ¥${vars.amount}`,
          dataUrl
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

  setStatus($("#status"), "ok", `Hub: ${HUB_URL} | Printer: ${HUB_PRINTER || "default"}`);
}

// ================= INIT =================
function init() {
  // migrate legacy single-template key if needed (uses settings label only to create default meta)
  migrateLegacyIfNeeded({ defaultName: "default", labelFromSettings: settings.label });

  refreshTemplateDropdown();

  $("#tplSelect").addEventListener("change", () => {
    // persist selection
    const slug = getSelectedSlug();
    if (slug) setLastUsed(slug);
    // regen buttons for new template context
    buildButtons().catch(()=>{});
  });

  $("#btnGen").onclick = () => buildButtons().catch(()=>{});
  buildButtons().catch(()=>{});
}

init();
