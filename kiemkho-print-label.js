import socket
import threading
import io
import time
from datetime import datetime
import json
from urllib.parse import urlparse

import win32print
import win32ui
from PIL import Image, ImageFile, ImageOps, ImageWin, ImageDraw, ImageFont
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler

# =====================
# CONFIG
# =====================
HOST = '0.0.0.0'
PORT = 9100                 # cổng nhận lệnh in từ LAN (cũ)
BUFFER_SIZE = 16384         # nhanh hơn
RECV_TIMEOUT = 5            # timeout đọc mỗi kết nối
JOB_MERGE_WINDOW = 1.0      # gom nhanh → giảm "time chết"
PRINTER_NAME = win32print.GetDefaultPrinter()

# HTTP server cho in tem giá
HTTP_HOST = '0.0.0.0'
HTTP_PORT = 5001            # cổng để kiểm kho gọi HTTP POST /print-label

# Không lưu file — chỉ in + log chi tiết
ImageFile.LOAD_TRUNCATED_IMAGES = True

# =====================
# Helpers
# =====================
def ts():
    return datetime.now().strftime('%H:%M:%S')

def log(msg):
    print(f'[{ts()}] {msg}', flush=True)

# =====================
# GS v0 + PNG/JPEG
# =====================
PNG_MAGIC = b'\x89PNG\r\n\x1a\n'
PNG_END   = b'\x00\x00\x00\x00IEND\xaeB`\x82'
JPG_SOI   = b'\xff\xd8'
JPG_EOI   = b'\xff\xd9'
GSV0_SIG  = b'\x1d\x76\x30'  # GS v 0

def _find_all(data: bytes, sub: bytes):
    i = 0
    while True:
        j = data.find(sub, i)
        if j == -1:
            return
        yield j
        i = j + 1

def _images_from_png_jpeg(data: bytes):
    images = []
    # PNG
    png_cnt = 0
    for start in _find_all(data, PNG_MAGIC):
        end = data.find(PNG_END, start)
        if end != -1:
            end += len(PNG_END)
            try:
                images.append(Image.open(io.BytesIO(data[start:end])).convert('RGB'))
                png_cnt += 1
            except Exception:
                pass
    if png_cnt:
        log(f'[PNG] {png_cnt} khối PNG')
    # JPEG
    jpg_cnt = 0
    idx = 0
    n = len(data)
    while True:
        soi = data.find(JPG_SOI, idx)
        if soi == -1: break
        eoi = data.find(JPG_EOI, soi + 2)
        if eoi == -1: break
        try:
            images.append(Image.open(io.BytesIO(data[soi:eoi+2])).convert('RGB'))
            jpg_cnt += 1
            idx = eoi + 2
        except Exception:
            idx = soi + 2
    if jpg_cnt:
        log(f'[JPG] {jpg_cnt} khối JPEG')
    return images

def _images_from_gs_v0(data: bytes):
    images = []
    i = 0
    n = len(data)
    block_no = 0
    while True:
        j = data.find(GSV0_SIG, i)
        if j == -1 or j + 7 >= n: break
        m = data[j+3]
        x = data[j+4] + (data[j+5] << 8)  # bytes/row
        y = data[j+6] + (data[j+7] << 8)  # rows
        size = x * y
        start = j + 8
        end = start + size
        block_no += 1
        if end > n:
            have = max(0, n - start)
            log(f'[GSv0] Block #{block_no}: thiếu dữ liệu (need={size}, have={have})')
            i = j + 3
            continue
        width = x * 8
        height = y
        # Giải bit nhanh (unrolled 8-bit)
        payload = data[start:end]
        row_pixels = bytearray(width * height)
        p = 0
        pos = 0
        for _row in range(height):
            for _xb in range(x):
                b = payload[pos]; pos += 1
                row_pixels[p+0] = 0 if (b & 0x80) else 255
                row_pixels[p+1] = 0 if (b & 0x40) else 255
                row_pixels[p+2] = 0 if (b & 0x20) else 255
                row_pixels[p+3] = 0 if (b & 0x10) else 255
                row_pixels[p+4] = 0 if (b & 0x08) else 255
                row_pixels[p+5] = 0 if (b & 0x04) else 255
                row_pixels[p+6] = 0 if (b & 0x02) else 255
                row_pixels[p+7] = 0 if (b & 0x01) else 255
                p += 8
        images.append(Image.frombytes('L', (width, height), bytes(row_pixels)).convert('RGB'))
        log(f'[GSv0] Block #{block_no} → {width}x{height} (m={m}, x(bytes)={x}, y(rows)={y})')
        i = end
    if not images:
        log('[GSv0] Không tìm thấy block GS v 0')
    return images

