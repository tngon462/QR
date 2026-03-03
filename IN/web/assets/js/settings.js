import { LS_KEYS, DEFAULTS } from "./app-config.js";
import { loadJSON, saveJSON, setStatus } from "./utils.js";

const $ = (s) => document.querySelector(s);

// Load settings hoặc dùng default
let settings = loadJSON(LS_KEYS.SETTINGS, DEFAULTS.settings);

// ===== SAFE GET ELEMENT =====
function val(id, fallback = "") {
  const el = $(id);
  return el ? el.value : fallback;
}

function num(id, fallback = 0) {
  const el = $(id);
  if (!el) return fallback;
  const n = Number(el.value);
  return isNaN(n) ? fallback : n;
}

// ===== FILL FORM =====
function fill() {
  // HUB
  if ($("#hub_url")) $("#hub_url").value = settings?.hub?.url || "";
  if ($("#hub_token")) $("#hub_token").value = settings?.hub?.token || "";
  if ($("#printer")) $("#printer").value = settings?.hub?.printer || "";
  if ($("#copies")) $("#copies").value = settings?.copies || 1;

  // LABEL
  const lb = settings?.label || {};
  if ($("#wmm")) $("#wmm").value = lb.width_mm ?? 60;
  if ($("#hmm")) $("#hmm").value = lb.height_mm ?? 40;
  if ($("#dpi")) $("#dpi").value = lb.dpi ?? 203;
  if ($("#gapmm")) $("#gapmm").value = lb.gap_mm ?? 2;
  if ($("#threshold")) $("#threshold").value = lb.threshold ?? 180;
}

// ===== SAVE SETTINGS =====
function save() {

  settings.hub = {
    url: val("#hub_url", ""),
    token: val("#hub_token", ""),
    printer: val("#printer", ""),
  };

  settings.copies = num("#copies", 1);

  settings.label = {
    width_mm: num("#wmm", 60),
    height_mm: num("#hmm", 40),
    dpi: num("#dpi", 203),
    gap_mm: num("#gapmm", 2),
    threshold: num("#threshold", 180),
  };

  saveJSON(LS_KEYS.SETTINGS, settings);

  setStatus($("#status"), "ok", "Đã lưu Settings thành công.");
}

// Bind button nếu tồn tại
if ($("#btnSave")) {
  $("#btnSave").onclick = save;
}

fill();
