const assert=require('node:assert/strict');const E=require('../js/studio-mp3-eligibility.js');
const frame=()=>{const size=417;const b=new Uint8Array(size);b.set([255,251,144,0]);return b};
function make(n){const f=frame(),out=new Uint8Array(f.length*n);for(let i=0;i<n;i++)out.set(f,i*f.length);return out}
const blob=(b,type='application/octet-stream')=>new Blob([b],{type});
(async()=>{const good=make(2400),short=make(20),supported={isConfigSupported:async()=>({supported:true})};
let r=E.inspectBytes(good);assert.equal(r.valid,true);assert.equal(r.frames,2400);assert(r.durationSeconds>60);
r=await E.assess(blob(good,'text/plain'),{AudioDecoder:supported});assert.equal(r.eligible,true);assert.equal(r.reason,'eligible_mp3');
r=await E.assess(blob(short,'audio/mpeg'),{AudioDecoder:supported});assert.equal(r.eligible,false);assert.equal(r.reason,'short_mp3');
r=await E.assess(blob(good),{AudioDecoder:null});assert.equal(r.reason,'webcodecs_unavailable');assert.equal(r.fallback,'legacy');
r=await E.assess(blob(good),{AudioDecoder:{isConfigSupported:async()=>({supported:false})}});assert.equal(r.reason,'mp3_decoder_unsupported');
for(const bad of [new Uint8Array([0,1,2,3]),good.slice(0,-1),new Uint8Array([73,68,51,4,0,0,127,0,0,0])]){r=await E.assess(blob(bad,'audio/mpeg'),{AudioDecoder:supported});assert.equal(r.eligible,false);assert.equal(r.fallback,'legacy')}
const tag=new Uint8Array(10+good.length);tag.set([73,68,51,4,0,0,0,0,0,0]);tag.set(good,10);assert.equal(E.inspectBytes(tag).valid,true);
assert.equal(E.inspectBytes(make(1)).valid,false);
console.log('STUDIO_PLAYBACK_LONG_017 PASS MP3_DETECTION DURATION INVALID_REJECTION UNKNOWN_FALLBACK WEBCODECS_FALLBACK')})().catch(e=>{console.error(e);process.exitCode=1});
