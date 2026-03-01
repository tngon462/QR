// IN/web/assets/js/app-config.js
export const LS_KEYS = {
  SETTINGS: "tngon_label_settings_v1",
  TEMPLATE_JSON: "tngon_label_template_json_v1",
};

export const DEFAULTS = {
  settings: {
    hub_url: "http://192.168.58.113:8787",
    hub_token: "YOUR_TOKEN",
    printer: "",
    copies: 1,
    label: {
      width_mm: 50,
      height_mm: 30,
      dpi: 203,
    }
  }
};
