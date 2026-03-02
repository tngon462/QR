// utils.js
export function loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function saveJSON(key, obj) {
  localStorage.setItem(key, JSON.stringify(obj));
}

export function setStatus(el, type, msg) {
  if (!el) return;
  el.textContent = msg;
  el.classList.remove("ok", "err");
  el.classList.add(type === "err" ? "err" : "ok");
}

export function mmToPx(mm, dpi) {
  // inch = 25.4mm
  return Math.round((mm / 25.4) * dpi);
}

export function gramsToSuffix(grams) {
  const n = Math.round(Number(grams || 0) / 10);
  return String(n).padStart(3, "0");
}

export function roundTo10(x) {
  return Math.round(Number(x || 0) / 10) * 10;
}

export function calcAmount(pricePerKg, grams) {
  const v = (Number(pricePerKg || 0) * Number(grams || 0)) / 1000;
  return roundTo10(Math.round(v));
}
