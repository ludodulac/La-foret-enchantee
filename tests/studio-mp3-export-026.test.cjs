'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {BITRATE_KBPS,inspectWav,encodeWavBlob}=require('../js/studio-mp3-export.js');
const html=fs.readFileSync(path.join(__dirname,'../studio.html'),'utf8');
function wav(durationSeconds) {
  const frames=Math.round(durationSeconds*44100),ab=new ArrayBuffer(44+frames*4),v=new DataView(ab);
  function word(i,s){for(let j=0;j<s.length;j++)v.setUint8(i+j,s.charCodeAt(j))}
  word(0,'RIFF');v.setUint32(4,36+frames*4,true);word(8,'WAVE');
  word(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,2,true);v.setUint32(24,44100,true);
  v.setUint32(28,176400,true);v.setUint16(32,4,true);v.setUint16(34,16,true);word(36,'data');v.setUint32(40,frames*4,true);
  for(let i=0;i<frames;i++){const sample=Math.round(Math.sin(2*Math.PI*440*i/44100)*11000);v.setInt16(44+i*4,sample,true);v.setInt16(46+i*4,sample,true)}
  return new Blob([ab],{type:'audio/wav'});
}
(async()=>{
  assert.equal(BITRATE_KBPS,192);
  const input=wav(2.5),before=await input.arrayBuffer();
  const inspected=await inspectWav(input);
  assert.equal(inspected.sampleRate,44100);
  assert.equal(inspected.frames,110250);
  assert(Math.abs(inspected.duration-2.5)<0.001);
  let counts={encodes:0,frames:0,flush:0},progress=[],yields=0;
  class FakeMp3 {
    constructor(ch,rate,bitrate){assert.equal(ch,2);assert.equal(rate,44100);assert.equal(bitrate,192)}
    encodeBuffer(left,right){
      assert(left instanceof Int16Array&&right instanceof Int16Array);
      assert.equal(left.length,right.length);
      assert(left.length>0&&left.length<=9216);
      counts.encodes++;counts.frames+=left.length;
      return Uint8Array.of(0xff,0xfb,0xb0,0x44);
    }
    flush(){counts.flush++;return Uint8Array.of(0,1,2)}
  }
  const result=await encodeWavBlob(input,{
    lame:{Mp3Encoder:FakeMp3},
    onProgress:(done,total)=>progress.push([done,total]),
    yieldFn:async()=>{yields++;}
  });
  assert.equal(counts.frames,inspected.frames);
  assert.equal(counts.flush,1);
  assert.equal(counts.encodes,yields);
  assert.equal(result.bitrateKbps,192);
  assert.equal(result.blob.type,'audio/mpeg');
  assert(progress.length>=2&&progress[progress.length-1][0]===inspected.frames);
  assert.deepEqual(await input.arrayBuffer(),before,'WAV must be preserved untouched');
  console.log('STUDIO MP3 026 FAKE ENCODER / CHUNK BOUNDS / WAV UNCHANGED PASS');

  const empty=new Blob([], {type:'audio/wav'});
  await assert.rejects(inspectWav(empty),/WAV/);
  const corrupted=new Uint8Array(await wav(0.5).arrayBuffer());
  corrupted[20]=3; // non-PCM format
  await assert.rejects(inspectWav(new Blob([corrupted])),/PCM/);
  const controller=new AbortController();controller.abort();
  await assert.rejects(encodeWavBlob(input,{lame:{Mp3Encoder:FakeMp3},signal:controller.signal}),/annulé/);
  await assert.rejects(encodeWavBlob(input,{lame:null}),/encodeur MP3/i);
  console.log('STUDIO MP3 026 BAD INPUT / ABORT / MISSING ENCODER PASS');

  const filenameLine=html.split('\n').find(line=>line.startsWith('function makeExportFilename('));
  assert(filenameLine,'Custom export filename helper must be present');
  const makeExportFilename=new Function(filenameLine+';return makeExportFilename;')();
  assert.equal(makeExportFilename('Mon conte','montage-son.wav','mp3'),'Mon conte.mp3');
  assert.equal(makeExportFilename('Épisode 1.wav','montage-son.wav','wav'),'Épisode 1.wav');
  assert.equal(makeExportFilename('Mon/Conte:*?','montage-son.wav','mp3'),'Mon-Conte---.mp3');
  assert.equal(makeExportFilename('   ','montage-son.wav','wav'),'montage-son.wav');
  assert(html.includes("makeExportFilename($('#export-title-input').value,x.filename,format)"),'Download must use editable filename');
  assert(html.includes("window.addEventListener('beforeunload'"),'Warn on page exit during encoding');
  assert(html.includes('id="undo-quick"') && html.includes('id="redo-quick"'),'Mobile undo and redo controls visible in zoom strip');
  assert(html.includes("$('#undo-quick').onclick=undoLastChange"),'Quick undo must connect to existing history');
  assert(html.includes("$('#redo-quick').onclick=redoLastChange"),'Quick redo must connect to existing history');
  assert(html.includes("document.addEventListener('keydown'") && html.includes("e.ctrlKey||e.metaKey"),'Ctrl/Cmd+Z support must exist');
  assert(html.includes("$('#undo-quick').disabled=!canUndo"),'Mobile undo must reflect history state');
  assert(html.includes('id="export-format-choice"'));
  assert(html.includes('<option value="mp3">'));
  assert(html.includes('<option value="wav">'));
  assert(html.includes('js/studio-mp3-export.js'));
  assert(html.includes('StudioMp3Export.encodeWavBlob'));
  assert(html.includes('id="export-forest-ready" type="button" hidden disabled'), 'Direct publishing hidden, manual workflow');
  const inline=html.slice(html.indexOf('<script>')+8,html.lastIndexOf('</script>'));
  new Function(inline);
  console.log('STUDIO MP3 026 EXPORT CHOICE UI AND INLINE JAVASCRIPT SYNTAX PASS');

  // Emulate the actual separate browser script tag to check window.lamejs exists.
  const vm=require('node:vm');
  const iifeSource=fs.readFileSync(require.resolve('@breezystack/lamejs'),'utf8');
  const browserGlobal={};
  vm.runInNewContext(iifeSource,browserGlobal,{timeout:5000});
  assert.equal(typeof browserGlobal.lamejs?.Mp3Encoder,'function','Pinned IIFE must expose window.lamejs.Mp3Encoder');
  console.log('STUDIO MP3 026 PINNED BROWSER IIFE GLOBAL PASS');

  // If the pinned, separate LGPL encoder is installed, exercise actual MP3 encoding.
  let lame;
  try{lame=await import('@breezystack/lamejs')}catch(e){throw Error('Test requires pinned @breezystack/lamejs@1.2.7: '+e.message)}
  if(!lame.Mp3Encoder&&lame.default?.Mp3Encoder)lame=lame.default;
  console.log('LAME 1.2.7 EXPORTS:',Object.keys(lame).slice(0,8).join(','));
  const real=await encodeWavBlob(wav(1.2),{lame,yieldFn:async()=>{}});
  const mp3=new Uint8Array(await real.blob.arrayBuffer());
  assert(mp3.byteLength>10000,'Real MP3 must be non-empty and have meaningful bitrate');
  let firstFrame=-1;
  for(let i=0;i<Math.min(mp3.length-4,128);i++)if(mp3[i]===255&&(mp3[i+1]&0xe0)===0xe0){firstFrame=i;break}
  assert(firstFrame>=0,'MP3 must contain a MPEG audio frame');
  assert.equal((mp3[firstFrame+2]>>4)&15,11,'44.1 kHz MPEG-1 layer III 192 kbps frame index');
  console.log('STUDIO MP3 026 ACTUAL LAMEJS 192KBPS MPEG FRAME PASS');
  console.log('STUDIO MP3 026 ALL TESTS PASS');
})().catch(err=>{console.error('STUDIO MP3 026 TEST FAILED',err);process.exitCode=1});
