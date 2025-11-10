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

  // Popup tham chiếu
  let categoryPopup = null;
  let categoryPopupAnchor = null;
  let tagsPopup = null;
  let tagsPopupAnchor = null;

  // Thêm CSS cho chế độ inline + popup
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
      .inline-popup {
        position: absolute;
        z-index: 9999;
        background: #fff;
        border: 1px solid #ccc;
        border-radius: 4px;
        box-shadow: 0 2px 8px rgba(0,0,0,.15);
        padding: 4px;
        max-height: 260px;
        overflow-y: auto;
        font-size: 12px;
      }
      .inline-popup-title {
        font-weight: 600;
        margin: 2px 4px 4px;
      }
      .inline-popup .popup-row {
        padding: 2px 4px;
        cursor: pointer;
      }
      .inline-popup .popup-row:hover {
        background: #f0f0f0;
      }
      .inline-popup .popup-row.current {
        font-weight: 600;
        background: #e6f4ff;
      }
      .inline-popup input[type="text"] {
        width: 100%;
        box-sizing: border-box;
        margin: 2px 0 4px;
        font-size: 12px;
        padding: 2px 4px;
      }
      .inline-popup .popup-footer {
        margin-top: 4px;
        padding-top: 4px;
        border-top: 1px solid #eee;
        display: flex;
        gap: 4px;
        justify-content: flex-end;
      }
      .inline-popup .popup-footer button {
        font-size: 11px;
        padding: 2px 6px;
      }
      .inline-popup .tag-checkbox-row {
        display: flex;
        align-items: center;
        gap: 4px;
        padding: 2px 4px;
      }
      .inline-popup .tag-checkbox-row input[type="checkbox"] {
        margin: 0;
      }
    `;
    document.head.appendChild(style);
  })();

  function closeCategoryPopup() {
    if (categoryPopup && categoryPopup.parentNode) {
      categoryPopup.parentNode.removeChild(categoryPopup);
    }
    categoryPopup = null;
    categoryPopupAnchor = null;
  }

  function closeTagsPopup() {
    if (tagsPopup && tagsPopup.parentNode) {
      tagsPopup.parentNode.removeChild(tagsPopup);
    }
    tagsPopup = null;
    tagsPopupAnchor = null;
  }

  function closeAllPopups() {
    closeCategoryPopup();
    closeTagsPopup();
  }

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

    // Gọi lại loadFromLocalStorage để sync vào biến items trong app chính
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

  // Mở popup chọn danh mục cho 1 dòng
  function editCategoryForRow(idx, anchor) {
    const items = getItemsFromLS();
    if (!items || idx < 0 || idx >= items.length) return;
    const item = items[idx];

    closeCategoryPopup();

    const popup = document.createElement('div');
    popup.className = 'inline-popup inline-popup-category';

    const rect = anchor.getBoundingClientRect();
    popup.style.left = (rect.left + window.scrollX) + 'px';
    popup.style.top = (rect.bottom + window.scrollY) + 'px';

    const title = document.createElement('div');
    title.className = 'inline-popup-title';
    title.textContent = 'Chọn danh mục';
    popup.appendChild(title);

    const searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.placeholder = 'Lọc danh mục...';
    popup.appendChild(searchInput);

    const listWrap = document.createElement('div');
    popup.appendChild(listWrap);

    function getCategoryList() {
      try {
        if (typeof categoryOptions !== 'undefined' && Array.isArray(categoryOptions)) {
          return categoryOptions;
        }
      } catch (e) {
        // ignore
      }
      return [];
    }

    function renderList(filterText) {
      const cats = getCategoryList();
      const ft = (filterText || '').trim().toLowerCase();
      listWrap.innerHTML = '';

      let arr = cats;
      if (ft) {
        arr = cats.filter(c => c.toLowerCase().includes(ft));
      }

      if (!arr.length) {
        const empty = document.createElement('div');
        empty.className = 'popup-row';
        empty.textContent = '(Chưa có danh mục)';
        listWrap.appendChild(empty);
      } else {
        arr.forEach(cat => {
          const row = document.createElement('div');
          row.className = 'popup-row';
          if ((item.category || '') === cat) {
            row.classList.add('current');
          }
          row.textContent = cat;
          row.addEventListener('click', function (e) {
            e.stopPropagation();
            item.category = cat;
            if (typeof window.nowString === 'function') {
              item.updated_at = window.nowString();
            }
            saveItemsToLS(items);
            closeCategoryPopup();
          });
          listWrap.appendChild(row);
        });
      }
    }

    renderList('');

    searchInput.addEventListener('input', function () {
      renderList(searchInput.value);
    });

    const footer = document.createElement('div');
    footer.className = 'popup-footer';

    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.textContent = '＋ Thêm mới';
    addBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      const name = prompt('Nhập tên danh mục mới:');
      if (!name) return;
      const trimmed = name.trim();
      if (!trimmed) return;

      item.category = trimmed;
      try {
        if (typeof categoryOptions !== 'undefined' && Array.isArray(categoryOptions)) {
          if (!categoryOptions.includes(trimmed)) {
            categoryOptions.push(trimmed);
            categoryOptions.sort((a, b) => a.localeCompare(b, 'vi'));
          }
        }
      } catch (err) {
        console.warn('Inline edit: không thể cập nhật categoryOptions', err);
      }

      if (typeof window.nowString === 'function') {
        item.updated_at = window.nowString();
      }
      saveItemsToLS(items);
      closeCategoryPopup();
    });

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.textContent = 'Đóng';
    closeBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      closeCategoryPopup();
    });

    footer.appendChild(addBtn);
    footer.appendChild(closeBtn);
    popup.appendChild(footer);

    document.body.appendChild(popup);
    categoryPopup = popup;
    categoryPopupAnchor = anchor;
  }

  // Mở popup chọn tags cho 1 dòng
  function editTagsForRow(idx, anchor) {
    const items = getItemsFromLS();
    if (!items || idx < 0 || idx >= items.length) return;
    const item = items[idx];

    closeTagsPopup();

    const popup = document.createElement('div');
    popup.className = 'inline-popup inline-popup-tags';

    const rect = anchor.getBoundingClientRect();
    popup.style.left = (rect.left + window.scrollX) + 'px';
    popup.style.top = (rect.bottom + window.scrollY) + 'px';

    const title = document.createElement('div');
    title.className = 'inline-popup-title';
    title.textContent = 'Chọn tags';
    popup.appendChild(title);

    const listWrap = document.createElement('div');
    popup.appendChild(listWrap);

    const currentSet = new Set(
      (item.tags || '')
        .split(/[;,]/)
        .map(t => t.trim())
        .filter(Boolean)
    );

    function getAllTagsList() {
      try {
        if (typeof allTags !== 'undefined' && Array.isArray(allTags)) {
          return allTags;
        }
      } catch (e) {
        // ignore
      }
      return [];
    }

    function applyTagsFromSet() {
      const arr = Array.from(currentSet);
      item.tags = arr.join('; ');
      if (typeof window.nowString === 'function') {
        item.updated_at = window.nowString();
      }
      saveItemsToLS(items);
    }

    function renderTagList() {
      const tags = getAllTagsList();
      listWrap.innerHTML = '';

      if (!tags.length) {
        const empty = document.createElement('div');
        empty.className = 'popup-row';
        empty.textContent = '(Chưa có tag, hãy thêm mới bên dưới)';
        listWrap.appendChild(empty);
      } else {
        tags.forEach(tag => {
          const row = document.createElement('label');
          row.className = 'tag-checkbox-row';

          const cb = document.createElement('input');
          cb.type = 'checkbox';
          cb.checked = currentSet.has(tag);
          cb.addEventListener('change', function (e) {
            e.stopPropagation();
            if (cb.checked) {
              currentSet.add(tag);
            } else {
              currentSet.delete(tag);
            }
            applyTagsFromSet();
          });

          const span = document.createElement('span');
          span.textContent = tag;

          row.appendChild(cb);
          row.appendChild(span);
          listWrap.appendChild(row);
        });
      }
    }

    renderTagList();

    const newTagInput = document.createElement('input');
    newTagInput.type = 'text';
    newTagInput.placeholder = 'Nhập tag mới rồi Enter';
    popup.appendChild(newTagInput);

    newTagInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        const name = newTagInput.value.trim();
        if (!name) return;

        try {
          if (typeof allTags !== 'undefined' && Array.isArray(allTags)) {
            if (!allTags.includes(name)) {
              allTags.push(name);
              allTags.sort((a, b) => a.localeCompare(b, 'vi'));
            }
          }
        } catch (err) {
          console.warn('Inline edit: không thể cập nhật allTags', err);
        }

        currentSet.add(name);
        newTagInput.value = '';
        applyTagsFromSet();
        renderTagList();
      }
    });

    const footer = document.createElement('div');
    footer.className = 'popup-footer';

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.textContent = 'Đóng';
    closeBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      closeTagsPopup();
    });

    footer.appendChild(closeBtn);
    popup.appendChild(footer);

    document.body.appendChild(popup);
    tagsPopup = popup;
    tagsPopupAnchor = anchor;
  }

  // Đóng popup khi click ra ngoài
  document.addEventListener('click', function (e) {
    if (categoryPopup && !categoryPopup.contains(e.target) &&
        (!categoryPopupAnchor || !categoryPopupAnchor.contains(e.target))) {
      closeCategoryPopup();
    }
    if (tagsPopup && !tagsPopup.contains(e.target) &&
        (!tagsPopupAnchor || !tagsPopupAnchor.contains(e.target))) {
      closeTagsPopup();
    }
  });

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
      tdCat.title = 'Click để chọn danh mục';
      tdCat.textContent = item.category || '';
      tdCat.addEventListener('click', function (e) {
        e.stopPropagation();
        editCategoryForRow(idx, tdCat);
      });
      tr.appendChild(tdCat);

      // Tags (click để sửa)
      const tdTags = document.createElement('td');
      tdTags.className = 'inline-edit-tags';
      tdTags.title = 'Click để chọn tags';
      tdTags.textContent = item.tags || '';
      tdTags.addEventListener('click', function (e) {
        e.stopPropagation();
        editTagsForRow(idx, tdTags);
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
      closeAllPopups();
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
      closeAllPopups();
      baseRenderTable();
    }
  });

  console.log('Inline edit: đã khởi động (v2 với popup danh mục/tags).');
})();
