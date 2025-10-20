// assets/js/blackout.js v3
// Đồng bộ màn đen theo:
// - control/screen (toàn quán)
// - control/tables/<tableId>/screen (bàn hiện tại của iPad)
// Tự theo dõi khi iPad đổi bàn thủ công (localStorage) & khi admin setTable (event custom).

(function(){
  'use strict';

  // Yêu cầu DOM có #screen-overlay
  const overlay = document.getElementById('screen-overlay');
  if (!overlay) {
    console.warn('[blackout] Thiếu #screen-overlay trong HTML.');
    return;
  }

  // Yêu cầu Firebase đã init + auth ẩn danh (firebase.js/device-bind.js làm trước)
  if (!window.firebase || !firebase.apps?.length) {
    console.warn('[blackout] Firebase chưa sẵn sàng.');
    return;
  }
  const db = firebase.database();

  // ---- State ----
  let globalState = 'on';      // 'on' | 'off'
  let tableState  = 'on';      // 'on' | 'off' (bàn hiện tại)
  let currentTable = null;     // tableId string | null
  let unSubGlobal = null;
  let unSubTable  = null;

  // Quy tắc: tắt màn khi (global == 'off') || (table == 'off')
  function applyOverlay(){
    const shouldOff = (globalState === 'off') || (tableState === 'off');
    overlay.style.display = shouldOff ? 'block' : 'none';
  }

  // ---- Subscribe global ----
  function subGlobal(){
    const ref = db.ref('control/screen');
    const onVal = (snap)=>{
      const v = (snap.exists()? String(snap.val()) : 'on').toLowerCase();
      globalState = (v === 'off') ? 'off' : 'on';
      applyOverlay();
    };
    const onErr = (e)=> console.warn('[blackout] global subscribe error:', e?.message||e);
    ref.on('value', onVal, onErr);
    unSubGlobal = ()=> ref.off('value', onVal);
  }

  // ---- Subscribe table (theo bàn hiện tại) ----
  function subTable(tableId){
    // Hủy sub cũ
    if (unSubTable) { try{ unSubTable(); }catch(_){} unSubTable = null; }
    currentTable = tableId || null;

    // Nếu chưa chọn bàn (đang ở màn chọn) → chỉ theo global
    if (!currentTable) {
      tableState = 'on';
      applyOverlay();
      return;
    }

    const ref = db.ref(`control/tables/${currentTable}/screen`);
    const onVal = (snap)=>{
      const v = (snap.exists()? String(snap.val()) : 'on').toLowerCase();
      tableState = (v === 'off') ? 'off' : 'on';
      applyOverlay();
    };
    const onErr = (e)=> console.warn('[blackout] table subscribe error:', e?.message||e);
    ref.on('value', onVal, onErr);
    unSubTable = ()=> ref.off('value', onVal);
  }

  // ---- Detect hiện tại iPad đang ở bàn nào ----
  function getLocalTable(){
    // redirect-core.js set window.tableId + localStorage.tableId
    const fromWin = (typeof window.tableId === 'string' && window.tableId) ? window.tableId : null;
    const fromLS  = localStorage.getItem('tableId') || null;
    return fromWin || fromLS || null;
  }

  // Theo dõi thay đổi bàn:
  // - Admin setTable: device-bind.js đã bắn event 'tngon:tableChanged'
  // - Thủ công trên iPad: localStorage.setItem(...) trong cùng tab KHÔNG bắn 'storage',
  //   nên dùng polling nhẹ để phát hiện thay đổi.
  let lastTable = null;
  function refreshTableSub(force=false){
    const t = getLocalTable();
    if (force || t !== lastTable) {
      lastTable = t;
      subTable(t);
    }
  }

  // Poll mỗi 800ms để bắt case đổi bàn thủ công
  const POLL_MS = 800;
  setInterval(()=> refreshTableSub(false), POLL_MS);

  // Lắng sự kiện custom khi admin đổi bàn (đã có trong device-bind.js mới):
  window.addEventListener('tngon:tableChanged', (e)=>{
    // e.detail = { table, url }
    refreshTableSub(true);
  });

  // Khi chuyển stage (select/start/pos) vẫn giữ bàn → overlay logic không đổi,
  // nhưng nếu về select (xoá bàn) thì tableState=on (chỉ theo global).
  window.addEventListener('tngon:stageChanged', ()=>{
    refreshTableSub(true);
  });

  // ---- Boot ----
  (async function boot(){
    // Global luôn subscribe
    subGlobal();
    // Bàn hiện tại
    refreshTableSub(true);
    // Áp trạng thái ban đầu
    applyOverlay();
    console.log('[blackout] ready. table =', currentTable);
  })();

})();
