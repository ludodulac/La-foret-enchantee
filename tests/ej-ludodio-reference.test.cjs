const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
test('URL Espace Jeunesse accessible depuis Ludodio sans dupliquer le MP3',()=>{
 const source=read('js/supabase.js');
 const context={window:{supabase:{createClient:()=>({})}}};
 vm.createContext(context);
 vm.runInContext(source,context);
 const id='11111111-1111-4111-8111-111111111111';
 assert.equal(vm.runInContext("getPublicUrl('audios','ej:"+id+"')",context),
  'https://espace-jeunesse-api.rondes.workers.dev/media/'+id);
 assert.equal(vm.runInContext("getPublicUrl('audios','ej:bad')",context).startsWith('https://espace-jeunesse-api'),false);
});
test('Sélecteur Ludodio distinct de la sonothèque Studio',()=>{
 const picker=read('js/ej-audio-picker.js'),editor=read('js/admin.js');
 assert.match(picker,/\/api\/ludodio\/catalog/);
 assert.match(editor,/espaceJeunesseId/);
 assert.match(editor,/if \(\/\^ej:/);
 assert.doesNotMatch(picker,/studio-sounds|localStorage|studio-autosave/);
});
