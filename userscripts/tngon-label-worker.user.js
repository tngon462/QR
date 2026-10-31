// ==UserScript==
// @name         T-NGON - In tem trực tiếp 58mm
// @namespace    https://tngon.kiotviet.vn/
// @version      5.0.0
// @description  Nhận tên + giá từ Firebase và in trực tiếp ra máy in nhiệt 58mm.
// @match        https://tngon.kiotviet.vn/man/*
// @run-at       document-idle
// @noframes
// @grant        GM_xmlhttpRequest
// @grant        GM_notification
// @connect      tngon-b37d6-default-rtdb.asia-southeast1.firebasedatabase.app
// ==/UserScript==

(() => {
  'use strict';
  const CONFIG = {
    databaseURL:
      "https://tngon-b37d6-default-rtdb.asia-southeast1.firebasedatabase.app",

    deviceId: "tngon_label_pc",

    token: "6868-LABEL-2026",

    pollMs: 500,

    heartbeatMs: 5000,

    commandMaxAgeMs: 60000,

    // Chiều rộng giấy thực tế.
    paperWidthMm: 58,

    // Vùng in nên hẹp hơn giấy một chút
    // để tránh driver cắt chữ hai bên.
    printableWidthMm: 54
  };

  const basePath =
    `labelPrinter/${CONFIG.deviceId}`;

  const api = path =>
    `${CONFIG.databaseURL}/${basePath}/${path}.json`;


  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function formatPrice(value) {
    const number =
      Number(value || 0);

    return (
      "¥" +
      number.toLocaleString(
        "ja-JP",
        {
          maximumFractionDigits: 0
        }
      )
    );
  }


  const VERSION = '5.0.0';
  const workerId = crypto.randomUUID();
  const JOURNAL = 'tngon_label_worker_v5_journal';
  let busy = false, halted = false, currentCommandId = null;
  const terminal = r => ['submitted', 'error', 'needs_review'].includes(r?.status);

  function request(method, url, data = undefined, headers = {}) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({ method, url, headers: {'Content-Type': 'application/json', ...headers},
        data: data === undefined ? undefined : JSON.stringify(data), timeout: 10000,
        onload: response => {
          if (response.status < 200 || response.status >= 300) {
            const error = new Error('Firebase HTTP ' + response.status);
            error.status = response.status; reject(error); return;
          }
          try {
            resolve({value: response.responseText ? JSON.parse(response.responseText) : null,
              etag: /^etag:\s*(.+)$/im.exec(response.responseHeaders || '')?.[1].trim()});
          } catch (error) { reject(error); }
        },
        onerror: () => reject(new Error('Không kết nối được Firebase')),
        ontimeout: () => reject(new Error('Firebase phản hồi quá chậm')),
        onabort: () => reject(new Error('Firebase request bị hủy'))
      });
    });
  }
  const get = async p => (await request('GET', api(p))).value;
  const put = (p, value) => request('PUT', api(p), value);
  const remove = p => request('DELETE', api(p));
  const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
  function journal() { return JSON.parse(localStorage.getItem(JOURNAL) || '{}'); }
  function remember(id, result) {
    const entries = journal(); entries[id] = result;
    localStorage.setItem(JOURNAL, JSON.stringify(entries));
  }
  function forget(id) {
    const entries = journal(); delete entries[id];
    localStorage.setItem(JOURNAL, JSON.stringify(entries));
  }
  function outcome(id, status, message) {
    return {commandId: id, status, message, updatedAt: Date.now(), workerId, version: VERSION};
  }
  async function heartbeat() {
    await put('status', {online: true, lastSeen: Date.now(), page: location.href,
      busy, currentCommandId, halted, mode: 'DIRECT_58MM', workerVersion: VERSION, queueProtocol: 2});
  }
  async function publish(id, result) {
    // Result must survive a failed ACK or page restart. Delete only this completed queue item.
    await put('results/' + id, result);
    await remove('queue/' + id);
    forget(id);
  }
  async function claim(id) {
    const snapshot = await request('GET', api('claims/' + id), undefined, {'X-Firebase-ETag': 'true'});
    if (snapshot.value) return false;
    if (!snapshot.etag) throw new Error('Firebase không trả ETag; dừng để tránh nhận trùng');
    try {
      await request('PUT', api('claims/' + id), {workerId, createdAt: Date.now()}, {'if-match': snapshot.etag});
      return true;
    } catch (error) { if (error.status === 412) return false; throw error; }
  }
  function validate(command) {
    if (!command || command.type !== 'PRINT_LABEL_DIRECT' || command.token !== CONFIG.token)
      throw new Error('Lệnh hoặc token không hợp lệ');
    if (!Number.isFinite(command.createdAt) || command.createdAt > Date.now() + 60000)
      throw new Error('Thời gian lệnh không hợp lệ');
    if (Date.now() - command.createdAt > 24 * 60 * 60 * 1000)
      throw new Error('Lệnh quá 24 giờ, cần kiểm tra trước khi in');
    if (!String(command.product?.name || '').trim() || !Number.isFinite(Number(command.product?.salePrice)))
      throw new Error('Tên hoặc giá sản phẩm không hợp lệ');
  }
  function printLabel(product) {
    return new Promise((resolve, reject) => {
      const name = String(product.name).trim(), price = Number(product.salePrice);
      const iframe = document.createElement('iframe');
      iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:1px;height:1px;opacity:0;border:0;pointer-events:none';
      let finished = false, started = false, fallback;
      const finish = error => {
        if (finished) return;
        finished = true; clearTimeout(deadline); clearTimeout(fallback);
        iframe.onload = null;
        if (error && started) halted = true;
        // Keep the document intact briefly after Chromium returns from print().
        setTimeout(() => iframe.remove(), 1000);
        if (error) reject(error); else resolve();
      };
      const deadline = setTimeout(() => finish(new Error('Trang in quá thời gian; kiểm tra hộp thoại và Windows queue')), 15000);
      // Install handlers BEFORE navigation. Never depend on an about:blank load event.
      iframe.onload = async () => {
        if (started || finished) return;
        try {
          const win = iframe.contentWindow;
          if (!win) throw new Error('Không mở được trang in');
          await win.document.fonts?.ready;
          await pause(50);
          if (finished) return;
          started = true;
          win.onafterprint = () => finish();
          win.focus();
          win.print();
          // Return means submitted to the browser, not physically printed.
          if (!finished) fallback = setTimeout(() => finish(), 500);
        } catch (error) { finish(error); }
      };
      iframe.srcdoc = `
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">

<style>

@page {
  size: ${CONFIG.paperWidthMm}mm auto;
  margin: 0;
}

* {
  box-sizing: border-box;
}

html,
body {
  margin: 0;
  padding: 0;
  width: ${CONFIG.paperWidthMm}mm;
  background: #fff;
}

body {
  font-family:
    Arial,
    "Noto Sans",
    sans-serif;

  color: #000;
}

.label {
  width: ${CONFIG.printableWidthMm}mm;

  margin: 0 auto;

  padding:
    3mm
    1.5mm
    3mm
    1.5mm;

  text-align: center;
}

.name {
  width: 100%;

  font-size: 18pt;

  font-weight: 500;

  line-height: 1.15;

  text-align: center;

  overflow-wrap: anywhere;
}

.price {
  width: 100%;

  margin-top: 1.5mm;

  font-size: 23pt;

  font-weight: 800;

  line-height: 1;

  text-align: center;
}

</style>
</head>

<body>

<div class="label">

  <div class="name">
    ${escapeHtml(name)}
  </div>

  <div class="price">
    ${escapeHtml(
      formatPrice(price)
    )}
  </div>

</div>

</body>
</html>
        `;
      document.body.appendChild(iframe);
    });
  }
  async function recover() {
    for (const [id, saved] of Object.entries(journal())) {
      if (!terminal(saved)) {
        const result = outcome(id, 'needs_review', 'Worker dừng trong lúc in; kiểm tra tem và Windows queue, không tự in lại');
        remember(id, result); await publish(id, result);
      } else await publish(id, saved);
    }
  }
  async function processJob(id, command) {
    const previous = await get('results/' + id);
    if (terminal(previous)) { await remove('queue/' + id); return; }
    if (!await claim(id)) {
      const owner = await get('claims/' + id);
      if (!owner || Date.now() - owner.createdAt < 120000) return;
      // A permanent claim is deliberately not leased/replayed: print() is not idempotent.
      const result = outcome(id, 'needs_review', 'Lệnh đã được worker nhận; kiểm tra tem và Windows queue trước khi in lại');
      remember(id, result); await publish(id, result); return;
    }
    let result, invoked = false;
    try {
      validate(command);
      remember(id, outcome(id, 'processing', 'Chuẩn bị trang in'));
      await put('results/' + id, outcome(id, 'processing', 'Đang gửi sang trình duyệt in'));
      invoked = true;
      await printLabel(command.product);
      result = outcome(id, 'submitted', 'Đã gửi sang trình duyệt in; kiểm tra tem tại máy');
    } catch (error) {
      result = outcome(id, invoked ? 'needs_review' : 'error', error.message || String(error));
    }
    remember(id, result);
    await publish(id, result);
  }
  async function pollCommand() {
    if (busy || halted) return;
    busy = true;
    try {
      await recover();
      const queue = await get('queue') || {};
      const first = Object.entries(queue).sort(([a,x],[b,y]) =>
        (Number(x?.createdAt) || 0) - (Number(y?.createdAt) || 0) || a.localeCompare(b))[0];
      if (!first) return;
      currentCommandId = first[0];
      await processJob(first[0], first[1]);
    } catch (error) { console.warn('[T-NGON queue]', error.message); }
    finally { currentCommandId = null; busy = false; }
  }
  async function run() {
    // One active tab per origin/device. Claims also protect each UUID across workers.
    if (!navigator.locks) throw new Error('Trình duyệt không hỗ trợ Web Locks');
    await navigator.locks.request('tngon-label-worker-v5', {ifAvailable: true}, async lock => {
      if (!lock) { console.info('[T-NGON] Một tab khác đang giữ worker'); return; }
      console.info('[T-NGON] Worker ' + VERSION + ' started');
      const beat = () => heartbeat().catch(e => console.warn('[T-NGON status]', e.message));
      await beat();
      setInterval(beat, CONFIG.heartbeatMs);
      // Schedule the next poll only after the current poll completes.
      for (;;) { await pollCommand(); await pause(CONFIG.pollMs); }
    });
  }
  run().catch(error => console.error('[T-NGON worker]', error.message));
})();
