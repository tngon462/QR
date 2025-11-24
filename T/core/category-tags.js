// core/category-tags.js
class CategoryTagsManager {
    constructor() {
        this.categoryInput = document.getElementById('categoryInput');
        this.categoryDropdown = document.getElementById('categoryDropdown');
        this.tagsDisplay = document.getElementById('tagsDisplay');
        this.tagsDropdown = document.getElementById('tagsDropdown');
        
        this.categoryOptions = [];
        this.allTags = [];
        this.formTags = [];
        this.autoCategoryTag = null;
        this.tagsTouchedManually = false;
        
        this.CATEGORY_DEFAULT_TAG = {
            'Chế biến sẵn': 'chebiensan',
            'Rau củ quả': 'raucuqua',
            'bún mì phở': 'mi',
            'gia vị': 'giavi',
            'trà cafe': 'cafe',
            'nước ngọt': 'nuocngot',
            'bia rượu': 'biaruoi',
            'GV indo': 'indo',
            'Gv mianma': 'mianma',
            'Thịt các loại': 'thit',
            'Hải sản': 'haisan',
            'Bánh kẹo': 'banhkeo'
        };
        
        this.bindEvents();
        this.rebuildLists();
    }

    bindEvents() {
        // Category events
        if (this.categoryInput) {
            this.categoryInput.addEventListener('focus', () => this.showCategoryDropdown(true));
            this.categoryInput.addEventListener('click', () => this.showCategoryDropdown(true));
            this.categoryInput.addEventListener('input', () => this.handleCategoryInput());
        }
        
        // Tags events
        if (this.tagsDisplay) {
            this.tagsDisplay.addEventListener('click', (e) => this.toggleTagsDropdown(e));
        }
        
        // Close dropdowns when clicking outside
        document.addEventListener('click', (e) => this.handleOutsideClick(e));
    }

    // ======================
    // Category methods
    // ======================
    showCategoryDropdown(showAll = false) {
        if (!this.categoryInput || !this.categoryDropdown) return;

        const filter = showAll ? '' : this.categoryInput.value;
        this.buildCategoryDropdown(filter);
        
        if (this.categoryOptions.length || this.categoryDropdown.children.length) {
            this.categoryDropdown.style.display = 'block';
        }
    }

    hideCategoryDropdown() {
        if (!this.categoryDropdown) return;
        this.categoryDropdown.style.display = 'none';
    }

    buildCategoryDropdown(filterText = '') {
        if (!this.categoryDropdown) return;

        this.categoryDropdown.innerHTML = '';

        const ft = (filterText || '').trim().toLowerCase();
        let filtered = this.categoryOptions;
        
        if (ft) {
            filtered = this.categoryOptions.filter(cat =>
                cat.toLowerCase().includes(ft)
            );
        }

        filtered.forEach((cat) => {
            const div = document.createElement('div');
            div.className = 'category-item';
            div.textContent = cat;
            div.title = cat;
            
            div.addEventListener('mousedown', (e) => {
                e.preventDefault();
                if (this.categoryInput) {
                    this.categoryInput.value = cat;
                }
                this.hideCategoryDropdown();
                this.handleCategoryChange(cat);
            });
            
            this.categoryDropdown.appendChild(div);
        });

        // Add new category option
        const addNew = document.createElement('div');
        addNew.className = 'category-item add-new';
        addNew.textContent = '＋ Thêm danh mục mới…';
        
        addNew.addEventListener('mousedown', (e) => {
            e.preventDefault();
            this.addNewCategory();
        });
        
        this.categoryDropdown.appendChild(addNew);
    }

    handleCategoryInput() {
        if (window.formHandler) {
            window.formHandler.formDirty = true;
        }
        this.showCategoryDropdown(false);

        const cat = this.categoryInput ? this.categoryInput.value : '';
        this.updateAutoTag(cat);
    }

    handleCategoryChange(cat) {
        if (window.formHandler) {
            window.formHandler.formDirty = true;
        }
        this.updateAutoTag(cat);
    }

