// Global config + localStorage keys

export const LS_KEYS = {
  SETTINGS: "tngon_label_settings_v1",
  TEMPLATE_JSON: "tngon_label_template_json_v1",
  LAST_FORM: "tngon_label_print_form_v1",
};

export const DEFAULTS = {
  settings: {
    hubUrl: "http://192.168.58.113:8787",
    token: "YOUR_TOKEN",
    printer: "",
    copies: 1,
    label: { width_mm: 50, height_mm: 30, dpi: 203 },
    requestTimeoutMs: 12000,
  },
  printForm: {
    baseCode: "123456",
    name: "Thịt bò",
    pricePerKg: 10000,
    minGram: 500,
    maxGram: 2000,
    stepGram: 50,
  }
};
