// core/data-manager.js
class DataManager {
  constructor() {
    this.items = [];
    this.STORAGE_KEY = 'inventoryItems_v5';
  }

  loadFromLocalStorage() {
    const raw = localStorage.getItem(this.STORAGE_KEY);
    if (!raw) return;
    
    try {
      this.items = JSON.parse(raw);
      this.items.forEach(item => {
        item.image = this.normalizeImageField(item.image || '');
      });
    } catch (e) {
      console.error('LS parse error', e);
    }
  }

  saveToLocalStorage() {
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.items));
  }

  normalizeImageField(val) {
    if (!val) return '';
    let s = String(val).trim();
    if (!s) return '';
    s = s.replace(/^"+|"+$/g, '');
    if (s.startsWith('http') && s.includes(',')) {
      s = s.split(',')[0].trim();
    }
    return s;
  }

  nowString() {
    const d = new Date();
    const pad = (n) => (n < 10 ? '0' + n : n);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
           `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  }

  upsertItem(itemData) {
    const existingIndex = this.items.findIndex(i => i.barcode === itemData.barcode);
    
    if (existingIndex !== -1) {
      // Update existing
      this.items[existingIndex] = { ...this.items[existingIndex], ...itemData };
    } else {
      // Add new
      this.items.push(itemData);
    }
    
    this.saveToLocalStorage();
    return this.items[existingIndex !== -1 ? existingIndex : this.items.length - 1];
  }

  deleteItem(barcode) {
    const index = this.items.findIndex(i => i.barcode === barcode);
    if (index !== -1) {
      this.items.splice(index, 1);
      this.saveToLocalStorage();
      return true;
    }
    return false;
  }

  searchItems(keyword, type = 'name') {
    const kwNorm = this.normalizeStr(keyword);
    return this.items.filter(item => {
      if (type === 'barcode') {
        return item.barcode && item.barcode.includes(keyword);
      }
      
      const nameNorm = this.normalizeStr(item.name || '');
      const tagNorm = this.normalizeStr(item.tags || '');
      return nameNorm.includes(kwNorm) || tagNorm.includes(kwNorm);
    });
  }

  normalizeStr(str) {
    return (str || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .replace(/[^0-9a-z\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
}

// Tạo instance toàn cục
window.dataManager = new DataManager();
