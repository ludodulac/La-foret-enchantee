'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.join(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const admin=read('admin.html'),auth=read('js/auth.js'),story=read('js/admin-story-flow.js'),main=read('index.html'),css=read('css/admin-inline-taxonomy.css'),script=read('js/admin-inline-taxonomy.js');
assert(!admin.includes('Tableau de bord'),'Dashboard removed');
assert(!admin.includes('Gérer la forêt'),'Dashboard headline removed');
assert(!admin.includes('stat-row'),'Stat cards removed');
assert(!admin.includes('stat-audios'),'Stat scripts removed');
assert(!auth.includes('wrap.prepend(intro)'),'Auth bootstrap must not recreate dashboard');
assert(!story.includes('story-suggestion-select'),'Suggested story chooser removed');
assert(!story.includes('STORY_SUGGESTIONS'),'Suggested story catalogue removed');
assert(story.includes('enhanceCoverEditors'),'Cover editor functionality retained');
assert(admin.includes('<label for="audio-title-in">Titre</label>')&&admin.includes('id="audio-title-in" required'),'Free title input');
assert(!admin.includes('Ex : Le Petit Chaperon Rouge'),'No suggested title');
for(const id of ['audio-cat','audio-sub','edit-audio-cat','edit-audio-sub']){
 for(const suffix of ['-create','-new','-message'])assert(admin.includes('id="'+id+suffix+'"'),id+suffix+' missing');
 for(const action of ['toggle','save','cancel'])assert(admin.includes('data-taxonomy-'+action+'="'+id+'"'),id+' '+action+' missing');
}
assert(admin.includes('js/admin.js')&&auth.includes('js/admin-inline-taxonomy.js'),'Inline category script loaded');
assert(admin.includes('css/admin-inline-taxonomy.css'),'Inline category styles loaded');
assert(css.includes('.taxonomy-create[hidden]'),'Closed taxonomy controls hidden');
assert(auth.includes("dbClient.rpc('is_app_admin')")||read('js/auth.js').includes("dbClient.rpc('is_app_admin')"),'Admin auth retained');
for(const file of ['index.html','admin.html','login.html','studio.html','audio.html','blog.html','article.html','js/app.js','js/audio.js','js/blog.js','js/child-shell.js']){
 const source=read(file);
 assert(!source.includes('La Forêt Enchantée'),file+' old name persists');
 assert(source.includes('Katpist Audio'),file+' new brand missing');
}
assert(main.includes('forest-admin-entry'),'Footer administration entry retained');
assert(read('js/admin-entry-footer.js').includes("'lfe'"),'Existing LFE navigation code retained');
new vm.Script(script,{filename:'admin-inline-taxonomy.js'});
function element(id){return {id,value:'',hidden:id.endsWith('-create'),disabled:false,listeners:{},addEventListener(k,fn){this.listeners[k]=fn},focus(){this.focused=true},removeAttribute(k){if(k==='disabled')this.disabled=false},querySelector(sel){if(sel==='button[data-taxonomy-save]')return elements.get(id.replace(/-create$/,'')+'-savebutton');throw Error('Unexpected selector '+sel)}}}
const elements=new Map();
for(const id of ['audio-cat','audio-sub','edit-audio-cat','edit-audio-sub']){
 for(const suffix of ['', '-create','-new','-message','-savebutton'])elements.set(id+suffix,element(id+suffix));
 for(const a of ['toggle','save','cancel'])elements.set(a+id,element(a+id));
}
for(const form of ['form-add-audio','form-edit-audio'])elements.set(form,element(form));
let categories=[],subcategories=[],writes=[],toasts=[],refreshes=0,rendered=0;
const dbClient={from(table){return{insert(values){return{select(){return{async single(){const id='new-'+(writes.length+1);writes.push({table,values,id});if(table==='categories')categories.push({id,name:values.name});else subcategories.push({id,name:values.name,category_id:values.category_id});return{data:{id},error:null}}}}}}}}};
const doc={readyState:'complete',getElementById(id){return elements.get(id)||null},querySelector(q){const match=q.match(/^\[data-taxonomy-(toggle|save|cancel)="([^"]+)"\]$/);return match?elements.get(match[1]+match[2]):null}};
const context={document:doc,dbClient,categories,subcategories,refreshData:async()=>{refreshes++},renderAll:()=>{rendered++},updateSubSelect:(id,cat)=>{elements.get(id).categoryId=cat},showNotif:msg=>{toasts.push(msg)},console};
vm.runInNewContext(script,context);
(async()=>{
 const toggle=elements.get('toggleaudio-cat'),add=elements.get('saveaudio-cat');
 toggle.listeners.click();
 assert.equal(elements.get('audio-cat-create').hidden,false);
 elements.get('audio-cat-new').value='Histoires imaginaires';
 await add.listeners.click();
 assert.equal(writes[0].table,'categories');
 assert.equal(elements.get('audio-cat').value,'new-1','created category selected');
 assert.equal(elements.get('audio-cat-create').hidden,true);
 elements.get('toggleaudio-sub').listeners.click();
 assert.equal(elements.get('audio-sub-create').hidden,false);
 elements.get('audio-sub-new').value='Contes';
 await elements.get('saveaudio-sub').listeners.click();
 assert.equal(writes[1].table,'subcategories');
 assert.equal(writes[1].values.category_id,'new-1');
 assert.equal(elements.get('audio-sub').value,'new-2');
 assert.equal(refreshes,2);assert.equal(rendered,2);
 elements.get('toggleedit-audio-sub').listeners.click();
 assert.equal(elements.get('edit-audio-sub-create').hidden,true,'Cannot create subcategory without parent');
 elements.get('toggleaudio-cat').listeners.click();
 elements.get('audio-cat-new').value='Histoires imaginaires';
 await add.listeners.click();
 assert.equal(writes.length,2,'duplicate category reused, not written twice');
 assert(toasts.length>=3,'Feedback after saves');
 console.log('KATPIST AUDIO — branding, simple admin, inline categories and secure access PASS');
})().catch(e=>{console.error(e);process.exitCode=1});
