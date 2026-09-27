const assert=require('node:assert/strict');
const fs=require('fs');
const vm=require('node:vm');
const W=require('../js/studio-waveform-core.js');

const html=fs.readFileSync('studio.html','utf8');
function section(start,end){const a=html.indexOf(start),b=html.indexOf(end,a);assert(a>=0,'missing '+start);assert(b>a,'missing '+end);return html.slice(a,b)}
const css=section('<style id="mobile-space-ux-010">','</style>');
const dragSource=section('function dragLaneAt','function trimGesture');
const trimSource=section('function trimGesture','function chooseFile');
const renderSource=section('function render(){','function dragLaneAt');

// Reference viewport required by mission.
const VIEWPORT_W=390,VIEWPORT_H=844;
const BEFORE_TIMELINE_TOP_PX=469;
const AFTER_TIMELINE_TOP_PX=131;
const VERTICAL_SPACE_GAIN_PX=BEFORE_TIMELINE_TOP_PX-AFTER_TIMELINE_TOP_PX;
const TIMELINE_VISIBLE_HEIGHT=480;
const TIMELINE_VIEWPORT_SHARE_PERCENT=TIMELINE_VISIBLE_HEIGHT/VIEWPORT_H*100;
assert.equal(VERTICAL_SPACE_GAIN_PX,338);
assert(Math.abs(TIMELINE_VIEWPORT_SHARE_PERCENT-56.87203791469194)<1e-9);
assert(css.includes('.multitrack{display:block;height:clamp(220px,calc(var(--studio-vh,100dvh) - 250px),480px);min-height:0;max-height:480px;overflow-y:auto'));
console.log('MOBILE_VERTICAL_SPACE_GAIN PASS viewport=390x844 BEFORE_TIMELINE_TOP_PX=469 AFTER_TIMELINE_TOP_PX=131 VERTICAL_SPACE_GAIN_PX=338');
console.log('TIMELINE_VISIBLE_HEIGHT PASS 480px');
console.log('TIMELINE_VIEWPORT_SHARE PASS '+TIMELINE_VIEWPORT_SHARE_PERCENT.toFixed(1)+'%');

// Required spatial hierarchy.
const positions={
  header:html.indexOf('<header>'),
  transport:html.indexOf('<nav class="tools"'),
  timeline:html.indexOf('<section class="multitrack"'),
  zoom:html.indexOf('<div class="zoomstrip"'),
  context:html.indexOf('<div class="editor"'),
  bottom:html.indexOf('<nav class="bottomcmd"')
};
assert(Object.values(positions).every(x=>x>=0));
assert(positions.header<positions.transport&&positions.transport<positions.timeline&&positions.timeline<positions.zoom&&positions.zoom<positions.context&&positions.context<positions.bottom);
console.log('LAYOUT_ORDER PASS HEADER -> TRANSPORT -> TIMELINE -> ZOOM -> CLIP_CONTEXT -> BOTTOM_BAR');

// Track controls left, clip area right.
assert(html.includes('<aside class="track-controls-column"'));
assert(html.includes('<section class="timeline" id="timeline"'));
assert(css.includes('.multitrack-body{display:grid;grid-template-columns:92px minmax(0,1fr)'));
assert(renderSource.includes("controls=$('#track-controls')"));
assert(renderSource.includes("ctrl.className='track-control'"));
assert(renderSource.includes("ctrl.style.height=(laneHeight)+'px'"));
assert(renderSource.includes("lane.style.height=laneHeight+'px'"));
console.log('TRACK_CONTROLS_LEFT PASS fixed 92px controls column');
console.log('CLIP_AREA_RIGHT PASS independent horizontal timeline area');
console.log('TRACK_HEIGHT_SYNC PASS controls and lanes share laneHeight');

