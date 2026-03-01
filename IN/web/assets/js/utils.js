// IN/web/assets/js/utils.js
export function loadJSON(key, fallback){
  try{
    const s = localStorage.getItem(key);
    if(!s) return fallback;
    return JSON.parse(s);
  }catch{
    return fallback;
  }
}

export function saveJSON(key, obj){
  localStorage.setItem(key, JSON.stringify(obj));
}

export function setStatus(el, type, msg){
  if(!el) return;
  el.className = `status ${type || ""}`.trim();
  el.textContent = msg || "";
}

export function mmToPx(mm, dpi){
  // px = inch * dpi; inch = mm / 25.4
  return Math.round((Number(mm) / 25.4) * Number(dpi));
}

export function pxToMm(px, dpi){
  return (Number(px) / Number(dpi)) * 25.4;
}

export function gramsToSuffix(grams){
  const n = Math.round(Number(grams) / 10);
  return String(n).padStart(3, "0");
}

export function calcAmount(pricePerKg, grams){
  // amount = round(pricePerKg × grams / 1000) then round to 10
  const raw = Math.round(Number(pricePerKg) * Number(grams) / 1000);
  return Math.round(raw / 10) * 10;
}

export async function hubFetchJSON(url, data){
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type":"application/json" },
    body: JSON.stringify(data)
  });
  const text = await res.text();
  let json = null;
  try{ json = JSON.parse(text); }catch{ /* ignore */ }
  if(!res.ok){
    const msg = (json && (json.error || json.message)) ? (json.error || json.message) : text;
    throw new Error(msg || `HTTP ${res.status}`);
  }
  return json ?? { ok: true };
}

export function dataUrlToBase64(dataUrl){
  // keep "data:image/png;base64,...." as-is
  return dataUrl;
}
