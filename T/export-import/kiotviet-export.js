// export-import/kiotviet-export.js
class KiotVietExport {
    constructor() {
        this.exportKiotVietBtn = document.getElementById('exportKiotVietBtn');
        this.bindEvents();
    }

    bindEvents() {
        this.exportKiotVietBtn.addEventListener('click', () => this.exportKiotVietXlsx());
    }

    exportKiotVietXlsx() {
        if (!dataManager.items.length) {
            alert('Chưa có dữ liệu để export KiotViet');
            return;
        }

        if (typeof XLSX === 'undefined') {
            alert('Không tìm thấy thư viện XLSX.');
            return;
        }

        const wb = this.buildKiotVietWorkbook();
        XLSX.writeFile(wb, 'kiotviet_update_tngon.xlsx');
    }

    buildKiotVietWorkbook() {
        const headers = [
            'Loại hàng', 'Loại thực đơn', 'Nhóm hàng(3 Cấp)', 'Mã hàng', 'Tên hàng hóa',
            'Giá vốn', 'Giá bán', 'Tồn kho', 'Đặt hàng', 'Tồn nhỏ nhất', 'Tồn lớn nhất',
            'Mã ĐVT Cơ bản', 'Quy đổi', 'Thuộc tính', 'Mã HH Liên quan', 'ĐVT',
            'Hình ảnh (url1,url2...)', 'Tích điểm', 'Đang kinh doanh', 'Được bán trực tiếp',
            'Mô tả', 'Mẫu ghi chú', 'Là món thêm', 'Là hàng dịch vụ tính theo thời gian sử dụng',
            'Hàng thành phần', 'Món thêm', 'Vị trí', 'Quản lý tồn kho'
        ];

        const rows = [headers];

        dataManager.items.forEach(item => {
            const row = this.buildKiotVietRow(item);
            if (row) rows.push(row);
        });

        if (rows.length <= 1) {
            alert('Không có dòng hợp lệ để export KiotViet.');
            return null;
        }

        const ws = XLSX.utils.aoa_to_sheet(rows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
        
        return wb;
    }

    buildKiotVietRow(item) {
        const barcode = (item.barcode || '').trim();
        const name = (item.name || '').trim();
        if (!barcode && !name) return null;

        const tonKho = this.getStockQuantity(item);
        const price = this.getPrice(item);
        const img = (item.image || '').trim();

        const row = [];

        // 0 Loại hàng
        row.push('Hàng hóa thường');
        // 1 Loại thực đơn
        row.push('');
        // 2 Nhóm hàng(3 Cấp)
        row.push(item.category || '');
        // 3 Mã hàng
        row.push(barcode);
        // 4 Tên hàng hóa
        row.push(name || barcode);
        // 5 Giá vốn
        row.push('');
        // 6 Giá bán
        row.push(price);
        // 7 Tồn kho
        row.push(tonKho);

        // 8–15: empty columns
        for (let i = 8; i <= 15; i++) {
            row.push('');
        }

        // 16 Hình ảnh
        row.push(img);

        // 17–27: empty columns
        for (let i = 17; i <= 27; i++) {
            row.push('');
        }

        return row;
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
}

// Khởi tạo khi DOM ready
document.addEventListener('DOMContentLoaded', () => {
    window.kiotVietExport = new KiotVietExport();
});