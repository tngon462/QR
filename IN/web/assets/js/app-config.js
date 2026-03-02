// app-config.js
export const LS_KEYS = {
  SETTINGS: "tngon_label_settings_v1",
  TEMPLATE_JSON: "tngon_label_template_json_v1",
};

export const DEFAULTS = {
  settings: {
    hub: { url: "http://192.168.58.113:8787", token: "YOUR_TOKEN", printer: "" },
    label: { width_mm: 50, height_mm: 30, dpi: 203 },
  },
};
