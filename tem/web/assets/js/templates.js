import { getTemplates, setTemplates, getLast, setLast } from "./storage.js";
import { downloadJSON, readFileAsText } from "./utils.js";

export function listTemplateNames() {
  const map = getTemplates();
  return Object.keys(map).sort();
}

export function getTemplate(name) {
  const map = getTemplates();
  return map[name] || null;
}

export function saveTemplate(name, tplObj) {
  const map = getTemplates();
  map[name] = tplObj;
  setTemplates(map);

  const last = getLast();
  last.templateName = name;
  setLast(last);
}

export function deleteTemplate(name) {
  const map = getTemplates();
  delete map[name];
  setTemplates(map);

  const last = getLast();
  if (last.templateName === name) last.templateName = "";
  setLast(last);
}

export function exportTemplate(name) {
  const tpl = getTemplate(name);
  if (!tpl) throw new Error("Template not found");
  downloadJSON(`template.${name}.json`, tpl);
}

export async function importTemplateFromFile(file) {
  const txt = await readFileAsText(file);
  const obj = JSON.parse(txt);

  // minimal validation
  if (!obj?.label?.width_mm || !obj?.label?.height_mm || !obj?.label?.dpi) {
    throw new Error("Invalid template JSON: missing label");
  }
  if (!obj?.konva) throw new Error("Invalid template JSON: missing konva");

  const name = obj.name || `import_${Date.now()}`;
  const map = getTemplates();
  map[name] = { label: obj.label, konva: obj.konva };
  setTemplates(map);

  const last = getLast();
  last.templateName = name;
  setLast(last);

  return name;
}