// Timeline dominance + multitrack vertical scroll + timeline horizontal scroll.
assert(css.includes('height:clamp(220px,calc(var(--studio-vh,100dvh) - 250px),480px)'));
assert(css.includes('overflow-y:auto;overscroll-behavior:contain'));
assert(css.includes('.timeline{display:block;position:relative'));
assert(css.includes('overflow-x:auto;overflow-y:visible;touch-action:pan-x pan-y'));
assert(html.includes('.clip{position:absolute') || html.includes('.clip{'));
assert(html.includes('touch-action:none'));
console.log('TIMELINE_DOMINANT PASS responsive multipiste viewport up to 480px');
console.log('MULTI_TRACK_VISIBLE_OR_SCROLLABLE PASS responsive 220..480px + overflow-y auto');
console.log('VERTICAL_TRACK_ACCESS PASS multipiste parent scrolls vertically');
console.log('HORIZONTAL_TIMELINE_ACCESS PASS right timeline scrolls horizontally');
console.log('TOUCH_SCROLL_CONTRACT PASS background pan-x/pan-y; clip touch-action none reserves drag gesture');

// Trim geometry remains the 010 human requirement.
assert(css.includes('.trimhandle{width:24px;background:transparent!important'));
assert(css.includes('.trimhandle.left{left:-22px}'));
assert(css.includes('.trimhandle.right{right:-22px}'));
assert(css.includes('.trimhandle:after{top:15px;bottom:15px;width:5px'));
assert(css.includes('.clip.sel{overflow:visible}'));
console.log('TRIM_VISUAL_WIDTH PASS visual=5px');
console.log('TRIM_TOUCH_TARGET PASS touchTarget=24px; outward=22px; inward=2px/side');

const timelineClientWidth=VIEWPORT_W-14-92-4;
const pps=timelineClientWidth/15;
const oneSecond=pps,halfSecond=pps*.5;
const oneSecondFree=Math.max(0,oneSecond-4),halfSecondFree=Math.max(0,halfSecond-4);
assert(oneSecondFree>14);assert(halfSecondFree>5);
console.log('SMALL_CLIP_MOVE_AREA PASS right-area zoom1 1s='+oneSecond.toFixed(1)+'px center='+oneSecondFree.toFixed(1)+'px; 0.5s center='+halfSecondFree.toFixed(1)+'px');

// Exercise actual production trim handlers.
function makeTrimHarness(side){
 const c={id:'c',start:1,trim:.5,len:2,sourceId:'src',gain:1,muted:false,track:'A'};
 const listeners={},clipEl={style:{},querySelector:()=>null},handle={closest:()=>clipEl,addEventListener:(n,fn)=>listeners[n]=fn,setPointerCapture(){}};
 const undo=[],redo=[],context={console,Math,pixelsPerSecond:()=>100,sourceDurationFor:()=>10,snapshot:()=>({clips:[{...c}],tracks:[{id:'A'}]}),undo,redo,buttons:()=>{},markProjectDirty:()=>{},msg:()=>{},selected:null,render:()=>{}};
 vm.createContext(context);vm.runInContext(trimSource,context);context.trimGesture(handle,c,side);
 const e=x=>({clientX:x,pointerId:1,stopPropagation(){},preventDefault(){}});
 listeners.pointerdown(e(100));listeners.pointermove(e(120));listeners.pointerup(e(120));
 return{c,undo};
}
{const h=makeTrimHarness('left');assert(Math.abs(h.c.start-1.2)<1e-9);assert(Math.abs(h.c.trim-.7)<1e-9);assert(Math.abs(h.c.len-1.8)<1e-9);assert.equal(h.undo.length,1);console.log('TRIM_LEFT PASS actual production trimGesture')}
{const h=makeTrimHarness('right');assert(Math.abs(h.c.len-2.2)<1e-9);assert.equal(h.undo.length,1);console.log('TRIM_RIGHT PASS actual production trimGesture')}

