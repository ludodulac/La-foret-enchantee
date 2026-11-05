'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.join(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const html=read('index.html');
const js=read('js/admin-entry-footer.js');
const css=read('css/admin-entry-footer.css');
const auth=read('js/auth.js');
const admin=read('admin.html');
const requireOnce=(source,snippet,label)=>assert.equal(source.split(snippet).length-1,1,label);
requireOnce(html,'id="forest-admin-entry"','one public footer entry');
requireOnce(html,'id="forest-admin-gate"','one access dialog');
requireOnce(html,'id="forest-admin-code-form"','one code form');
assert(html.indexOf('id="main-content"')<html.indexOf('class="forest-public-footer"'),'footer must follow public library content');
assert(html.includes('js/admin-entry-footer.js?v=1'),'entry script must load');
assert(html.includes('css/admin-entry-footer.css?v=1'),'entry CSS must load');
assert(!html.includes('<a class="sidebar-link" href="login.html">Administration</a>'),'no duplicate old sidebar entry');
assert(css.includes('.forest-admin-gate[hidden]'),'dialog hidden by default even with CSS display');
assert(admin.includes('href="index.html" class="visit-link"'),'admin must link back to the public site');
assert(auth.includes("dbClient.rpc('is_app_admin')"),'real admin authorization must remain');
assert(auth.includes("window.location.href = 'login.html?next=admin.html'"),'unauthenticated visitors still require credentials');
new vm.Script(js,{filename:'admin-entry-footer.js'});
const els=new Map();
function make(id){
  const el={id,hidden:id==='forest-admin-gate'||id==='forest-admin-code-error',value:'',isConnected:true,listeners:{},
    addEventListener(event,fn){this.listeners[event]=fn},
    focus(){doc.activeElement=this},
    select(){this.selected=true},
    querySelector(selector){assert.equal(selector,'button[type=submit]');return submit}};
  els.set(id,el);return el;
}
const submit=make('submit');
const ids=['forest-admin-entry','forest-admin-gate','forest-admin-code-form','forest-admin-code','forest-admin-code-error','forest-admin-cancel'];
for(const id of ids)make(id);
const doc={activeElement:null,getElementById(id){return els.get(id)}};
const history=[];const win={location:{assign(url){history.push(url)}}};
vm.runInNewContext(js,{document:doc,window:win});
const open=els.get('forest-admin-entry'),gate=els.get('forest-admin-gate'),input=els.get('forest-admin-code'),error=els.get('forest-admin-code-error'),form=els.get('forest-admin-code-form'),cancel=els.get('forest-admin-cancel');
doc.activeElement=open;
open.listeners.click();
assert.equal(gate.hidden,false,'dialog opens');
assert.equal(doc.activeElement,input,'code input focused');
input.value='wrong';
form.listeners.submit({preventDefault(){}});
assert.equal(error.hidden,false,'wrong code rejected');
assert.equal(history.length,0,'wrong code never navigates');
input.value=' LFE ';
form.listeners.submit({preventDefault(){}});
assert.equal(history[0],'admin.html','right code navigates to protected admin');
cancel.listeners.click();
assert.equal(gate.hidden,true,'cancel closes dialog');
assert.equal(doc.activeElement,open,'focus restored');
open.listeners.click();
gate.listeners.keydown({key:'Escape',preventDefault(){}});
assert.equal(gate.hidden,true,'escape closes dialog');
console.log('FOREST ADMIN FOOTER GATE — navigation and protected Supabase auth retained PASS');
