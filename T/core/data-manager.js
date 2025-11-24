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

  // ⭐ THÊM HÀM XÓA
  deleteItem(index) {
    if (index < 0 || index >= this.items.length) return false;
    this.items.splice(index, 1);
    this.saveToLocalStorage();
    return true;
  }

  normalizeImageField(val) {
    if (!val) return '';
    const v = val.trim();
    if (!v) return '';
    if (v.startsWith('http') || v.startsWith('data:')) return v;
    if (this.isProbablyBase64(v)) return 'data:image/jpeg;base64,' + v;
    return '';
  }

  isProbablyBase64(str) {
    return /^[A-Za-z0-9+/=]+$/.test(str) && str.length > 100;
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
}

// Tạo instance toàn cục
window.dataManager = new DataManager();
