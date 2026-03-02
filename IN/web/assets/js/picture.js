// picture.js (v3) — Guaranteed add image by writing into #txtTemplate then triggering Load.
// Works even if designer.js re-renders stage from template frequently.

(function () {
  "use strict";

  const $ = (sel, root = document) => root.querySelector(sel);

  function toast(msg) {
    const el = $("#status");
    if (el) el.textContent = msg;
    else console.log("[picture.js]", msg);
  }

  function uid() {
    return "pic_" + Math.random().toString(16).slice(2) + Date.now().toString(16);
  }

  function readFileAsDataURL(file) {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result);
      fr.onerror = reject;
      fr.readAsDataURL(file);
    });
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const im = new Image();
      im.onload = () => resolve(im);
      im.onerror = reject;
      im.src = src;
    });
  }

  function findStage() {
    if (window.Konva && Array.isArray(window.Konva.stages) && window.Konva.stages.length) {
      return window.Konva.stages[0];
    }
    return null;
  }

  function getTemplateTextarea() {
    return $("#txtTemplate");
  }

  function parseTemplate() {
    const ta = getTemplateTextarea();
    if (!ta) return null;
    const s = (ta.value || "").trim();
    if (!s) return null;
    try {
      return JSON.parse(s);
    } catch (e) {
      console.warn("Template JSON parse error:", e);
      return null;
    }
  }

  function findDesignLayer(templateObj) {
    // Expect: templateObj.children = [Layer0(empty?), Layer1(design)]
    // We'll pick the layer that contains the bg rect (name:"bg") or barcode_box.
    const layers = templateObj?.children || [];
    if (!layers.length) return null;

    // 1) layer that has bg rect
    for (const layer of layers) {
      const kids = layer?.children || [];
      const hasBg = kids.some((n) => n?.className === "Rect" && n?.attrs?.name === "bg");
      const hasBarcodeBox = kids.some((n) => n?.className === "Rect" && n?.attrs?.name === "barcode_box");
      if (hasBg || hasBarcodeBox) return layer;
    }

    // 2) fallback: last layer
    return layers[layers.length - 1] || null;
  }

  function getStageSizeFromTemplate(templateObj) {
    const w = templateObj?.attrs?.width || 320;
    const h = templateObj?.attrs?.height || 240;
    return { w, h };
  }

  function fitIntoBox(imgW, imgH, boxW, boxH) {
    const s = Math.min(boxW / imgW, boxH / imgH, 1);
    return { w: Math.round(imgW * s), h: Math.round(imgH * s) };
  }

  function writeTemplateAndTriggerLoad(templateObj) {
    const ta = getTemplateTextarea();
    if (!ta) return;

    ta.value = JSON.stringify(templateObj);
    ta.dispatchEvent(new Event("input", { bubbles: true }));
    ta.dispatchEvent(new Event("change", { bubbles: true }));

    const btnLoad = $("#btnLoad");
    if (btnLoad) btnLoad.click();
  }

  async function hydratePicturesOnce() {
    const stage = findStage();
    if (!stage || !window.Konva) return;

    const nodes = stage.find((n) => n?.className === "Image" && n.getAttr?.("src"));
    if (!nodes?.length) return;

    let touched = false;
    for (const n of nodes) {
      if (n.image?.()) continue;

      const src = n.getAttr("src");
      if (!src) continue;

      try {
        const im = await loadImage(src);
        n.image(im);
        if (typeof n.draggable === "function" && !n.draggable()) n.draggable(true);
        touched = true;
      } catch (e) {
        console.warn("hydrate failed", e);
      }
    }

    if (touched) stage.draw();
  }

  async function addImageIntoTemplateFromFile(file) {
    const dataUrl = await readFileAsDataURL(file);

    const tpl = parseTemplate();
    if (!tpl) {
      toast("Template JSON đang trống hoặc lỗi JSON. Bấm Reset Sample trước rồi thử lại.");
      return;
    }

    const layer = findDesignLayer(tpl);
    if (!layer) {
      toast("Không tìm thấy Layer thiết kế trong Template JSON.");
      return;
    }

    const kids = (layer.children = layer.children || []);
    const size0 = getStageSizeFromTemplate(tpl);

    // load image to know natural size (for initial fit)
    let im;
    try {
      im = await loadImage(dataUrl);
    } catch {
      toast("Ảnh lỗi hoặc không đọc được.");
      return;
    }

    const boxW = Math.max(80, Math.round(size0.w * 0.7));
    const boxH = Math.max(60, Math.round(size0.h * 0.7));
    const fitted = fitIntoBox(im.width, im.height, boxW, boxH);

    // remove old picture if you want only 1 image (optional)
    // If you want multiple images, comment these 2 lines.
    for (let i = kids.length - 1; i >= 0; i--) {
      if (kids[i]?.className === "Image" && (kids[i]?.attrs?.name === "picture_img" || kids[i]?.attrs?.kind === "picture")) {
        kids.splice(i, 1);
      }
    }

    // push new Image node
    kids.push({
      className: "Image",
      attrs: {
        id: uid(),
        name: "picture_img",
        kind: "picture",
        x: Math.round((size0.w - fitted.w) / 2),
        y: Math.round((size0.h - fitted.h) / 2),
        width: fitted.w,
        height: fitted.h,
        draggable: true,

        // ✅ important: store dataUrl in attrs so we can hydrate
        src: dataUrl,
      },
    });

    // write back + load
    writeTemplateAndTriggerLoad(tpl);

    // hydrate after load
    setTimeout(() => hydratePicturesOnce().catch(() => {}), 60);
    setTimeout(() => hydratePicturesOnce().catch(() => {}), 250);

    toast("Đã thêm ảnh vào Template JSON và load lại khung.");
  }

  function injectButtonIfMissing() {
    // If your "+ Image" already exists, we only hook it.
    let btn = $("#btnAddPicture");
    if (!btn) {
      // fallback: create beside Delete
      const btnDelete = $("#btnDelete");
      const row = btnDelete?.closest(".row");
      if (!row) return;
      btn = document.createElement("button");
      btn.id = "btnAddPicture";
      btn.textContent = "+ Image";
      btn.title = "Thêm ảnh vào thiết kế";
      row.appendChild(btn);
    }

    // ensure we have a file input
    let inp = btn.parentElement.querySelector('input[type="file"].__picture_file');
    if (!inp) {
      inp = document.createElement("input");
      inp.type = "file";
      inp.accept = "image/*";
      inp.className = "__picture_file";
      inp.style.display = "none";
      btn.parentElement.appendChild(inp);
    }

    btn.addEventListener("click", () => inp.click());
    inp.addEventListener("change", async () => {
      const f = inp.files && inp.files[0];
      inp.value = "";
      if (!f) return;

      try {
        await addImageIntoTemplateFromFile(f);
      } catch (e) {
        console.error(e);
        toast("Lỗi thêm ảnh (mở Console để xem).");
      }
    });
  }

  function boot() {
    injectButtonIfMissing();

    // keep hydrating periodically (in case designer re-renders)
    setInterval(() => hydratePicturesOnce().catch(() => {}), 600);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
