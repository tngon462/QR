// ==UserScript==
// @name         T-NGON - In tem truc tiep 58mm (BATCH)
// @namespace    https://tngon.kiotviet.vn/
// @version      5.0.0-batch
// @description  In tem 58mm theo lo: nhan nhieu lenh trong hang doi roi in LIEN TUC, khong cho 2.5s giua cac tem. Van nhan lenh cu o node command neu hang doi trong.
// @match        https://tngon.kiotviet.vn/man/*
// @run-at       document-idle
// @grant        GM_xmlhttpRequest
// @grant        GM_notification
// @connect      tngon-b37d6-default-rtdb.asia-southeast1.firebasedatabase.app
// ==/UserScript==

(() => {
  "use strict";

  const CONFIG = {
    databaseURL: "https://tngon-b37d6-default-rtdb.asia-southeast1.firebasedatabase.app",
    deviceId: "tngon_label_pc",
    // Token KHONG duoc commit vao repo. Lay tu localStorage cua profile POS.
    // Khi cai dat: dat localStorage["tngon_label_token"] = <token thiet bi>.
    token: (typeof localStorage !== "undefined" && localStorage.getItem("tngon_label_token")) || "",

    pollMs: 400,
    pollJitterMs: 150,

    // ===== IN LO =====
    batchMax: 10,          // toi da 10 tem / 1 dot
    gapMs: 120,            // nghi giua 2 tem trong lo (chi de driver kip nhan)
    afterPrintFallbackMs: 600,  // 4.0.1 dung 2500ms -> day la cho cham nhat

    commandMaxAgeMs: 300000,
    queueMaxAgeMs: 600000,
    maxRetry: 2,
    printTimeoutMs: 9000,

    paperWidthMm: 58,
    printableWidthMm: 54,
    gapBetweenLabelsMm: 2
  };

  const basePath = `labelPrinter/${CONFIG.deviceId}`;
  const api = p => `${CONFIG.databaseURL}/${basePath}/${p}.json`;
  const queueItemUrl = id => `${CONFIG.databaseURL}/${basePath}/queue/${id}.json`;

  const LAST_KEY = `tngon_label_done_v5::${CONFIG.deviceId}`;
  const QUEUE_DONE_KEY = `tngon_label_qdone_v5::${CONFIG.deviceId}`;
  const LEADER_KEY = "tngon_label_leader_v1";
  const LEADER_TTL_VISIBLE = 8000;
  const LEADER_TTL_HIDDEN = 70000;

  const ME = Math.random().toString(36).slice(2) + Date.now().toString(36);

  let busy = false;
  let isLeaderNow = false;
  let lastDone = "";
  let lastQueueDone = [];
  let invalidSeen = null;
  let timer = null;

  /* ---------- helpers ---------- */
  const validId = id => typeof id === "string" && /^[A-Za-z0-9_-]{8,64}$/.test(id);

  function readDone() {
    try { return localStorage.getItem(LAST_KEY) || ""; } catch { return ""; }
  }
  function markDone(id) {
    if (!validId(id)) return;
    lastDone = id;
    try { localStorage.setItem(LAST_KEY, id); } catch {}
  }
  function readQueueDone() {
    try {
      const a = JSON.parse(localStorage.getItem(QUEUE_DONE_KEY) || "[]");
      return Array.isArray(a) ? a : [];
    } catch { return []; }
  }
  function markQueueDone(id) {
    if (!id || lastQueueDone.indexOf(id) >= 0) return;
    lastQueueDone.unshift(id);
    if (lastQueueDone.length > 50) lastQueueDone.length = 50;
    try { localStorage.setItem(QUEUE_DONE_KEY, JSON.stringify(lastQueueDone)); } catch {}
  }

  function request(method, url, data) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method, url,
        headers: { "Content-Type": "application/json" },
        data: data === undefined ? undefined : JSON.stringify(data),
        timeout: 10000,
        onload: r => {
          if (r.status < 200 || r.status >= 300) { reject(new Error("Firebase HTTP " + r.status)); return; }
          try { resolve(r.responseText ? JSON.parse(r.responseText) : null); } catch { resolve(null); }
        },
        onerror: () => reject(new Error("Khong ket noi duoc Firebase.")),
        ontimeout: () => reject(new Error("Firebase phan hoi qua cham."))
      });
    });
  }
  const getJSON = u => request("GET", u);
  const putJSON = (u, d) => request("PUT", u, d);
  const delJSON = u => request("DELETE", u);
  const patchJSON = (u, d) => request("PATCH", u, d);

  async function setStatus(extra) {
    await putJSON(api("status"), Object.assign({
      online: true, lastSeen: Date.now(), page: location.href,
      busy, mode: "BATCH_58MM"
    }, extra || {}));
  }
  async function setResult(id, status, msg, extra) {
    await putJSON(api("result"), Object.assign({
      commandId: id, status, message: msg, updatedAt: Date.now()
    }, extra || {}));
  }

  /* ---------- leader ---------- */
  function readLeader() {
    try { return JSON.parse(localStorage.getItem(LEADER_KEY) || "null"); } catch { return null; }
  }
  function writeLeader() {
    try { localStorage.setItem(LEADER_KEY, JSON.stringify({ id: ME, ts: Date.now() })); } catch {}
  }
  function tryLeader() {
    const L = readLeader();
    const now = Date.now();
    const vis = document.visibilityState === "visible";
    if (!L || !L.id) { writeLeader(); return true; }
    if (L.id === ME) { writeLeader(); return true; }
    const age = now - Number(L.ts || 0);
    if (age < 0) { writeLeader(); return true; }
    if (vis && age > LEADER_TTL_VISIBLE) { writeLeader(); return true; }
    if (!vis && age > LEADER_TTL_HIDDEN) { writeLeader(); return true; }
    return false;
  }

  /* ---------- in ---------- */
  function esc(v) {
    return String(v == null ? "" : v)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  }
  function money(v) {
    return "¥" + Number(v || 0).toLocaleString("ja-JP", { maximumFractionDigits: 0 });
  }

  function labelHtml(items) {
    // 1 tem = 1 khoi; bat buoc 1 tem / 1 job de khong phu thuoc "@page auto"
    const it = items[0];
    return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
@page { size: ${CONFIG.paperWidthMm}mm auto; margin: 0; }
* { box-sizing: border-box; }
html, body { margin:0; padding:0; width:${CONFIG.paperWidthMm}mm; background:#fff; }
body { font-family: Arial, "Noto Sans", sans-serif; color:#000; }
.label { width:${CONFIG.printableWidthMm}mm; margin:0 auto; padding:3mm 1.5mm 3mm 1.5mm; text-align:center; }
.name { width:100%; font-size:18pt; font-weight:500; line-height:1.15; text-align:center; overflow-wrap:anywhere; }
.price { width:100%; margin-top:1.5mm; font-size:23pt; font-weight:800; line-height:1; text-align:center; }
</style></head><body>
<div class="label">
  <div class="name">${esc(it.product && it.product.name)}</div>
  <div class="price">${esc(money(it.product && it.product.salePrice))}</div>
</div></body></html>`;
  }

  // In 1 tem. Resolve NGAY khi print() tra ve, khong doi 2.5s.
  function printOne(item) {
    return new Promise((resolve, reject) => {
      const name = String((item.product && item.product.name) || "").trim();
      if (!name) { reject(new Error("San pham khong co ten.")); return; }

      const f = document.createElement("iframe");
      f.style.cssText = "position:fixed;right:0;bottom:0;width:1px;height:1px;opacity:0;pointer-events:none;border:0";
      document.body.appendChild(f);

      const doc = f.contentDocument;
      if (!doc) { f.remove(); reject(new Error("Khong tao duoc trang in.")); return; }

      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        clearTimeout(t);
        setTimeout(() => { try { f.remove(); } catch (e) {} }, 600);
        resolve();
      };

      const t = setTimeout(() => {
        if (done) return;
        done = true;
        try { f.remove(); } catch (e) {}
        reject(new Error("Het thoi gian cho in."));
      }, CONFIG.printTimeoutMs);

      doc.open();
      doc.write(labelHtml([item]));
      doc.close();

      f.onload = () => {
        try {
          const w = f.contentWindow;
          if (!w) throw new Error("Khong mo duoc cua so in.");
          w.onafterprint = finish;
          setTimeout(() => {
            try {
              w.focus();
              w.print();
            } catch (e) {
              if (!done) { done = true; clearTimeout(t); try { f.remove(); } catch (x) {} reject(e); }
              return;
            }
            // 4.0.1: 2500ms -> 600ms
            setTimeout(finish, CONFIG.afterPrintFallbackMs);
          }, 40);
        } catch (e) {
          if (!done) { done = true; clearTimeout(t); try { f.remove(); } catch (x) {} reject(e); }
        }
      };
    });
  }

  async function printBatch(items) {
    const ok = [];
    for (let i = 0; i < items.length; i++) {
      await printOne(items[i]);
      ok.push(items[i]);
      if (i < items.length - 1) await new Promise(r => setTimeout(r, CONFIG.gapMs));
    }
    return ok;
  }

  /* ---------- hang doi ---------- */
  async function readQueue() {
    const raw = await getJSON(api("queue"));
    if (!raw || typeof raw !== "object") return [];
    const now = Date.now();
    const out = [];
    for (const id of Object.keys(raw)) {
      const v = raw[id];
      if (!v || typeof v !== "object") continue;
      const age = now - Number(v.createdAt || 0);
      if (age > CONFIG.queueMaxAgeMs) { delJSON(queueItemUrl(id)).catch(() => {}); continue; }
      if (lastQueueDone.indexOf(id) >= 0) continue;
      if (readQueueDone().indexOf(id) >= 0) continue;
      out.push({
        id, kind: "queue",
        type: v.type, token: v.token,
        createdAt: Number(v.createdAt || 0),
        product: v.product || {},
        retryCount: Number(v.retryCount || 0)
      });
    }
    out.sort((a, b) => a.createdAt - b.createdAt);
    return out;
  }

  /* ---------- xu ly ---------- */
  async function handleBatch() {
    // chan chay song song: vong loop goi lai trong khi dang in
    if (busy) return;
    // fail closed: khong co token thi khong lam gi
    if (!CONFIG.token) return;

    const q = await readQueue();
    const legacy = [];

    if (q.length > 0) {
      if (busy) return;
      busy = true;

      const take = q.slice(0, CONFIG.batchMax);
      const good = [];
      for (const it of take) {
        if (it.type !== "PRINT_LABEL_DIRECT" || it.token !== CONFIG.token) {
          await setResult(it.id, "error", "Token/loai lenh khong hop le.").catch(() => {});
          await patchJSON(queueItemUrl(it.id), { retryCount: it.retryCount + 1 }).catch(() => {});
          if (it.retryCount + 1 >= CONFIG.maxRetry) await delJSON(queueItemUrl(it.id)).catch(() => {});
          continue;
        }
        good.push(it);
      }
      if (good.length === 0) { busy = false; return; }

      for (const it of good) setResult(it.id, "processing", "Dang in " + (it.product.name || "") + "…").catch(() => {});
      setStatus({ currentCommandId: good.map(x => x.id).join(",") }).catch(() => {});

      let printed = [];
      try {
        printed = await printBatch(good);
      } catch (e) {
        // in duoc bao nhieu hay bay nhieu
        console.warn("[T-NGON Batch]", e);
      }

      for (const it of good) {
        if (printed.indexOf(it) >= 0) {
          await setResult(it.id, "success", "Da in " + (it.product.name || "") + ".", {
            name: it.product.name || "", salePrice: Number(it.product.salePrice || 0)
          }).catch(() => {});
          await delJSON(queueItemUrl(it.id)).catch(() => {});
          markQueueDone(it.id);
        } else {
          const rc = it.retryCount + 1;
          await setResult(it.id, "error", "In loi.").catch(() => {});
          await patchJSON(queueItemUrl(it.id), { retryCount: rc }).catch(() => {});
          if (rc >= CONFIG.maxRetry) await delJSON(queueItemUrl(it.id)).catch(() => {});
        }
      }

      GM_notification({
        title: "T-NGON in tem",
        text: "Da in " + printed.length + "/" + good.length + " tem",
        timeout: 1800
      });

      busy = false;
      setStatus({ currentCommandId: null }).catch(() => {});
      return;
    }

    // ===== tuong thich nguoc: node command (giao thuc cu) =====
    const cmd = await getJSON(api("command"));
    if (busy) return;
    if (!cmd) return;
    if (!validId(cmd.id)) {
      const raw = String(cmd && cmd.id);
      if (invalidSeen !== raw) {
        invalidSeen = raw;
        console.warn("[T-NGON Batch] Bo qua lenh cu: thieu ID hop le.");
      }
      return;
    }
    if (cmd.id === readDone() || cmd.id === lastDone) return;

    busy = true;
    setResult(cmd.id, "processing", "Dang in " + (cmd.product && cmd.product.name || "") + "…").catch(() => {});
    setStatus({ currentCommandId: cmd.id }).catch(() => {});
    try {
      if (cmd.type !== "PRINT_LABEL_DIRECT") throw new Error("Loai lenh khong ho tro.");
      if (cmd.token !== CONFIG.token) throw new Error("Token lenh khong dung.");
      if (Date.now() - Number(cmd.createdAt || 0) > CONFIG.commandMaxAgeMs) throw new Error("Lenh in da qua cu.");
      await printOne(cmd);
      markDone(cmd.id);
      setResult(cmd.id, "success", "Da in " + (cmd.product.name || "") + ".", {
        name: cmd.product.name || "", salePrice: Number(cmd.product.salePrice || 0)
      }).catch(() => {});
    } catch (e) {
      console.warn("[T-NGON Batch]", e);
      setResult(cmd.id, "error", (e && e.message) || String(e)).catch(() => {});
    } finally {
      busy = false;
      setStatus({ currentCommandId: null }).catch(() => {});
    }
  }

  /* ---------- vong lap ---------- */
  function loop() {
    isLeaderNow = tryLeader();
    if (isLeaderNow) {
      const shared = readDone();
      if (shared) lastDone = shared;
      handleBatch().catch(e => console.warn("[T-NGON Batch] poll:", e));
    }
    clearTimeout(timer);
    timer = setTimeout(loop, CONFIG.pollMs + Math.floor(Math.random() * CONFIG.pollJitterMs));
  }

  document.addEventListener("visibilitychange", () => {
    isLeaderNow = tryLeader();
    if (!document.hidden && isLeaderNow) handleBatch().catch(() => {});
  });
  window.addEventListener("focus", () => { isLeaderNow = tryLeader(); });

  lastDone = readDone();
  lastQueueDone = readQueueDone();
  console.log("[T-NGON Batch] Script 5.0.0-batch khoi dong | tab " + ME);

  isLeaderNow = tryLeader();
  setStatus().catch(() => {});
  loop();
  setInterval(() => { if (isLeaderNow) setStatus().catch(() => {}); }, 5000);
})();