    updateAutoTag(cat) {
        const defTag = this.catToDefaultTag(cat);
        if (!defTag) return;

        if (!this.tagsTouchedManually) {
            if (this.autoCategoryTag && this.autoCategoryTag !== defTag) {
                this.formTags = this.formTags.filter(t => t !== this.autoCategoryTag);
            }
            if (!this.formTags.includes(defTag)) {
                this.formTags.unshift(defTag);
            }
            this.autoCategoryTag = defTag;
            this.renderTagsDisplay();
        }
    }

    addNewCategory() {
        const name = prompt('Nhập tên danh mục mới:');
        if (name) {
            const trimmed = name.trim();
            if (trimmed) {
                if (this.categoryInput) {
                    this.categoryInput.value = trimmed;
                }
                if (!this.categoryOptions.includes(trimmed)) {
                    this.categoryOptions.push(trimmed);
                    this.categoryOptions.sort();
                }
                if (window.formHandler) {
                    window.formHandler.formDirty = true;
                }
            }
        }
        this.hideCategoryDropdown();
    }

    catToDefaultTag(cat) {
        const trimmed = (cat || '').trim();
        if (!trimmed) return null;

        // Exact match
        if (this.CATEGORY_DEFAULT_TAG[trimmed]) {
            return this.CATEGORY_DEFAULT_TAG[trimmed];
        }

        // Case-insensitive match
        const lower = trimmed.toLowerCase();
        for (const key in this.CATEGORY_DEFAULT_TAG) {
            if (key.toLowerCase() === lower) {
                return this.CATEGORY_DEFAULT_TAG[key];
            }
        }

        // Fallback: generate slug from category name
        const base = this.normalizeStr(trimmed);
        if (!base) return null;
        return base.replace(/\s+/g, '');
    }

    // ======================
    // Tags methods
    // ======================
    toggleTagsDropdown(e) {
        e.stopPropagation();
        if (!this.tagsDropdown) return;

        const visible = this.tagsDropdown.style.display === 'block';
        
        if (visible) {
            this.tagsDropdown.style.display = 'none';
        } else {
            this.buildTagsDropdown();
            this.tagsDropdown.style.display = 'block';
        }
    }

    buildTagsDropdown() {
        if (!this.tagsDropdown) return;

        this.tagsDropdown.innerHTML = '';

        this.allTags.forEach(tag => {
            const div = document.createElement('div');
            div.className = 'tags-dropdown-item';
            
            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.checked = this.formTags.includes(tag);
            
            cb.addEventListener('change', (e) => {
                e.stopPropagation();
                if (cb.checked) {
                    if (!this.formTags.includes(tag)) {
                        this.formTags.push(tag);
                    }
                } else {
                    this.formTags = this.formTags.filter(t => t !== tag);
                }
                this.tagsTouchedManually = true;
                this.renderTagsDisplay();
                
                if (window.formHandler) {
                    window.formHandler.formDirty = true;
                }
            });
            
            const span = document.createElement('span');
            span.textContent = tag;
            
            div.appendChild(cb);
            div.appendChild(span);
            this.tagsDropdown.appendChild(div);
        });

        // Add new tag option
        const addNew = document.createElement('div');
        addNew.className = 'tags-dropdown-item add-new';
        addNew.textContent = '＋ Thêm tag mới…';
        
        addNew.addEventListener('mousedown', (e) => {
            e.preventDefault();
            this.addNewTag();
        });
        
        this.tagsDropdown.appendChild(addNew);
    }

    addNewTag() {
        const name = prompt('Nhập tên tag mới:');
        if (!name) return;
        
        const trimmed = name.trim();
        if (!trimmed) return;
        
        if (!this.allTags.includes(trimmed)) {
            this.allTags.push(trimmed);
            this.allTags.sort((a, b) => a.localeCompare(b, 'vi'));
        }
        
        if (!this.formTags.includes(trimmed)) {
            this.formTags.push(trimmed);
        }
        
        this.tagsTouchedManually = true;
        this.renderTagsDisplay();
        this.buildTagsDropdown();
        
        if (window.formHandler) {
            window.formHandler.formDirty = true;
        }
    }

