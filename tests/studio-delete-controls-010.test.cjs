const assert=require('node:assert/strict');
const fs=require('fs');
const vm=require('node:vm');
const A=require('../js/studio-autosave.js');

const html=fs.readFileSync('studio.html','utf8');
function section(start,end){const a=html.indexOf(start),b=html.indexOf(end,a);assert(a>=0,'missing '+start);assert(b>a,'missing '+end);return html.slice(a,b)}
const stateFns=section('function projectDuration()','function syncStudioViewport');
const clipDeleteHandler=section("$('#del').onclick","$('#clipmute').onclick");
const renderSource=section('function render(){','function dragLaneAt');

assert(html.includes('id="del" title="Supprimer"'));
assert(clipDeleteHandler.includes("deleteClipById(selected.id)"));
console.log('CLIP_DELETE_UI_ACCESS PASS selected clip context exposes SUPPRIMER');

function makeClassList(){const s=new Set();return{add:x=>s.add(x),remove:x=>s.delete(x),toggle(x,on){on?s.add(x):s.delete(x)},contains:x=>s.has(x)}}
function makeHarness({tracks,clips,armed,selectedId=null,confirmResult=true,sources=[]}){
  const undo=[],redo=[];
  const editor={classList:makeClassList()};
  const controls=[];
  const localSources=new Map(sources.map(x=>[x.id,x]));
  const ctx={
    console,Math,
    window:{confirm:()=>confirmResult},
    tracks:tracks.map(x=>({...x})),
    clips:clips.map(x=>({...x})),
    selectedRecordTrackId:armed,
    selected:selectedId?clips.map(x=>({...x})).find(x=>x.id===selectedId)||null:null,
    undo,redo,
    liveDuration:0,
    localSources,
    renderCount:0,dirtyCount:0,msgs:[],
    document:{querySelectorAll:sel=>sel==='.track-control'?controls:[]},
    $:sel=>sel==='#editor'?editor:sel==='#undo'||sel==='#redo'||sel==='#cut'||sel==='#duplicate'||sel==='#clipmute'||sel==='#del'||sel==='#clipvol'?{disabled:false}:sel==='#clip-context-name'?{textContent:''}:editor,
    render(){this.renderCount++},
    markProjectDirty(){this.dirtyCount++},
    msg(x){this.msgs.push(x)}
  };
  vm.createContext(ctx);
  vm.runInContext(stateFns,ctx);
  return ctx;
}

const T1={id:'voice',name:'VOIX 1',type:'voice',gain:1,muted:false,color:'#785cff'};
const T2={id:'sound2',name:'SON 2',type:'sound',gain:.7,muted:false,color:'#18a77b'};
const T3={id:'sound3',name:'SON 3',type:'sound',gain:.9,muted:true,color:'#e09b32'};
const recorded={id:'rec1',track:'voice',name:'Voix',sourceId:'src-rec',start:0,trim:0,len:1.2,gain:1,muted:false};
const imported={id:'imp1',track:'sound2',name:'porte.mp3',sourceId:'src-imp',start:2,trim:.1,len:.8,gain:.8,muted:false};
const duplicated={id:'dup1',track:'sound2',name:'porte.mp3',sourceId:'src-imp',start:3,trim:.1,len:.8,gain:.8,muted:false};

for(const [label,clip] of [['DELETE_RECORDED_CLIP',recorded],['DELETE_IMPORTED_CLIP',imported],['DELETE_DUPLICATED_CLIP',duplicated]]){
  const ctx=makeHarness({tracks:[T1,T2],clips:[recorded,imported,duplicated],armed:'voice',selectedId:clip.id,sources:[{id:'src-rec'},{id:'src-imp'}]});
  assert.equal(ctx.deleteClipById(clip.id),true);
  assert(!ctx.clips.some(c=>c.id===clip.id));
  assert.equal(ctx.undo.length,1);
  console.log(label+' PASS');
}

