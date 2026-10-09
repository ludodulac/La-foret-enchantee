(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.StudioMp3Eligibility=api})(typeof globalThis!=='undefined'?globalThis:this,function(){'use strict';
const THRESHOLD_SECONDS=60,MAX_INSPECT_BYTES=32*1024*1024;
function frameAt(a,i,end){if(i+4>end||a[i]!==255||(a[i+1]&224)!==224)return null;const version=(a[i+1]>>3)&3,layer=(a[i+1]>>1)&3,bitrate=(a[i+2]>>4)&15,sr=(a[i+2]>>2)&3,padding=(a[i+2]>>1)&1;if(version===1||layer!==1||bitrate===0||bitrate===15||sr===3)return null;const v1=version===3;const rates=[44100,48000,32000],rate=rates[sr]/(v1?1:version===2?2:4),kbps=(v1?[0,32,40,48,56,64,80,96,112,128,160,192,224,256,320]:[0,8,16,24,32,40,48,56,64,80,96,112,128,144])[bitrate],size=Math.floor((v1?144:72)*kbps*1000/rate)+padding;return size>=4&&i+size<=end?{size,rate,samples:v1?1152:576,version}:null}
function inspectBytes(input){const a=input instanceof Uint8Array?input:new Uint8Array(input);let start=0,end=a.length;if(end>=10&&a[0]===73&&a[1]===68&&a[2]===51){if((a[6]|a[7]|a[8]|a[9])&128)return{valid:false,reason:'invalid_id3'};const tag=((a[6]&127)<<21)|((a[7]&127)<<14)|((a[8]&127)<<7)|(a[9]&127);start=10+tag+((a[5]&16)?10:0);if(start>=end)return{valid:false,reason:'truncated_id3'}}if(end>=128&&a[end-128]===84&&a[end-127]===65&&a[end-126]===71)end-=128;
let pos=start,frames=0,samples=0,rate=null,version=null;while(pos<end){const f=frameAt(a,pos,end);if(!f)return{valid:false,reason:frames?'truncated_or_invalid_frame':'not_mp3',frames};if(rate!==null&&(f.rate!==rate||f.version!==version))return{valid:false,reason:'inconsistent_stream',frames};rate=f.rate;version=f.version;pos+=f.size;samples+=f.samples;frames++}
if(frames<2)return{valid:false,reason:'insufficient_frames',frames};return{valid:true,frames,sampleRate:rate,durationSeconds:samples/rate}}
const WINDOW_BYTES=65536,MAX_FRAME_BYTES=8192;
async function inspectBlob(blob,opts={}){const signal=opts.signal;let cursor=0,buffer=new Uint8Array(0),base=0,peak=0,reads=0;
const abort=()=>{if(signal?.aborted)throw Error('INSPECTION_ABORTED')};
async function ensure(n){abort();if(n>MAX_FRAME_BYTES)throw Error('FRAME_TOO_LARGE');while(base+buffer.length<cursor+n){const offset=base+buffer.length;if(offset>=blob.size)return false;const next=new Uint8Array(await blob.slice(offset,Math.min(blob.size,offset+WINDOW_BYTES)).arrayBuffer());reads++;if(!next.length)return false;const remaining=buffer.subarray(cursor-base);const joined=new Uint8Array(remaining.length+next.length);joined.set(remaining);joined.set(next,remaining.length);buffer=joined;base=cursor;peak=Math.max(peak,buffer.length);abort()}return true}
async function advance(n){cursor+=n;if(cursor-base>WINDOW_BYTES){buffer=buffer.subarray(cursor-base);base=cursor}}
try{
if(!await ensure(10))return{valid:false,reason:'too_short',maxWorkingBuffer:peak,reads};
if(buffer[0]===73&&buffer[1]===68&&buffer[2]===51){const a=buffer;if((a[6]|a[7]|a[8]|a[9])&128)return{valid:false,reason:'invalid_id3',maxWorkingBuffer:peak,reads};const tag=((a[6]&127)<<21)|((a[7]&127)<<14)|((a[8]&127)<<7)|(a[9]&127);await advance(10+tag+((a[5]&16)?10:0));if(cursor>=blob.size)return{valid:false,reason:'truncated_id3',maxWorkingBuffer:peak,reads}}
let end=blob.size;if(end>=128){const tail=new Uint8Array(await blob.slice(end-128,end-125).arrayBuffer());reads++;if(tail[0]===84&&tail[1]===65&&tail[2]===71)end-=128}
let frames=0,samples=0,rate=null,version=null;
while(cursor<end){if(!await ensure(4))return{valid:false,reason:'truncated_frame',frames,maxWorkingBuffer:peak,reads};const at=cursor-base;const header=buffer.subarray(at,at+4);const v=(header[1]>>3)&3,l=(header[1]>>1)&3,b=(header[2]>>4)&15,s=(header[2]>>2)&3,p=(header[2]>>1)&1;
if(header[0]!==255||(header[1]&224)!==224||v===1||l!==1||b===0||b===15||s===3)return{valid:false,reason:'invalid_frame',frames,maxWorkingBuffer:peak,reads};
const v1=v===3,r=[44100,48000,32000][s]/(v1?1:v===2?2:4),kbps=(v1?[0,32,40,48,56,64,80,96,112,128,160,192,224,256,320]:[0,8,16,24,32,40,48,56,64,80,96,112,128,144])[b],size=Math.floor((v1?144:72)*kbps*1000/r)+p;
if(size<4||size>MAX_FRAME_BYTES||cursor+size>end||!await ensure(size))return{valid:false,reason:'truncated_frame',frames,maxWorkingBuffer:peak,reads};
if(rate!==null&&(rate!==r||version!==v))return{valid:false,reason:'inconsistent_stream',frames,maxWorkingBuffer:peak,reads};
rate=r;version=v;samples+=v1?1152:576;frames++;await advance(size)}
return frames>=2?{valid:true,frames,sampleRate:rate,durationSeconds:samples/rate,maxWorkingBuffer:peak,reads}:{valid:false,reason:'insufficient_frames',frames,maxWorkingBuffer:peak,reads}
}catch(err){return{valid:false,reason:signal?.aborted?'interrupted':'inspection_failed',error:String(err),maxWorkingBuffer:peak,reads}}}
async function assess(blob,opts={}){if(!(blob instanceof Blob))throw TypeError('Blob required');const parsed=await inspectBlob(blob,opts);if(!parsed.valid)return{...parsed,eligible:false,durationSeconds:null,fallback:'legacy'};if(parsed.durationSeconds<=THRESHOLD_SECONDS)return{...parsed,eligible:false,reason:'short_mp3',fallback:'legacy'};
const Decoder=opts.AudioDecoder===undefined?(typeof AudioDecoder==='undefined'?null:AudioDecoder):opts.AudioDecoder;if(!Decoder||typeof Decoder.isConfigSupported!=='function')return{...parsed,eligible:false,reason:'webcodecs_unavailable',fallback:'legacy'};
try{const supported=await Decoder.isConfigSupported({codec:'mp3',sampleRate:parsed.sampleRate,numberOfChannels:2});if(!supported?.supported)return{...parsed,eligible:false,reason:'mp3_decoder_unsupported',fallback:'legacy'}}catch{return{...parsed,eligible:false,reason:'mp3_decoder_unsupported',fallback:'legacy'}}
return{...parsed,eligible:true,reason:'eligible_mp3',fallback:null}}

return{THRESHOLD_SECONDS,WINDOW_BYTES,MAX_FRAME_BYTES,inspectBytes,inspectBlob,assess}});
