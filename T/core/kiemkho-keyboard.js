// core/kiemkho-keyboard.js
// Bàn phím full ký tự (chữ + số + space) dùng chung cho các input có data-keyboard

(function () {
  let kbEl = null;
  let kbContainer = null;
  let currentInput = null;

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
    kbEl.style.zIndex = "99998"; // thấp hơn numpad nếu cùng lúc
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
        btn.style.color = "#000";      // CHỮ MÀU ĐEN
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

  function handleKeyPress(key) {
    if (!currentInput) return;

    let val = currentInput.value || "";

    if (key.length === 1 && key !== "←") {
      // Ký tự bình thường (chữ/số)
      currentInput.value = val + key;
      currentInput.dispatchEvent(new Event("input", { bubbles: true }));
      return;
    }

    if (key === "SPACE") {
      currentInput.value = val + " ";
      currentInput.dispatchEvent(new Event("input", { bubbles: true }));
      return;
    }

    if (key === "←") {
      // Backspace
      currentInput.value = val.slice(0, -1);
      currentInput.dispatchEvent(new Event("input", { bubbles: true }));
      return;
    }

    if (key === "C") {
      // Clear hết
      currentInput.value = "";
      currentInput.dispatchEvent(new Event("input", { bubbles: true }));
      return;
    }

    if (key === "OK") {
      hideKeyboard();
      currentInput.blur();
      return;
    }
  }

  // Tự lắng nghe focus vào input có data-keyboard
  document.addEventListener("focusin", function (e) {
    const t = e.target;
    if (
      t &&
