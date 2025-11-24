// export-import/github-sync.js

class GitHubSync {
  constructor() {
    this.GH_OWNER = 'tngon462';
    this.GH_REPO = 'QR';
    this.GH_BRANCH = 'main';
    this.GH_PATH = 'kiemkho-data.csv';
    this.GH_IMAGE_FOLDER = 'kiemkho-images';
    
    this.githubToken = localStorage.getItem('kiemkho_github_token') || '';
    this.lastGithubSha = null;
    
    this.initializeElements();
    this.bindEvents();
  }

  initializeElements() {
    this.githubPullBtn = document.getElementById('githubPullBtn');
    this.githubPushBtn = document.getElementById('githubPushBtn');
  }

  bindEvents() {
    if (this.githubPullBtn) {
      this.githubPullBtn.addEventListener('click', () => this.pullCSV());
    }
    if (this.githubPushBtn) {
      this.githubPushBtn.addEventListener('click', () => this.pushCSV());
    }
  }

  // ===== Helpers cho items & lưu/render an toàn =====
  getItems() {
    const dm = (typeof window !== 'undefined') ? window.dataManager : null;
    if (dm && Array.isArray(dm.items)) return dm.items;
    if (Array.isArray(window.items)) return window.items;
    return [];
  }

  setItems(newItems) {
    const dm = (typeof window !== 'undefined') ? window.dataManager : null;
    if (dm) {
      dm.items = Array.isArray(newItems) ? newItems : [];
      if (typeof dm.saveToLocalStorage === 'function') {
        dm.saveToLocalStorage();
      }
    } else {
      window.items = Array.isArray(newItems) ? newItems : [];
      if (typeof window.saveToLocalStorage === 'function') {
        window.saveToLocalStorage();
      }
    }
  }

  saveItems() {
    const dm = (typeof window !== 'undefined') ? window.dataManager : null;
    if (dm && typeof dm.saveToLocalStorage === 'function') {
      dm.saveToLocalStorage();
    } else if (typeof window.saveToLocalStorage === 'function') {
      window.saveToLocalStorage();
    }
  }

  renderTableIfNeeded() {
    if (window.tableRenderer && typeof window.tableRenderer.render === 'function') {
      window.tableRenderer.render();
    }
  }

  async ensureToken() {
    if (!this.githubToken) {
      const token = prompt('Nhập GitHub Personal Access Token (PAT):');
      if (!token) return false;
      this.githubToken = token.trim();
      localStorage.setItem('kiemkho_github_token', this.githubToken);
    }
    return true;
  }

  async pullCSV() {
    if (!(await this.ensureToken())) return;

    try {
      const csvText = await this.fetchCSV();
      if (csvText) {
        if (window.csvHandler && typeof window.csvHandler.parseCSV === 'function') {
          // Cho CSVHandler xử lý như bình thường
          window.csvHandler.parseCSV(csvText);
        } else {
          // Fallback: tự parse rất đơn giản (ít dùng)
          console.warn('csvHandler không tồn tại, chưa parse CSV.');
          alert('Đã tải được CSV từ GitHub nhưng không có csvHandler để parse.');
        }
      }
    } catch (error) {
      console.error('Lỗi khi tải CSV từ GitHub:', error);
      alert('Lỗi khi tải CSV từ GitHub');
    }
  }

  async pushCSV() {
    const items = this.getItems();
    if (!items.length) {
      if (!confirm('Chưa có dữ liệu. Vẫn muốn lưu file rỗng lên GitHub?')) return;
    }

    if (!(await this.ensureToken())) return;

    try {
      await this.ensureFileSha();
      await this.uploadImages();
      
      const csvText = window.csvHandler.buildCSV();
      await this.uploadCSV(csvText);
      
      alert('Đã lưu CSV (và link ảnh) lên GitHub xong.');
    } catch (error) {
      console.error('Lỗi khi lưu CSV lên GitHub:', error);
      alert('Lỗi khi lưu CSV lên GitHub');
    }
  }

  async fetchCSV() {
    const apiUrl = `https://api.github.com/repos/${this.GH_OWNER}/${this.GH_REPO}/contents/${encodeURIComponent(this.GH_PATH)}?ref=${this.GH_BRANCH}`;
    const rawUrl = `https://raw.githubusercontent.com/${this.GH_OWNER}/${this.GH_REPO}/${this.GH_BRANCH}/${this.GH_PATH}`;

    const res = await fetch(apiUrl, {
      headers: this.getHeaders()
    });

    if (res.status === 404) {
      alert('Trên GitHub chưa có file CSV. Hãy lưu lên 1 lần trước.');
      return null;
    }

    if (!res.ok) throw new Error(`API error: ${res.status}`);

    const data = await res.json();
    this.lastGithubSha = data.sha;

    if (data.content) {
      try {
        const contentB64 = (data.content || '').replace(/\n/g, '');
        return this.fromBase64Unicode(contentB64);
      } catch (e) {
        console.warn('Decode API failed, fallback to raw URL');
      }
    }

    // Fallback to raw URL
    const rawRes = await fetch(rawUrl);
    if (!rawRes.ok) throw new Error(`Raw URL error: ${rawRes.status}`);
    return await rawRes.text();
  }