def extract_images_from_bytes(data: bytes):
    imgs = _images_from_png_jpeg(data)
    if not imgs:
        imgs = _images_from_gs_v0(data)
    return imgs

# =====================
# Stitch & Print (giữ in lát để không mất phần cuối)
# =====================
def stitch_vertical(images):
    if not images: return None
    max_w = max(im.width for im in images)
    resized = [ImageOps.contain(im, (max_w, 200000)) for im in images]
    total_h = sum(im.height for im in resized)
    canvas = Image.new('RGB', (max_w, total_h), 'white')
    y = 0
    for im in resized:
        canvas.paste(im, (0, y))
        y += im.height
    return canvas

def print_image_paged(image: Image.Image):
    hdc = win32ui.CreateDC()
    hdc.CreatePrinterDC(PRINTER_NAME)
    HORZRES = hdc.GetDeviceCaps(8)
    VERTRES = hdc.GetDeviceCaps(10)

    scale = HORZRES / image.width
    img = image.resize((HORZRES, max(1, int(image.height * scale))), Image.LANCZOS)

    hdc.StartDoc('POS Print')
    top = 0
    while top < img.height:
        bottom = min(top + VERTRES, img.height)
        tile = img.crop((0, top, HORZRES, bottom))
        dib = ImageWin.Dib(tile)
        hdc.StartPage()
        dib.draw(hdc.GetHandleOutput(), (0, 0, tile.width, tile.height))
        hdc.EndPage()
        top = bottom
    hdc.EndDoc()
    hdc.DeleteDC()

