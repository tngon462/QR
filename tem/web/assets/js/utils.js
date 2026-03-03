export function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

export function pad3(n) {
  const s = String(n);
  return s.length >= 3 ? s : ("000" + s).slice(-3);
}

export function roundTo10(n) {
  return Math.round(n / 10) * 10;
}

export function gramsToKg(grams) {
  return Math.round((grams / 1000) * 100) / 100; // 2 decimals
}

export function makeBarcode(baseCode, grams) {
  // suffix = pad3(grams/10) with rounding to nearest 10g bucket
  const suffix = pad3(Math.round(grams / 10));
  return `${baseCode}T${suffix}`;
}

export function uuidv4() {
  // good-enough UUID for client job id
  if (crypto?.randomUUID) return crypto.randomUUID();
  const a = crypto.getRandomValues(new Uint8Array(16));
  a[6] = (a[6] & 0x0f) | 0x40;
  a[8] = (a[8] & 0x3f) | 0x80;
  const hex = [...a].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function downloadJSON(filename, obj) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export async function readFileAsText(file) {
  return await new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result || ""));
    r.onerror = () => rej(r.error);
    r.readAsText(file);
  });
}

export async function readFileAsDataURL(file) {
  return await new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result || ""));
    r.onerror = () => rej(r.error);
    r.readAsDataURL(file);
  });
}
