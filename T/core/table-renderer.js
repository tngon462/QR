// core/table-renderer.js
class TableRenderer {
    constructor() {
        this.itemsBody = document.getElementById('itemsBody');
        this.tableSortState = {
            key: null,
            dir: 1
        };
        this.initializeSortHandlers();
    }

    initializeSortHandlers() {
        const table = document.querySelector('table');
        if (!table) return;
        
        const ths = table.querySelectorAll('thead th');
        ths.forEach((th, idx) => {
            th.addEventListener('click', () => {
                const key = th.dataset.key;
                if (!key) return;

                if (this.tableSortState.key === key) {
                    this.tableSortState.dir *= -1;
                } else {
                    this.tableSortState.key = key;
                    this.tableSortState.dir = 1;
                }

                this.sortItems(key, this.tableSortState.dir);
                this.render();
            });
        });
    }

    sortItems(key, dir) {
        if (!key) return;
        dataManager.items.sort((a, b) => {
            const va = a[key] || '';
            const vb = b[key] || '';
            return va > vb ? dir : -dir;
        });
    }

    render() {
        this.itemsBody.innerHTML = '';
        
        dataManager.items.forEach((item, idx) => {
            const tr = this.createTableRow(item, idx);
            this.itemsBody.appendChild(tr);
        });
    }

    createTableRow(item, idx) {
        const tr = document.createElement('tr');
        tr.dataset.barcode = item.barcode || '';

        const imgSrc = this.makeImageSrc(item.image || '');
        let imgCell = '';
        if (imgSrc) {
            imgCell = `<img src="${imgSrc}" class="img-table-thumb" alt="Ảnh" />`;
        } else if (item.image) {
            imgCell = item.image;
        }

        const barcodeTxt = this.truncate(item.barcode || '', 15);
        const nameTxt = this.truncate(item.name || '', 15);
        const catTxt = this.truncate(item.category || '', 20);
        const tagsTxt = this.truncate(item.tags || '', 20);

        const priceFull = String(item.price || '');
        const qtyFull = String(item.qty || '');
        const stockFull = String(item.stock || '');

        tr.innerHTML = `
            <td>${idx + 1}</td>
            <td title="${item.barcode || ''}">${barcodeTxt}</td>
            <td title="${item.name || ''}">${nameTxt}</td>
            <td>${imgCell}</td>
            <td title="${item.category || ''}">${catTxt}</td>
            <td title="${item.tags || ''}">${tagsTxt}</td>
            <td title="${priceFull}">${this.truncate(priceFull,4)}</td>
            <td title="${qtyFull}">${this.truncate(qtyFull,4)}</td>
            <td title="${stockFull}">${this.truncate(stockFull,4)}</td>
            <td>${item.note || ''}</td>
            <td>${item.updated_at || ''}</td>
            <td><button class="table-delete-btn" data-del-idx="${idx}">Xóa</button></td>
        `;

        // Click row → load to form
        tr.addEventListener('click', () => {
            if (window.formHandler) {
                window.formHandler.loadItemToForm(item);
            }
            const inp = document.getElementById('barcodeInput');
            if (inp) {
                inp.focus();
                inp.select();
            }
        });

        // XÓA
        const delBtn = tr.querySelector('.table-delete-btn');
        delBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const idxToDel = parseInt(delBtn.dataset.delIdx, 10);
            await this.deleteItemAtIndex(idxToDel);
        });

        return tr;
    }

    async deleteItemAtIndex(idx) {
        if (idx < 0 || idx >= dataManager.items.length) return;

        const item = dataManager.items[idx];
        const ok = await this.showDeleteConfirm(item);
        if (!ok) return;

        // XÓA
        dataManager.deleteItem(idx);
        this.render();

        if (window.categoryManager) {
            window.categoryManager.rebuildList();
        }

        // Reset form nếu đang hiển thị sản phẩm vừa xóa
        const currentBarcode = document.getElementById('barcodeInput').value.trim();
        if (currentBarcode === (item.barcode || '')) {
            if (window.formHandler) window.formHandler.resetForm();
        }

        // Auto sync
        if (window.githubSync && window.githubSync.githubToken) {
            window.githubSync.pushCSV({ silent: true });
        }
    }

    // ⭐ BỔ SUNG DIALOG FALLBACK
    async showDeleteConfirm(item) {
        const dlg = document.getElementById('deleteDialog');
        const btnCancel = document.getElementById('deleteCancelBtn');
        const btnConfirm = document.getElementById('deleteConfirmBtn');
        const name = document.getElementById('deleteName');
        const barcodeEl = document.getElementById('deleteBarcode');

        // Nếu chưa dựng dialog → fallback confirm()
        if (!dlg || !btnCancel || !btnConfirm || !name || !barcodeEl) {
            const label = item.name || item.barcode || '(không tên)';
            return window.confirm(`Xóa sản phẩm "${label}"?`);
        }

        return new Promise((resolve) => {
            name.textContent = item.name || '(không tên)';
            barcodeEl.textContent = item.barcode || '';

            btnCancel.onclick = () => { dlg.close(); resolve(false); };
            btnConfirm.onclick = () => { dlg.close(); resolve(true); };

            dlg.showModal();
        });
    }

    makeImageSrc(v) {
        if (!v) return null;
        if (v.startsWith('http') || v.startsWith('data:')) return v;
        if (/^[A-Za-z0-9+/=]+$/.test(v) && v.length > 100)
            return "data:image/jpeg;base64," + v;
        return null;
    }

    truncate(str, maxLen) {
        if (!str) return '';
        str = String(str);
        if (str.length <= maxLen) return str;
        return str.slice(0, maxLen - 1) + '…';
    }
}

// Init
document.addEventListener('DOMContentLoaded', () => {
    window.tableRenderer = new TableRenderer();
});
