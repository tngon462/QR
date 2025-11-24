// core/form-handler.js
class FormHandler {
  constructor() {
    this.formDirty = false;
    this.lastSaveDecision = null;
    this.countMode = false;
    this.initializeElements();
    this.bindEvents();
  }

  initializeElements() {
    this.elements = {
      barcodeInput: document.getElementById('barcodeInput'),
      nameInput: document.getElementById('nameInput'),
      imageInput: document.getElementById('imageInput'),
      categoryInput: document.getElementById('categoryInput'),
      qtyInput: document.getElementById('qtyInput'),
      stockInput: document.getElementById('stockInput'),
      priceInput: document.getElementById('priceInput'),
      noteInput: document.getElementById('noteInput'),
      saveBtn: document.getElementById('saveBtn'),
      resetBtn: document.getElementById('resetBtn'),
      imageThumb: document.getElementById('imageThumb')
    };
  }

  bindEvents() {
    this.elements.saveBtn.addEventListener('click', () => this.saveForm());
    this.elements.resetBtn.addEventListener('click', () => this.resetForm());
    
    // Track form changes
    ['nameInput', 'imageInput', 'qtyInput', 'stockInput', 'priceInput', 'noteInput'].forEach(elName => {
      this.elements[elName].addEventListener('input', () => {
        this.formDirty = true;
      });
    });

    this.elements.imageInput.addEventListener('input', () => this.updateImageThumb());
  }

  getFormData() {
    return {
      barcode: (this.elements.barcodeInput.value || '').trim(),
      name: (this.elements.nameInput.value || '').trim(),
      image: dataManager.normalizeImageField((this.elements.imageInput.value || '').trim()),
      category: (this.elements.categoryInput.value || '').trim(),
      price: this.parsePrice(this.elements.priceInput.value),
      qty: this.parseInt(this.elements.qtyInput.value, 0),
      stock: this.parseInt(this.elements.stockInput.value, ''),
      note: (this.elements.noteInput.value || '').trim(),
      tags: window.tagsManager ? window.tagsManager.getTagsString() : '',
      updated_at: dataManager.nowString()
    };
  }

  parsePrice(value) {
    const priceStr = (value || '').trim();
    if (priceStr === '') return '';
    const p = parseFloat(priceStr);
    return isNaN(p) ? '' : p;
  }

  parseInt(value, defaultValue) {
    const str = (value || '').trim();
    if (str === '') return defaultValue;
    const num = parseInt(str, 10);
    return isNaN(num) ? defaultValue : num;
  }

  validateFormData(formData) {
    const missing = [];
    if (!formData.barcode) missing.push('mã vạch');
    if (!formData.name) missing.push('tên sản phẩm');
    if (!formData.category) missing.push('danh mục');
    if (!formData.price && formData.price !== 0) missing.push('giá bán');
    
    return missing;
  }

  async saveForm() {
    const formData = this.getFormData();
    const missing = this.validateFormData(formData);
    
    if (missing.length > 0) {
      const shouldContinue = await this.showMissingFieldsWarning(missing);
      if (!shouldContinue) return false;
    }

    dataManager.upsertItem(formData);
    this.formDirty = false;
    
    if (window.tableRenderer) {
      window.tableRenderer.render();
    }
    
    return true;
  }

  async showMissingFieldsWarning(missingFields) {
    const msg = `Thiếu: ${missingFields.join(', ')}\n\nChọn OK = "Tiếp tục" (KHÔNG lưu).\nChọn Cancel = "Sửa" (quay lại nhập nốt).`;
    return !window.confirm(msg);
  }

  resetForm() {
    Object.values(this.elements).forEach(element => {
      if (element.tagName === 'INPUT') {
        if (element === this.elements.qtyInput) {
          element.value = '1';
        } else {
          element.value = '';
        }
      }
    });
    
    if (window.tagsManager) {
      window.tagsManager.resetTags();
    }
    
    this.formDirty = false;
    this.elements.barcodeInput.focus();
    this.updateImageThumb();
  }

  loadItemToForm(item) {
    this.elements.barcodeInput.value = item.barcode || '';
    this.elements.nameInput.value = item.name || '';
    this.elements.imageInput.value = item.image || '';
    this.elements.categoryInput.value = item.category || '';
    this.elements.qtyInput.value = item.qty !== undefined ? item.qty : 0;
    this.elements.stockInput.value = item.stock !== undefined ? item.stock : '';
    this.elements.priceInput.value = item.price !== undefined ? item.price : '';
    this.elements.noteInput.value = item.note || '';
    
    if (window.tagsManager) {
      window.tagsManager.loadTagsFromItem(item);
    }
    
    this.updateImageThumb();
    this.formDirty = false;
  }

  updateImageThumb() {
    const src = this.makeImageSrc(this.elements.imageInput.value || '');
    if (src) {
      this.elements.imageThumb.src = src;
      this.elements.imageThumb.style.display = 'block';
    } else {
      this.elements.imageThumb.src = '';
      this.elements.imageThumb.style.display = 'none';
    }
  }

  makeImageSrc(imageValue) {
    if (!imageValue) return null;
    const v = imageValue.trim();
    if (!v) return null;
    if (v.startsWith('http') || v.startsWith('data:')) return v;
    if (this.isProbablyBase64(v)) return 'data:image/jpeg;base64,' + v;
    return null;
  }

  isProbablyBase64(str) {
    return /^[A-Za-z0-9+/=]+$/.test(str) && str.length > 100;
  }
}

// Khởi tạo khi DOM ready
document.addEventListener('DOMContentLoaded', () => {
  window.formHandler = new FormHandler();
});