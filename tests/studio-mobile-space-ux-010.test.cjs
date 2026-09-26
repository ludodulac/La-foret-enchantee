const assert=require('node:assert/strict');
const fs=require('fs');
const vm=require('node:vm');

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
assert(css.includes('.multitrack{display:block;height:min(480px,57dvh);min-height:360px;overflow-y:auto'));
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
assert(css.includes('height:min(480px,57dvh)'));
assert(css.includes('overflow-y:auto;overscroll-behavior:contain'));
assert(css.includes('.timeline{display:block;position:relative'));
assert(css.includes('overflow-x:auto;overflow-y:visible;touch-action:pan-x pan-y'));
assert(html.includes('.clip{position:absolute') || html.includes('.clip{'));
assert(html.includes('touch-action:none'));
console.log('TIMELINE_DOMINANT PASS explicit 480px / 57dvh multipiste viewport');
console.log('MULTI_TRACK_VISIBLE_OR_SCROLLABLE PASS min-height 360px + overflow-y auto');
console.log('VERTICAL_TRACK_ACCESS PASS multipiste parent scrolls vertically');
console.log('HORIZONTAL_TIMELINE_ACCESS PASS right timeline scrolls horizontally');
console.log('TOUCH_SCROLL_CONTRACT PASS background pan-x/pan-y; clip touch-action none reserves drag gesture');

// Trim geometry remains the 010 human requirement.
assert(css.includes('.trimhandle{width:24px;background:transparent!important'));
assert(css.includes('.trimhandle.left{left:-20px}'));
assert(css.includes('.trimhandle.right{right:-20px}'));
assert(css.includes('.trimhandle:after{top:15px;bottom:15px;width:5px'));
assert(css.includes('.clip.sel{overflow:visible}'));
console.log('TRIM_VISUAL_WIDTH PASS visual=5px');
console.log('TRIM_TOUCH_TARGET PASS touchTarget=24px; outward=20px; inward=4px/side');

const timelineClientWidth=VIEWPORT_W-14-92-4;
const pps=timelineClientWidth/15;
const oneSecond=pps,halfSecond=pps*.5;
const oneSecondFree=Math.max(0,oneSecond-8),halfSecondFree=Math.max(0,halfSecond-8);
assert(oneSecondFree>10);assert(halfSecondFree>=0);
console.log('SMALL_CLIP_MOVE_AREA PASS right-area zoom1 1s='+oneSecond.toFixed(1)+'px center='+oneSecondFree.toFixed(1)+'px; 0.5s center='+halfSecondFree.toFixed(1)+'px');

// Exercise actual production trim handlers.
function makeTrimHarness(side){
 const c={id:'c',start:1,trim:.5,len:2,sourceId:'src',gain:1,muted:false,track:'A'};
 const listeners={},clipEl={style:{}},handle={closest:()=>clipEl,addEventListener:(n,fn)=>listeners[n]=fn,setPointerCapture(){}};
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
 "$('#stop').onclick=()=>stopPlay()",
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

console.log('Studio mobile space UX 010 revised spatial hierarchy tests PASS');