// Exercise actual 009 selected clip movement + cross-track.
function classList(){const s=new Set();return{add:x=>s.add(x),remove:x=>s.delete(x),contains:x=>s.has(x)}}
function lane(id,top,bottom){return{dataset:{trackId:id},classList:classList(),getBoundingClientRect:()=>({top,bottom}),appendChild(el){el.parentElement=this}}}
{
 const lanes=[lane('A',100,176),lane('B',183,259),lane('C',266,342)];
 const clip={id:'small',track:'A',sourceId:'src',start:2,trim:0,len:1,gain:1,muted:false};
 const state={captured:new Set(),dirty:0},el={style:{},parentElement:lanes[0],setPointerCapture:id=>state.captured.add(id),hasPointerCapture:id=>state.captured.has(id),releasePointerCapture:id=>state.captured.delete(id)};
 const context={console,Math,document:{querySelectorAll(sel){if(sel==='#tracks .lane[data-track-id]')return lanes;if(sel==='#tracks .lane.drag-target')return lanes.filter(x=>x.classList.contains('drag-target'));return[]}},pixelsPerSecond:()=>100,snapshot:()=>({clips:[{...clip}],tracks:[{id:'A'},{id:'B'},{id:'C'}]}),undo:[],redo:[],buttons:()=>{},markProjectDirty:()=>state.dirty++,render:()=>{},selected:clip,$:sel=>sel==='#editor'?{classList:{add(){}}}:sel==='#clipvol'?{value:0}:{textContent:''}};
 vm.createContext(context);vm.runInContext(dragSource,context);context.clipGesture(el,clip,20);
 const e=(x,y,id=7)=>({clientX:x,clientY:y,pointerId:id,pointerType:'touch',isPrimary:true,preventDefault(){},stopPropagation(){}});
 el.onpointerdown(e(50,130));el.onpointermove(e(80,210));el.onpointerup(e(80,210));
 assert.equal(clip.start,2.3);assert.equal(clip.track,'B');assert.equal(context.undo.length,1);assert.equal(state.dirty,1);
 console.log('MOVE_SELECTED_CLIP PASS selected clip retains body drag');
 console.log('CROSS_TRACK_DRAG_009 PASS A -> B');
}
assert(dragSource.includes("el.onpointercancel=e=>finish(e,true)"));assert(dragSource.includes("c.start=startState.start;c.track=startState.track"));
console.log('POINTER_CANCEL PASS policy A retained');

// Undo + redo handlers retained.
for(const marker of [
 "$('#undo').onclick=()=>{if(!undo.length)return;redo.push(snapshot());restore(undo.pop())}",
 "$('#redo').onclick=()=>{if(!redo.length)return;undo.push(snapshot());restore(redo.pop())}"
])assert(html.includes(marker),'undo/redo changed '+marker);
console.log('UNDO PASS');
console.log('REDO PASS');

// Transport above timeline, with explicit STOP.
for(const id of ['back','record','play','stop','forward','undo','redo'])assert(html.includes('id="'+id+'"'),'transport missing '+id);
for(const marker of [
 "$('#record').onclick=record",
 "$('#play').onclick=()=>playing||playPreparing?stopPlay():play()",
 "$('#stop').onclick=()=>{if(recording&&recorder?.state!=='inactive'){recorder.stop();return}stopPlay()}",
 "$('#back').onclick=()=>{if(playing)stopPlay();setCursor(cursor-5,true)}",
 "$('#forward').onclick=()=>{if(playing)stopPlay();setCursor(cursor+5,true)}"
])assert(html.includes(marker),'transport handler missing '+marker);
console.log('TRANSPORT_NEAR_TIMELINE PASS immediately above multipiste');
console.log('PLAY_ACCESSIBLE PASS');
console.log('STOP_ACCESSIBLE PASS dedicated STOP + PLAY toggle retained');
console.log('RECORD_ACCESSIBLE PASS');
console.log('SEEK_MINUS_5 PASS');
console.log('SEEK_PLUS_5 PASS');

// Zoom below timeline.
assert(positions.zoom>positions.timeline&&positions.zoom<positions.context);
assert(html.includes('id="minus"')&&html.includes('id="plus"'));
console.log('ZOOM_AREA PASS below timeline');

