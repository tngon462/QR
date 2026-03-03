import { LS_KEYS, DEFAULTS } from "./app-config.js";
import { loadJSON, saveJSON, setStatus } from "./utils.js";

const $ = (s) => document.querySelector(s);

let settings = loadJSON(LS_KEYS.SETTINGS, DEFAULTS.settings);

function fill(){
  $("#hub_url").value = settings?.hub?.url || "";
  $("#hub_token").value = settings?.hub?.token || "";
  $("#printer").value = settings?.hub?.printer || "";
  $("#copies").value = settings?.copies || 1;

  const lb = settings.label || {};
  $("#wmm").value = lb.width_mm ?? 60;
  $("#hmm").value = lb.height_mm ?? 40;
  $("#dpi").value = lb.dpi ?? 203;
  $("#gapmm").value = lb.gap_mm ?? 2;
  $("#threshold").value = lb.threshold ?? 180;
}

function save(){

  settings.hub = {
    url: $("#hub_url").value.trim(),
    token: $("#hub_token").value.trim(),
    printer: $("#printer").value.trim(),
  };

  settings.copies = Number($("#copies").value || 1);

  settings.label = {
    width_mm: Number($("#wmm").value || 60),
    height_mm: Number($("#hmm").value || 40),
    dpi: Number($("#dpi").value || 203),
    gap_mm: Number($("#gapmm").value || 2),
    threshold: Number($("#threshold").value || 180),
  };

  saveJSON(LS_KEYS.SETTINGS, settings);
  setStatus($("#status"), "ok", "Đã lưu Settings (hub structure OK).");
}

$("#btnSave").onclick = save;
fill();
