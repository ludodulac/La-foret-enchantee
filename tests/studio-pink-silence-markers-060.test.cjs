'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const Silence=require('../js/studio-silence-editor.js');
const html=fs.readFileSync('studio.html','utf8');

async function main(){
  const rate=1000,seconds=8,data=new Float32Array(rate*seconds);
  data.fill(.3,0,2000);data.fill(.25,3200,5000);data.fill(.2,6000,8000);
  const buffer={sampleRate:rate,length:data.length,duration:seconds,numberOfChannels:1,getChannelData(){return data}};
  const edit=await Silence.analyze(buffer,0,8,'natural');
  assert.equal(edit.pauses.length,2);
  const after={id:'two',track:'voice',sourceId:'source',start:10,trim:0,len:0,gain:1,muted:false,silenceEdit:edit};
  after.len=Silence.duration(after);
  let markers=Silence.markers(after);
  assert.equal(markers.length,2,'Exactly two reduced silences yield two markers');
  assert(markers[0].at>1.95&&markers[0].at<2.35);
  assert(markers[1].at>markers[0].at);
  assert.equal(markers[0].pauseIndex,0);
  assert.equal(markers[1].pauseIndex,1);
  assert(markers.every(m=>m.removed>.3&&m.at<after.len));
  assert.equal(Silence.markers({...after,silenceEdit:null}).length,0,'Unprocessed audio has no pink marks');
  console.log('PINK_LINES_AT_EXACT_NONDESTRUCTIVE_CUT_JOINS PASS');

  const start=html.indexOf('function renderSilenceMarkers(clipElement,clip,pps){');
  const end=html.indexOf('function applySilenceEdit(){',start);
  assert(start>0&&end>start,'Actual production marker and restoration handlers exist');
  assert(html.includes('renderSilenceMarkers(e,c,pps);'),'Render attaches markers to every audio clip');
  assert(html.includes('.silence-marker:before')&&html.includes('background:#ff4cb4'),'Visible pink line on clips');
  assert(html.includes('studio-silence-editor.js?v=060'),'Fresh helper loaded even on cached Android browser');
  assert(!html.includes('marker.style.left=(marker.at*pps)+'), 'Marker style should use element local coordinates');
  const buttons=[],confirmTexts=[],status=[],undo=[];
  let confirmation=false,stopped=0,repaints=0,saves=0,handled=0;
  const target=after;
  const following={id:'three',track:'voice',sourceId:'source2',start:10+after.len,len:3};
  const fourth={id:'four',track:'voice',sourceId:'source3',start:13+after.len,len:2};
  const unrelated={id:'other',track:'music',sourceId:'music',start:11,len:20};
  const clips=[target,following,fourth,unrelated],savedStart=following.start,oldLen=target.len;
  const ctx={
    console,Math,JSON,Number,StudioSilenceEditor:Silence,clips,undo,
    recording:false,micStarting:false,
    fmt:v=>'at '+v.toFixed(2),
    window:{confirm(message){confirmTexts.push(message);return confirmation}},
    document:{createElement(type){
      assert.equal(type,'button');
      const events={};
      const button={style:{},dataset:{},setAttribute(key,value){this[key]=value},
        addEventListener(key,fn){events[key]=fn},events};
      buttons.push(button);return button;
    }},
    stopPlay(){stopped++},
    checkpoint(){undo.push({clips:clips.map(c=>({...c}))})},
    render(){repaints++},
    markProjectDirty(){saves++},
    msg(s){status.push(s)}
  };
  vm.createContext(ctx);vm.runInContext(html.slice(start,end),ctx);
  const parent={children:[],appendChild(el){this.children.push(el)}};
  ctx.renderSilenceMarkers(parent,target,40);
  assert.equal(parent.children.length,2);
  assert.equal(parent.children[0].style.left,markers[0].at*40+'px');
  assert.equal(parent.children[0].dataset.pauseIndex,'0');
  assert.equal(parent.children[0].type,'button');
  assert.equal(parent.children[0].className,'silence-marker');
  assert(parent.children[0].title.includes('Silence réduit'));
  assert(parent.children[0]['aria-label'].includes('Restaurer'));
  for(const event of ['pointerdown','pointerup','pointermove','pointercancel']){
    assert.equal(typeof parent.children[0].events[event],'function');
    parent.children[0].events[event]({stopPropagation(){handled++}});
  }
  assert.equal(handled,4,'Marker tap must not drag clips or move playhead');
  const tap={preventDefault(){handled++},stopPropagation(){handled++}};
  parent.children[0].events.click(tap);
  assert.equal(confirmTexts.length,1,'Message must ask confirmation');
  assert(confirmTexts[0].includes('Restaurer le silence'));
  assert(confirmTexts[0].includes('autres silences'));
  assert.equal(undo.length,0,'Cancel leaves undo history untouched');
  assert.equal(following.start,savedStart,'Cancel leaves later clips untouched');
  assert.equal(Silence.markers(target).length,2);
  console.log('TAP_PINK_LINE_CANCEL_CONFIRMATION_LEAVES_AUDIO_UNCHANGED PASS');

  confirmation=true;
  parent.children[0].events.click(tap);
  assert.equal(undo.length,1,'Restoring a single pause is one undo step');
  assert.equal(stopped,1);
  assert.equal(repaints,1);assert.equal(saves,1);
  assert.equal(Silence.markers(target).length,1,'Only restored pause loses its pink line');
  assert.equal(Silence.markers(target)[0].pauseIndex,1,'The other edit remains in place');
  assert(target.len>oldLen);
  assert(Math.abs(following.start-(target.start+target.len))<.00001);
  assert(Math.abs(fourth.start-(target.start+target.len+3))<.00001);
  assert.equal(unrelated.start,11,'Other track never moves');
  assert.equal(target.sourceId,'source','Original recording remains intact');
  assert.equal(undo[0].clips[0].len,oldLen);
  assert.equal(undo[0].clips[0].silenceEdit.pauses[0].reduced,true,'Undo keeps old reduction');
  assert.equal(target.silenceEdit.pauses[0].reduced,false,'Only selected pause is restored');
  assert.equal(target.silenceEdit.pauses[1].reduced,true,'Other pauses remain reduced');
  assert(status[0].includes('trait rose retiré'));
  console.log('RESTORE_ONE_MARKER_ONE_UNDO_SAME_TRACK_RIPPLE_NO_DUPLICATE_AUDIO PASS');

  const nextParent={children:[],appendChild(el){this.children.push(el)}};
  ctx.renderSilenceMarkers(nextParent,target,40);
  assert.equal(nextParent.children.length,1,'After re-render only the unrecovered pink marker is visible');
  assert.equal(nextParent.children[0].dataset.pauseIndex,'1');
  assert.equal(nextParent.children[0].style.left,Silence.markers(target)[0].at*40+'px','Remaining marker moves when previous pause restored');
  console.log('RENDERED_PINK_LINE_REMOVED_AND_REMAINING_MARK_REPOSITIONED PASS');

  const prev=undo.pop();clips.splice(0,clips.length,...prev.clips);
  assert.equal(Silence.markers(clips[0]).length,2,'Undo recovers original two reductions');
  assert.equal(clips[1].start,savedStart);
  assert.equal(clips[3].start,11);
  console.log('UNDO_RESTORES_BOTH_MARKERS_AND_EXACT_TRACK_POSITIONS PASS');
}
main().catch(e=>{console.error(e);process.exitCode=1});
