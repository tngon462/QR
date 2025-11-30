// core/kiemkho-keyboard.js
// Bàn phím full ký tự + hỗ trợ gõ tiếng Việt kiểu Telex
// Dùng cho các input có data-keyboard="1"

(function () {
  let kbEl = null;
  let kbContainer = null;
  let currentInput = null;

  // Bảng map dấu cho từng nguyên âm
  const TONE_MAP = {
    'a': { s:'á', f:'à', r:'ả', x:'ã', j:'ạ' },
    'ă': { s:'ắ', f:'ằ', r:'ẳ', x:'ẵ', j:'ặ' },
    'â': { s:'ấ', f:'ầ', r:'ẩ', x:'ẫ', j:'ậ' },
    'e': { s:'é', f:'è', r:'ẻ', x:'ẽ', j:'ẹ' },
    'ê': { s:'ế', f:'ề', r:'ể', x:'ễ', j:'ệ' },
    'i': { s:'í', f:'ì', r:'ỉ', x:'ĩ', j:'ị' },
    'o': { s:'ó', f:'ò', r:'ỏ', x:'õ', j:'ọ' },
    'ô': { s:'ố', f:'ồ', r:'ổ', x:'ỗ', j:'ộ' },
    'ơ': { s:'ớ', f:'ờ', r:'ở', x:'ỡ', j:'ợ' },
    'u': { s:'ú', f:'ù', r:'ủ', x:'ũ', j:'ụ' },
    'ư': { s:'ứ', f:'ừ', r:'ử', x:'ữ', j:'ự' },
    'y': { s:'ý', f:'ỳ', r:'ỷ', x:'ỹ', j:'ỵ' }
  };

  const TONE_CHARS = ['s','f','r','x','j','z'];

  function createKeyboardIfNeeded() {
    if (kbEl) return;

    kbEl = document.createElement("div");
    kbEl.id = "kk-full-keyboard";
    kbEl.style.position = "fixed";
    kbEl.style.left = "50%";
    kbEl.style.bottom = "10px";
    kbEl.style.transform = "translateX(-50%)";
    kbEl.style.display = "none";
    kbEl.style.background = "#ffffff";
    kbEl.style.padding = "8px";
    kbEl.style.borderRadius = "12px";
    kbEl.style.boxShadow = "0 4px 20px rgba(0,0,0,0.25)";
    kbEl.style.zIndex = "99998";
    kbEl.style.userSelect = "none";
    kbEl.style.touchAction = "manipulation";
    kbEl.style.maxWidth = "100%";

    kbContainer = document.createElement("div");
    kbContainer.style.display = "flex";
    kbContainer.style.flexDirection = "column";
    kbContainer.style.gap = "4px";

    const layout = [
      ["1","2","3","4","5","6","7","8","9","0"],
      ["Q","W","E","R","T","Y","U","I","O","P"],
      ["A","S","D","F","G","H","J","K","L"],
      ["Z","X","C","V","B","N","M"],
      ["SPACE","←","C","OK"]
    ];

    layout.forEach(row => {
      const rowEl = document.createElement("div");
      rowEl.style.display = "flex";
      rowEl.style.justifyContent = "center";
      rowEl.style.gap = "4px";

      row.forEach(key => {
        const btn = document.createElement("button");
        btn.type = "button";

        let label = key;
        if (key === "SPACE") label = "Space";
        if (key === "←") label = "←";
        if (key === "C") label = "C";
        if (key === "OK") label = "OK";

        btn.textContent = label;
        btn.style.fontSize = "16px";
        btn.style.padding = "8px 6px";
        btn.style.borderRadius = "6px";
        btn.style.border = "1px solid #ccc";
        btn.style.background = "#f3f3f3";
        btn.style.color = "#000"; // CHỮ MÀU ĐEN
        btn.style.minWidth = key === "SPACE" ? "120px" : "32px";
        btn.style.flex = key === "SPACE" ? "1" : "0";
        btn.style.whiteSpace = "nowrap";

        if (key === "C") {
          btn.style.background = "#ffecec";
        } else if (key === "OK") {
          btn.style.background = "#d1f5d3";
        }

        btn.addEventListener("click", function (e) {
          e.stopPropagation();
          handleKeyPress(key);
        });

        rowEl.appendChild(btn);
      });

      kbContainer.appendChild(rowEl);
    });

    kbEl.appendChild(kbContainer);
    document.body.appendChild(kbEl);

    // Click ngoài bàn phím → ẩn
    document.addEventListener("click", function (e) {
      if (!kbEl || kbEl.style.display === "none") return;
      if (kbEl.contains(e.target)) return;
      if (currentInput && e.target === currentInput) return;
      hideKeyboard();
    });
  }

  function showKeyboardForInput(input) {
    if (!input) return;
    createKeyboardIfNeeded();
    currentInput = input;
    kbEl.style.display = "block";
  }

  function hideKeyboard() {
    if (!kbEl) return;
    kbEl.style.display = "none";
    currentInput = null;
  }

  // Xử lý Telex trên toàn chuỗi text, chỉ đụng vào từ cuối cùng
  function applyTelex(text) {
    const parts = text.split(/(\s+)/); // tách và giữ khoảng trắng
    for (let i = parts.length - 1; i >= 0; i--) {
      if (!parts[i].match(/^\s+$/)) {
        parts[i] = processWordTelex(parts[i]);
        break;
      }
    }
    return parts.join('');
  }

  function processWordTelex(word) {
    if (!word) return word;
    let w = word.toLowerCase();

    // 1) Lấy tone (s,f,r,x,j,z) nếu nằm ở cuối
    let tone = '';
    const last = w[w.length - 1];
    if (TONE_CHARS.includes(last)) {
      tone = last;
      w = w.slice(0, -1);
    }

    // 2) Đổi kiểu chữ (dd, aw, aa, ee, oo, ow, uw)
    w = applyTypeMarks(w);

    // 3) Gắn dấu (nếu có tone và tone != 'z')
    if (tone && tone !== 'z') {
      w = applyToneMark(w, tone);
    } else if (tone === 'z') {
      // 'z' = bỏ dấu → tạm thời không xử lý phức tạp, giữ nguyên w
    }

    return w;
  }

  function applyTypeMarks(w) {
    // đơn giản: replace hết, ưu tiên từ trái sang phải
    // thực tế thường chỉ có 1 cụm trong 1 âm nên ổn
    return w
      .replace(/dd/g, 'đ')
      .replace(/aw/g, 'ă')
      .replace(/aa/g, 'â')
      .replace(/ee/g, 'ê')
      .replace(/oo/g, 'ô')
      .replace(/ow/g, 'ơ')
      .replace(/uw/g, 'ư');
  }

  function applyToneMark(w, tone) {
    const chars = w.split('');
    // tìm từ phải sang trái nguyên âm để đặt dấu
    for (let i = chars.length - 1; i >= 0; i--) {
      const c = chars[i];
      if (TONE_MAP[c] && TONE_MAP[c][tone]) {
        chars[i] = TONE_MAP[c][tone];
        break;
      }
    }
    return chars.join('');
  }

  function handleKeyPress(key) {
    if (!currentInput) return;

    let val = currentInput.value || "";

    if (key === "SPACE") {
      val = val + " ";
      currentInput.value = val;
      currentInput.dispatchEvent(new Event("input", { bubbles: true }));
      return;
    }

    if (key === "←") {
      // backspace 1 ký tự rồi chạy lại Telex cho từ cuối
      val = val.slice(0, -1);
      val = applyTelex(val);
      currentInput.value = val;
      currentInput.dispatchEvent(new Event("input", { bubbles: true }));
      return;
    }

    if (key === "C") {
      currentInput.value = "";
      currentInput.dispatchEvent(new Event("input", { bubbles: true }));
      return;
    }

    if (key === "OK") {
      hideKeyboard();
      currentInput.blur();
      return;
    }

    // Các phím chữ / số bình thường
    const ch = key.toLowerCase();
    // Gắn thêm ký tự mới rồi áp Telex cho từ cuối
    val = val + ch;
    val = applyTelex(val);
    currentInput.value = val;
    currentInput.dispatchEvent(new Event("input", { bubbles: true }));
  }

  // Tự lắng nghe focus vào input có data-keyboard
  document.addEventListener("focusin", function (e) {
    const t = e.target;
    if (
      t &&
      t.tagName === "INPUT" &&
      (t.dataset.keyboard === "1" || t.dataset.keyboard === "true" || t.hasAttribute("data-keyboard"))
    ) {
      showKeyboardForInput(t);
    }
  });

  // Public API
  window.KiemKhoKeyboard = {
    attachToInput: function (input) {
      if (!input) return;
      input.setAttribute("data-keyboard", "1");
    },
    hide: hideKeyboard
  };
})();
