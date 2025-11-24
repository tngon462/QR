// export-import/shopify-export.js
class ShopifyExport {
    constructor() {
        this.exportShopifyBtn = document.getElementById('exportShopifyBtn');
        this.bindEvents();
    }

    bindEvents() {
        this.exportShopifyBtn.addEventListener('click', () => this.exportShopifyCSV());
    }

    exportShopifyCSV() {
        if (!dataManager.items.length) {
            alert('Chưa có dữ liệu để export Shopify');
            return;
        }

        const csv = this.buildShopifyCSV();
        this.downloadFile(csv, 'shopify_import_tngon.csv', 'text/csv');
    }

    buildShopifyCSV() {
        const headers = [
            'Handle', 'Title', 'Body (HTML)', 'Vendor', 'Product Category', 'Type', 'Tags',
            'Published', 'Option1 Name', 'Option1 Value', 'Option2 Name', 'Option2 Value',
            'Option3 Name', 'Option3 Value', 'Variant SKU', 'Variant Grams',
            'Variant Inventory Tracker', 'Variant Inventory Qty', 'Variant Inventory Policy',
            'Variant Fulfillment Service', 'Variant Price', 'Variant Compare At Price',
            'Variant Requires Shipping', 'Variant Taxable', 'Variant Barcode',
            'Variant Image', 'Image Src', 'Image Position', 'Image Alt Text',
            'Gift Card', 'SEO Title', 'SEO Description', 'Status'
        ];

        const rows = [];

        dataManager.items.forEach(item => {
            const row = this.buildShopifyRow(item);
            if (row) rows.push(row);
        });

        if (!rows.length) {
            alert('Không có dòng hợp lệ để export Shopify.');
            return '';
        }

        return this.buildCSVGeneric(headers, rows);
    }

    buildShopifyRow(item) {
        const barcode = (item.barcode || '').trim();
        const name = (item.name || '').trim();
        if (!barcode && !name) return null;

        const handle = barcode || this.slugifyHandle(name);
        const cat = (item.category || '').split('>>')[0] || '';
        
        const tagsShopify = (item.tags || '')
            .split(';')
            .map(t => t.trim())
            .filter(Boolean)
            .join(', ');

        const tonKho = this.getStockQuantity(item);
        const price = this.getPrice(item);
        const img = dataManager.normalizeImageField(item.image || '');

        return {
            'Handle': handle,
            'Title': name || barcode,
            'Body (HTML)': '',
            'Vendor': 'T-NGON',
            'Product Category': '',
            'Type': cat,
            'Tags': tagsShopify,
            'Published': 'FALSE',
            'Option1 Name': 'Title',
            'Option1 Value': 'Default Title',
            'Option2 Name': '',
            'Option2 Value': '',
            'Option3 Name': '',
            'Option3 Value': '',
            'Variant SKU': barcode,
            'Variant Grams': '',
            'Variant Inventory Tracker': 'shopify',
            'Variant Inventory Qty': tonKho,
            'Variant Inventory Policy': 'deny',
            'Variant Fulfillment Service': 'manual',
            'Variant Price': price,
            'Variant Compare At Price': '',
            'Variant Requires Shipping': 'TRUE',
            'Variant Taxable': 'TRUE',
            'Variant Barcode': barcode,
            'Variant Image': '',
            'Image Src': img,
            'Image Position': img ? '1' : '',
            'Image Alt Text': name || barcode,
            'Gift Card': 'FALSE',
            'SEO Title': '',
            'SEO Description': '',
            'Status': 'draft'
        };
    }

    getStockQuantity(item) {
        if (item.qty !== undefined && item.qty !== null && item.qty !== '') {
            return item.qty;
        }
        if (item.stock !== undefined && item.stock !== null) {
            return item.stock;
        }
        return '';
    }

    getPrice(item) {
        if (item.price !== undefined && item.price !== null && item.price !== '') {
            return item.price;
        }
        return '';
    }

    slugifyHandle(str) {
        return String(str || '')
            .toLowerCase()
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '') || ('sp-' + Date.now());
    }

    buildCSVGeneric(headers, rows) {
        const esc = (v) => {
            if (v === null || v === undefined) return '';
            const s = String(v);
            if (/[",\n\r]/.test(s)) {
                return '"' + s.replace(/"/g, '""') + '"';
            }
            return s;
        };
        
        const lines = [];
        lines.push(headers.map(esc).join(','));
        
        rows.forEach(row => {
            const line = headers.map(h => {
                const v = (row[h] === undefined || row[h] === null) ? '' : row[h];
                return esc(v);
            }).join(',');
            lines.push(line);
        });
        
        return lines.join('\r\n');
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
    window.shopifyExport = new ShopifyExport();
});