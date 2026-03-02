// picture.js — add image tool for Konva designer (plug-in style, minimal touching core)
//
// Features:
// - Injects a "+ Image" button into Toolbox area
// - Pick image file -> add to stage as Konva.Image (draggable + transformer)
// - Stores image as node attr: { src: "data:image/..." } so template JSON can keep it
// - Auto-hydrate images when template is loaded (rebuild node.image() from src)
// - Independent selection/transformer (doesn't require modifying designer.js)

(function () {
  "use strict";

  // ---------- small helpers ----------
  const $ = (sel, root = document) => root.querySelector(sel);

  function uid() {
    return "pic_" + Math.random().toString(16).slice(2) + Date.now().toString(16);
  }

  function toast(msg) {
    const el = $("#status");
    if (el) {
      el.textContent = msg;
      el.style.opacity = "1";
      clearTimeout(toast._t);
      toast._t = setTimeout(() => (el.style.opacity = "0.85"), 1200);
    } else {
      console.log("[picture.js]", msg);
    }
  }

  function findStage() {
    // Most reliable for Konva in browser: Konva.stages[0]
    if (window.Konva && Array.isArray(window.Konva.stages) && window.Konva.stages.length) {
      return window.Konva.stages[0];
    }

    // fallback: try common globals
    if (window.stage && window.stage.getClassName && window.stage.getClassName() === "Stage") return window.stage;
    if (window.__stage && window.__stage.getClassName && window.__stage.getClassName() === "Stage") return window.__stage;

    return null;
  }

  function ensureLayer(stage) {
    const layers = stage.getLayers();
    if (layers && layers.length) return layers[0];

    const layer = new window.Konva.Layer();
    stage.add(layer);
    layer.draw();
    return layer;
  }

  function ensureTransformer(stage, layer) {
    if (!window.Konva) return null;

    // 1 transformer for picture tool
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
          // prevent too small
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
    if (!tr) return;
    tr.nodes(node ? [node] : []);
    layer.draw();
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
    // scale down to fit, keep aspect
    const s = Math.min(boxW / imgW, boxH / imgH, 1);
    return { w: Math.round(imgW * s), h: Math.round(imgH * s) };
  }

  // ---------- core: add picture ----------
  async function addPictureFromFile(file) {
    const stage = findStage();
    if (!stage || !window.Konva) {
      toast("Chưa thấy Konva stage. Mở Designer xong đợi 1 chút rồi thử lại.");
      return;
    }

    const layer = ensureLayer(stage);
    const src = await readFileAsDataURL(file);
    const im = await loadImage(src);

    // default position: center-ish
    const cw = stage.width();
    const ch = stage.height();
    const maxW = Math.max(80, Math.round(cw * 0.6));
    const maxH = Math.max(60, Math.round(ch * 0.6));
    const size = fitIntoBox(im.width, im.height, maxW, maxH);

    const node = new window.Konva.Image({
      x: Math.round((cw - size.w) / 2),
      y: Math.round((ch - size.h) / 2),
      width: size.w,
      height: size.h,
      image: im,
      draggable: true,

      // IMPORTANT: keep in JSON (template)
      name: "picture_img",
      id: uid(),
    });

    // store source so template JSON can restore
    node.setAttr("src", src);
    node.setAttr("kind", "picture");

    // click select
    node.on("mousedown touchstart", (e) => {
      e.cancelBubble = true;
      selectNode(stage, layer, node);
    });

    // when transform ends, keep correct size
    node.on("transformend", () => {
      // Konva transforms via scale; normalize into width/height
      const scaleX = node.scaleX();
      const scaleY = node.scaleY();
      node.scaleX(1);
      node.scaleY(1);
      node.width(Math.max(1, node.width() * scaleX));
      node.height(Math.max(1, node.height() * scaleY));
      layer.draw();
    });

    layer.add(node);
    layer.draw();
    selectNode(stage, layer, node);

    toast("Đã thêm ảnh. Kéo/zoom/rotate trực tiếp trên khung.");
  }

  // ---------- hydrate pictures after template load ----------
  async function hydratePicturesOnce() {
    const stage = findStage();
    if (!stage || !window.Konva) return;

    // find nodes that have src but missing actual image()
    const nodes = stage.find((n) => n && n.className === "Image" && typeof n.getAttr === "function" && n.getAttr("src"));
    if (!nodes || !nodes.length) return;

    let touched = false;
    for (const n of nodes) {
      if (n.image && n.image()) continue; // already ok

      const src = n.getAttr("src");
      if (!src || typeof src !== "string") continue;

      try {
        const im = await loadImage(src);
        n.image(im);
        // also make it draggable by default if not set
        if (typeof n.draggable === "function" && !n.draggable()) n.draggable(true);

        // attach select handler once
        if (!n.__pictureBound) {
          const layer = n.getLayer() || ensureLayer(stage);
          n.on("mousedown touchstart", (e) => {
            e.cancelBubble = true;
            selectNode(stage, layer, n);
          });
          n.__pictureBound = true;
        }

        touched = true;
      } catch (e) {
        console.warn("hydrate picture failed", e);
      }
    }

    if (touched) {
      const layer0 = stage.getLayers()[0];
      if (layer0) layer0.draw();
    }
  }

  // ---------- UI injection ----------
  function injectUI() {
    // try to place near Toolbox buttons
    const btnDelete = $("#btnDelete");
    const toolsRow = btnDelete ? btnDelete.closest(".row") : null;

    if (!toolsRow) {
      // fallback: place in left card
      const leftCard = $(".grid2 .card");
      if (!leftCard) return;
      const row = document.createElement("div");
      row.className = "row";
      row.style.marginTop = "10px";
      row.style.flexWrap = "wrap";
      leftCard.appendChild(row);
      return buildControls(row);
    }

    // insert a new row right below toolbox row (cleaner)
    const row = document.createElement("div");
    row.className = "row";
    row.style.marginTop = "10px";
    row.style.flexWrap = "wrap";
    toolsRow.parentElement.insertBefore(row, toolsRow.nextSibling);

    buildControls(row);
  }

  function buildControls(rowEl) {
    // + Image button
    const btn = document.createElement("button");
    btn.id = "btnAddPicture";
    btn.textContent = "+ Image";
    btn.title = "Thêm ảnh vào thiết kế";
    rowEl.appendChild(btn);

    // hidden file input
    const inp = document.createElement("input");
    inp.type = "file";
    inp.accept = "image/*";
    inp.style.display = "none";
    rowEl.appendChild(inp);

    btn.addEventListener("click", () => inp.click());
    inp.addEventListener("change", async () => {
      const f = inp.files && inp.files[0];
      inp.value = ""; // allow re-pick same file next time
      if (!f) return;

      try {
        await addPictureFromFile(f);
      } catch (e) {
        console.error(e);
        toast("Lỗi thêm ảnh. Mở console để xem chi tiết.");
      }
    });

    // stage click: deselect picture transformer
    const tryBindStageClick = () => {
      const stage = findStage();
      if (!stage) return false;
      const layer = ensureLayer(stage);
      ensureTransformer(stage, layer);

      stage.on("mousedown touchstart", (e) => {
        // if clicked on empty stage or background, deselect
        if (e.target === stage) selectNode(stage, layer, null);
      });
      return true;
    };

    // bind later (designer.js creates stage async)
    let tries = 0;
    const t = setInterval(() => {
      tries++;
      if (tryBindStageClick() || tries > 60) clearInterval(t);
    }, 200);

    toast("Picture tool loaded.");
  }

  // ---------- bootstrap ----------
  function boot() {
    if (!window.Konva) {
      // wait Konva
      let tries = 0;
      const t = setInterval(() => {
        tries++;
        if (window.Konva) {
          clearInterval(t);
          injectUI();
        } else if (tries > 80) {
          clearInterval(t);
          console.warn("picture.js: Konva not found");
        }
      }, 150);
    } else {
      injectUI();
    }

    // keep hydrating in case template loads later
    setInterval(() => {
      hydratePicturesOnce().catch(() => {});
    }, 800);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
