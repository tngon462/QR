// ==UserScript==
// @name         T-NGON KiotViet - Đồng bộ danh mục in tem
// @namespace    https://tngon.kiotviet.vn/
// @version      2.1.1
// @description  Tải toàn bộ hàng hóa từ trang quản lý KiotViet và đẩy catalog gọn lên Firebase.
// @author       T-NGON
// @match        https://tngon.kiotviet.vn/man/*
// @run-at       document-start
// @grant        GM_xmlhttpRequest
// @grant        GM_notification
// @grant        unsafeWindow
// @connect      api-man1.kiotviet.vn
// @connect      tngon-b37d6-default-rtdb.asia-southeast1.firebasedatabase.app
// ==/UserScript==

(() => {
  "use strict";

  const CONFIG = {
    apiURL:
      "https://api-man1.kiotviet.vn/api/branchs/226299/masterproducts?format=json&Includes=ProductAttributes&ForSummaryRow=true",

    databaseURL:
      "https://tngon-b37d6-default-rtdb.asia-southeast1.firebasedatabase.app",

    firebasePath:
      "labelPrinter/tngon_label_pc/catalog",

    syncPath:
      "labelPrinter/tngon_label_pc/catalogSync",

    branchId: "226299",

    retailer: "tngon",

    groupId: "11",

    pageSize: 100,

    requestTimeoutMs: 30000,

    pauseBetweenPagesMs: 120,

    autoSyncDaily: false
  };

  const STORAGE = {
    auth:
      "tngon_catalog_auth_v1",

    lastSync:
      "tngon_catalog_last_sync_v1",

    lastRemoteRequest:
      "tngon_catalog_last_remote_request_v1"
  };

  let capturedAuthorization = "";
  let syncing = false;

  let panel = null;
  let statusText = null;
  let detailText = null;
  let syncButton = null;

  function sleep(ms) {
    return new Promise(resolve =>
      setTimeout(resolve, ms)
    );
  }

  function log(...args) {
    console.log(
      "[T-NGON Catalog]",
      ...args
    );
  }

  function normalizeAuthorization(value) {
    const text =
      String(value || "").trim();

    if (!text) {
      return "";
    }

    return /^Bearer\s+/i.test(text)
      ? text
      : `Bearer ${text}`;
  }

  function looksLikeJwt(value) {
    const text =
      String(value || "")
        .replace(/^Bearer\s+/i, "")
        .trim();

    return (
      text.split(".").length === 3 &&
      text.length > 100
    );
  }

  function saveAuthorization(value) {
    const normalized =
      normalizeAuthorization(value);

    if (!looksLikeJwt(normalized)) {
      return false;
    }

    capturedAuthorization = normalized;

    try {
      sessionStorage.setItem(
        STORAGE.auth,
        normalized
      );
    } catch {
      // Bỏ qua.
    }

    updatePanel();
    return true;
  }

  function scanStorageForToken(storage) {
    if (!storage) {
      return "";
    }

    for (
      let index = 0;
      index < storage.length;
      index += 1
    ) {
      const key =
        storage.key(index);

      const raw =
        storage.getItem(key);

      if (!raw) {
        continue;
      }

      if (looksLikeJwt(raw)) {
        return normalizeAuthorization(raw);
      }

      try {
        const parsed =
          JSON.parse(raw);

        const stack = [parsed];

        while (stack.length) {
          const current =
            stack.pop();

          if (
            typeof current ===
              "string" &&
            looksLikeJwt(current)
          ) {
            return normalizeAuthorization(
              current
            );
          }

          if (
            current &&
            typeof current ===
              "object"
          ) {
            Object.values(current)
              .forEach(value => {
                stack.push(value);
              });
          }
        }
      } catch {
        // Không phải JSON.
      }
    }

    return "";
  }

  function findStoredAuthorization() {
    const cached =
      sessionStorage.getItem(
        STORAGE.auth
      );

    if (looksLikeJwt(cached)) {
      return normalizeAuthorization(
        cached
      );
    }

    return (
      scanStorageForToken(
        window.localStorage
      ) ||
      scanStorageForToken(
        window.sessionStorage
      )
    );
  }

  function injectNetworkHook() {
    const pageWindow =
      typeof unsafeWindow !==
        "undefined"
        ? unsafeWindow
        : window;

    if (
      pageWindow.__TNGON_CATALOG_HOOK__
    ) {
      return;
    }

    pageWindow.__TNGON_CATALOG_HOOK__ =
      true;

    const captureToken = value => {
      const text =
        String(value || "").trim();

      if (!text) {
        return;
      }

      saveAuthorization(text);
    };

    const originalFetch =
      pageWindow.fetch;

    if (
      typeof originalFetch ===
        "function"
    ) {
      pageWindow.fetch =
        function(input, init = {}) {
          try {
            const headers =
              new Headers(
                init.headers ||
                input?.headers ||
                {}
              );

            captureToken(
              headers.get(
                "authorization"
              )
            );
          } catch {
            // Bỏ qua.
          }

          return originalFetch.apply(
            this,
            arguments
          );
        };
    }

    const xhrPrototype =
      pageWindow.XMLHttpRequest
        .prototype;

    const originalOpen =
      xhrPrototype.open;

    const originalSetRequestHeader =
      xhrPrototype.setRequestHeader;

    xhrPrototype.open =
      function() {
        this.__tngonHeaders = {};

        return originalOpen.apply(
          this,
          arguments
        );
      };

    xhrPrototype.setRequestHeader =
      function(name, value) {
        try {
          const normalizedName =
            String(name)
              .toLowerCase();

          this.__tngonHeaders[
            normalizedName
          ] = value;

          if (
            normalizedName ===
            "authorization"
          ) {
            captureToken(value);
          }
        } catch {
          // Bỏ qua.
        }

        return originalSetRequestHeader
          .apply(
            this,
            arguments
          );
      };
  }

  function request(
    method,
    url,
    data = null,
    headers = {}
  ) {
    return new Promise(
      (resolve, reject) => {
        GM_xmlhttpRequest({
          method,
          url,

          headers: {
            Accept:
              "application/json, text/plain, */*",

            ...(data !== null
              ? {
                  "Content-Type":
                    "application/json; charset=utf-8"
                }
              : {}),

            ...headers
          },

          data:
            data === null
              ? undefined
              : JSON.stringify(data),

          timeout:
            CONFIG.requestTimeoutMs,

          onload: response => {
            if (
              response.status < 200 ||
              response.status >= 300
            ) {
              reject(
                new Error(
                  `HTTP ${
                    response.status
                  }: ${
                    response
                      .responseText
                      ?.slice(
                        0,
                        300
                      ) || ""
                  }`
                )
              );

              return;
            }

            try {
              resolve(
                response.responseText
                  ? JSON.parse(
                      response.responseText
                    )
                  : null
              );
            } catch {
              reject(
                new Error(
                  "Phản hồi không phải JSON hợp lệ."
                )
              );
            }
          },

          onerror: () => {
            reject(
              new Error(
                "Không kết nối được máy chủ."
              )
            );
          },

          ontimeout: () => {
            reject(
              new Error(
                "Máy chủ phản hồi quá chậm."
              )
            );
          }
        });
      }
    );
  }

  function getAuthorization() {
    if (
      looksLikeJwt(
        capturedAuthorization
      )
    ) {
      return capturedAuthorization;
    }

    const stored =
      findStoredAuthorization();

    if (stored) {
      saveAuthorization(stored);
      return stored;
    }

    return "";
  }

  function productPayload(
    page,
    skip
  ) {
    return {
      "$inlinecount":
        "allpages",

      "$format":
        "json",

      CategoryIds:
        "[]",

      AttributeFilter:
        "[]",

      BranchId:
        -1,

      ProductTypes:
        "",

      IsImei:
        2,

      IsFormulas:
        2,

      IsActive:
        true,

      AllowSale:
        null,

      IsBatchExpireControl:
        2,

      ShelvesIds:
        "",

      TrademarkIds:
        "",

      StockoutDate:
        "alltime",

      CreatedDate:
        "alltime",

      supplierIds:
        "",

      isNewFilter:
        true,

      "$top":
        CONFIG.pageSize,

      Skip:
        skip,

      Take:
        CONFIG.pageSize,

      PageSize:
        CONFIG.pageSize,

      Page:
        page
    };
  }

  async function fetchProductPage(
    page,
    skip
  ) {
    const authorization =
      getAuthorization();

    if (!authorization) {
      throw new Error(
        "Chưa lấy được token đăng nhập. Hãy tải lại trang quản lý KiotViet rồi thử lại."
      );
    }

    return request(
      "POST",
      CONFIG.apiURL,
      productPayload(
        page,
        skip
      ),
      {
        authorization,

        branchid:
          CONFIG.branchId,

        retailer:
          CONFIG.retailer,

        "x-group-id":
          CONFIG.groupId,

        "x-language":
          "vi-VN",

        "x-retailer-code":
          CONFIG.retailer,

        "x-timezone":
          "Asia/Tokyo",

        isusekvclient:
          "1"
      }
    );
  }

  function cleanBarcode(value) {
    return String(value || "")
      .replace(/\s+/g, "")
      .trim();
  }

  function compactProduct(item) {
    const barcode =
      cleanBarcode(
        item.Barcode ||
        item.Code
      );

    if (
      Number(item.Id) <= 0 ||
      Number(item.ProductId) <= 0 ||
      item.isDeleted === true ||
      item.isActive !== true ||
      !barcode
    ) {
      return null;
    }

    return {
      id:
        Number(
          item.ProductId ||
          item.Id
        ),

      barcode,

      code:
        String(
          item.Code || ""
        ).trim(),

      masterCode:
        String(
          item.MasterCode || ""
        ).trim(),

      name:
        String(
          item.Name ||
          item.FullName ||
          ""
        ).trim(),

      category:
        String(
          item.CategoryName || ""
        ).trim(),

      categoryTree:
        String(
          item.CategoryNameTree ||
          ""
        ).trim(),

      salePrice:
        Number(
          item.BasePrice || 0
        ),

      costPrice:
        Number(
          item.Cost || 0
        ),

      latestPurchasePrice:
        Number(
          item.LatestPurchasePrice ||
          0
        ),

      imageUrl:
        pickImageUrl(item)
    };
  }

  // Anh dai dien: API KiotViet co the tra string, mang string hoac mang {Url}
  function pickImageUrl(item) {
    const pick = v => {
      if (!v) return "";
      if (typeof v === "string") return v.trim();
      if (Array.isArray(v)) {
        for (const e of v) {
          const r = pick(e);
          if (r) return r;
        }
        return "";
      }
      if (typeof v === "object") {
        return pick(
          v.Url ?? v.url ?? v.URL ?? v.ImageUrl ?? v.imageUrl ??
          v.Path ?? v.path ?? v.Src ?? v.src ?? ""
        );
      }
      return "";
    };

    const keys = [
      "images", "Images", "image", "Image", "picture", "Picture",
      "thumbnail", "Thumbnail", "avatar", "Avatar", "photo", "Photo"
    ];

    for (const k of keys) {
      const r = pick(item[k]);
      if (r) return r;
    }
    return "";
  }

  function setStatus(
    message,
    detail = ""
  ) {
    if (statusText) {
      statusText.textContent =
        message;
    }

    if (detailText) {
      detailText.textContent =
        detail;
    }
  }

  function updatePanel() {
    if (!panel) {
      return;
    }

    const hasToken =
      Boolean(
        getAuthorization()
      );

    const lastSync =
      Number(
        localStorage.getItem(
          STORAGE.lastSync
        ) || 0
      );

    if (!syncing) {
      statusText.textContent =
        hasToken
          ? "Sẵn sàng đồng bộ"
          : "Đang chờ token KiotViet";

      detailText.textContent =
        lastSync
          ? `Lần cuối: ${
              new Date(lastSync)
                .toLocaleString(
                  "vi-VN"
                )
            }`
          : "Chưa đồng bộ lần nào";
    }

    syncButton.disabled =
      syncing;
  }

  async function uploadCatalog(
    products,
    sourceSummary
  ) {
    const now =
      Date.now();

    const payload = {
      token:
        "6868-LABEL-2026",

      meta: {
        version:
          now,

        updatedAt:
          now,

        total:
          products.length,

        sourceTotal:
          Number(
            sourceSummary.Total ||
            sourceSummary.TotalProduct ||
            products.length
          ),

        branchId:
          CONFIG.branchId,

        retailer:
          CONFIG.retailer
      },

      products:
        Object.fromEntries(
          products.map(product => [
            product.barcode,
            product
          ])
        )
    };

    const firebaseURL =
      `${CONFIG.databaseURL}/` +
      `${CONFIG.firebasePath}.json`;

    await request(
      "PUT",
      firebaseURL,
      payload
    );

    return payload.meta;
  }

  const syncApi = path =>
    `${CONFIG.databaseURL}/${CONFIG.syncPath}/${path}.json`;

  async function setRemoteSyncStatus(
    requestId,
    status,
    message,
    extra = {}
  ) {
    await request(
      "PUT",
      syncApi("status"),
      {
        requestId,
        status,
        message,
        updatedAt:
          Date.now(),

        ...extra
      }
    );
  }

  async function syncAllProducts(
    remoteRequestId = ""
  ) {
    if (syncing) {
      return;
    }

    syncing = true;

    if (syncButton) {
      syncButton.disabled =
        true;
    }

    try {
      setStatus(
        "Đang chuẩn bị…",
        "Kiểm tra token đăng nhập"
      );

      if (remoteRequestId) {
        await setRemoteSyncStatus(
          remoteRequestId,
          "processing",
          "Script quản lý đã nhận yêu cầu."
        );
      }

      if (!getAuthorization()) {
        throw new Error(
          "Chưa thấy token đăng nhập. Hãy tải lại trang quản lý KiotViet rồi thử lại."
        );
      }

      const productsByBarcode =
        new Map();

      let page = 1;
      let skip = 0;
      let sourceSummary = {};
      let emptyPageCount = 0;

      while (true) {
        setStatus(
          `Đang tải trang ${page}…`,
          `Đã gom ${
            productsByBarcode.size
          } sản phẩm`
        );

        if (remoteRequestId) {
          await setRemoteSyncStatus(
            remoteRequestId,
            "processing",
            `Đang tải trang ${page} · đã gom ${productsByBarcode.size} sản phẩm`
          );
        }

        const response =
          await fetchProductPage(
            page,
            skip
          );

        sourceSummary =
          response || {};

        const rows =
          Array.isArray(
            response?.Data
          )
            ? response.Data
            : [];

        rows
          .map(compactProduct)
          .filter(Boolean)
          .forEach(product => {
            productsByBarcode.set(
              product.barcode,
              product
            );
          });

        setStatus(
          `Đã tải trang ${page}`,
          `API trả ${
            rows.length
          } dòng · giữ ${
            productsByBarcode.size
          } sản phẩm`
        );

        if (!rows.length) {
          emptyPageCount += 1;
        } else {
          emptyPageCount = 0;
        }

        const expectedTotal =
          Number(
            response?.Total ||
            response?.TotalProduct ||
            0
          );

        const reachedExpected =
          expectedTotal > 0 &&
          productsByBarcode.size >=
            expectedTotal;

        if (
          rows.length <
            CONFIG.pageSize ||
          reachedExpected ||
          emptyPageCount >= 2
        ) {
          break;
        }

        page += 1;

        skip +=
          CONFIG.pageSize;

        await sleep(
          CONFIG
            .pauseBetweenPagesMs
        );
      }

      const products =
        Array.from(
          productsByBarcode
            .values()
        );

      if (!products.length) {
        throw new Error(
          "Không lấy được sản phẩm hợp lệ nào."
        );
      }

      setStatus(
        "Đang gửi lên Firebase…",
        `${products.length} sản phẩm`
      );

      const meta =
        await uploadCatalog(
          products,
          sourceSummary
        );

      localStorage.setItem(
        STORAGE.lastSync,
        String(meta.updatedAt)
      );

      setStatus(
        "Đồng bộ thành công",
        `${meta.total} sản phẩm · ${
          new Date(
            meta.updatedAt
          ).toLocaleString(
            "vi-VN"
          )
        }`
      );

      if (remoteRequestId) {
        await setRemoteSyncStatus(
          remoteRequestId,
          "success",
          `Đã đồng bộ ${meta.total} sản phẩm.`,
          {
            total:
              meta.total,

            version:
              meta.version
          }
        );
      }

      GM_notification({
        title:
          "T-NGON đồng bộ sản phẩm",

        text:
          `Đã đồng bộ ${meta.total} sản phẩm.`,

        timeout:
          3000
      });
    } catch (error) {
      console.error(
        "[T-NGON Catalog]",
        error
      );

      setStatus(
        "Đồng bộ thất bại",
        error?.message ||
          String(error)
      );

      if (remoteRequestId) {
        await setRemoteSyncStatus(
          remoteRequestId,
          "error",
          error?.message ||
            String(error)
        ).catch(() => null);
      }
    } finally {
      syncing = false;

      if (syncButton) {
        syncButton.disabled =
          false;
      }
    }
  }

  function createPanel() {
    if (
      panel ||
      !document.body ||
      !document.head
    ) {
      return;
    }

    panel =
      document.createElement(
        "div"
      );

    panel.id =
      "tngonCatalogPanel";

    panel.innerHTML = `
      <div class="tngon-title">
        T-NGON Catalog
      </div>

      <div
        id="tngonCatalogStatus"
        class="tngon-status"
      >
        Đang khởi động…
      </div>

      <div
        id="tngonCatalogDetail"
        class="tngon-detail"
      >
        —
      </div>

      <button
        id="tngonCatalogSync"
        type="button"
      >
        Đồng bộ toàn bộ sản phẩm
      </button>
    `;

    const style =
      document.createElement(
        "style"
      );

    style.textContent = `
      #tngonCatalogPanel {
        position: fixed;
        z-index: 2147483647;
        right: 18px;
        bottom: 18px;
        width: 290px;
        padding: 14px;
        border: 1px solid rgba(0,0,0,.12);
        border-radius: 14px;
        background: #fff;
        box-shadow: 0 12px 40px rgba(0,0,0,.22);
        color: #18202a;
        font-family: Arial, sans-serif;
      }

      #tngonCatalogPanel .tngon-title {
        margin-bottom: 7px;
        font-size: 16px;
        font-weight: 800;
      }

      #tngonCatalogPanel .tngon-status {
        font-size: 14px;
        font-weight: 700;
      }

      #tngonCatalogPanel .tngon-detail {
        min-height: 34px;
        margin: 5px 0 11px;
        color: #667085;
        font-size: 12px;
        line-height: 1.4;
      }

      #tngonCatalogPanel button {
        width: 100%;
        min-height: 42px;
        border: 0;
        border-radius: 10px;
        background: #1677ff;
        color: #fff;
        font-size: 14px;
        font-weight: 800;
        cursor: pointer;
      }

      #tngonCatalogPanel button:disabled {
        opacity: .55;
        cursor: wait;
      }
    `;

    document.head.appendChild(
      style
    );

    document.body.appendChild(
      panel
    );

    statusText =
      panel.querySelector(
        "#tngonCatalogStatus"
      );

    detailText =
      panel.querySelector(
        "#tngonCatalogDetail"
      );

    syncButton =
      panel.querySelector(
        "#tngonCatalogSync"
      );

    syncButton.addEventListener(
      "click",
      () =>
        syncAllProducts()
    );

    updatePanel();
  }

  async function pollRemoteSyncRequest() {
    if (syncing) {
      return;
    }

    try {
      const remoteRequest =
        await request(
          "GET",
          syncApi("request")
        );

      if (
        !remoteRequest?.id ||
        remoteRequest.type !==
          "SYNC_CATALOG" ||
        remoteRequest.token !==
          "6868-LABEL-2026"
      ) {
        return;
      }

      const lastProcessed =
        localStorage.getItem(
          STORAGE.lastRemoteRequest
        ) || "";

      if (
        remoteRequest.id ===
        lastProcessed
      ) {
        return;
      }

      localStorage.setItem(
        STORAGE.lastRemoteRequest,
        remoteRequest.id
      );

      await syncAllProducts(
        remoteRequest.id
      );
    } catch (error) {
      console.warn(
        "[T-NGON Catalog] Remote poll:",
        error
      );
    }
  }

  injectNetworkHook();

  const initialToken =
    findStoredAuthorization();

  if (initialToken) {
    saveAuthorization(
      initialToken
    );
  }

  const readyTimer =
    setInterval(() => {
      if (
        document.body &&
        document.head
      ) {
        clearInterval(
          readyTimer
        );

        createPanel();
      }
    }, 100);

  setInterval(() => {
    const token =
      findStoredAuthorization();

    if (token) {
      saveAuthorization(token);
    }
  }, 2000);

  pollRemoteSyncRequest();

  setInterval(
    pollRemoteSyncRequest,
    2000
  );

  log(
    "Script đồng bộ catalog 2.0.0 đã khởi động."
  );
})();