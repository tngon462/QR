// IN/web/assets/js/settings.js
import { LS_KEYS, DEFAULTS } from "./app-config.js";
import { loadJSON, saveJSON, setStatus } from "./utils.js";

const $ = (s) => document.querySelector(s);

let settings = loadJSON(LS_KEYS.SETTINGS, DEFAULTS.settings);

function fill(){
  $("#hub_url").value = settings.hub_url || "";
  $("#hub_token").value = settings.hub_token || "";
  $("#printer").value = settings.printer || "";
  $("#copies").value = settings.copies || 1;

  $("#wmm").value = settings.label.width_mm;
  $("#hmm").value = settings.label.height_mm;
  $("#dpi").value = settings.label.dpi;
}

function save(){
  settings.hub_url = $("#hub_url").value.trim();
  settings.hub_token = $("#hub_token").value.trim();
  settings.printer = $("#printer").value.trim();
  settings.copies = Number($("#copies").value || 1);

  settings.label = {
    width_mm: Number($("#wmm").value || 50),
    height_mm: Number($("#hmm").value || 30),
    dpi: Number($("#dpi").value || 203),
  };

  saveJSON(LS_KEYS.SETTINGS, settings);
  setStatus($("#status"), "ok", "Đã lưu Settings.");
}

$("#btnSave").onclick = save;
fill();
