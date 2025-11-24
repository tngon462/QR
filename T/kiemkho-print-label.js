const PRINT_SERVER_URL = "http://192.168.1.10:5001/print-label";  
function formatPriceJPY(num) {
    try {
        return "¥" + Number(num).toLocaleString("ja-JP");
    } catch (e) {
        return "¥" + num;
    }
}

function getFormDataForLabel() {
    const barcode = (document.getElementById("barcodeInput")?.value || "").trim();
    const name    = (document.getElementById("nameInput")?.value || "").trim();
    const price   = (document.getElementById("priceInput")?.value || "").trim();

    const priceNum = parseInt(price.replace(/\D/g, ""), 10) || 0;
    const priceLabel = formatPriceJPY(priceNum);

    return { barcode, name, priceNum, priceLabel };
}


function printCurrentItemLabel() {
    const data = getFormDataForLabel();

    if (!data.name) {
        alert("Chưa có TÊN SẢN PHẨM để in tem.");
        return;
    }

    if (!data.priceNum) {
        alert("Chưa nhập GIÁ BÁN để in tem.");
        return;
    }

    const url =
        PRINT_SERVER_URL +
        "?name=" + encodeURIComponent(data.name) +
        "&price_label=" + encodeURIComponent(data.priceLabel) +
        "&barcode=" + encodeURIComponent(data.barcode || "");

    console.log("Gửi lệnh in:", url);


    const w = window.open(url, "_blank", "noopener,noreferrer");

    if (!w) {
        alert("Trình duyệt đã chặn popup. Hãy cho phép popup rồi thử lại.");
    }
}

window.addEventListener("DOMContentLoaded", () => {
    const btn = document.getElementById("printLabelBtn");
    if (btn) {
        btn.addEventListener("click", printCurrentItemLabel);
        console.log("🔌 In tem giá đã sẵn sàng.");
    } else {
        console.warn("Không tìm thấy nút #printLabelBtn để gắn sự kiện in.");
    }
});
