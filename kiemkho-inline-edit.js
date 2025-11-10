// kiemkho-inline-edit.js
// Bật/tắt chế độ sửa trực tiếp bảng (inline edit) dùng localStorage làm nguồn dữ liệu

(function () {
  const toggleBtn = document.getElementById('inlineEditToggleBtn');
  const tableBody = document.getElementById('itemsBody');
  const table = tableBody ? tableBody.parentElement : null;

  const LS_KEY = 'inventoryItems_v5';

  if (!toggleBtn || !tableBody || !table) {
    console.warn('Inline edit: không tìm thấy nút hoặc bảng (#inlineEditToggleBtn, #itemsBody).');
    return;
  }

  // Lưu renderTable gốc
  const baseRenderTable = window.renderTable;
  if (typeof baseRenderTable !== 'function') {
    console.warn('Inline edit: không tìm thấy hàm renderTable gốc.');
    return;
  }

  // Cờ trạng thái
  window.inlineEditMode = false;

  // Thêm CSS cho chế độ inline
  (function injectInlineCss() {
    const style = document.createElement('style');
    style.textContent = `
      table.inline-edit-on th,
      table.inline-edit-on td {
        padding: 2px 3px;
      }
      table.inline-edit-on input.cell-input {
        width: 100%;
        box-sizing: border-box;
        font-size: 12px;
        padding: 2px 3px;
        border: 1px solid #ccc;
        border-radius: 2px;
      }
      td.inline-edit-category,
      td.inline-edit-tags {
        cursor: pointer;
      }
      td.inline-edit-category:hover,
      td.inline-edit-tags:hover {
        background: #fff8e1;
      }
      td.inline-edit-note input.cell-input {
        min-width: 120px;
      }
    `;
    document.head.appendChild(style);
  })();

  // Đọc items từ localStorage
  function getItemsFromLS() {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return [];
    try {
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    } catch (e) {
      console.error('Inline edit: lỗi parse localStorage', e);
      return [];
    }
  }

  // Lưu items vào localStorage + sync lại app gốc
  function saveItemsToLS(items) {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(items));
    } catch (e) {
      console.error('Inline edit: lỗi ghi localStorage', e);
    }

    // Gọi lại hàm loadFromLocalStorage của app gốc (nếu có) để sync vào biến items bên trong
    if (typeof window.loadFromLocalStorage === 'function') {
      window.loadFromLocalStorage();
    } else if (typeof baseRenderTable === 'function') {
      baseRenderTable();
    }
  }

  // Tạo input trong 1 ô
  function makeInputCell(tr, idx, field, value, type) {
    const td = document.createElement('td');
    const input = document.createElement('input');
    input.className = 'cell-input';
    input.type = type || 'text';
    input.value =
      value === undefined || value === null ? '' : String(value);

    input.addEventListener('change', function () {
      saveInlineCell(idx, field, input.value);
    });

    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        saveInlineCell(idx, field, input.value);
      }
    });

    td.appendChild(input);
    tr.appendChild(td);
    return td;
  }

  // Lưu thay đổi 1 ô (barcode, name, price, qty, stock, note)
  function saveInlineCell(idx, field, value) {
    const items = getItemsFromLS();
    if (!items || idx < 0 || idx >= items.length) return;
    const item = items[idx];
    if (!item || typeof item !== 'object') return;

    let v = value;

    if (field === 'barcode' || field === 'name' || field === 'note') {
      v = (value || '').trim();
      item[field] = v;
    } else if (field === 'price') {
      v = (value || '').trim();
      if (v === '') {
        item.price = '';
      } else {
        const p = parseFloat(v);
        item.price = isNaN(p) ? '' : p;
      }
    } else if (field === 'qty') {
      const n = parseInt(value, 10);
      item.qty = isNaN(n) ? 0 : n;
    } else if (field === 'stock') {
      const n = parseInt(value, 10);
      item.stock = isNaN(n) ? '' : n;
    }

    if (typeof window.nowString === 'function') {
      item.updated_at = window.nowString();
    }

    saveItemsToLS(items);
  }

  // Sửa danh mục 1 dòng
  function editCategoryForRow(idx) {
    const items = getItemsFromLS();
    if (!items || idx < 0 || idx >= items.length) return;
    const item = items[idx];

    const current = item.category || '';

    let suggestions = '';
    if (Array.isArray(window.categoryOptions) && window.categoryOptions.length) {
      suggestions =
        '\n\nDanh mục hiện có:\n- ' + window.categoryOptions.join('\n- ');
    }

    const input = window.prompt(
      'Nhập / sửa danh mục cho sản phẩm này:' + suggestions,
      current
    );
    if (input === null) return; // cancel

    const val = input.trim();
    item.category = val;

    if (typeof window.nowString === 'function') {
      item.updated_at = window.nowString();
    }

    saveItemsToLS(items);

    if (typeof window.rebuildCategoryList === 'function') {
      window.rebuildCategoryList();
    }

    renderTableEditable();
  }

  // Sửa tags 1 dòng
  function editTagsForRow(idx) {
    const items = getItemsFromLS();
    if (!items || idx < 0 || idx >= items.length) return;
    const item = items[idx];

    const current = (item.tags || '').trim();

    let suggestions = '';
    if (Array.isArray(window.allTags) && window.allTags.length) {
      suggestions =
        '\n\nCác tag hiện có (gợi ý):\n- ' + window.allTags.join('\n- ');
    }

    const input = window.prompt(
      'Nhập tags cho sản phẩm này (ngăn cách bằng dấu chấm phẩy ";")' +
        suggestions,
      current
    );
    if (input === null) return;

    const raw = input.trim();
    item.tags = raw;

    if (typeof window.nowString === 'function') {
      item.updated_at = window.nowString();
    }

    saveItemsToLS(items);

    if (typeof window.rebuildTagListFromItems === 'function') {
      window.rebuildTagListFromItems();
    }

    renderTableEditable();
  }

  // Render bảng ở chế độ sửa trực tiếp
  function renderTableEditable() {
    const items = getItemsFromLS();
    tableBody.innerHTML = '';
    table.classList.add('inline-edit-on');

    items.forEach((item, idx) => {
      const tr = document.createElement('tr');
      tr.dataset.index = idx;

      const imgSrc = (function () {
        if (typeof window.makeImageSrc === 'function') {
          return window.makeImageSrc(item.image || '');
        }
        const v = (item.image || '').trim();
        if (!v) return null;
        if (v.startsWith('http') || v.startsWith('data:')) return v;
        return null;
      })();

      // #
      const tdIndex = document.createElement('td');
      tdIndex.textContent = idx + 1;
      tr.appendChild(tdIndex);

      // Mã vạch
      makeInputCell(tr, idx, 'barcode', item.barcode || '', 'text');

      // Tên sản phẩm
      makeInputCell(tr, idx, 'name', item.name || '', 'text');

      // Ảnh (hiển thị)
      const tdImg = document.createElement('td');
      if (imgSrc) {
        const img = document.createElement('img');
        img.src = imgSrc;
        img.className = 'img-table-thumb';
        img.alt = 'Ảnh';
        tdImg.appendChild(img);
      } else if (item.image) {
        tdImg.textContent = item.image;
      } else {
        tdImg.textContent = '';
      }
      tr.appendChild(tdImg);

      // Danh mục (click để sửa)
      const tdCat = document.createElement('td');
      tdCat.className = 'inline-edit-category';
      tdCat.title = 'Click để sửa danh mục';
      tdCat.textContent = item.category || '';
      tdCat.addEventListener('click', function () {
        editCategoryForRow(idx);
      });
      tr.appendChild(tdCat);

      // Tags (click để sửa)
      const tdTags = document.createElement('td');
      tdTags.className = 'inline-edit-tags';
      tdTags.title = 'Click để sửa tags';
      tdTags.textContent = item.tags || '';
      tdTags.addEventListener('click', function () {
        editTagsForRow(idx);
      });
      tr.appendChild(tdTags);

      // Giá bán
      makeInputCell(tr, idx, 'price', item.price, 'number');

      // Số lượng
      makeInputCell(tr, idx, 'qty', item.qty, 'number');

      // Tồn kho
      makeInputCell(tr, idx, 'stock', item.stock, 'number');

      // Ghi chú
      const tdNote = makeInputCell(
        tr,
        idx,
        'note',
        item.note || '',
        'text'
      );
      tdNote.classList.add('inline-edit-note');

      // Cập nhật lúc (readonly)
      const tdUpdated = document.createElement('td');
      tdUpdated.textContent = item.updated_at || '';
      tr.appendChild(tdUpdated);

      tableBody.appendChild(tr);
    });
  }

  // Ghi đè renderTable để hỗ trợ 2 mode
  window.renderTable = function () {
    if (window.inlineEditMode) {
      renderTableEditable();
    } else {
      table.classList.remove('inline-edit-on');
      baseRenderTable();
    }
  };

  // Nút bật/tắt
  toggleBtn.addEventListener('click', function () {
    window.inlineEditMode = !window.inlineEditMode;

    if (window.inlineEditMode) {
      toggleBtn.textContent = '✅ Sửa trực tiếp (ĐANG BẬT)';
      toggleBtn.style.background = '#ffe8cc';
      renderTableEditable();
    } else {
      toggleBtn.textContent = '✏️ Sửa trực tiếp bảng';
      toggleBtn.style.background = '';
      table.classList.remove('inline-edit-on');
      baseRenderTable();
    }
  });

  console.log('Inline edit: đã khởi động.');
})();