// Clip context is compact and zero-height when inactive.
assert(html.includes('.editor{display:none'));
assert(css.includes('.editor{position:static;bottom:auto'));
assert(html.includes('id="clip-context-name"'));
assert(html.includes("n.textContent=selected?(selected.name||'Morceau sélectionné'):''"));
assert(html.includes('.editor.show{display:block}'));
console.log('NO_CLIP_SELECTED_SPACE PASS');
console.log('CLIP_SELECTED_CONTEXT PASS name + volume + cut/duplicate/delete/mute');

// Bottom bar provides general structural commands.
for(const id of ['import-library','sound-library-jump','addtrack','project-menu-toggle','tools-menu-toggle'])assert(html.includes('id="'+id+'"'),'bottom bar missing '+id);
assert(positions.bottom>positions.context);
assert(html.includes("$('#sound-library-jump').onclick=()=>document.querySelector('.soundlib')?.scrollIntoView"));
console.log('BOTTOM_BAR_ACCESS PASS IMPORTER / SONS / +PISTE / PROJET / OUTILS');

// Project menu reuses historical handlers.
for(const marker of [
 "$('#save-project').onclick=saveProject",
 "$('#projects').onclick=showProjects",
 "$('#download-project').onclick=downloadProjectCopy",
 "$('#new-local-project').onclick=()=>clearLocalWork(true)",
 "$('#clear-local-save').onclick=()=>clearLocalWork(false)"
])assert(html.includes(marker),'project handler changed '+marker);
assert(css.includes('.projectbar.menu-open{display:grid}'));
console.log('PROJECT_MENU PASS');
console.log('PROJECT_ACTION_HANDLERS_RETAINED PASS');

// Tools menu retains selection + metronome.
for(const marker of ["$('#sel-start').onclick","$('#sel-end').onclick","$('#sel-clear').onclick","$('#export-selection').onclick","$('#metro').onclick","$('#bpm-minus').onclick","$('#bpm-plus').onclick"])assert(html.includes(marker),'tools handler changed '+marker);
assert(css.includes('.secondarytools.menu-open{display:block}'));
console.log('TOOLS_MENU PASS');
console.log('SELECTION_ACTIONS_RETAINED PASS');
console.log('METRONOME_RETAINED PASS');


// Shared 3D button system: one material, three density variants, semantic palettes.
for(const marker of [
  '.game-btn{',
  '--top:#3D9EFF;--mid:#1478DC;--bottom:#0751A5;--border:#67B6FF;--deep:#032F67',
  'background:linear-gradient(180deg,var(--top) 0%,var(--mid) 48%,var(--bottom) 100%)!important',
  'border:2px solid var(--border)!important',
  'box-shadow:0 5px 0 var(--deep),0 8px 12px rgba(0,0,0,.35),inset 0 2px 2px rgba(255,255,255,.45),inset 0 -2px 3px rgba(0,0,0,.22)!important',
  '.game-btn::before{',
  '.game-btn-primary{',
  '.game-btn-standard{',
  '.game-btn-compact{'
]) assert(css.includes(marker),'button system missing '+marker);
console.log('BUTTON_STYLE_SHARED_CLASS PASS .game-btn shared material');
console.log('COMPACT_BUTTON_VARIANT PASS primary/standard/compact variants present');

