// hub.js — Python LAN Print Bridge compatible (with safe hubPrinters stub)
import { getSettings } from "./storage.js";

function normalizeBaseUrl(u) {
  u = String(u || "").trim();
  if (!u) return "";
  // nếu user nhập "192.168.68.112:5055" => tự thêm http://
  if (!/^https?:\/\//i.test(u)) u = "http://" + u;
  return u.replace(/\/+$/, "");
}

export function getHubBaseUrl() {
  const s = getSettings();
  return normalizeBaseUrl(s.hubUrl);
}

// Ping: Python server dùng /bridge
export async function hubHealth() {
  const base = getHubBaseUrl();
  if (!base) throw new Error("Hub URL missing");
  const url = `${base}/bridge`;
  const r = await fetch(url, { method: "GET", cache: "no-store" });
  if (!r.ok) throw new Error(`Bridge HTTP ${r.status}`);
  return { ok: true, name: "Python Bridge", url };
}

/**
 * Python server hiện KHÔNG có endpoint /printers
 * => trả stub để app.js không bị lỗi, và dropdown chỉ có (Auto)
 */
export async function hubPrinters() {
  return { ok: true, printers: [] };
}

/**
 * Open bridge tab -> wait BRIDGE_READY -> postMessage PRINT_PNG -> auto close tab
 * Message format must match python /bridge listener:
 *   { type:"PRINT_PNG", token, printer_name, png_base64, label:{w_mm,h_mm,gap_mm,threshold} }
 */
export async function hubPrintViaBridge({
  token,
  printer_name,
  png_base64,
  label,
  autoCloseMs = 1200,
}) {
  const base = getHubBaseUrl();
  if (!base) throw new Error("Hub URL missing");

  const bridgeUrl = `${base}/bridge`;

  // mở tab mới
  const w = window.open(bridgeUrl, "_blank");
  if (!w) throw new Error("Popup blocked. Cho phép pop-up cho trang này.");

  return await new Promise((resolve, reject) => {
    let done = false;

    const cleanup = () => window.removeEventListener("message", onMsg);

    const fail = (err) => {
      if (done) return;
      done = true;
      cleanup();
      try { w.close(); } catch {}
      reject(err);
    };

    const ok = () => {
      if (done) return;
      done = true;
      cleanup();
      setTimeout(() => {
        try { w.close(); } catch {}
      }, autoCloseMs);
      resolve({ ok: true });
    };

    const timer = setTimeout(() => fail(new Error("Bridge timeout: không nhận BRIDGE_READY")), 5000);

    function onMsg(ev) {
      const msg = ev.data || {};
      if (msg.type === "BRIDGE_READY") {
        clearTimeout(timer);

        try {
          w.postMessage(
            {
              type: "PRINT_PNG",
              token,
              printer_name,
              png_base64,
              label,
            },
            "*"
          );
        } catch (e) {
          return fail(e);
        }

        // python bridge hiện không post-back kết quả -> đóng tab sau khi gửi
        ok();
      }
    }

    window.addEventListener("message", onMsg);
  });
}
