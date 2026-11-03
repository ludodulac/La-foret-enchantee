'use strict';
const assert=require('node:assert/strict');
const C=require('../js/studio-latency-compensation.js');
function sampleDelayedPulse(ms,noise=0){
  const rate=44100,n=Math.round(3.75*rate),pcm=new Int16Array(n);
  for(let i=0;i<n;i++)pcm[i]=Math.round(Math.sin(i*1.7)*noise*32767);
  for(const at of C.TIMES){
    const p=Math.round((at+C.START_LEAD+ms/1000)*rate),duration=Math.ceil(C.TONE_DURATION*rate);
    for(let i=0;i<duration;i++){
      let fade=Math.pow(Math.sin(Math.PI*(i+.5)/duration),2);
      let x=.55*fade*Math.sin(2*Math.PI*960*i/rate);
      pcm[p+i]=Math.max(-32768,Math.min(32767,Math.round(x*32767)));
    }
  }
  const chunks=[];
  for(let i=0;i<pcm.length;i+=rate){
    const split=pcm.subarray(i,Math.min(pcm.length,i+rate));
    chunks.push(new Uint8Array(split.buffer.slice(split.byteOffset,split.byteOffset+split.byteLength)));
  }
  return chunks;
}
for(const delay of [40,85,180,310,560]){
  const result=C.measure(sampleDelayedPulse(delay,.001),44100);
  assert(Math.abs(result.ms-delay)<=20,`Expected ${delay}, got ${result.ms}`);
  assert.equal(result.clicks,4);
}
assert.throws(()=>C.measure(sampleDelayedPulse(180,0).map(x=>new Uint8Array(x.length)),44100),/inaudibles/);
const original={start:0,trim:0,len:3.4,sourceId:'one'};
let moved=C.shiftClip(original,180);
assert.equal(moved.start,0);
assert.equal(moved.trim,.18);
assert.equal(moved.len,3.22);
assert.deepEqual(original,{start:0,trim:0,len:3.4,sourceId:'one'},'original project not mutated');
let returned=C.shiftClip(moved,-180);
assert(Math.abs(returned.start-original.start)<.00001);
assert(Math.abs(returned.trim-original.trim)<.00001);
assert(Math.abs(returned.len-original.len)<.00001);
let later=C.shiftClip({start:1,trim:0,len:3},180);
assert.equal(later.start,.82);
assert.equal(later.trim,0);
assert.equal(later.len,3);
assert.throws(()=>C.shiftClip(original,4000),/hors limites/);
const state=new Map(),storage={getItem:k=>state.get(k),setItem:(k,v)=>state.set(k,v)};
assert.equal(C.load(storage),0);
assert.equal(C.save(storage,235),235);
assert.equal(C.load(storage),235);
const ctx={sampleRate:44100,createBuffer:(channels,length,rate)=>({sampleRate:rate,length,getChannelData:()=>new Float32Array(length)})};
const tone=C.createTestTone(ctx);
assert(tone.length>2.4*44100&&tone.length<2.7*44100,'Four calibration clicks are in range');
console.log('STUDIO-038 PASS: five roundtrip delays, silent rejection, audio timing shift/undo, persistent profile, safe click generation');
