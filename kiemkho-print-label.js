// kiemkho-print-label.js
(() => {
  // ĐỊA CHỈ SERVER PYTHON TRÊN MÁY SẾP
  // Đổi port/path nếu bên Python dùng khác
  const PRINT_SERVER_URL = 'http://127.0.0.1:5001/print-label';

  function formatPriceNumber(raw) {
    if (raw === null || raw === undefined) return null;
    const num = Number(String(raw).replace(/[,¥円\s]/g, ''));
    if (!Number.isFinite(num) || num <= 0) return null;
    return num;
  }

  function formatPriceLabelJPY(num) {
    // Hiển thị kiểu: ¥1,234
    try {
      return '¥' + num.toLocaleString('ja-JP');
    } catch (e) {
      return '¥' + num;
    }
  }

  async function printCurrentItemLabel() {
    const barcodeInput = document.getElementById('barcodeInput');
    const nameInput    = document.getElementById('nameInput');
    const priceInput   = document.getElementById('priceInput');

    if (!barcodeInput || !nameInput || !priceInput) {
      alert('Không tìm thấy ô mã vạch / tên / giá. Kiểm tra lại ID input trong HTML.');
      return;
    }

    const barcode = (barcodeInput.value || '').trim();
    const name    = (nameInput.value    || '').trim();
    const priceRaw = (priceInput.value  || '').trim();

    if (!name) {
      alert('Chưa có TÊN SẢN PHẨM để in tem giá.');
      nameInput.focus();
      return;
    }

    const priceNumber = formatPriceNumber(priceRaw);
    if (priceNumber === null) {
      alert('Giá bán không hợp lệ hoặc đang bỏ trống.');
      priceInput.focus();
      return;
    }

    const priceLabel = formatPriceLabelJPY(priceNumber);

    // Thử lưu form hiện tại vào CSV (nếu hàm có tồn tại trong script chính)
    if (typeof upsertItemFromForm === 'function') {
      const ok = upsertItemFromForm(false);
      if (!ok) {
        // upsertItemFromForm đã tự cảnh báo thiếu dữ liệu
        return;
      }
    }

    const payload = {
      barcode: barcode || null,
      name: name,
      price: priceNumber,       // số nguyên / số thực
      price_label: priceLabel,  // "¥1,234"
      // có thể thêm trường khác nếu bên Python cần
    };

    try {
      const res = await fetch(PRINT_SERVER_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        let msg = '';
        try {
          msg = await res.text();
        } catch (e) {
          // bỏ qua
        }
        throw new Error('HTTP ' + res.status + (msg ? (': ' + msg) : ''));
      }

      // Nếu server trả JSON có thông điệp
      let data = null;
      try {
        data = await res.json();
      } catch (e) {
        // có thể server không trả JSON, không sao
      }

      if (data && data.message) {
        alert('Đã gửi lệnh in tem giá:\n' + data.message);
      } else {
        alert('Đã gửi lệnh in tem giá cho:\n' + name + '\n' + priceLabel);
      }
    } catch (err) {
      console.error('Lỗi khi gọi server in tem:', err);
      alert(
        'Không gửi được lệnh đến server in.\n' +
        '• Kiểm tra xem Python server đã chạy chưa.\n' +
        '• Kiểm tra port / URL trong kiemkho-print-label.js.\n\n' +
        'Chi tiết: ' + err.message
      );
    }
  }

  // Gắn event khi DOM sẵn sàng
  document.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('printLabelBtn');
    if (!btn) return;

    btn.addEventListener('click', (e) => {
      e.preventDefault();
      printCurrentItemLabel();
    });
  });
})();
