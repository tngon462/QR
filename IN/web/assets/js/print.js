// IN/web/assets/js/print.js
import { LS_KEYS, DEFAULTS } from "./app-config.js";
import {
  loadJSON, setStatus, gramsToSuffix, calcAmount, hubFetchJSON, dataUrlToBase64, mmToPx
} from "./utils.js";
import { substituteTextNodes, setBarcodeImage } from "./template.js";

const $ = (s) => document.querySelector(s);
const Konva = window.Konva;

let settings = loadJSON(LS_KEYS.SETTINGS, DEFAULTS.settings);

function buildButtons(){
  const baseCode = $("#baseCode").value.trim();
  const name = $("#name").value.trim();
  const pricePerKg = Number($("#pricePerKg").value || 0);
  const minGram = Number($("#minGram").value || 0);
  const maxGram = Number($("#maxGram").value || 0);
  const stepGram = Number($("#stepGram").value || 10);

  if(!baseCode) return setStatus($("#status"), "err", "Thiếu baseCode");
  if(minGram <= 0 || maxGram <= 0 || stepGram <= 0 || maxGram < minGram){
    return setStatus($("#status"), "err", "min/max/step không hợp lệ");
  }

  const box = $("#grid");
  box.innerHTML = "";

  for(let g=minGram; g<=maxGram; g+=stepGram){
    const suffix = gramsToSuffix(g);
    const barcode = `${baseCode}T${suffix}`;
    const amount = calcAmount(pricePerKg, g);
    const kg = (g/1000).toFixed(2);

    const btn = document.createElement("button");
    btn.className = "weight-btn";
    btn.innerHTML = `<div class="k">${kg}kg</div><div class="v">¥${amount}</div><div class="b">${barcode}</div>`;
    btn.onclick = () => doPrint({ baseCode, name, pricePerKg, grams:g });
    box.appendChild(btn);
  }

  setStatus($("#status"), "ok", "Đã tạo nút.");
}

async function renderPNG(jobVars){
  const label = settings.label;

  const w = mmToPx(label.width_mm, label.dpi);
  const h = mmToPx(label.height_mm, label.dpi);

  const json = localStorage.getItem(LS_KEYS.TEMPLATE_JSON);
  if(!json) throw new Error("Chưa có template. Vào Designer -> Reset Sample -> Save Template.");

  const tmpDiv = document.createElement("div");
  tmpDiv.style.position = "absolute";
  tmpDiv.style.left = "-99999px";
  tmpDiv.style.top = "-99999px";
  document.body.appendChild(tmpDiv);

  const stage = Konva.Node.create(json, tmpDiv);
  stage.size({ width:w, height:h });

  const vars = {
    name: jobVars.name || "",
    weight_g: jobVars.grams,
    weight_kg: Number((jobVars.grams/1000).toFixed(2)),
    amount: jobVars.amount,
    barcode: jobVars.barcode
  };

  substituteTextNodes(stage, vars);
  await setBarcodeImage(stage, vars.barcode);

  stage.draw();

  const dataUrl = stage.toDataURL({ pixelRatio: 2 });

  stage.destroy();
  tmpDiv.remove();

  return dataUrl;
}

async function doPrint({ baseCode, name, pricePerKg, grams }){
  const btns = Array.from(document.querySelectorAll(".weight-btn"));
  btns.forEach(b => b.disabled = true);

  try{
    const suffix = gramsToSuffix(grams);
    const barcode = `${baseCode}T${suffix}`;
    const amount = calcAmount(pricePerKg, grams);

    // render
    const png = await renderPNG({ barcode, name, grams, amount });

    // show preview
    $("#lastPreview").src = png;

    // send to hub
    const payload = {
      token: settings.hub_token,
      printer: settings.printer || undefined,
      copies: Number(settings.copies || 1),
      label: { ...settings.label },
      job: {
        barcode,
        name,
        weight_g: grams,
        weight_kg: Number((grams/1000).toFixed(2)),
        amount
      },
      image_png_base64: dataUrlToBase64(png)
    };

    const url = (settings.hub_url || "").replace(/\/+$/,"") + "/print";
    setStatus($("#status"), "", "Đang gửi lệnh in...");
    await hubFetchJSON(url, payload);

    setStatus($("#status"), "ok", `Đã gửi in: ${barcode}`);
  }catch(e){
    setStatus($("#status"), "err", "In lỗi: " + e.message);
  }finally{
    btns.forEach(b => b.disabled = false);
  }
}

$("#btnGenerate").onclick = buildButtons;

// init defaults
$("#baseCode").value = "123456";
$("#name").value = "Thịt bò";
$("#pricePerKg").value = 10000;
$("#minGram").value = 500;
$("#maxGram").value = 2000;
$("#stepGram").value = 50;
