import { LS_KEYS, DEFAULTS } from "./app-config.js";
import { loadJSON, mmToPx, setStatus, gramsToSuffix, calcAmount } from "./utils.js";
import { substituteTextNodes, setBarcodeImage } from "./template.js";

const $ = (s) => document.querySelector(s);
const Konva = window.Konva;

const settings = loadJSON(LS_KEYS.SETTINGS, DEFAULTS.settings);

function getVars(baseCode, name, grams, pricePerKg, extra){
  const suffix = gramsToSuffix(grams);
  const barcode = `${baseCode}T${suffix}`;
  const amount = calcAmount(pricePerKg, grams);
  return {
    name,
    weight_g: grams,
    weight_kg: Number((grams/1000).toFixed(2)),
    amount,
    barcode,
    indo: extra.indo || "",
    myanma: extra.myanma || "",
    japan: extra.japan || "",
    english: extra.english || ""
  };
}

function makeTempStageFromTemplate(templateJson){
  // render into offscreen div
  const div = document.createElement("div");
  div.style.position = "absolute";
  div.style.left = "-99999px";
  div.style.top = "-99999px";
  document.body.appendChild(div);

  const stg = Konva.Node.create(templateJson, div);
  return { stg, div };
}

async function renderLabelToJpg(vars){
  const templateJson = localStorage.getItem(LS_KEYS.TEMPLATE_JSON);
  if(!templateJson) throw new Error("Chưa có template. Vào Designer → Save Template trước.");

  const { stg, div } = makeTempStageFromTemplate(templateJson);

  substituteTextNodes(stg, vars);
  await setBarcodeImage(stg, vars.barcode);

  stg.draw();

  // JPG preview
  const dataUrl = stg.toDataURL({ pixelRatio: 2, mimeType: "image/jpeg", quality: 0.92 });

  stg.destroy();
  div.remove();
  return dataUrl;
}

function showModal(title, dataUrl){
  $("#mTitle").textContent = title;
  $("#mImg").src = dataUrl;

  $("#mask").style.display = "flex";

  $("#btnDownload").onclick = () => {
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = "label.jpg";
    a.click();
  };
}

function hideModal(){
  $("#mask").style.display = "none";
  $("#mImg").src = "";
}

$("#btnClose").onclick = hideModal;
$("#mask").addEventListener("click", (e) => {
  if(e.target === $("#mask")) hideModal();
});

function buildButtons(){
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

  if(!baseCode) return setStatus($("#status"), "err", "Thiếu baseCode.");
  if(!name) return setStatus($("#status"), "err", "Thiếu name.");
  if(!pricePerKg) return setStatus($("#status"), "err", "Thiếu giá/1kg.");
  if(minGram <= 0 || maxGram <= 0 || stepGram <= 0) return setStatus($("#status"), "err", "min/max/step phải > 0.");
  if(minGram > maxGram) return setStatus($("#status"), "err", "minGram > maxGram.");

  const grid = $("#grid");
  grid.innerHTML = "";

  for(let g = minGram; g <= maxGram; g += stepGram){
    const vars = getVars(baseCode, name, g, pricePerKg, extra);

    const row = document.createElement("div");
    row.className = "btnRow";

    const btnMain = document.createElement("button");
    btnMain.className = "btnMain";
    btnMain.textContent = `${vars.weight_kg.toFixed(2)}kg – ¥${vars.amount}`;

    // Nút in thật: hiện tại chưa setup hub -> tạm báo
    btnMain.onclick = async () => {
      setStatus($("#status"), "err", "Chưa setup Print Hub/máy in. Dùng nút Xem trước để test hình tem.");
    };

    const btnPrev = document.createElement("button");
    btnPrev.className = "btnMini";
    btnPrev.textContent = "Xem trước";
    btnPrev.onclick = async () => {
      try{
        setStatus($("#status"), "ok", "Đang render preview...");
        const jpg = await renderLabelToJpg(vars);
        showModal(`${vars.barcode} • ${vars.weight_kg.toFixed(2)}kg • ¥${vars.amount}`, jpg);
        setStatus($("#status"), "ok", "Preview OK.");
      }catch(e){
        setStatus($("#status"), "err", "Preview lỗi: " + e.message);
      }
    };

    row.appendChild(btnMain);
    row.appendChild(btnPrev);

    grid.appendChild(row);
  }

  setStatus($("#status"), "ok", "Generate xong. Bấm Xem trước để xem ảnh JPG.");
}

$("#btnGen").onclick = buildButtons;

// auto generate once
buildButtons();