    renderTagsDisplay() {
        if (!this.tagsDisplay) return;

        this.tagsDisplay.innerHTML = '';
        
        if (!this.formTags || !this.formTags.length) {
            this.tagsDisplay.textContent = '+ Chọn / thêm tag';
            this.tagsDisplay.classList.add('tags-placeholder');
            return;
        }
        
        this.tagsDisplay.classList.remove('tags-placeholder');
        
        this.formTags.forEach(tag => {
            const pill = document.createElement('span');
            pill.className = 'tag-pill';
            pill.textContent = tag;
            
            const rm = document.createElement('span');
            rm.className = 'remove';
            rm.textContent = '×';
            
            rm.addEventListener('click', (e) => {
                e.stopPropagation();
                this.formTags = this.formTags.filter(t => t !== tag);
                this.tagsTouchedManually = true;
                this.renderTagsDisplay();
                
                if (window.formHandler) {
                    window.formHandler.formDirty = true;
                }
            });
            
            pill.appendChild(rm);
            this.tagsDisplay.appendChild(pill);
        });
    }

    // ======================
    // Data management
    // ======================
    rebuildLists() {
        this.rebuildCategoryList();
        this.rebuildTagList();
    }

    rebuildCategoryList() {
        const set = new Set();
        if (window.dataManager && Array.isArray(dataManager.items)) {
            dataManager.items.forEach((item) => {
                if (item.category && item.category.trim()) {
                    set.add(item.category.trim());
                }
            });
        }
        this.categoryOptions = Array.from(set).sort();
    }

    rebuildTagList() {
        const set = new Set();
        if (window.dataManager && Array.isArray(dataManager.items)) {
            dataManager.items.forEach(item => {
                if (item.tags && item.tags.trim()) {
                    item.tags.split(';').forEach(t => {
                        const tt = t.trim();
                        if (tt) set.add(tt);
                    });
                }
            });
        }
        this.allTags = Array.from(set).sort((a, b) => a.localeCompare(b, 'vi'));
    }

    // Quét toàn bộ items và tự thêm tag mặc định theo danh mục
    applyDefaultTagsForAllItems() {
        if (!window.dataManager || !Array.isArray(dataManager.items)) return;

        dataManager.items.forEach(item => {
            if (!item || typeof item !== 'object') return;

            const cat = (item.category || '').trim();
            if (!cat) return;

            const defTag = this.catToDefaultTag(cat);
            if (!defTag) return;

            let tagsArr = (item.tags || '')
                .split(';')
                .map(t => t.trim())
                .filter(Boolean);

            if (!tagsArr.includes(defTag)) {
                tagsArr.unshift(defTag);
                item.tags = tagsArr.join('; ');
            }
        });

        // Lưu lại + cập nhật lại list tags
        if (window.dataManager && typeof dataManager.saveToLocalStorage === 'function') {
            dataManager.saveToLocalStorage();
        }
        this.rebuildTagList();
    }

    loadTagsFromItem(item) {
        this.formTags = (item.tags || '').split(';').map(t => t.trim()).filter(Boolean);
        this.autoCategoryTag = null;
        this.tagsTouchedManually = false;
        
        const defTag = this.catToDefaultTag(item.category || '');
        if (defTag && this.formTags.includes(defTag)) {
            this.autoCategoryTag = defTag;
        }
        
        this.renderTagsDisplay();
    }

    resetTags() {
        this.formTags = [];
        this.autoCategoryTag = null;
        this.tagsTouchedManually = false;
        this.renderTagsDisplay();
    }

    getTagsString() {
        return this.formTags
            .map(t => t.trim())
            .filter(Boolean)
            .join('; ');
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

    handleOutsideClick(e) {
        if (this.categoryInput && this.categoryDropdown) {
            if (e.target !== this.categoryInput && !this.categoryDropdown.contains(e.target)) {
                this.hideCategoryDropdown();
            }
        }
        if (this.tagsDisplay && this.tagsDropdown) {
            if (e.target !== this.tagsDisplay && !this.tagsDropdown.contains(e.target)) {
                this.tagsDropdown.style.display = 'none';
            }
        }
    }
}

// Khởi tạo khi DOM ready
document.addEventListener('DOMContentLoaded', () => {
    const manager = new CategoryTagsManager();
    window.categoryManager = manager;
    window.tagsManager = manager; // alias cho FormHandler dùng
});