{
  const ctx=makeHarness({tracks:[T1,T2],clips:[recorded,imported,duplicated],armed:'voice',selectedId:'imp1',sources:[{id:'src-rec'},{id:'src-imp'}]});
  const before=JSON.parse(JSON.stringify({tracks:ctx.tracks,clips:ctx.clips,selectedRecordTrackId:ctx.selectedRecordTrackId}));
  ctx.deleteClipById('imp1');
  assert.equal(ctx.clips.length,2);
  ctx.restore(ctx.undo.pop());
  assert.deepEqual(JSON.parse(JSON.stringify(ctx.tracks)),before.tracks);
  assert.deepEqual(JSON.parse(JSON.stringify(ctx.clips)),before.clips);
  assert.equal(ctx.selectedRecordTrackId,before.selectedRecordTrackId);
  console.log('DELETE_CLIP_UNDO PASS');
}

{
  const ctx=makeHarness({tracks:[T1,T2],clips:[imported,duplicated],armed:'voice',selectedId:'imp1',sources:[{id:'src-imp',blob:{tag:'immutable'}}]});
  const sourceBefore=ctx.localSources.get('src-imp');
  ctx.deleteClipById('imp1');
  assert.equal(ctx.clips.length,1);
  assert.equal(ctx.clips[0].sourceId,'src-imp');
  assert.strictEqual(ctx.localSources.get('src-imp'),sourceBefore);
  console.log('SHARED_SOURCE_SURVIVES_CLIP_DELETE PASS same source object retained for duplicate');
}

{
  const ctx=makeHarness({tracks:[T1,T2],clips:[recorded],armed:'voice'});
  assert.equal(ctx.deleteTrackById('sound2',()=>{throw Error('confirmation should not run for empty track')}),true);
  assert.deepEqual(ctx.tracks.map(t=>t.id),['voice']);
  assert.equal(ctx.clips.length,1);
  console.log('DELETE_EMPTY_TRACK PASS');
}

{
  let prompt='';
  const ctx=makeHarness({tracks:[T1,T2,T3],clips:[recorded,imported,duplicated],armed:'voice'});
  assert.equal(ctx.deleteTrackById('sound2',msg=>{prompt=msg;return true}),true);
  assert(prompt.includes('2 morceaux'));
  assert(!ctx.tracks.some(t=>t.id==='sound2'));
  assert(!ctx.clips.some(c=>c.track==='sound2'));
  console.log('DELETE_TRACK_WITH_CLIPS_CONFIRM PASS prompt="'+prompt+'"');
}

{
  let prompt='';
  const ctx=makeHarness({tracks:[T1,T2],clips:[recorded,imported],armed:'voice'});
  const before=JSON.parse(JSON.stringify({tracks:ctx.tracks,clips:ctx.clips}));
  assert.equal(ctx.deleteTrackById('sound2',msg=>{prompt=msg;return false}),false);
  assert(prompt.includes('1 morceau'));
  assert.deepEqual(JSON.parse(JSON.stringify(ctx.tracks)),before.tracks);
  assert.deepEqual(JSON.parse(JSON.stringify(ctx.clips)),before.clips);
  assert.equal(ctx.undo.length,0);
  console.log('DELETE_TRACK_WITH_CLIPS_CANCEL PASS');
}

{
  const ctx=makeHarness({tracks:[T1,T2,T3],clips:[recorded,imported,duplicated],armed:'sound2'});
  const before=JSON.parse(JSON.stringify({tracks:ctx.tracks,clips:ctx.clips,selectedRecordTrackId:ctx.selectedRecordTrackId}));
  ctx.deleteTrackById('sound2',()=>true);
  assert.equal(ctx.undo.length,1);
  ctx.restore(ctx.undo.pop());
  assert.deepEqual(JSON.parse(JSON.stringify(ctx.tracks)),before.tracks);
  assert.deepEqual(JSON.parse(JSON.stringify(ctx.clips)),before.clips);
  assert.equal(ctx.selectedRecordTrackId,'sound2');
  assert(ctx.clips.every((c,i)=>c.sourceId===before.clips[i].sourceId));
  console.log('DELETE_TRACK_UNDO PASS track/order/clips/sourceId/params/armed state restored in one snapshot');
}

