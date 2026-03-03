// hub.js — Python LAN Print Bridge compatible
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

// Ping: Python server không có /health, nên ping /bridge
export async function hubHealth() {
  const base = getHubBaseUrl();
  if (!base) throw new Error("Hub URL missing");
  const url = `${base}/bridge`;
  const r = await fetch(url, { method: "GET", cache: "no-store" });
  if (!r.ok) throw new Error(`Bridge HTTP ${r.status}`);
  return { ok: true, name: "Python Bridge", url };
}

/**
 * Open bridge tab -> wait BRIDGE_READY -> postMessage PRINT_PNG -> auto close tab
 * Payload must match python /bridge listener:
 *   { type:"PRINT_PNG", token, printer_name, png_base64, label:{w_mm,h_mm,gap_mm,threshold} }
 * :contentReference[oaicite:1]{index=1}
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

  // Mở tab mới
  const w = window.open(bridgeUrl, "_blank");
  if (!w) throw new Error("Popup blocked. Cho phép pop-up cho trang này.");

  // chờ BRIDGE_READY rồi gửi PRINT_PNG
  return await new Promise((resolve, reject) => {
    let done = false;

    const cleanup = () => {
      window.removeEventListener("message", onMsg);
    };

    const fail = (err) => {
      if (done) return;
      done = true;
      cleanup();
      try {
        w.close();
      } catch {}
      reject(err);
    };

    const ok = () => {
      if (done) return;
      done = true;
      cleanup();
      // auto close sau 1 chút
      setTimeout(() => {
        try {
          w.close();
        } catch {}
      }, autoCloseMs);
      resolve({ ok: true });
    };

    const timer = setTimeout(() => {
      clearTimeout(timer);
      fail(new Error("Bridge timeout: không nhận BRIDGE_READY"));
    }, 5000);

    function onMsg(ev) {
      const msg = ev.data || {};
      if (msg.type === "BRIDGE_READY") {
        clearTimeout(timer);

        // gửi lệnh in sang bridge
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

        // Bridge hiện tại không post back kết quả → mình coi như OK và đóng tab
        ok();
      }
    }

    window.addEventListener("message", onMsg);
  });
}
