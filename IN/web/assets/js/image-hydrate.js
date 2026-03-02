// image-hydrate.js — auto load bitmap for Konva.Image nodes from attrs.src
// Use with templates that store { attrs: { src: "data:image/..." } }.
//
// Include this script on BOTH designer.html and print.html (after main scripts).

(function () {
  "use strict";

  const $ = (sel, root = document) => root.querySelector(sel);

  function toast(msg) {
    const el = $("#status");
    if (el) el.textContent = msg;
    // console.log("[image-hydrate]", msg);
  }

  function getStage() {
    if (window.Konva && Array.isArray(window.Konva.stages) && window.Konva.stages.length) {
      return window.Konva.stages[0];
    }
    if (window.stage && window.stage.getClassName?.() === "Stage") return window.stage;
    return null;
  }

  function loadBitmap(src) {
    return new Promise((resolve, reject) => {
      const im = new Image();
      im.onload = () => resolve(im);
      im.onerror = reject;
      im.src = src;
    });
  }

  async function hydrateOnce() {
    const stage = getStage();
    if (!stage || !window.Konva) return;

    // Find any Konva.Image with attrs.src but missing node.image()
    const nodes = stage.find((n) => n?.className === "Image" && n.getAttr?.("src"));
    if (!nodes?.length) return;

    let touched = 0;

    for (const n of nodes) {
      const src = n.getAttr("src");
      if (!src) continue;

      // already hydrated
      if (typeof n.image === "function" && n.image()) continue;

      // avoid re-trying forever
      if (n.__hydrating || n.__hydratedFail) continue;
      n.__hydrating = true;

      try {
        const im = await loadBitmap(src);
        n.image(im);
        if (typeof n.draggable === "function") n.draggable(true);
        touched++;
      } catch (e) {
        n.__hydratedFail = true;
        // console.warn("hydrate failed", e);
      } finally {
        n.__hydrating = false;
      }
    }

    if (touched) {
      // draw only when changed
      stage.draw();
      toast(`Hydrated images: ${touched}`);
    }
  }

  function boot() {
    // hydrate repeatedly because template can be reloaded any time
    hydrateOnce().catch(() => {});
    setInterval(() => hydrateOnce().catch(() => {}), 400);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
