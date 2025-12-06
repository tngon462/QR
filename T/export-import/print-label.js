// export-import/print-label.js
class PrintLabelHandler {
    constructor() {
        this.PRINT_SERVER_URL = 'http://192.168.1.7:5001/print-label';
        this.printLabelBtn = document.getElementById('printLabelBtn');
        
        this.bindEvents();
    }

    bindEvents() {
        if (this.printLabelBtn) {
            this.printLabelBtn.addEventListener('click', (e) => {
    e.preventDefault();
    if (!this.printLabelBtn) return;

    this.printLabelBtn.disabled = true;
    this.printLabelBtn.classList.add("is-busy");

    // Cho phép printCurrentItemLabel là async
    Promise.resolve(this.printCurrentItemLabel())
      .catch((err) => {
        console.error(err);
      })
      .finally(() => {
        this.printLabelBtn.disabled = false;
        this.printLabelBtn.classList.remove("is-busy");
        this.printLabelBtn.blur();

        const bc = document.getElementById("barcodeInput");
        if (bc) bc.focus();
      });
});
        }
    }

    async printCurrentItemLabel() {
        const barcode = document.getElementById('barcodeInput').value.trim();
        const name = document.getElementById('nameInput').value.trim();
        const priceRaw = document.getElementById('priceInput').value.trim();

        if (!name) {
            alert('Chưa có TÊN SẢN PHẨM để in tem giá.');
            document.getElementById('nameInput').focus();
            return;
        }

        const priceNumber = this.formatPriceNumber(priceRaw);
        if (priceNumber === null) {
            alert('Giá bán không hợp lệ hoặc đang bỏ trống.');
            document.getElementById('priceInput').focus();
            return;
        }

        const priceLabel = this.formatPriceLabelJPY(priceNumber);

        // Thử lưu form hiện tại vào CSV
        if (window.formHandler) {
            const ok = window.formHandler.saveForm();
            if (!ok) {
                return;
            }
        }

        const payload = {
            barcode: barcode || null,
            name: name,
            price: priceNumber,
            price_label: priceLabel
        };

        // Nếu đang chạy trên GitHub (https) → mở tab mới
        if (location.protocol === 'https:') {
            this.openPrintPopup(name, priceLabel, barcode);
            return;
        }

        // Còn nếu chạy bản nội bộ (http) → dùng fetch JSON
        await this.sendPrintRequest(payload, name, priceLabel);
    }

    openPrintPopup(name, priceLabel, barcode) {
        const params = new URLSearchParams({
            mode: 'popup',
            name: name,
            price_label: priceLabel,
            barcode: barcode || ''
        });

        const url = this.PRINT_SERVER_URL + '?' + params.toString();
        const w = window.open(url, '_blank');

        if (!w) {
            alert('Trình duyệt đã chặn cửa sổ in. Hãy cho phép pop-up cho trang này rồi bấm in lại.');
        }
    }

    async sendPrintRequest(payload, name, priceLabel) {
        try {
            const res = await fetch(this.PRINT_SERVER_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            if (!res.ok) {
                let msg = '';
                try { msg = await res.text(); } catch (e) {}
                throw new Error('HTTP ' + res.status + (msg ? (': ' + msg) : ''));
            }

            let data = null;
            try { data = await res.json(); } catch (e) {}

            if (data && data.message) {
                alert('Đã gửi lệnh in:\n' + data.message);
            } else {
                alert('Đã gửi lệnh in tem giá cho:\n' + name + '\n' + priceLabel);
            }
        } catch (err) {
            console.error('Lỗi khi gọi server in:', err);
            alert(
                'Không gửi được lệnh đến server in.\n' +
                '• Kiểm tra Python print_server_v6 có đang chạy không.\n' +
                '• Kiểm tra lại IP/port trong PRINT_SERVER_URL.\n\n' +
                'Chi tiết: ' + err.message
            );
        }
    }

    formatPriceNumber(raw) {
        if (raw === null || raw === undefined) return null;
        const num = Number(String(raw).replace(/[,¥円\s]/g, ''));
        if (!Number.isFinite(num) || num <= 0) return null;
        return num;
    }

    formatPriceLabelJPY(num) {
        try {
            return '¥' + num.toLocaleString('ja-JP');
        } catch (e) {
            return '¥' + num;
        }
    }
}

// Khởi tạo khi DOM ready
document.addEventListener('DOMContentLoaded', () => {
    window.printLabelHandler = new PrintLabelHandler();
});
