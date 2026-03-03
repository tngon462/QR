// template-store.js — multi-template localStorage manager (no backend)
// v1 storage schema as requested.

export const TPL_KEYS = {
  INDEX: "tngon_label_templates_index_v1",
  PREFIX: "tngon_label_template_v1::",
  LAST_USED: "tngon_label_last_tpl_v1",
  LEGACY_TEMPLATE_JSON: "tngon_label_template_json_v1", // migration source
};

// ---------- utils ----------
function nowSec(){ return Math.floor(Date.now()/1000); }

function safeJsonParse(s, fallback=null){
  try{ return JSON.parse(s); }catch{ return fallback; }
}

function slugify(name){
  const base = String(name || "").trim() || "template";
  // remove accents
  const noAcc = base.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const slug = noAcc
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return slug || ("tpl-" + nowSec());
}

function readIndex(){
  const raw = localStorage.getItem(TPL_KEYS.INDEX);
  const arr = safeJsonParse(raw, []);
  return Array.isArray(arr) ? arr : [];
}

function writeIndex(arr){
  localStorage.setItem(TPL_KEYS.INDEX, JSON.stringify(arr));
}

function getKey(slug){ return TPL_KEYS.PREFIX + slug; }

export function listTemplates(){
  const idx = readIndex();
  // newest first
  idx.sort((a,b) => (b.updated_at||0) - (a.updated_at||0));
  return idx;
}

export function getTemplate(slug){
  if(!slug) return null;
  const raw = localStorage.getItem(getKey(slug));
  const obj = safeJsonParse(raw, null);
  if(!obj || typeof obj !== "object") return null;
  if(!obj.meta || !obj.templateJson) return null;
  return obj;
}

export function saveTemplate({ name, label, templateJson, overwrite=false }){
  const n = String(name||"").trim();
  if(!n) throw new Error("Tên template trống.");

  const slug = slugify(n);
  const key = getKey(slug);
  const exists = !!localStorage.getItem(key);

  if(exists && !overwrite){
    // let caller decide confirm
    return { ok:false, reason:"exists", slug };
  }

  const ts = nowSec();
  const prev = getTemplate(slug);

  const meta = {
    name: n,
    created_at: prev?.meta?.created_at || ts,
    updated_at: ts,
    label: {
      width_mm: Number(label?.width_mm || 60),
      height_mm: Number(label?.height_mm || 40),
      dpi: 203,
    },
  };

  const payload = { meta, templateJson: String(templateJson||"") };
  localStorage.setItem(key, JSON.stringify(payload));

  // update index
  const idx = readIndex().filter(x => x && x.name);
  const found = idx.find(x => slugify(x.name) === slug);
  if(found){
    found.name = n;
    found.updated_at = ts;
  }else{
    idx.push({ name:n, updated_at: ts });
  }
  writeIndex(idx);

  return { ok:true, slug, meta };
}

export function deleteTemplateBySlug(slug){
  if(!slug) return;
  localStorage.removeItem(getKey(slug));

  const idx = readIndex().filter(x => x && x.name);
  const next = idx.filter(x => slugify(x.name) !== slug);
  writeIndex(next);

  // if last used points to deleted => clear
  const last = localStorage.getItem(TPL_KEYS.LAST_USED);
  if(last && last === slug){
    localStorage.removeItem(TPL_KEYS.LAST_USED);
  }
}

export function exportTemplateFile(slug){
  const tpl = getTemplate(slug);
  if(!tpl) throw new Error("Không tìm thấy template để export.");
  const contentObj = {
    version: 1,
    meta: tpl.meta,
    templateJson: tpl.templateJson,
  };
  const safeName = (tpl.meta?.name || "template").replace(/[^\w\- ]+/g, "").trim() || "template";
  const filename = `tngon-label-template::${safeName}.json`;
  return { filename, content: JSON.stringify(contentObj, null, 2) };
}

export function importTemplateObject(obj, { overwrite=false, autoRename=true } = {}){
  if(!obj || typeof obj !== "object") throw new Error("File import không hợp lệ.");
  if(obj.version !== 1) throw new Error("Sai version template.");
  if(!obj.meta || !obj.meta.name) throw new Error("Thiếu meta.name.");
  if(!obj.templateJson) throw new Error("Thiếu templateJson.");

  let name = String(obj.meta.name).trim();
  if(!name) throw new Error("meta.name trống.");

  const slug = slugify(name);
  const exists = !!localStorage.getItem(getKey(slug));

  if(exists && !overwrite){
    if(!autoRename) return { ok:false, reason:"exists", slug };
    // auto rename by appending time
    name = `${name} (${nowSec()})`;
  }

  const label = obj.meta.label || { width_mm:60, height_mm:40, dpi:203 };
  const res = saveTemplate({
    name,
    label,
    templateJson: obj.templateJson,
    overwrite: true, // after rename or explicit overwrite
  });
  return { ok:true, slug: res.slug, meta: res.meta };
}

// ---------- migration ----------
export function migrateLegacyIfNeeded({ defaultName="default", labelFromSettings=null } = {}){
  const legacy = localStorage.getItem(TPL_KEYS.LEGACY_TEMPLATE_JSON);
  if(!legacy) return { migrated:false };

  const idx = readIndex();
  if(idx && idx.length > 0){
    // keep legacy as is (do not overwrite user collection)
    return { migrated:false, reason:"already_has_index" };
  }

  const label = {
    width_mm: Number(labelFromSettings?.width_mm || 50),
    height_mm: Number(labelFromSettings?.height_mm || 30),
    dpi: 203,
  };

  const res = saveTemplate({
    name: defaultName,
    label,
    templateJson: legacy,
    overwrite: true,
  });

  // keep legacy key as backup? spec says chuyển sang cấu trúc mới; we can remove to avoid confusion
  try{ localStorage.removeItem(TPL_KEYS.LEGACY_TEMPLATE_JSON); }catch{}

  // set last used
  localStorage.setItem(TPL_KEYS.LAST_USED, res.slug);

  return { migrated:true, slug: res.slug };
}

export function setLastUsed(slug){
  if(!slug) return;
  localStorage.setItem(TPL_KEYS.LAST_USED, slug);
}
export function getLastUsed(){
  return localStorage.getItem(TPL_KEYS.LAST_USED) || "";
}
