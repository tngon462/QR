import { LS_KEYS, DEFAULTS } from "./app-config.js";
import {
  loadJSON, saveJSON, setStatus, fetchWithTimeout,
  gramsToSuffix, calcAmount, mmToPx
} from "./utils.js";
import { substituteTextNodes, setBarcodeImage } from "./template.js";

const $ = (s) => document.querySelector(s);

let settings = loadJSON(LS_KEYS.SETTINGS, DEFAULTS.settings);
let form = loadJSON(LS_KEYS.LAST_FORM, DEFAULTS.printForm);

function fillForm(){
  $("#baseCode").value = form.baseCode || "";
  $("#name").value = form.name || "";
  $("#pricePerKg").value = form.pricePerKg ?? 0;
  $("#minGram").value = form.minGram ?? 500;
  $("#maxGram").value = form.maxGram ?? 2000;
  $("#stepGram").value = form.stepGram ?? 50;
}
function readForm(){
  form = {
    baseCode: $("#baseCode").value.trim(),
    name: $("#name").value.trim(),
    pricePerKg: Number($("#pricePerKg").value || 0),
    minGram: Number($("#minGram").value || 0),
    maxGram: Number($("#maxGram").value || 0),
    stepGram: Number($("#stepGram").value || 0),
  };
}

$("#btnSaveForm").onclick = () => {
  readForm();
  saveJSON(LS_KEYS.LAST_FORM, form);
  setStatus($("#status"), "ok", "Đã lưu form.");
};

$("#btnClear").onclick = () => {
  $("#grid").innerHTML = "";
  setStatus($("#status"), "", "Đã clear.");
};

function getTemplateJSON(){
  const json = localStorage.getItem(LS_KEYS.TEMPLATE_JSON);
  return json || "";
}

function buildWeights(minG, maxG, stepG){
  const arr = [];
  for(let g = minG; g <= maxG; g += stepG){
    arr.push(g);
  }
  return arr;
}

async function renderLabelPNG(vars){
  // Create stage from saved template json, substitute, export PNG
  const Konva = window.Konva;
  const label = settings.label;

  const stageW = mmToPx(label.width_mm, label.dpi);
  const stageH = mmToPx(label.height_mm, label.dpi);

  // build stage
  const json = getTemplateJSON();
  if(!json){
    throw new Error("Chưa có template. Vào Designer -> Save Template.");
  }

  // create a stage from JSON into hidden container
  // Konva.Node.create returns Stage
  const node = Konva.Node.create(json, "renderStage");
  const stage = node;

  stage.width(stageW);
  stage.height(stageH);

  // Substitute
  substituteTextNodes(stage, vars);
  await setBarcodeImage(stage, vars.barcode);

  stage.draw();

  // Export
  const dataUrl = stage.toDataURL({ pixelRatio: 2 }); // nét hơn
  stage.destroy();
  $("#renderStage").innerHTML = "";
  return dataUrl;
}

async function sendToHub(payload){
  const url = settings.hubUrl.replace(/\/+$/,"") + "/print";
  const res = await fetchWithTimeout(url, {
    method: "POST",
    headers: { "Content-Type":"application/json" },
    body: JSON.stringify(payload)
  }, settings.requestTimeoutMs);

  const txt = await res.text();
  let data = null;
  try{ data = JSON.parse(txt); }catch{}
  if(!res.ok){
    throw new Error((data && data.error) ? data.error : (txt || ("HTTP " + res.status)));
  }
  return data || { ok:true };
}

function makeTile(grams, amount){
  const btn = document.createElement("button");
  btn.className = "btnTile";
  btn.innerHTML = `
    <div class="top">${(grams/1000).toFixed(2)}kg – ¥${amount}</div>
    <div class="sub">${grams}g</div>
  `;
  return btn;
}

$("#btnGen").onclick = async () => {
  settings = loadJSON(LS_KEYS.SETTINGS, DEFAULTS.settings);
  readForm();

  if(!settings.hubUrl || !settings.token){
    setStatus($("#status"), "err", "Chưa cấu hình Hub URL / token. Vào Settings.");
    return;
  }

  const weights = buildWeights(form.minGram, form.maxGram, form.stepGram);
  if(weights.length === 0){
    setStatus($("#status"), "err", "Dải gram không hợp lệ.");
    return;
  }

  $("#grid").innerHTML = "";
  setStatus($("#status"), "", `Đã generate ${weights.length} nút. Hub: ${settings.hubUrl}`);

  for(const g of weights){
    const suffix = gramsToSuffix(g);
    const barcode = `${form.baseCode}T${suffix}`;
    const amount = calcAmount(form.pricePerKg, g);
    const wkg = Number((g/1000).toFixed(2));

    const btn = makeTile(g, amount);
    btn.onclick = async () => {
      btn.disabled = true;
      try{
        setStatus($("#status"), "", `Đang render + gửi in: ${barcode} ...`);

        const vars = {
          barcode,
          name: form.name,
          weight_g: g,
          weight_kg: wkg,
          amount
        };

        const image_png_base64 = await renderLabelPNG(vars);

        const payload = {
          token: settings.token,
          printer: settings.printer || undefined,
          copies: settings.copies || 1,
          label: settings.label,
          job: vars,
          image_png_base64
        };

        await sendToHub(payload);
        setStatus($("#status"), "ok", `Đã gửi in OK: ${barcode}`);
      }catch(e){
        setStatus($("#status"), "err", `Lỗi in: ${e.message}`);
      }finally{
        btn.disabled = false;
      }
    };

    $("#grid").appendChild(btn);
  }

  saveJSON(LS_KEYS.LAST_FORM, form);
};

fillForm();
