'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const A=require('../js/studio-autosave.js');
const Nav=require('../js/studio-timeline-navigation.js');
const html=fs.readFileSync('studio.html','utf8');
function snapshot(id,clipIds){
  return{schema:A.SCHEMA_VERSION,projectId:id,name:id,cursor:0,zoom:1,selectionStart:null,selectionEnd:null,selectedRecordTrackId:'voice',
    tracks:[{id:'voice',name:'Voix',type:'voice',gain:1,muted:false,color:'#fff'}],
    clips:clipIds.map((sourceId,i)=>({id:'clip-'+id+'-'+i,track:'voice',sourceId,name:'Voix',start:i*2,trim:0,len:1,gain:1,muted:false}))};
}
async function main(){
  assert.equal(Nav.MIN_ZOOM,0.001);
  assert(Nav.fitZoom(280,1800)<=0.009,'30 minute recording fits on narrow phone');
  assert(Nav.pixelsPerSecond(280,Nav.fitZoom(280,1800))*1800<=280);
  assert(Nav.pixelsPerSecond(280,Nav.MIN_ZOOM)*1800<220);
  assert(Nav.rulerStep(.1)>=500,'No 5-second label flood at extreme zoom');
  assert(Nav.isTap(50,100,54,102,0,0),'Short finger tap seeks');
  assert(!Nav.isTap(50,100,80,100,0,50),'Horizontal swipe is not a seek');
  assert(!Nav.isTap(50,100,52,100,0,200),'Content scrolling alone disallows seek');
  assert(html.includes('id="zoom-fit"')&&html.includes('id="move-clip"'));
  assert(html.includes('StudioTimelineNavigation.fitZoom('));
  assert(html.includes('StudioTimelineNavigation.clampZoom('));
  assert(html.includes("panOnly=e.pointerType==='touch'&&moveArmedClipId!==c.id"));
  assert(html.includes("if(panOnly){panScrollStart=$('#timeline').scrollLeft;return}"));
  assert(html.includes("if(StudioTimelineNavigation.isTap(tap.x,tap.y"));
  assert(html.includes("el.onpointercancel=e=>finish(e,true)"),'Canceled touch must not move the clip');
  assert(html.includes('.clip{touch-action:pan-x}'),'Native horizontal gesture over clips');
  assert(html.includes('.clip.move-armed{touch-action:none}'),'Only armed clip captures touch');
  // Run actual empty-space timeline handlers: swipe must not seek, tap does.
  const start=html.indexOf('let blankPointer=null;');
  const end=html.indexOf("let ph=$('#playhead');",start);
  assert(start>=0&&end>start,'Timeline gestures must be present');
  const timeline={scrollLeft:0},seekCalls=[];
  const runtime={StudioTimelineNavigation:Nav,$:()=>timeline,xToTime:x=>x/10,setCursor:x=>seekCalls.push(x)};
  vm.createContext(runtime);vm.runInContext(html.slice(start,end),runtime);
  const event=(x,y,id=1,pointerType='touch')=>({pointerId:id,pointerType,isPrimary:true,clientX:x,clientY:y,target:{closest(){return null}}});
  timeline.onpointerdown(event(100,50));
  timeline.scrollLeft=150;
  timeline.onpointerup(event(160,50));
  assert.equal(seekCalls.length,0,'Native timeline swipe never moves playhead');
  timeline.scrollLeft=150;
  timeline.onpointerdown(event(110,50));
  timeline.onpointerup(event(112,51));
  assert.deepEqual(seekCalls,[11.2],'An intentional tap can move playhead');
  timeline.onpointerdown(event(150,50,2,'mouse'));
  assert.deepEqual(seekCalls,[11.2,15],'Mouse click-to-seek remains available');
  console.log('ACTUAL_EMPTY_TIMELINE_POINTER_GESTURES PASS');

  console.log('STUDIO_ZOOM_30_MIN_FIT_AND_SAFE_TOUCH_PAN PASS');

  const store=A.createMemoryStore();
  await store.initializeLibrary();
  const bytes=(n)=>new Blob([new Uint8Array(n)],{type:'audio/webm'});
  const shared={id:'shared',blob:bytes(15),origin:'test'};
  const deleted={id:'deleted',blob:bytes(21),origin:'test'};
  await store.createProject({id:'A',name:'A',snapshot:snapshot('A',['shared','deleted']),newSources:[shared,deleted]});
  await store.createProject({id:'B',name:'B',snapshot:snapshot('B',['shared'])});
  await store.saveWaveform('deleted',{version:1,peakRate:256,duration:1,peaks:new Uint8Array([10])});
  assert.deepEqual(await store.getLocalStorageStats(),{sourceCount:2,audioBytes:36});
  await store.saveProject('A',snapshot('A',['shared']),[]);
  let result=await store.cleanupUnusedAudio(['deleted']);
  assert(result.safe);
  assert(result.removedSourceIds.length===0,'Undo protects deleted source until history expires');
  assert(store._state().sources.has('deleted'));
  assert.equal(store._state().projects.size,2,'Only latest revisions kept after safe cleanup');

  result=await store.cleanupUnusedAudio([]);
  assert.deepEqual(result.removedSourceIds,['deleted']);
  assert(!store._state().waveforms.has('deleted'),'Also frees unused waveform cache');
  assert(store._state().sources.has('shared'),'Still referenced by both projects');
  await store.saveProject('B',snapshot('B',[]),[]);
  await store.cleanupUnusedAudio([]);
  assert(store._state().sources.has('shared'),'Must not remove audio from another project');
  await store.saveProject('A',snapshot('A',[]),[]);
  await store.cleanupUnusedAudio([]);
  assert.deepEqual(await store.getLocalStorageStats(),{sourceCount:0,audioBytes:0});
  console.log('AUTOMATIC_AUDIO_GC_UNDO_PROTECTION_SHARED_PROJECTS PASS');

  const broken=A.createMemoryStore();await broken.initializeLibrary();
  await broken.createProject({id:'safe',name:'safe',snapshot:snapshot('safe',['source']),newSources:[{id:'source',blob:bytes(4)}]});
  broken._state().library.get('safe').latestGeneration='missing';
  const skip=await broken.cleanupUnusedAudio([]);
  assert.equal(skip.safe,false);
  assert(broken._state().sources.has('source'),'Corrupted project reference must fail closed');
  console.log('CORRUPT_PROJECT_NO_AUDIO_DELETION PASS');

  const src=html.slice(html.indexOf('function checkpoint(){'),html.indexOf('function bindRecordTrackControl'));
  assert(src.includes('if(undo.length>30)undo.splice(0,undo.length-30)'));
  assert(html.includes('if(redo.length>30)redo.splice(0,redo.length-30)'));
  assert(html.includes("undo=[];redo=[];try{await cleanupLocalAudio(false)}"),'Project closure drops undo and cleans audio');
  assert(html.includes('await localStore.cleanupUnusedAudio([])'),'Next launch cleans after browser closure');
  assert(html.includes('id="clean-unused-audio"'),'Explicit safe cleanup button');
  assert(html.includes("const changes=undo.length+redo.length;"),'Manual button warns about losing Undo history');
  assert(html.includes('await flushLocalAutosave()'),'Manual cleaning must save before clearing');
  assert(html.includes('Nettoyage des sons non utilisés'), 'Cleanup errors cannot silently delete audio');
  console.log('UNDO_30_IN_SESSION_AND_CLEANUP_ON_NEXT_START PASS');
}
main().catch(err=>{console.error(err);process.exitCode=1});
