// picture.js (v2) — Add Image that survives Designer's template/live-preview re-render
(function () {
  "use strict";

  const $ = (sel, root = document) => root.querySelector(sel);

  function uid() {
    return "pic_" + Math.random().toString(16).slice(2) + Date.now().toString(16);
  }

  function toast(msg) {
    const el = $("#status");
    if (el) el.textContent = msg;
    else console.log("[picture.js]", msg);
  }

  function findStage() {
    if (window.Konva && Array.isArray(window.Konva.stages) && window.Konva.stages.length) {
      return window.Konva.stages[0];
    }
    if (window.stage && window.stage.getClassName?.() === "Stage") return window.stage;
    if (window.__stage && window.__stage.getClassName?.() === "Stage") return window.__stage;
    return null;
  }

  function ensureLayer(stage) {
    const layers = stage.getLayers?.() || [];
    if (layers.length) return layers[0];
    const layer = new window.Konva.Layer();
    stage.add(layer);
    layer.draw();
    return layer;
  }

  function ensureTransformer(stage, layer) {
    let tr = stage.findOne(".__picture_tr");
    if (!tr) {
      tr = new window.Konva.Transformer({
        name: "__picture_tr",
        rotateEnabled: true,
        keepRatio: false,
        enabledAnchors: [
          "top-left",
          "top-right",
          "bottom-left",
          "bottom-right",
          "middle-left",
          "middle-right",
          "top-center",
          "bottom-center",
        ],
        boundBoxFunc: (oldBox, newBox) => {
          if (newBox.width < 10 || newBox.height < 10) return oldBox;
          return newBox;
        },
      });
      layer.add(tr);
      layer.draw();
    }
    return tr;
  }

  function selectNode(stage, layer, node) {
    const tr = ensureTransformer(stage, layer);
    tr.nodes(node ? [node] : []);
    layer.batchDraw();
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

  function fitIntoBox(imgW, imgH, boxW, boxH) {
    const s = Math.min(boxW / imgW, boxH / imgH, 1);
    return { w: Math.round(imgW * s), h: Math.round(imgH * s) };
  }

  // ✅ KEY: sync stage -> Template JSON textarea so designer.js won't overwrite our changes
  function syncTemplateTextarea(stage) {
    const ta = $("#txtTemplate");
    if (!ta || !stage?.toJSON) return;

    try {
      ta.value = stage.toJSON();
      // trigger listeners (nếu designer.js có nghe input/change)
      ta.dispatchEvent(new Event("input", { bubbles: true }));
      ta.dispatchEvent(new Event("change", { bubbles: true }));
    } catch (e) {
      console.warn("syncTemplateTextarea failed", e);
    }
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

        if (!n.__pictureBound) {
          const layer = n.getLayer() || ensureLayer(stage);
          n.on("mousedown touchstart", (e) => {
            e.cancelBubble = true;
            selectNode(stage, layer, n);
          });
          // normalize transform like designer tools
          n.on("transformend", () => {
            const layer2 = n.getLayer() || ensureLayer(stage);
            const sx = n.scaleX();
            const sy = n.scaleY();
            n.scaleX(1);
            n.scaleY(1);
            n.width(Math.max(1, n.width() * sx));
            n.height(Math.max(1, n.height() * sy));
            layer2.batchDraw();
            syncTemplateTextarea(stage);
          });
          n.on("dragend", () => syncTemplateTextarea(stage));
          n.__pictureBound = true;
        }

        touched = true;
      } catch (e) {
        console.warn("hydrate picture failed", e);
      }
    }

    if (touched) stage.draw();
  }

  async function addPictureFromFile(file) {
    const stage = findStage();
    if (!stage || !window.Konva) {
      toast("Chưa thấy Konva stage. Reload trang Designer rồi thử lại.");
      return;
    }

    const layer = ensureLayer(stage);

    const src = await readFileAsDataURL(file);
    const im = await loadImage(src);

    const cw = stage.width();
    const ch = stage.height();
    const maxW = Math.max(80, Math.round(cw * 0.7));
    const maxH = Math.max(60, Math.round(ch * 0.7));
    const size = fitIntoBox(im.width, im.height, maxW, maxH);

    const node = new window.Konva.Image({
      x: Math.round((cw - size.w) / 2),
      y: Math.round((ch - size.h) / 2),
      width: size.w,
      height: size.h,
      image: im,
      draggable: true,

      // attrs saved into JSON:
      name: "picture_img",
      id: uid(),
    });

    // store dataUrl inside JSON to survive reload/template
    node.setAttr("src", src);
    node.setAttr("kind", "picture");

    node.on("mousedown touchstart", (e) => {
      e.cancelBubble = true;
      selectNode(stage, layer, node);
    });

    node.on("transformend", () => {
      const sx = node.scaleX();
      const sy = node.scaleY();
      node.scaleX(1);
      node.scaleY(1);
      node.width(Math.max(1, node.width() * sx));
      node.height(Math.max(1, node.height() * sy));
      layer.batchDraw();
      syncTemplateTextarea(stage);
    });

    node.on("dragend", () => syncTemplateTextarea(stage));

    layer.add(node);

    // make sure not hidden behind other nodes
    node.moveToTop();
    layer.batchDraw();

    // ✅ sync template immediately (important!)
    syncTemplateTextarea(stage);

    // in case designer.js re-renders right after, hydrate again
    setTimeout(() => hydratePicturesOnce().catch(() => {}), 50);

    selectNode(stage, layer, node);
    toast("Đã thêm ảnh. Nếu chưa thấy, bấm 'Load From Box' 1 lần.");
  }

  function injectUI() {
    const btnDelete = $("#btnDelete");
    const toolsRow = btnDelete ? btnDelete.closest(".row") : null;
    if (!toolsRow) return;

    // if already exists, do nothing
    if ($("#btnAddPicture")) return;

    const btn = document.createElement("button");
    btn.id = "btnAddPicture";
    btn.textContent = "+ Image";
    btn.title = "Thêm ảnh vào thiết kế";
    toolsRow.appendChild(btn);

    const inp = document.createElement("input");
    inp.type = "file";
    inp.accept = "image/*";
    inp.style.display = "none";
    toolsRow.appendChild(inp);

    btn.addEventListener("click", () => inp.click());
    inp.addEventListener("change", async () => {
      const f = inp.files && inp.files[0];
      inp.value = "";
      if (!f) return;

      try {
        await addPictureFromFile(f);
      } catch (e) {
        console.error(e);
        toast("Lỗi thêm ảnh (mở Console để xem).");
      }
    });

    // deselect when click empty stage
    const bindStageClick = () => {
      const stage = findStage();
      if (!stage) return false;
      const layer = ensureLayer(stage);
      ensureTransformer(stage, layer);
      stage.on("mousedown touchstart", (e) => {
        if (e.target === stage) selectNode(stage, layer, null);
      });
      return true;
    };

    let tries = 0;
    const t = setInterval(() => {
      tries++;
      if (bindStageClick() || tries > 80) clearInterval(t);
    }, 150);

    toast("Picture tool loaded.");
  }

  function boot() {
    if (!window.Konva) {
      let tries = 0;
      const t = setInterval(() => {
        tries++;
        if (window.Konva) {
          clearInterval(t);
          injectUI();
        } else if (tries > 100) clearInterval(t);
      }, 100);
    } else {
      injectUI();
    }

    // keep hydrating because designer.js may recreate image nodes
    setInterval(() => hydratePicturesOnce().catch(() => {}), 600);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else boot();
})();
