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
    const v = String(val).trim();
    if (!v) return '';
    
    // Link ảnh chuẩn
    if (v.startsWith('http') || v.startsWith('data:')) return v;

    // Kiểm tra base64
    if (this.isProbablyBase64(v)) return 'data:image/jpeg;base64,' + v;

    // KiotViet: nhiều link ảnh phân tách bởi dấu phẩy → lấy ảnh đầu
    if (v.includes(',')) {
      const first = v.split(',')[0].trim();
      if (first.startsWith('http')) return first;
    }

    return v;
  }

  isProbablyBase64(str) {
    return /^[A-Za-z0-9+/=]+$/.test(str) && str.length > 100;
  }

  // ⚡ Hàm tạo chuỗi thời gian cập nhật
  nowString() {
    const d = new Date();
    const pad = (n) => (n < 10 ? '0' + n : n);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
           `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  }

  // Thêm mới / cập nhật theo mã vạch
  upsertItem(itemData) {
    const existingIndex = this.items.findIndex(i => i.barcode === itemData.barcode);
    
    if (existingIndex !== -1) {
      // Update existing
      const merged = { ...this.items[existingIndex], ...itemData };
      merged.updated_at = this.nowString();
      merged.image = this.normalizeImageField(merged.image || '');
      this.items[existingIndex] = merged;
      this.saveToLocalStorage();
      return this.items[existingIndex];
    } else {
      // Add new
      const newItem = {
        ...itemData,
        updated_at: this.nowString()
      };
      newItem.image = this.normalizeImageField(newItem.image || '');
      this.items.push(newItem);
      this.saveToLocalStorage();
      return newItem;
    }
  }

  // Xoá theo mã vạch (đang được vài chỗ dùng)
  // Xoá item: chấp nhận cả index (số) hoặc mã vạch (chuỗi)
  deleteItem(target) {
    let index = -1;

    if (typeof target === 'number') {
      // Được gọi từ deleteItemAtIndex(idx)
      index = target;
    } else {
      // Được gọi khi truyền barcode
      index = this.items.findIndex(i => i.barcode === target);
    }

    if (index < 0 || index >= this.items.length) return false;

    this.items.splice(index, 1);
    this.saveToLocalStorage();
    return true;
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
        return item.barcode && String(item.barcode).includes(keyword);
      }
      
      const nameNorm = this.normalizeStr(item.name || '');
      const tagNorm  = this.normalizeStr(item.tags || '');
      return nameNorm.includes(kwNorm) || tagNorm.includes(kwNorm);
    });
  }
}

// Tạo instance toàn cục
window.dataManager = new DataManager();
