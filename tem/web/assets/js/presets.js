import { getPresets, setPresets, getLast, setLast } from "./storage.js";
import { downloadJSON, readFileAsText } from "./utils.js";

export function ensurePresetIds(list) {
  return list.map((p) => ({
    id: p.id || `p_${Math.random().toString(16).slice(2)}_${Date.now()}`,
    ...p,
  }));
}

export function listPresets() {
  return getPresets();
}

export function savePresets(list) {
  setPresets(ensurePresetIds(list));
}

export function addPreset(p) {
  const list = getPresets();
  list.push({ id: `p_${Math.random().toString(16).slice(2)}_${Date.now()}`, ...p });
  setPresets(list);
}

export function updatePreset(id, patch) {
  const list = getPresets();
  const idx = list.findIndex((x) => x.id === id);
  if (idx < 0) throw new Error("Preset not found");
  list[idx] = { ...list[idx], ...patch };
  setPresets(list);
}

export function deletePreset(id) {
  const list = getPresets().filter((x) => x.id !== id);
  setPresets(list);

  const last = getLast();
  if (last.presetId === id) last.presetId = "";
  setLast(last);
}

export function exportPresets() {
  downloadJSON("presets.json", getPresets());
}

export async function importPresetsFromFile(file) {
  const txt = await readFileAsText(file);
  const obj = JSON.parse(txt);
  if (!Array.isArray(obj)) throw new Error("Invalid presets JSON: must be array");
  setPresets(ensurePresetIds(obj));
}
