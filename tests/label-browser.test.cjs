'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require('playwright');
test('real browser: web -> Firebase fixture -> worker -> print API, with second tab excluded', {timeout:60000},async()=>{
  const browser=await chromium.launch({headless:true});
  try {
    const context=await browser.newContext();
    const db={queue:{},claims:{},results:{},catalog:{meta:{version:'test',updatedAt:Date.now()},products:{'1234567890123':{name:'Browser test label',barcode:'1234567890123',salePrice:123}}}};
    const versions=new Map();let printCalls=0;
    const read=p=>p.split('/').reduce((v,k)=>v?.[k],db)??null;
    await context.route('**/*',async route=>{
      const req=route.request(),url=new URL(req.url());
      if(url.hostname==='labels.test')return route.fulfill({contentType:'text/html',body:fs.readFileSync(path.join(__dirname,'../intemkiot.html'),'utf8')});
      if(url.hostname==='tngon.kiotviet.vn')return route.fulfill({contentType:'text/html',body:'<!doctype html><html><body>Mock POS page for isolated test</body></html>'});
      if(!url.hostname.endsWith('firebasedatabase.app'))return route.abort();
      const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'GET, PUT, DELETE, OPTIONS','Access-Control-Expose-Headers':'etag'};
      if(req.method()==='OPTIONS')return route.fulfill({status:204,headers});
      const p=url.pathname.split('/').slice(3).join('/').replace(/\.json$/,'');
      const version=versions.get(p)||0;
      if(req.headers()['if-match']&&req.headers()['if-match']!=='"'+version+'"')return route.fulfill({status:412,headers,body:'null'});
      if(['PUT','DELETE'].includes(req.method())) {
        const keys=p.split('/');let at=db;for(const k of keys.slice(0,-1))at=at[k]??={};
        if(req.method()==='DELETE')delete at[keys.at(-1)];else at[keys.at(-1)]=req.postDataJSON();
        versions.set(p,version+1);
      }
      await route.fulfill({status:200,headers:{...headers,etag:'"'+(versions.get(p)||0)+'"'},contentType:'application/json',body:JSON.stringify(read(p))});
    });
    await context.exposeBinding('countPrint',()=>{printCalls++;});
    // Installed in every new document including srcdoc iframe. No Windows printer is used.
    await context.addInitScript(()=>{window.print=()=>{window.countPrint();window.dispatchEvent(new Event('afterprint'));};});
    const workerSource=fs.readFileSync(path.join(__dirname,'../userscripts/tngon-label-worker.user.js'),'utf8');
    const startWorker=async()=>{
      const p=await context.newPage();await p.goto('https://tngon.kiotviet.vn/man/test');
      await p.evaluate(()=>{window.GM_xmlhttpRequest=r=>{fetch(r.url,{method:r.method,headers:r.headers,body:r.data}).then(async response=>r.onload({status:response.status,responseText:await response.text(),responseHeaders:'ETag: '+response.headers.get('etag')+'\r\n'})).catch(()=>r.onerror());};});
      await p.addScriptTag({content:workerSource});return p;
    };
    await startWorker();await startWorker();
    const app=await context.newPage();const errors=[];app.on('pageerror',e=>errors.push(e.message));
    await app.goto('https://labels.test/intemkiot.html');
    await app.waitForFunction(()=>document.querySelector('#catalogBadge').textContent==='Sẵn sàng');
    await app.waitForFunction(()=>document.querySelector('#onlineBadge').textContent==='Online');
    for(let i=0;i<5;i++) {
      await app.locator('#barcode').fill('1234567890123');
      await app.locator('#checkBtn').click();
      await app.locator('[data-print-id]').first().click();
      await app.waitForFunction(n=>document.querySelectorAll('.scan-item-status.success').length===n,i+1);
    }
    assert.equal(Object.keys(db.results).length,5);
    assert.equal(printCalls,5);assert.equal(Object.keys(db.queue).length,0);
    assert.ok(Object.values(db.results).every(r=>r.status==='submitted'));
    assert.deepEqual(errors,[]);
    console.log('Browser evidence: 5 UI jobs, 5 unique UUID results, 5 print API calls, 0 pending, 0 page errors, 2 worker tabs. Physical printer not exercised.');
  } finally {await browser.close();}
});