{
  const sharedA={id:'a',track:'sound2',name:'shared',sourceId:'shared-src',start:1,trim:0,len:1,gain:1,muted:false};
  const sharedB={id:'b',track:'sound3',name:'shared copy',sourceId:'shared-src',start:4,trim:.2,len:.8,gain:.5,muted:true};
  const ctx=makeHarness({tracks:[T1,T2,T3],clips:[sharedA,sharedB],armed:'voice',sources:[{id:'shared-src',blob:{tag:'keep'}}]});
  const source=ctx.localSources.get('shared-src');
  ctx.deleteTrackById('sound2',()=>true);
  assert.equal(ctx.clips.length,1);
  assert.equal(ctx.clips[0].sourceId,'shared-src');
  assert.strictEqual(ctx.localSources.get('shared-src'),source);
  console.log('SHARED_SOURCE_SURVIVES_TRACK_DELETE PASS');
}

{
  const ctx=makeHarness({tracks:[T1,T2,T3],clips:[recorded,imported],armed:'sound2'});
  assert.equal(ctx.deleteTrackById('sound2',()=>true),true);
  assert.equal(ctx.selectedRecordTrackId,'voice');
  assert(ctx.tracks.some(t=>t.id===ctx.selectedRecordTrackId));
  console.log('DELETE_ARMED_RECORD_TRACK PASS');
  console.log('RECORD_TRACK_FALLBACK_AFTER_DELETE PASS deterministic first remaining track=voice');
}

{
  const ctx=makeHarness({tracks:[T1],clips:[recorded],armed:'voice'});
  assert.equal(ctx.deleteTrackById('voice',()=>true),false);
  assert.equal(ctx.tracks.length,1);
  assert.equal(ctx.clips.length,1);
  assert(ctx.msgs.some(x=>/dernière piste/.test(x)));
  console.log('LAST_TRACK_DELETE_GUARD PASS');
}

// Persistence after deletion: deleted clip/track remain absent after autosave-like store round trip.
(async()=>{
  {
    const ctx=makeHarness({tracks:[T1,T2],clips:[recorded,imported],armed:'voice'});
    ctx.deleteClipById('imp1');
    const store=A.createMemoryStore();
    const snap={schema:A.SCHEMA_VERSION,selectedRecordTrackId:ctx.selectedRecordTrackId,tracks:ctx.tracks.map(x=>({...x})),clips:ctx.clips.map(x=>({...x}))};
    await store.save(snap,[]);
    const loaded=await store.load();
    assert(!loaded.snapshot.clips.some(c=>c.id==='imp1'));
    console.log('DELETE_CLIP_AUTOSAVE_RELOAD PASS');
  }
  {
    const ctx=makeHarness({tracks:[T1,T2,T3],clips:[recorded,imported,duplicated],armed:'voice'});
    ctx.deleteTrackById('sound2',()=>true);
    const store=A.createMemoryStore();
    const snap={schema:A.SCHEMA_VERSION,selectedRecordTrackId:ctx.selectedRecordTrackId,tracks:ctx.tracks.map(x=>({...x})),clips:ctx.clips.map(x=>({...x}))};
    await store.save(snap,[]);
    const loaded=await store.load();
    assert(!loaded.snapshot.tracks.some(t=>t.id==='sound2'));
    assert(!loaded.snapshot.clips.some(c=>c.track==='sound2'));
    console.log('DELETE_TRACK_AUTOSAVE_RELOAD PASS');
  }

  // Delete code must not perform source writes, decoding, waveform scanning, WAV conversion, or source pruning.
  const deleteSource=section('function deleteClipById','function bindRecordTrackControl');
  for(const forbidden of ['registerSourceBlob','getDecodedSource','decodeAudioData','ensureWaveformForSource','wav(','localSources.delete','decodedSourceCache.remove']){
    assert(!deleteSource.includes(forbidden),'delete path unexpectedly does audio work: '+forbidden);
  }
  console.log('ZERO_AUDIO_REENCODE_ON_DELETE PASS no audio write/decode/PCM scan/WAV/source deletion in delete paths');

  // UI is compact: track delete is a third 26px control, not a large lane CTA.
  assert(renderSource.includes('data-delete-track title="Supprimer la piste"'));
  assert(html.includes('.track-control-buttons{display:grid;grid-template-columns:1fr 1fr 1fr;gap:2px}'));
  assert(html.includes('.track-control-buttons button{min-height:26px;height:26px'));
  console.log('TRACK_DELETE_UI_COMPACT PASS 26px compact red trash in track control row');

  console.log('Studio delete controls 010 tests PASS');
})().catch(e=>{console.error(e);process.exit(1)});
