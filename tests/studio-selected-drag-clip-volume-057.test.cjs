'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const Autosave=require('../js/studio-autosave.js');
const html=fs.readFileSync('studio.html','utf8');
const cutAt=html.indexOf("$('#cut').onclick=()=>");
const volumeEnd=html.indexOf('// Silence reductions are virtual playback/export cuts:',cutAt);
assert(cutAt>0&&volumeEnd>cutAt);
const editSource=html.slice(cutAt,volumeEnd);
const baseClip={id:'piece-1',track:'voice',name:'Prise originale',sourceId:'source-1',start:1,trim:0,len:10,gain:0.7,muted:false};
const t={id:'voice',name:'Voix',type:'voice',gain:0.5,muted:false};
const clips=[baseClip],tracks=[t],undo=[],redo=[],liveClipGainNodes=new Map(),notifications=[];
let selected=baseClip,dirty=0,uuid=0;
const elements=Object.fromEntries(['cut','duplicate','del','clipmute','clipvol','clipvol-value'].map(name=>['#'+name,{value:70,textContent:'',classList:{toggle(){}}}]));
const ctx={console,Math,Number,tracks,clips,undo,redo,liveClipGainNodes,selected,cursor:4,
  crypto:{randomUUID:()=> 'piece-'+(++uuid+1)},snapshot:()=>({clips:ctx.clips.map(c=>({...c})),tracks:ctx.tracks.map(t=>({...t}))}),
  checkpoint(){undo.push(ctx.snapshot())},render(){ctx.renderCount=(ctx.renderCount||0)+1},
  buttons(){},markProjectDirty(){dirty++},msg:m=>notifications.push(m),
  deleteClipById(){},$:selector=>elements[selector]};
vm.createContext(ctx);
vm.runInContext(editSource,ctx);
assert(editSource.includes('right={...selected,id:crypto.randomUUID()')&&editSource.includes('StudioSilenceEditor.slice(original,rel,original.len)'),'Unedited and silence-processed splits preserve original metadata');
elements['#cut'].onclick();
assert.equal(clips.length,2);
assert.equal(clips[0].start,1);
assert.equal(clips[0].len,3);
assert.equal(clips[1].start,4);
assert.equal(clips[1].trim,3);
assert.equal(clips[1].len,7);
assert.equal(clips[0].gain,0.7);
assert.equal(clips[1].gain,0.7);
assert.equal(clips[0].sourceId,clips[1].sourceId);
assert.strictEqual(ctx.selected,clips[1]);
const afterCutCheckpoint=undo.length;
const right=clips[1],liveRight={gain:{value:0.35}};
liveClipGainNodes.set(right.id,liveRight);
const slider=elements['#clipvol'],volumeText=elements['#clipvol-value'];
slider.onpointerdown();
slider.oninput({target:{value:'30'}});
assert.equal(right.gain,.3);
assert.equal(clips[0].gain,.7,'Earlier part must retain original volume');
assert.equal(tracks[0].gain,.5,'Whole-track volume must not be affected');
assert(Math.abs(liveRight.gain.value-.15)<1e-10,'Current playing segment must change volume immediately');
assert.equal(volumeText.textContent,'30 %');
slider.onchange();
assert.equal(undo.length,afterCutCheckpoint+1,'Volume change adds exactly one undo step');
assert.equal(dirty,1,'Volume modification schedules local autosave');
const previous=undo.at(-1).clips.find(c=>c.id===right.id);
assert.equal(previous.gain,.7);
assert.equal(undo.at(-1).clips.find(c=>c.id===baseClip.id).gain,.7);
slider.onblur();
assert.equal(undo.length,afterCutCheckpoint+1,'Blur does not create double undo step');
ctx.selected=clips[0];
const leftLive={gain:{value:.35}};
liveClipGainNodes.set(clips[0].id,leftLive);
slider.oninput({target:{value:'120'}}); // Accessible keyboard/voice: no preceding pointerdown.
slider.onchange();
assert.equal(clips[0].gain,1.2);
assert.equal(clips[1].gain,.3,'Changing first part must not touch second part');
assert.equal(tracks[0].gain,.5);
assert(Math.abs(leftLive.gain.value-.6)<1e-10);
assert.equal(dirty,2);
const snapshot={schema:Autosave.SCHEMA_VERSION,name:'Prise découpée',cursor:4,zoom:1,selectionStart:null,selectionEnd:null,
  selectedRecordTrackId:'voice',tracks,clips};
(async()=>{
  const store=Autosave.createMemoryStore();
  await store.save(snapshot,[{id:'source-1',blob:new Blob(['voice'],{type:'audio/webm'})}]);
  const restored=await store.load();
  assert.deepEqual(restored.snapshot.clips.map(c=>c.gain),[1.2,.3]);
  assert.deepEqual(restored.snapshot.tracks.map(t=>t.gain),[.5]);
  assert.equal(restored.audio.size,1,'Two segments share one source audio without duplication');
  assert(html.includes('VOLUME CLIP'));
  assert(html.includes('id="clipvol-value"'));
  assert(html.includes("panOnly=e.pointerType==='touch'&&selected?.id!==c.id"));
  assert(html.includes('.clip.sel{touch-action:none}'));
  assert(!html.includes('id="move-clip"'));
  console.log('STUDIO_SELECTED_DRAG_AND_INDEPENDENT_POST_CUT_VOLUME_057 PASS');
})().catch(error=>{console.error(error);process.exitCode=1});
