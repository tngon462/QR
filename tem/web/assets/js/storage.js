// storage.js — localStorage schema (single source of truth)

const KEYS = {
  SETTINGS: "tngon_in_settings_v1",
  PRESETS: "tngon_in_presets_v1",
  TEMPLATES: "tngon_in_templates_v1",
  LASTS: "tngon_in_last_v1", // last selections / last job
};

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

export function getSettings() {
  return loadJSON(KEYS.SETTINGS, {
    hubUrl: "",
    token: "",
    defaultPrinter: "",
  });
}

export function setSettings(s) {
  saveJSON(KEYS.SETTINGS, s);
}

export function getPresets() {
  return loadJSON(KEYS.PRESETS, []);
}

export function setPresets(list) {
  saveJSON(KEYS.PRESETS, list);
}

export function getTemplates() {
  // map: name -> { label:{width_mm,height_mm,dpi}, konva:{...} }
  return loadJSON(KEYS.TEMPLATES, {});
}

export function setTemplates(map) {
  saveJSON(KEYS.TEMPLATES, map);
}

export function getLast() {
  return loadJSON(KEYS.LASTS, {
    presetId: "",
    templateName: "",
    lastJob: null,
  });
}

export function setLast(v) {
  saveJSON(KEYS.LASTS, v);
}

export { KEYS };
