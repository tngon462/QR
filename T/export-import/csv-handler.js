// export-import/csv-handler.js

// ===== Helpers an toàn cho dataManager & normalizeImageField =====
function getDataManagerSafe() {
  return (typeof window !== 'undefined' && window.dataManager) ? window.dataManager : null;
}

function normalizeImageFieldSafe(raw) {
  const val = raw || '';
  const dm = getDataManagerSafe();

  // Ưu tiên dùng hàm normalize trong dataManager nếu có
  if (dm && typeof dm.normalizeImageField === 'function') {
    return dm.normalizeImageField(val);
  }

  // Nếu có hàm global normalizeImageField thì dùng
  if (typeof window !== 'undefined' && typeof window.normalizeImageField === 'function') {
    return window.normalizeImageField(val);
  }

  // Fallback: chỉ trim
  return val.trim();
}

class CSVHandler {
  constructor() {
    this.initializeElements();
    this.bindEvents();
  }

  initializeElements() {
    this.csvFileInput = document.getElementById('csvFileInput');
  }

  bindEvents() {
    if (this.csvFileInput) {
      this.csvFileInput.addEventListener('change', (e) => this.handleFileImport(e));
    }
  }

  handleFileImport(e) {
    const file = e.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (event) => {
      this.parseCSV(event.target.result);
    };
    reader.readAsText(file, 'utf-8');
  }

  parseCSV(text) {
    if (!text) {
      alert('File CSV trống hoặc không đọc được.');
      return;
    }

    const lines = text.split(/\r?\n/);
    if (lines.length <= 1) {
      alert('File CSV chỉ có header hoặc không có dữ liệu.');
      return;
    }

    const newItems = [];
    const header = lines[0].split(',');

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (!line || !line.trim()) continue;

      const cols = this.splitCSVLine(line);
      const item = this.parseCSVRow(cols, header);
      if (item.barcode) {
        newItems.push(item);
      }
    }

    if (newItems.length > 0) {
      // Ghi dữ liệu vào dataManager nếu có, nếu không thì dùng window.items
      const dm = getDataManagerSafe();
      if (dm) {
        dm.items = newItems;
        if (typeof dm.saveToLocalStorage === 'function') {
          dm.saveToLocalStorage();
        }
      } else {
        // fallback: dùng global items + hàm saveToLocalStorage() cũ nếu có
        window.items = newItems;
        if (typeof window.saveToLocalStorage === 'function') {
          window.saveToLocalStorage();
        }
      }
      
      // Render bảng nếu có tableRenderer
      if (window.tableRenderer && typeof window.tableRenderer.render === 'function') {
        window.tableRenderer.render();
      }
      
      // Rebuild danh mục/tags nếu có categoryManager
      if (window.categoryManager && typeof window.categoryManager.rebuildLists === 'function') {
        window.categoryManager.rebuildLists();
      }
      
      alert('Đã tải CSV: ' + newItems.length + ' sản phẩm');
    }
  }

  splitCSVLine(line) {
    const cols = [];
    let cur = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const ch = line[i];

      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === ',' && !inQuotes) {
        cols.push(cur);
        cur = '';
      } else {
        cur += ch;
      }
    }
    cols.push(cur);
    return cols;
  }

  parseCSVRow(cols, header) {
    const getCol = (idx) => (idx >= 0 && idx < cols.length ? cols[idx] : '');
    const cleanValue = (val) => (val || '').replace(/^"+|"+$/g, '').trim();

    const barcode = cleanValue(getCol(0));
    if (!barcode) return {};

    const hasTags = header.includes('Tags');

    return {
      barcode,
      name: cleanValue(getCol(1)),
      // ⬇ dùng helper an toàn thay vì dataManager.normalizeImageField
      image: normalizeImageFieldSafe(getCol(2)),
      category: cleanValue(getCol(3)),
      tags: hasTags ? cleanValue(getCol(4)) : '',
      price: this.parseNumber(cleanValue(getCol(hasTags ? 5 : 4))),
      qty: this.parseNumber(cleanValue(getCol(hasTags ? 6 : 5)), 0),
      stock: this.parseNumber(cleanValue(getCol(hasTags ? 7 : 6)), ''),
      note: cleanValue(getCol(hasTags ? 8 : 7)),
      updated_at: cleanValue(getCol(hasTags ? 9 : 8))
    };
  }

  parseNumber(value, defaultValue = '') {
    if (!value) return defaultValue;
    const num = parseFloat(value);
    return isNaN(num) ? defaultValue : num;
  }

  exportCSV() {
    const dm = getDataManagerSafe();
    const items = dm ? (dm.items || []) : (window.items || []);

    if (!items.length) {
      alert('Chưa có dữ liệu để export');
      return;
    }

    const csvText = this.buildCSV();
    this.downloadFile(csvText, 'hang-kiem-kho.csv', 'text/csv');
  }

  buildCSV() {
    const dm = getDataManagerSafe();
    const items = dm ? (dm.items || []) : (window.items || []);

    const header = 'Mã vạch,Tên sản phẩm,Ảnh,Danh mục,Tags,Giá bán,Số lượng,Tồn kho,Ghi chú,Cập nhật lúc';
    const lines = [header];

    items.forEach((item) => {
      const row = [
        item.barcode || '',
        (item.name || '').replace(/,/g, ' '),
        item.image || '',
        (item.category || '').replace(/,/g, ' '),
        (item.tags || '').replace(/,/g, ' '),
        item.price !== '' && item.price != null ? item.price : '',
        item.qty !== undefined && item.qty !== null ? item.qty : 0,
        item.stock !== undefined && item.stock !== null && item.stock !== '' ? item.stock : '',
        (item.note || '').replace(/,/g, ' '),
        item.updated_at || '',
      ];
      lines.push(row.join(','));
    });

    return lines.join('\n');
  }

  downloadFile(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}

// Khởi tạo khi DOM ready
document.addEventListener('DOMContentLoaded', () => {
  window.csvHandler = new CSVHandler();
});
