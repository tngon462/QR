'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require('playwright');

// Expose closure state only in the served fixture to inspect the actual Error.
const html=fs.readFileSync(path.join(__dirname,'../intemkiot.html'),'utf8')
  .replace('      const cached =', `      window.httpFixture = {
        request: firebaseRequest,
        items: () => scannedItems
      };
      const cached =`);
const headers={
  'Access-Control-Allow-Origin':'*',
  'Access-Control-Allow-Headers':'*',
  'Access-Control-Allow-Methods':'GET, PUT, OPTIONS'
};

for(const fixture of [
  {name:'A: permission denied stops the queue',status:401,body:'{"error":"Permission denied"}',code:'FIREBASE_PERMISSION_DENIED',blocked:true},
  {name:'B: HTTP 500 is a Firebase failure',status:500,body:'upstream unavailable',code:'FIREBASE_HTTP_ERROR'},
  {name:'C: aborted fetch is a network failure',abort:true,code:'FIREBASE_NETWORK_ERROR'},
  {name:'403 permission denied',status:403,body:'{"error":"Permission denied"}',code:'FIREBASE_PERMISSION_DENIED',blocked:true},
  {name:'invalid authentication',status:401,body:'{"error":"Auth token is expired"}',code:'FIREBASE_AUTH_INVALID',blocked:true}
]) {
  test(fixture.name,{timeout:60000},async()=>{
    const browser=await chromium.launch({headless:true});
    try {
      const context=await browser.newContext({serviceWorkers:'block'});
      let printCalls=0,queuePuts=0;
      await context.exposeBinding('countPrint',()=>{printCalls++;});
      await context.addInitScript(()=>{
        window.print=()=>window.countPrint();
      });
      await context.route('**/*',async route=>{
        const req=route.request(),url=new URL(req.url());
        if(url.hostname==='labels.test')return route.fulfill({contentType:'text/html',body:html});
        if(url.hostname!=='tngon-b37d6-default-rtdb.asia-southeast1.firebasedatabase.app')return route.abort();
        if(req.method()==='OPTIONS')return route.fulfill({status:204,headers});
        if(req.method()==='PUT'&&url.pathname.includes('/queue/')) {
          queuePuts++;
          if(fixture.abort)return route.abort('failed');
          return route.fulfill({status:fixture.status,headers,body:fixture.body});
        }
        let body;
        if(url.pathname.endsWith('/status.json'))body={online:true,lastSeen:Date.now(),queueProtocol:2};
        else if(url.pathname.endsWith('/catalog/meta.json'))body={version:'test',updatedAt:Date.now()};
        else if(url.pathname.endsWith('/catalog/products.json'))body={'1234567890123':{name:'HTTP fixture label',barcode:'1234567890123',salePrice:123}};
        else if(url.pathname.includes('/probe/'))body=null;
        else return route.abort();
        return route.fulfill({status:200,headers,contentType:'application/json',body:JSON.stringify(body)});
      });
      const app=await context.newPage();
      const pageErrors=[];
      app.on('pageerror',error=>pageErrors.push(error.message));
      await app.goto('https://labels.test/intemkiot.html');
      await app.waitForFunction(()=>document.querySelector('#catalogBadge').textContent==='Sẵn sàng');
      await app.waitForFunction(()=>document.querySelector('#onlineBadge').textContent==='Online');
      for(let i=0;i<2;i++) {
        await app.locator('#barcode').fill('1234567890123');
        await app.locator('#checkBtn').click();
      }
      await app.evaluate(()=>{
        const ids=[...document.querySelectorAll('[data-print-id]')].map(button=>button.dataset.printId);
        for(const id of ids)document.querySelector(`[data-print-id="${id}"]`).click();
      });
      await app.waitForFunction(()=>window.httpFixture.items().every(item=>item.printError));
      const items=await app.evaluate(()=>window.httpFixture.items().map(item=>({
        status:item.status,message:item.message,error:{
          code:item.printError.code,status:item.printError.status,
          method:item.printError.method,path:item.printError.path,
          firebaseMessage:item.printError.firebaseMessage,
          isAuthProblem:item.printError.isAuthProblem
        }
      })));
      for(const item of items) {
        assert.equal(item.error.code,fixture.code);
        assert.equal(item.error.method,'PUT');
        assert.equal(item.error.status,fixture.status||0);
        assert.equal(item.error.isAuthProblem,!!fixture.blocked);
        assert.equal(item.status,fixture.blocked?'blocked':'unknown');
        assert.match(item.message,/Firebase/);
        if(!fixture.blocked)assert.doesNotMatch(item.message,/máy in|Windows queue|Kiểm tra tem/);
      }
      assert.equal(queuePuts,fixture.blocked?1:2);
      assert.equal(await app.locator('[data-print-id]:disabled').count(),2);
      if(fixture.code==='FIREBASE_PERMISSION_DENIED') {
        assert.equal(items[0].error.firebaseMessage,'Permission denied');
        assert.match(await app.locator('#scanList').textContent(),/không phải lỗi máy in/);
        assert.equal(await app.locator('.scan-item-status.blocked').count(),2);
      }
      const log=await app.evaluate(()=>window.__tnHttpLog());
      assert.ok(log.some(entry=>entry.method==='GET'&&entry.status===200));
      assert.ok(log.some(entry=>entry.method==='PUT'&&entry.status===(fixture.status||0)&&entry.code===fixture.code));
      assert.match(await app.locator('#logBox').textContent(),new RegExp(fixture.code));
      assert.equal(printCalls,0);
      assert.deepEqual(pageErrors,[]);

      // Query strings, credentials in paths, and returned snapshots cannot leak.
      await app.evaluate(async()=>{
        const base='https://tngon-b37d6-default-rtdb.asia-southeast1.firebasedatabase.app/labelPrinter/tngon_label_pc/probe/';
        await window.httpFixture.request(base+'6868-LABEL-2026.json?auth=secret');
        await window.httpFixture.request(base+'abcdefghijklmnopqrstuvwxyz0123456789.json?auth=secret');
      });
      const redacted=await app.evaluate(()=>window.__tnHttpLog());
      assert.ok(redacted.some(entry=>entry.path.includes('[redacted].json')));
      assert.doesNotMatch(JSON.stringify(redacted),/6868-LABEL-2026|abcdefghijklmnopqrstuvwxyz0123456789|auth=|\?/);
      assert.ok(redacted.every(entry=>/^https:\/\/[^/]+\//.test(entry.path)));
      assert.ok(redacted.every(entry=>Number.isFinite(entry.ms)));
      const unchanged=await app.evaluate(()=>{
        const snapshot=window.__tnHttpLog();
        snapshot[0].path='changed';snapshot.length=0;
        return window.__tnHttpLog()[0].path!=='changed';
      });
      assert.equal(unchanged,true);
      await app.evaluate(async()=>{
        for(let i=0;i<55;i++)await window.httpFixture.request(
          'https://tngon-b37d6-default-rtdb.asia-southeast1.firebasedatabase.app/labelPrinter/tngon_label_pc/probe/'+i+'.json'
        );
      });
      assert.equal(await app.evaluate(()=>window.__tnHttpLog().length),50);
    } finally {await browser.close();}
  });
}