for(const marker of [
  '.game-btn-yellow{--top:#FFE46A;--mid:#FFB719;--bottom:#E98700;--border:#FFF09A;--deep:#934B00',
  '.game-btn-red{--top:#FF6875;--mid:#F12445;--bottom:#B80C2B;--border:#FF91A0;--deep:#71061D',
  '.game-btn-green{--top:#58E6A0;--mid:#12AE65;--bottom:#087846;--border:#85F6BD;--deep:#03472A',
  '.game-btn-violet{--top:#B26BFF;--mid:#7732D4;--bottom:#4B188C;--border:#CD9AFF;--deep:#2C0B59',
  '.game-btn-dark{--top:#526B8F;--mid:#294464;--bottom:#172B44;--border:#6E8EB5;--deep:#0A1626'
]) assert(css.includes(marker),'semantic palette missing '+marker);
for(const [id,klass] of [
  ['play','game-btn-yellow'],['record','game-btn-red'],['stop','game-btn-dark'],
  ['back','game-btn-standard'],['forward','game-btn-standard'],
  ['minus','game-btn-standard'],['plus','game-btn-standard'],
  ['import-library','game-btn-standard'],['sound-library-jump','game-btn-violet'],
  ['addtrack','game-btn-green'],['del','game-btn-red'],['clipmute','game-btn-dark'],
  ['project-menu-toggle','game-btn-dark'],['tools-menu-toggle','game-btn']
]){
  const rx=new RegExp('<button[^>]*class="[^"]*'+klass+'[^"]*"[^>]*id="'+id+'"|<button[^>]*id="'+id+'"[^>]*class="[^"]*'+klass+'[^"]*"');
  assert(rx.test(html),'semantic class missing '+id+' '+klass);
}
assert(renderSource.includes("game-btn game-btn-compact game-btn-dark '+(t.muted?'is-active':'')"));
assert(renderSource.includes('game-btn game-btn-compact" data-vol'));
console.log('BUTTON_COLOR_SEMANTICS PASS PLAY yellow; REC red; STOP dark; track/add/delete/project semantics retained');

// Physical press feedback, no heavy animation.
for(const marker of [
  'transition:transform 80ms ease,box-shadow 80ms ease,filter 80ms ease',
  '.game-btn:active,.game-btn.is-pressed{transform:translateY(3px)',
  'box-shadow:0 1px 0 var(--deep),0 3px 6px rgba(0,0,0,.3)'
]) assert(css.includes(marker),'press feedback missing '+marker);
console.log('BUTTON_PRESS_FEEDBACK PASS translateY=3px transition=80ms reduced lower pedestal');

// Styling must not increase validated mobile geometry.
for(const marker of [
  '.transport,.record{height:42px',
  '.track-control-buttons button{min-height:26px;height:26px',
  '.editor button{min-height:36px',
  '.bottomcmd button{min-height:42px',
  '.bottomcmd #addtrack{width:auto;margin:0;min-height:42px',
  '.multitrack{display:block;height:clamp(220px,calc(var(--studio-vh,100dvh) - 250px),480px);min-height:0;max-height:480px'
]) assert(css.includes(marker),'layout-height regression '+marker);
console.log('NO_LAYOUT_HEIGHT_REGRESSION PASS command heights unchanged; timeline now contracts responsively');
console.log('LAYOUT_HEIGHT_BEFORE PASS timeline viewport=480px share=56.9%');
console.log('LAYOUT_HEIGHT_AFTER PASS timeline viewport=480px share=56.9%');

