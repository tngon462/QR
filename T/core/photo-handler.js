// core/photo-handler.js
class PhotoHandler {
    constructor() {
        this.photoBtn = document.getElementById('photoBtn');
        this.photoFrame = document.getElementById('photoFrame');
        this.photoPreview = document.getElementById('photoPreview');
        this.takePhotoBtn = document.getElementById('takePhotoBtn');
        this.closePhotoBtn = document.getElementById('closePhotoBtn');
        this.photoCanvas = document.getElementById('photoCanvas');
        this.imageInput = document.getElementById('imageInput');
        
        this.photoStream = null;
        
        this.bindEvents();
    }

    bindEvents() {
        this.photoBtn.addEventListener('click', () => this.togglePhotoCamera());
        this.takePhotoBtn.addEventListener('click', () => this.takePhoto());
        this.closePhotoBtn.addEventListener('click', () => this.stopPhotoCamera());
    }

    async togglePhotoCamera() {
        if (this.photoStream) {
            this.stopPhotoCamera();
        } else {
            // Stop scanner camera if running
            if (window.cameraScanner) {
                window.cameraScanner.stopCamera();
            }
            await this.startPhotoCamera();
        }
    }

    async startPhotoCamera() {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            alert('Trình duyệt không hỗ trợ camera.');
            return;
        }

        try {
            this.photoStream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'environment' }
            });
            
            this.photoPreview.srcObject = this.photoStream;
            this.photoFrame.style.display = 'block';
            this.takePhotoBtn.style.display = 'inline-block';
            this.closePhotoBtn.style.display = 'inline-block';
        } catch (e) {
            console.error('Photo camera error:', e);
            alert('Không mở được camera để chụp ảnh.');
        }
    }

    stopPhotoCamera() {
        if (this.photoStream) {
            this.photoStream.getTracks().forEach(track => track.stop());
            this.photoStream = null;
        }
        
        this.photoPreview.srcObject = null;
        this.photoFrame.style.display = 'none';
        this.takePhotoBtn.style.display = 'none';
        this.closePhotoBtn.style.display = 'none';
    }

    takePhoto() {
        if (!this.photoStream || !this.photoPreview.videoWidth) {
            alert('Camera chưa sẵn sàng. Đợi video hiển thị rồi thử lại.');
            return;
        }

        const srcW = this.photoPreview.videoWidth;
        const srcH = this.photoPreview.videoHeight;
        const size = 250;
        
        this.photoCanvas.width = size;
        this.photoCanvas.height = size;

        const ctx = this.photoCanvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, size, size);

        const side = Math.min(srcW, srcH);
        const sx = (srcW - side) / 2;
        const sy = (srcH - side) / 2;
        
        ctx.drawImage(this.photoPreview, sx, sy, side, side, 0, 0, size, size);

        const dataUrl = this.photoCanvas.toDataURL('image/jpeg', 0.7);
        const base64 = dataUrl.split(',')[1] || '';

        this.imageInput.value = base64;
        
        if (window.formHandler) {
            window.formHandler.updateImageThumb();
        }
        
        if (window.formHandler) {
            window.formHandler.formDirty = true;
        }
        
        if (navigator.vibrate) navigator.vibrate(80);
        this.stopPhotoCamera();
    }
}

// Khởi tạo khi DOM ready
document.addEventListener('DOMContentLoaded', () => {
    window.photoHandler = new PhotoHandler();
});