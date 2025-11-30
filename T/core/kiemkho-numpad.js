// kiemkho-numpad.js
// Bàn phím số 0–9 dùng chung cho Kiểm kho & các màn khác

(function () {
  let padEl = null;
  let buttonsContainer = null;
  let currentInput = null;

  function createPadIfNeeded() {
    if (padEl) return;

    padEl = document.createElement("div");
    padEl.id = "kk-num-pad";
    padEl.style.position = "fixed";
    padEl.style.left = "50%";
    padEl.style.bottom = "10px";
    padEl.style.transform = "translateX(-50%)";
    padEl.style.display = "none";
    padEl.style.background = "#ffffff";
    padEl.style.padding = "12px";
    padEl.style.borderRadius = "12px";
    padEl.style.boxShadow = "0 4px 20px rgba(0,0,0,0.25)";
    padEl.style.zIndex = "99999";
    padEl.style.userSelect = "none";
    padEl.style.touchAction = "manipulation";

    buttonsContainer = document.createElement("div");
    buttonsContainer.style.display = "grid";
    buttonsContainer.style.gridTemplateColumns = "repeat(3, 70px)";
    buttonsContainer.style.gap = "8px";

    const keys = [
      "1","2","3",
      "4","5","6",
      "7","8","9",
      "DEL","0","OK"
    ];

    keys.forEach(key => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = key;
      btn.style.fontSize = "20px";
      btn.style.padding = "10px 0";
      btn.style.borderRadius = "8px";
      btn.style.border = "1px solid #ccc";
      btn.style.background = "#f3f3f3";
      btn.style.minWidth = "70px";
      btn.style.color = "#000";
      
      if (key === "C") {
        btn.style.background = "#ffecec";
      } else if (key === "OK") {
        btn.style.background = "#d1f5d3";
      }

      btn.addEventListener("click", function (e) {
        e.stopPropagation();
        handleKeyPress(key);
      });

      buttonsContainer.appendChild(btn);
    });

    padEl.appendChild(buttonsContainer);
    document.body.appendChild(padEl);

    // Click bên ngoài → ẩn bàn phím
    document.addEventListener("click", function (e) {
      if (!padEl || padEl.style.display === "none") return;
      if (padEl.contains(e.target)) return;
      if (currentInput && e.target === currentInput) return;
      hidePad();
    });
  }

  function showPadForInput(input) {
    if (!input) return;
    createPadIfNeeded();
    currentInput = input;
    padEl.style.display = "block";
  }

  function hidePad() {
    if (!padEl) return;
    padEl.style.display = "none";
    currentInput = null;
  }

  function handleKeyPress(key) {
    if (!currentInput) return;

    let val = currentInput.value || "";

    if (key >= "0" && key <= "9") {
      currentInput.value = val + key;
      // Bắn event input để các logic khác (nếu có) bắt được
      currentInput.dispatchEvent(new Event("input", { bubbles: true }));
      return;
    }

    if (key === "C") {
      currentInput.value = "";
      currentInput.dispatchEvent(new Event("input", { bubbles: true }));
      return;
    }

    if (key === "OK") {
      hidePad();
      currentInput.blur();
      return;
    }
  }

  // Lắng nghe focus vào các input có data-numpad
  document.addEventListener("focusin", function (e) {
    const t = e.target;
    if (
      t &&
      t.tagName === "INPUT" &&
      (t.dataset.numpad === "1" || t.dataset.numpad === "true" || t.hasAttribute("data-numpad"))
    ) {
      showPadForInput(t);
    }
  });

  // Public API (để sau này nếu muốn xài tay trong code JS khác)
  window.KiemKhoNumPad = {
    attachToInput: function (input) {
      if (!input) return;
      input.setAttribute("data-numpad", "1");
    },
    hide: hidePad
  };
})();
