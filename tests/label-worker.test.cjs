'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../userscripts/tngon-label-worker.user.js'),'utf8');
const clone=x=>x===undefined?null:JSON.parse(JSON.stringify(x));
const backendVersions=new WeakMap();
function fixture(options={}) {
  const db=options.db||{queue:{},results:{},claims:{}};
  const storage=options.storage||new Map();
  if(!backendVersions.has(db))backendVersions.set(db,new Map());
  const versions=backendVersions.get(db);const calls=[];let prints=0, failFinal=options.failFinal||0;
  const read=p=>p.split('/').reduce((v,k)=>v?.[k],db)??null;
  const write=(p,v)=>{const keys=p.split('/');let at=db;for(const k of keys.slice(0,-1))at=at[k]??={};if(v===null)delete at[keys.at(-1)];else at[keys.at(-1)]=clone(v);versions.set(p,(versions.get(p)||0)+1);};
  const context={crypto:require('node:crypto').webcrypto, console:{warn(){},info(){},error(){}},
    location:{href:'https://example.test/man/'},navigator:{},
    localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},
    setTimeout:(fn,ms)=>setTimeout(fn,ms===15000?50:Math.min(ms,2)),clearTimeout,setInterval,
    GM_xmlhttpRequest:r=>queueMicrotask(()=>{
      const p=new URL(r.url).pathname.split('/').slice(3).join('/').replace(/\.json$/,'');
      calls.push([r.method,p]);
      if((options.failQueue&&p==='queue')||(options.failStatus&&p==='status'))return r.onerror();
      const body=r.data?JSON.parse(r.data):null;
      if(failFinal&&r.method==='PUT'&&p.startsWith('results/')&&body.status==='submitted') {failFinal--;return r.onerror();}
      if(r.method==='PUT'&&r.headers['if-match']!==undefined&&r.headers['if-match']!=='"'+(versions.get(p)||0)+'"')return r.onload({status:412,responseText:'null'});
      if(r.method==='PUT')write(p,body);if(r.method==='DELETE')write(p,null);
      r.onload({status:200,responseText:JSON.stringify(read(p)),responseHeaders:'ETag: "'+(versions.get(p)||0)+'"\r\n'});
    }),
    document:{createElement:()=>{
      const win={document:{fonts:{ready:Promise.resolve()}},focus(){},print(){prints++;if(options.printThrows)throw Error('print failed');if(!options.noAfterprint)this.onafterprint?.();}};
      return {style:{},contentWindow:win,remove(){}};
    },body:{appendChild:frame=>{if(!options.noLoad)queueMicrotask(()=>frame.onload?.());}}}
  };
  vm.createContext(context);
  const exposed=source.replace("  run().catch(error => console.error('[T-NGON worker]', error.message));",'  globalThis.worker={pollCommand, heartbeat, printLabel, get busy(){return busy},get halted(){return halted},config:CONFIG};');
  vm.runInContext(exposed,context);
  const command=(name='Test',createdAt=Date.now())=>({type:'PRINT_LABEL_DIRECT',token:context.worker.config.token,createdAt,product:{name,salePrice:100}});
  return {worker:context.worker,db,storage,calls,command,get prints(){return prints}};
}
test('20 FIFO queue jobs: one submission per UUID, durable separate results',async()=>{
  const f=fixture();for(let i=19;i>=0;i--)f.db.queue['job'+i]=f.command('P'+i,Date.now()-1000+i);
  for(let i=0;i<20;i++)await f.worker.pollCommand();
  assert.equal(f.prints,20);assert.equal(Object.keys(f.db.queue).length,0);assert.equal(Object.keys(f.db.results).length,20);
  assert.deepEqual(f.calls.filter(([m,p])=>m==='PUT'&&p.startsWith('claims/')).map(([,p])=>p),Array.from({length:20},(_,i)=>'claims/job'+i));
  assert.ok(Object.values(f.db.results).every(r=>r.status==='submitted'));
});
test('overlapping polls cannot take two jobs',async()=>{
  const f=fixture();f.db.queue.a=f.command();f.db.queue.b=f.command();await Promise.all([f.worker.pollCommand(),f.worker.pollCommand()]);assert.equal(f.prints,1);assert.equal(f.worker.busy,false);
});
test('network failure always releases busy; a later job still prints',async()=>{
  const opts={failQueue:true};const f=fixture(opts);f.db.queue.a=f.command();await f.worker.pollCommand();assert.equal(f.worker.busy,false);opts.failQueue=false;await f.worker.pollCommand();assert.equal(f.prints,1);
});
test('failed heartbeat cannot lock the print worker',async()=>{
  const f=fixture({failStatus:true});await assert.rejects(f.worker.heartbeat());f.db.queue.a=f.command();await f.worker.pollCommand();assert.equal(f.prints,1);assert.equal(f.worker.busy,false);
});
test('ACK failure then restart republishes final result without printing again',async()=>{
  const f=fixture({failFinal:1});f.db.queue.a=f.command();await f.worker.pollCommand();assert.equal(f.prints,1);assert.ok(f.db.queue.a);
  const restarted=fixture({db:f.db,storage:f.storage});await restarted.worker.pollCommand();assert.equal(restarted.prints,0);assert.equal(f.db.results.a.status,'submitted');assert.equal(f.db.queue.a,undefined);
});
test('restart after ambiguous print records needs_review without replay',async()=>{
  const f=fixture();f.db.queue.a=f.command();f.db.claims.a={workerId:'old',createdAt:Date.now()};f.storage.set('tngon_label_worker_v5_journal',JSON.stringify({a:{status:'processing'}}));await f.worker.pollCommand();assert.equal(f.prints,0);assert.equal(f.db.results.a.status,'needs_review');
});
test('two runtimes race the same UUID: loser leaves active ACK alone',async()=>{
  const a=fixture(),b=fixture({db:a.db});a.db.queue.a=a.command();await Promise.all([a.worker.pollCommand(),b.worker.pollCommand()]);assert.equal(a.prints+b.prints,1);assert.equal(a.db.results.a.status,'submitted');
});
test('completed UUID remains deduplicated if queue deletion must be repeated',async()=>{
  const f=fixture();f.db.queue.a=f.command();f.db.results.a={commandId:'a',status:'submitted'};await f.worker.pollCommand();assert.equal(f.prints,0);assert.equal(f.db.queue.a,undefined);
});
test('invalid command gets explicit error and does not block next job',async()=>{
  const f=fixture();f.db.queue.a=f.command('',Date.now()-100);f.db.queue.b=f.command();await f.worker.pollCommand();await f.worker.pollCommand();assert.equal(f.db.results.a.status,'error');assert.equal(f.prints,1);
});
test('missing afterprint still settles as submitted, never physical success',async()=>{
  const f=fixture({noAfterprint:true});f.db.queue.a=f.command();await f.worker.pollCommand();assert.equal(f.db.results.a.status,'submitted');assert.equal(f.worker.busy,false);
});
test('missing iframe load has bounded wait and releases busy',async()=>{
  const f=fixture({noLoad:true});f.db.queue.a=f.command();await f.worker.pollCommand();assert.equal(f.prints,0);assert.equal(f.db.results.a.status,'needs_review');assert.equal(f.worker.busy,false);
});
test('exception in async print callback does not strand worker and halts ambiguous printing',async()=>{
  const f=fixture({printThrows:true});f.db.queue.a=f.command();await f.worker.pollCommand();assert.equal(f.db.results.a.status,'needs_review');assert.equal(f.worker.busy,false);assert.equal(f.worker.halted,true);
});
