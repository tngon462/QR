// print.js
import { LS_KEYS, DEFAULTS } from "./app-config.js";
import { loadJSON, setStatus, gramsToSuffix, calcAmount } from "./utils.js";
import { renderTemplateToDataURL } from "./template.js";

const $ = (s) => document.querySelector(s);

const settings = loadJSON(LS_KEYS.SETTINGS, DEFAULTS.settings);
const label = settings.label;

function getTemplateJson() {
  const json = localStorage.getItem(LS_KEYS.TEMPLATE_JSON);
  if (!json) throw new Error("Chưa có template. Vào Designer bấm Reset + Save trước.");
  return json;
}

function buildVars({ base, name, grams, pricePerKg, indo, myanma, japan, english }) {
  const suffix = gramsToSuffix(grams);
  const barcode = `${base}T${suffix}`;
  const amount = calcAmount(pricePerKg, grams);
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

async function previewOne(vars) {
  const tpl = getTemplateJson();
  const url = await renderTemplateToDataURL(tpl, label, vars, 3);
  $("#previewImg").src = url;
  $("#previewInfo").textContent = `${label.width_mm}×${label.height_mm}mm @${label.dpi}dpi — ${vars.barcode}`;
}

function generate() {
  const base = $("#baseCode").value.trim() || "123456";
  const name = $("#name").value.trim() || "Item";
  const pricePerKg = Number($("#pricePerKg").value || 0);

  const minG = Number($("#minGram").value || 0);
  const maxG = Number($("#maxGram").value || 0);
  const stepG = Number($("#stepGram").value || 10);

  const indo = $("#indo").value.trim();
  const myanma = $("#myanma").value.trim();
  const japan = $("#japan").value.trim();
  const english = $("#english").value.trim();

  const grid = $("#grid");
  grid.innerHTML = "";

  if (minG <= 0 || maxG <= 0 || stepG <= 0 || minG > maxG) {
    setStatus($("#status"), "err", "Thông số gram không hợp lệ.");
    return;
  }

  const tpl = localStorage.getItem(LS_KEYS.TEMPLATE_JSON);
  if (!tpl) {
    setStatus($("#status"), "err", "Chưa có template. Vào Designer -> Reset sample -> Save.");
    return;
  }

  const weights = [];
  for (let g = minG; g <= maxG; g += stepG) weights.push(g);

  weights.forEach((grams) => {
    const vars = buildVars({ base, name, grams, pricePerKg, indo, myanma, japan, english });

    const wrap = document.createElement("div");
    wrap.className = "cardBtn";

    const meta = document.createElement("div");
    meta.className = "meta";
    meta.innerHTML = `<b>${vars.weight_kg.toFixed(2)}kg – ¥${vars.amount}</b><small>${vars.barcode}</small>`;

    const actions = document.createElement("div");
    actions.style.display = "flex";
    actions.style.gap = "6px";

    const btnPrint = document.createElement("button");
    btnPrint.textContent = "Print";
    btnPrint.disabled = true; // phase 1 chưa in
    btnPrint.title = "Phase 1 chưa kết nối Hub";

    const btnPrev = document.createElement("button");
    btnPrev.textContent = "👁 Preview";
    btnPrev.onclick = async () => {
      try {
        setStatus($("#status"), "ok", "Đang render preview…");
        await previewOne(vars);
        setStatus($("#status"), "ok", "Preview OK.");
      } catch (e) {
        setStatus($("#status"), "err", "Preview lỗi: " + e.message);
      }
    };

    actions.appendChild(btnPrev);
    actions.appendChild(btnPrint);

    wrap.appendChild(meta);
    wrap.appendChild(actions);
    grid.appendChild(wrap);
  });

  setStatus($("#status"), "ok", `Đã tạo ${weights.length} nút. Bấm 👁 Preview để xem tem.`);
}

$("#btnGenerate").onclick = () => {
  try {
    generate();
  } catch (e) {
    setStatus($("#status"), "err", e.message);
  }
};

// auto generate once
generate();