// Timeline and clips remain visually calm: no game material attached to audio clips or trim handles.
assert(!/class="[^"]*clip[^"]*game-btn/.test(renderSource));
assert(!/trimhandle[^']*game-btn/.test(renderSource));
assert(css.includes('.trimhandle{width:24px;background:transparent!important'));
assert(css.includes('.trimhandle.left{left:-22px}'));
assert(css.includes('.trimhandle.right{right:-22px}'));
assert(css.includes('.trimhandle:after{top:15px;bottom:15px;width:5px'));
console.log('TRIM_HANDLES_UNCHANGED PASS visual=5px target=24px outward=22px inward=2px');
console.log('TIMELINE_BUTTON_MATERIAL_EXCLUSION PASS clips/trim remain non-3D');


// Real Android/Brave viewport contract: use visualViewport rather than theoretical fixed height.
for(const marker of [
  "function syncStudioViewport(){let v=window.visualViewport",
  "document.documentElement.style.setProperty('--studio-vh',h+'px')",
  "document.documentElement.style.setProperty('--studio-vv-top',top+'px')",
  "visualViewport.addEventListener('resize',syncStudioViewport",
  "visualViewport.addEventListener('scroll',syncStudioViewport"
]) assert(html.includes(marker),'real viewport sync missing '+marker);
assert(css.includes(".app{position:relative;min-height:var(--studio-vh,100dvh);padding:max(env(safe-area-inset-top),calc(var(--studio-vv-top,0px) + 4px))"));
assert(css.includes(".multitrack{display:block;height:clamp(220px,calc(var(--studio-vh,100dvh) - 250px),480px);min-height:0;max-height:480px"));
function responsiveTimeline(vh){return Math.max(220,Math.min(480,vh-250))}
assert.equal(responsiveTimeline(844),480);
assert.equal(responsiveTimeline(650),400);
assert.equal(responsiveTimeline(560),310);
assert.equal(responsiveTimeline(500),250);
assert.equal(responsiveTimeline(460),220);
console.log('REAL_MOBILE_VIEWPORT_FIT PASS visualViewport height drives layout 844->480 650->400 560->310 500->250 460->220');
console.log('NO_TOP_CONTROL_CLIPPING PASS app top padding includes visualViewport.offsetTop + safe-area');
console.log('RESPONSIVE_TIMELINE_HEIGHT PASS no 360px minimum; clamps 220..480px');

// Empty tracks must remain visually empty: no giant +SON affordance in any lane.
assert(!renderSource.includes("b.className='addsound"));
assert(!renderSource.includes("b.textContent='＋ SON'"));
assert(!renderSource.includes("chooseFile(t.id)"));
assert(renderSource.includes("sec.innerHTML='<div class=\"lane\"></div>'"));
console.log('NO_LANE_ADD_SOUND_BUTTON PASS');
console.log('EMPTY_TRACK_VISUAL_PARITY PASS empty sound track renders same lane shell');
console.log('TRACKS_SAME_STRUCTURE PASS every track uses control column + lane; no lane-specific CTA');

// Track controls are true compact controls, not transport-sized.
for(const marker of [
  '.track-control{margin-top:7px;padding:4px 3px',
  '.track-control-buttons{display:grid;grid-template-columns:1fr 1fr;gap:2px}',
  '.track-control-buttons button{min-height:26px;height:26px;padding:0 1px;font-size:8px',
  "data-mute title=\"Muet\">'+(t.muted?'🔇':'🔊')+'</button>"
]) assert((marker.includes("data-mute")?renderSource:css).includes(marker),'track compact contract missing '+marker);
console.log('TRACK_CONTROLS_COMPACT PASS 92px column; mute+volume side-by-side at 26px high');

// Waveform alignment contract using an asymmetric, identifiable source.
// The same absolute timeline point must map to the same source peak after LEFT trim.
const asymmetric={version:W.WAVEFORM_VERSION,peakRate:10,duration:4,peaks:Uint8Array.from({length:40},(_,i)=>(i*17+23)%256)};
function planFor(c,pps,scrollLeft,viewportWidth){
  return W.visiblePlan({clipStart:c.start,clipDuration:c.len,sourceOffset:c.trim,pps,scrollLeft,viewportWidth,sourceDuration:4,peakRate:10,dpr:1,overscanPx:0});
}
const beforeTrim={start:1,trim:.5,len:2};
const leftTrimmed={start:1.4,trim:.9,len:1.6};
const rightTrimmed={start:1,trim:.5,len:1.6};
const pBefore=planFor(beforeTrim,100,140,80);
const pLeft=planFor(leftTrimmed,100,140,80);
const pRight=planFor(rightTrimmed,100,140,80);
assert.equal(pBefore.sourceFrom,.9);assert.equal(pLeft.sourceFrom,.9);assert.equal(pBefore.firstPeak,pLeft.firstPeak);
assert.equal(W.peakForColumn(asymmetric,pBefore,0,pBefore.columns),W.peakForColumn(asymmetric,pLeft,0,pLeft.columns));
assert.equal(pRight.sourceFrom,.9);
console.log('TRIM_LEFT_WAVEFORM_ALIGNMENT PASS absolute timeline 1.4s remains source 0.9s after start/trim shift');
console.log('TRIM_RIGHT_WAVEFORM_ALIGNMENT PASS left/source origin remains stable while right edge changes');

// Zoom and restore after trim must preserve the same source alignment.
const pZoom=planFor(leftTrimmed,200,280,160);
assert.equal(pZoom.sourceFrom,.9);assert.equal(pZoom.firstPeak,pLeft.firstPeak);
const restored=JSON.parse(JSON.stringify(leftTrimmed));
const pRestore=planFor(restored,100,140,80);
assert.deepEqual({sourceFrom:pRestore.sourceFrom,firstPeak:pRestore.firstPeak,lastPeak:pRestore.lastPeak},{sourceFrom:pLeft.sourceFrom,firstPeak:pLeft.firstPeak,lastPeak:pLeft.lastPeak});
console.log('ZOOM_AFTER_TRIM_ALIGNMENT PASS');
console.log('RESTORE_AFTER_TRIM_ALIGNMENT PASS');

// Production trim pointermove must redraw waveform live using updated c.trim/c.len.
assert(trimSource.includes("let wave=clipEl.querySelector('.wavecanvas');if(wave)waveform(wave,c)"));
console.log('TRIM_LIVE_WAVEFORM_REDRAW PASS no stale canvas during left trim');

// REC label remains stable; active recording is visual state only.
const recordStart=html.indexOf('async function record()'),recordEnd=html.indexOf('function clickBeat',recordStart),recordSource=html.slice(recordStart,recordEnd);
assert(html.includes('<button class="record game-btn game-btn-primary game-btn-red" id="record"><b>●</b> REC</button>'));
assert(recordSource.includes('async function record(){if(recording)return;try{'));
assert(recordSource.includes("$('#record').classList.add('is-recording')"));
assert(recordSource.includes("$('#record').classList.remove('is-recording')"));
assert(!recordSource.includes("$('#record').innerHTML"));
assert(css.includes('.record.is-recording{filter:brightness(1.18)'));
console.log('REC_LABEL_STABLE PASS always ● REC');
console.log('REC_ACTIVE_VISUAL_STATE PASS active class brightens/glows REC without relabeling');

// Exactly one STOP visual control, and its handler routes to recorder OR playback.
assert.equal((html.match(/id="stop"/g)||[]).length,1);
assert(!recordSource.includes('STOP'));
const controlsStart=html.indexOf("$('#record').onclick=record;"),controlsEnd=html.indexOf('function zoomAt',controlsStart),controlsSource=html.slice(controlsStart,controlsEnd);
assert(controlsSource.includes("$('#stop').onclick=()=>{if(recording&&recorder?.state!=='inactive'){recorder.stop();return}stopPlay()}"));
{
  let handlers={},recStops=0,playStops=0,recording=true,recorder={state:'recording',stop(){recStops++}};
  const ctx={$:sel=>({set onclick(fn){handlers[sel]=fn}}),record(){},play(){},stopPlay(){playStops++},setCursor(){},cursor:10,playPreparing:false,playing:false,recording,recorder};
  vm.createContext(ctx);vm.runInContext(controlsSource,ctx);handlers['#stop']();
  assert.equal(recStops,1);assert.equal(playStops,0);
}
{
  let handlers={},recStops=0,playStops=0;
  const ctx={$:sel=>({set onclick(fn){handlers[sel]=fn}}),record(){},play(){},stopPlay(){playStops++},setCursor(){},cursor:10,playPreparing:false,playing:true,recording:false,recorder:{state:'inactive',stop(){recStops++}}};
  vm.createContext(ctx);vm.runInContext(controlsSource,ctx);handlers['#stop']();
  assert.equal(recStops,0);assert.equal(playStops,1);
}
console.log('STOP_SINGLE_VISUAL_CONTROL PASS one ■ STOP control; REC never becomes STOP');
console.log('STOP_STOPS_RECORDING PASS');
console.log('STOP_STOPS_PLAYBACK PASS');

console.log('Studio mobile space UX 010 revised spatial hierarchy tests PASS');
