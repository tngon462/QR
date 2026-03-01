export function pad3(n){
  const x = Math.round(Number(n));
  return String(x).padStart(3, "0");
}

export function gramsToSuffix(grams){
  // suffix = pad3(grams / 10)
  return pad3(Number(grams) / 10);
}

export function roundTo10(amount){
  // làm tròn đơn vị 10
  const n = Math.round(Number(amount));
  return Math.round(n / 10) * 10;
}

export function calcAmount(pricePerKg, grams){
  const raw = Number(pricePerKg) * (Number(grams) / 1000);
  return roundTo10(Math.round(raw));
}

export function mmToPx(mm, dpi){
  return Math.round((Number(mm) / 25.4) * Number(dpi));
}

export function pxToMm(px, dpi){
  return (Number(px) / Number(dpi)) * 25.4;
}

export function nowISO(){
  return new Date().toISOString();
}

export function loadJSON(key, fallback){
  try{
    const s = localStorage.getItem(key);
    if(!s) return fallback;
    return JSON.parse(s);
  }catch(e){
    return fallback;
  }
}

export function saveJSON(key, obj){
  localStorage.setItem(key, JSON.stringify(obj));
}

export function sleep(ms){
  return new Promise(r => setTimeout(r, ms));
}

export async function fetchWithTimeout(url, opts = {}, timeoutMs = 12000){
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try{
    const res = await fetch(url, { ...opts, signal: ctrl.signal });
    return res;
  } finally {
    clearTimeout(t);
  }
}

export function setStatus(el, kind, msg){
  if(!el) return;
  el.className = "notice " + (kind || "");
  el.textContent = msg || "";
}
