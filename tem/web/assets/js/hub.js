import { getSettings } from "./storage.js";

export async function hubHealth() {
  const s = getSettings();
  if (!s.hubUrl) throw new Error("Hub URL missing");
  const url = `${s.hubUrl.replace(/\/$/, "")}/health`;
  const r = await fetch(url, { method: "GET", cache: "no-store" });
  if (!r.ok) throw new Error(`Health HTTP ${r.status}`);
  return await r.json();
}

export async function hubPrinters() {
  const s = getSettings();
  if (!s.hubUrl) throw new Error("Hub URL missing");
  const url = `${s.hubUrl.replace(/\/$/, "")}/printers`;
  const r = await fetch(url, { method: "GET", cache: "no-store" });
  if (!r.ok) throw new Error(`Printers HTTP ${r.status}`);
  return await r.json();
}

export async function hubPrint(payload) {
  const s = getSettings();
  if (!s.hubUrl) throw new Error("Hub URL missing");
  const url = `${s.hubUrl.replace(/\/$/, "")}/print`;
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg = data?.error || `Print HTTP ${r.status}`;
    throw new Error(msg);
  }
  return data;
}