# =====================
# Tạo ảnh tem giá (tên trên, giá dưới, căn giữa, chữ to)
# =====================
def make_price_label_image(name: str, price_label: str, width=600, height=300) -> Image.Image:
    """
    Tạo 1 ảnh trắng, tên ở trên, giá bên dưới, căn giữa.
    width/height là tương đối, sẽ được scale theo máy in nên không cần quá chuẩn mm.
    """
    name = (name or '').strip()
    price_label = (price_label or '').strip()

    img = Image.new('RGB', (width, height), 'white')
    draw = ImageDraw.Draw(img)

    # Thử dùng font truetype, nếu không có thì fallback default
    # Sếp có thể đổi sang font tiếng Nhật, ví dụ 'meiryo.ttc' nếu muốn hiển thị tiếng Nhật đẹp hơn
    try:
        font_name = ImageFont.truetype("arial.ttf", 48)
        font_price = ImageFont.truetype("arial.ttf", 72)
    except Exception:
        font_name = ImageFont.load_default()
        font_price = ImageFont.load_default()

    # Tính kích thước chữ và căn giữa
    # Name (trên)
    bbox_name = draw.textbbox((0, 0), name, font=font_name)
    w_name = bbox_name[2] - bbox_name[0]
    h_name = bbox_name[3] - bbox_name[1]

    # Price (dưới)
    bbox_price = draw.textbbox((0, 0), price_label, font=font_price)
    w_price = bbox_price[2] - bbox_price[0]
    h_price = bbox_price[3] - bbox_price[1]

    # Căn giữa theo chiều ngang, chia chiều cao 3 phần: name ~ 1/3, price ~ 2/3
    x_name = (width - w_name) // 2
    y_name = (height // 3 - h_name) // 2

    x_price = (width - w_price) // 2
    y_price = height // 2 + (height // 3 - h_price) // 2

    draw.text((x_name, y_name), name, font=font_name, fill="black")
    draw.text((x_price, y_price), price_label, font=font_price, fill="black")

    return img

# =====================
# Job manager (per IP) - cho luồng 9100 cũ
# =====================
_jobs = {}
_timers = {}
_lock = threading.Lock()

def _flush_job(ip: str):
    with _lock:
        chunks = _jobs.pop(ip, [])
        t = _timers.pop(ip, None)
        if t:
            try: t.cancel()
            except Exception: pass
    if not chunks:
        return

    merged = b''.join(chunks)
    log(f'[GOM] IP {ip}: tổng sau gom {len(merged)} bytes')

    images = extract_images_from_bytes(merged)
    if not images:
        log('[CẢNH BÁO] Không trích xuất được ảnh từ luồng hiện có')
        return

    big = stitch_vertical(images)
    if big is None:
        log('[LỖI] stitch_vertical trả về None')
        return

    log(f'[IN] Bắt đầu in {len(images)} ảnh (ghép dọc)')
    try:
        print_image_paged(big)
        log(f'[XONG] IP {ip}: In thành công ({len(images)} ảnh)')
    except Exception as e:
        log(f'[LỖI IN] {e}')

def _schedule_flush(ip: str):
    def _cb(): _flush_job(ip)
    old = _timers.get(ip)
    if old:
        try: old.cancel()
        except Exception: pass
    t = threading.Timer(JOB_MERGE_WINDOW, _cb)
    t.daemon = True
    _timers[ip] = t
    t.start()

# =====================
# Socket server 9100 (giữ nguyên chức năng cũ)
# =====================
def handle_client(conn, addr):
    ip, port = addr
    log(f'[KẾT NỐI] {addr}')
    conn.settimeout(RECV_TIMEOUT)
    chunks = []
    total = 0
    try:
        while True:
            buf = conn.recv(BUFFER_SIZE)
            if not buf: break
            chunks.append(buf)
            total += len(buf)
    except socket.timeout:
        pass
    except Exception as e:
        log(f'[SOCKET ERR] {e}')
    finally:
        try: conn.close()
        except Exception: pass

    if total == 0:
        log(f'[RỖNG] Không nhận dữ liệu từ {addr}')
        return

    log(f'[NHẬN] {total} bytes từ {ip}')
    with _lock:
        _jobs.setdefault(ip, []).append(b''.join(chunks))
    _schedule_flush(ip)

def start_socket_server():
    log(f'[MỞ CỔNG] Listening {HOST}:{PORT} → máy in {PRINTER_NAME} (in + log, no save)')
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        s.bind((HOST, PORT))
        s.listen()
        while True:
            conn, addr = s.accept()
            threading.Thread(target=handle_client, args=(conn, addr), daemon=True).start()

# =====================
# HTTP server /print-label cho kiểm kho
# =====================
class PrintLabelHandler(BaseHTTPRequestHandler):
    def _set_headers(self, status=200):
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        # CORS cho phép gọi từ file:// hoặc domain khác
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def do_OPTIONS(self):
        self._set_headers(200)

    def do_POST(self):
        parsed = urlparse(self.path)
        if parsed.path != '/print-label':
            self._set_headers(404)
            self.wfile.write(b'{"ok": false, "error": "Not Found"}')
            return

        # Đọc body
        length = int(self.headers.get('Content-Length', '0') or '0')
        body = self.rfile.read(length) if length > 0 else b''
        try:
            data = json.loads(body.decode('utf-8'))
        except Exception:
            self._set_headers(400)
            self.wfile.write(b'{"ok": false, "error": "Invalid JSON"}')
            return

        name = (data.get('name') or '').strip()
        price_label = (data.get('price_label') or '').strip()
        barcode = (data.get('barcode') or '').strip()

        if not name or not price_label:
            self._set_headers(400)
            self.wfile.write(b'{"ok": false, "error": "Missing name or price_label"}')
            return

        log(f'[HTTP] In tem: name="{name}", price="{price_label}", barcode="{barcode}"')

        try:
            img = make_price_label_image(name, price_label)
            print_image_paged(img)
        except Exception as e:
            log(f'[LỖI IN TEM] {e}')
            self._set_headers(500)
            resp = json.dumps({"ok": False, "error": str(e)}).encode('utf-8')
            self.wfile.write(resp)
            return

        self._set_headers(200)
        resp = json.dumps({"ok": True, "message": f"In tem: {name} / {price_label}"}).encode('utf-8')
        self.wfile.write(resp)

def start_http_server():
    server = ThreadingHTTPServer((HTTP_HOST, HTTP_PORT), PrintLabelHandler)
    log(f'[HTTP] Listening {HTTP_HOST}:{HTTP_PORT} → endpoint /print-label')
    server.serve_forever()

# =====================
# MAIN
# =====================
if __name__ == '__main__':
    # Chạy HTTP server in tem giá trên thread riêng
    threading.Thread(target=start_http_server, daemon=True).start()
    # Chạy socket server 9100 như cũ
    start_socket_server()
