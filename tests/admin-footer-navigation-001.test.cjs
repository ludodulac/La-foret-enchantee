'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.join(__dirname,'..'),read=file=>fs.readFileSync(path.join(root,file),'utf8');
const html=read('index.html'),js=read('js/admin-entry-footer.js'),css=read('css/admin-entry-footer.css');
const auth=read('js/auth.js'),admin=read('admin.html'),client=read('js/supabase.js');
function exactlyOnce(str,match){assert.equal(str.split(match).length-1,1,match)}
exactlyOnce(html,'id="forest-admin-entry"');
exactlyOnce(html,'id="forest-admin-code-form"');
assert(html.includes('js/admin-entry-footer.js?v=1'));
assert(css.includes('.forest-admin-gate[hidden]'));
assert(admin.includes('href="index.html" class="visit-link"'));
assert(auth.includes("dbClient.rpc('is_app_admin')"),'Authorization stays server-side');
assert(auth.includes("window.location.replace('index.html#administration')"),'No second login form');
assert(!js.includes("!== 'lfe'")&&!js.includes("!=='lfe'"),'PIN must not be checked in public JavaScript');
assert(client.includes('LUDODIO_API')&&!client.includes('SUPABASE_ANON_KEY'),'No Supabase key or runtime dependency');
new vm.Script(js,{filename:'admin-entry-footer.js'});
const elements=new Map(),events=[],submit={disabled:false,textContent:'Continuer',focus(){doc.activeElement=this}};
function el(id){
  const item={id,hidden:id==='forest-admin-gate'||id==='forest-admin-code-error',value:'',listeners:{},isConnected:true,
    addEventListener(name,fn){this.listeners[name]=fn},
    focus(){doc.activeElement=this},select(){this.selected=true},
    querySelector(selector){assert.equal(selector,'button[type=submit]');return submit}};
  elements.set(id,item);return item;
}
for(const id of ['forest-admin-entry','forest-admin-gate','forest-admin-code-form','forest-admin-code','forest-admin-code-error','forest-admin-cancel'])el(id);
const doc={activeElement:null,getElementById(id){return elements.get(id)||null}};
const win={location:{hash:'',assign(href){events.push(href)},pathname:'/Ludodio/index.html',search:''}};
const dbClient={
 auth:{async signInWithPassword({password}){return password==='test-code'?{error:null}:{error:new Error('Code incorrect')}},
 async signOut(){return {error:null}}},
 async rpc(name){assert.equal(name,'is_app_admin');return {data:true,error:null}}
};
vm.runInNewContext(js,{document:doc,window:win,dbClient,history:{replaceState(){}},console});
(async()=>{
 const open=elements.get('forest-admin-entry'),gate=elements.get('forest-admin-gate'),input=elements.get('forest-admin-code'),
 form=elements.get('forest-admin-code-form'),error=elements.get('forest-admin-code-error');
 open.listeners.click();assert.equal(gate.hidden,false);assert.equal(doc.activeElement,input);
 input.value='wrong';
 await form.listeners.submit({preventDefault(){}});
 assert.equal(error.hidden,false);assert.deepEqual(events,[]);
 input.value='test-code';
 await form.listeners.submit({preventDefault(){}});
 assert.deepEqual(events,['admin.html']);
 elements.get('forest-admin-cancel').listeners.click();assert.equal(gate.hidden,true);
 console.log('LUDODIO — one PIN-only form with server-side verification and single admin navigation PASS');
})().catch(error=>{console.error(error);process.exitCode=1});