  async uploadCSV(csvText) {
    const url = `https://api.github.com/repos/${this.GH_OWNER}/${this.GH_REPO}/contents/${encodeURIComponent(this.GH_PATH)}`;
    const body = {
      message: 'Update inventory CSV from kiemkho app',
      content: this.toBase64Unicode(csvText),
      branch: this.GH_BRANCH
    };

    if (this.lastGithubSha) {
      body.sha = this.lastGithubSha;
    }

    const res = await fetch(url, {
      method: 'PUT',
      headers: this.getHeaders(),
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      if (res.status === 409) {
        alert('Lỗi 409: File trên GitHub đã đổi. Hãy tải về trước rồi lưu lại.');
      } else {
        throw new Error(`Upload failed: ${res.status}`);
      }
      return;
    }

    const data = await res.json();
    if (data?.content?.sha) {
      this.lastGithubSha = data.content.sha;
    }
  }

  async uploadImages() {
    const items = this.getItems();

    for (const item of items) {
      let imageData = (item.image || '').trim();
      if (!imageData) continue;
      if (imageData.startsWith('http')) continue; // đã là link

      imageData = imageData.replace(/^data:image\/[a-zA-Z0-9+.\-]+;base64,/, '').trim();
      
      if (!this.isBase64(imageData)) continue;
      if (!item.barcode) continue;

      try {
        const imageUrl = await this.uploadImage(item.barcode, imageData);
        if (imageUrl) {
          item.image = imageUrl;
        }
      } catch (error) {
        console.error(`Upload ảnh thất bại cho ${item.barcode}:`, error);
      }
    }

    // Lưu & render lại sau khi update link ảnh
    this.saveItems();
    this.renderTableIfNeeded();
  }

  async uploadImage(barcode, base64Data) {
    const filename = `${this.GH_IMAGE_FOLDER}/${barcode}.jpg`;
    const apiUrl = `https://api.github.com/repos/${this.GH_OWNER}/${this.GH_REPO}/contents/${this.encodePath(filename)}`;

    // Check if image exists
    try {
      const checkRes = await fetch(apiUrl + `?ref=${this.GH_BRANCH}`, {
        headers: this.getHeaders()
      });

      if (checkRes.ok) {
        const meta = await checkRes.json();
        return meta.download_url || `https://raw.githubusercontent.com/${this.GH_OWNER}/${this.GH_REPO}/${this.GH_BRANCH}/${filename}`;
      }
    } catch (e) {
      console.warn('Lỗi kiểm tra ảnh tồn tại:', e);
    }

    // Upload new image
    const body = {
      message: `Add product image ${barcode}`,
      content: base64Data,
      branch: this.GH_BRANCH
    };

    const res = await fetch(apiUrl, {
      method: 'PUT',
      headers: this.getHeaders(),
      body: JSON.stringify(body)
    });

    if (!res.ok) throw new Error(`Upload image failed: ${res.status}`);

    const json = await res.json();
    return json.content?.download_url || `https://raw.githubusercontent.com/${this.GH_OWNER}/${this.GH_REPO}/${this.GH_BRANCH}/${filename}`;
  }

  async ensureFileSha() {
    if (this.lastGithubSha) return;

    const url = `https://api.github.com/repos/${this.GH_OWNER}/${this.GH_REPO}/contents/${encodeURIComponent(this.GH_PATH)}?ref=${this.GH_BRANCH}`;
    
    try {
      const res = await fetch(url, { headers: this.getHeaders() });
      if (res.ok) {
        const data = await res.json();
        this.lastGithubSha = data.sha;
      } else if (res.status !== 404) {
        console.warn('Không lấy được file SHA:', res.status);
      }
    } catch (error) {
      console.warn('Lỗi ensureFileSha:', error);
    }
  }

  getHeaders() {
    return {
      'Accept': 'application/vnd.github+json',
      'Authorization': 'Bearer ' + this.githubToken,
      'Content-Type': 'application/json'
    };
  }

  encodePath(path) {
    return path.split('/').map(encodeURIComponent).join('/');
  }

  toBase64Unicode(str) {
    return btoa(unescape(encodeURIComponent(str)));
  }

  fromBase64Unicode(b64) {
    return decodeURIComponent(escape(atob(b64)));
  }

  isBase64(str) {
    return /^[A-Za-z0-9+/=]+$/.test(str) && str.length > 100;
  }
}

// Khởi tạo khi DOM ready
document.addEventListener('DOMContentLoaded', () => {
  window.githubSync = new GitHubSync();
});
