// export-import/csv-handler.js
class CSVHandler {
  constructor() {
    this.initializeElements();
    this.bindEvents();
  }

  initializeElements() {
    this.csvFileInput = document.getElementById('csvFileInput');
  }

  bindEvents() {
    this.csvFileInput.addEventListener('change', (e) => this.handleFileImport(e));
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
      dataManager.items = newItems;
      dataManager.saveToLocalStorage();
      
      if (window.tableRenderer) {
        window.tableRenderer.render();
      }
      
      if (window.categoryManager) {
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

    return {
      barcode,
      name: cleanValue(getCol(1)),
      image: dataManager.normalizeImageField(getCol(2)),
      category: cleanValue(getCol(3)),
      tags: header.includes('Tags') ? cleanValue(getCol(4)) : '',
      price: this.parseNumber(cleanValue(getCol(header.includes('Tags') ? 5 : 4))),
      qty: this.parseNumber(cleanValue(getCol(header.includes('Tags') ? 6 : 5)), 0),
      stock: this.parseNumber(cleanValue(getCol(header.includes('Tags') ? 7 : 6)), ''),
      note: cleanValue(getCol(header.includes('Tags') ? 8 : 7)),
      updated_at: cleanValue(getCol(header.includes('Tags') ? 9 : 8))
    };
  }

  parseNumber(value, defaultValue = '') {
    if (!value) return defaultValue;
    const num = parseFloat(value);
    return isNaN(num) ? defaultValue : num;
  }

  exportCSV() {
    if (!dataManager.items.length) {
      alert('Chưa có dữ liệu để export');
      return;
    }

    const csvText = this.buildCSV();
    this.downloadFile(csvText, 'hang-kiem-kho.csv', 'text/csv');
  }

  buildCSV() {
    const header = 'Mã vạch,Tên sản phẩm,Ảnh,Danh mục,Tags,Giá bán,Số lượng,Tồn kho,Ghi chú,Cập nhật lúc';
    const lines = [header];

    dataManager.items.forEach((item) => {
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