const assert=require('node:assert/strict');
const O=require('../js/studio-ogg-opus.js');
const P=require('../js/studio-opus-compact.js');
async function check(){
  let a=new Uint8Array(44+44100*4),v=new DataView(a.buffer);
  const put=(p,s)=>{for(let i=0;i<s.length;i++)a[p+i]=s.charCodeAt(i)};
  put(0,'RIFF');v.setUint32(4,a.length-8,true);put(8,'WAVEfmt ');
  v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,2,true);
  v.setUint32(24,44100,true);v.setUint32(28,44100*4,true);
  v.setUint16(32,4,true);v.setUint16(34,16,true);put(36,'data');v.setUint32(40,a.length-44,true);
  for(let i=0;i<44100;i++){v.setInt16(44+i*4,10000,true);v.setInt16(46+i*4,-10000,true)}
  const wav=new Blob([a],{type:'audio/wav'});
  const meta=await P.inspectWav(wav);assert.equal(meta.seconds,1);assert.equal(meta.frames,44100);
  assert.equal(P.FRAMES_PER_PACKET,960);assert.equal(P.TARGET_RATE,48000);
  const modified=a.slice();modified[22]=1;await assert.rejects(()=>P.inspectWav(new Blob([modified])),/stéréo/);
  assert.equal((await P.encoderConfig(class{static async isConfigSupported(c){return{supported:c.codec==='opus'}}})).codec,'opus');
  await assert.rejects(()=>P.encoderConfig(class{static async isConfigSupported(){return{supported:false}}}),/pas disponible/);
  let largestInputSlice=0,opened=0,deleted=[],data;
  const slicedFile={
    size:wav.size,
    slice(from,to){largestInputSlice=Math.max(largestInputSlice,to-from);return wav.slice(from,to)}
  };
  // Real File/Blob is required by inspectWav. Instrument Blob's slice on the test only.
  const originalSlice=Blob.prototype.slice;Blob.prototype.slice=function(start,end,...rest){
    if(this===wav)largestInputSlice=Math.max(largestInputSlice,end-start);
    return originalSlice.call(this,start,end,...rest);
  };
  const pages=[];
  const dir={
    async getFileHandle(name,opts){opened++;assert(opts.create);assert.match(name,/^\.studio-opus-/);
      return{async createWritable(){return{
        async write(bytes){pages.push(new Uint8Array(bytes))},
        async close(){data=new Blob(pages,{type:'audio/ogg'})},
        async abort(){}};
      },async getFile(){return data}};},
    async removeEntry(name){deleted.push(name)}
  };
  let packets=0,maxFrames=0,closed=0;
  class FakeAudioData{
    constructor(c){assert.equal(c.numberOfFrames,960);assert.equal(c.sampleRate,48000);
      assert.equal(c.numberOfChannels,2);maxFrames=Math.max(maxFrames,c.numberOfFrames);
      this.value=c.data[500];this.data=c.data;this.timestamp=c.timestamp;
    }
    close(){closed++}
  }
  class FakeEncoder{
    static async isConfigSupported(c){return{supported:c.codec==='opus'&&c.sampleRate===48000}}
    constructor({output,error}){this.output=output;this.error=error}
    configure(c){assert.equal(c.sampleRate,48000)}
    encode(a){packets++;this.output({byteLength:50,copyTo(out){out.fill(packets%233+1)}},{})}
    async flush(){}
    close(){}
  }
  const progress=[];
  const result=await P.encodeWav(wav,{AudioEncoderType:FakeEncoder,AudioDataType:FakeAudioData,
    directory:dir,yieldFn:async()=>{},onProgress:x=>progress.push(x)});
  Blob.prototype.slice=originalSlice;
  assert.equal(result.seconds,1);assert(result.bytes<1e4);
  assert.equal(result.packetCount,Math.ceil((48000+P.PRE_SKIP)/960));
  assert.equal(closed,packets);assert.equal(maxFrames,960);
  assert(largestInputSlice<6000,'only ~20ms input PCM read');
  assert.equal(progress.at(-1),1);
  const allPages=pages.map(p=>O.readPage(p));
  assert(allPages[0].bos);assert(allPages.at(-1).eos);
  assert.equal(Number(allPages.at(-1).granule),48000+P.PRE_SKIP);
  assert(allPages.every((p,i)=>p.sequence===i));
  assert(result.file.size>200&&result.file.size<wav.size);
  assert.equal(deleted.length,0,'no automatic deletion of newly generated file');
  await result.cleanup();assert.equal(deleted.length,1);
  await result.cleanup();assert.equal(deleted.length,1,'cleanup idempotent');
  // Page boundary : 25 packets uses EOS on last packet, never an empty final page.
  const m=O.createMuxer({packetsPerPage:25});m.begin();
  for(let i=0;i<24;i++)m.packet(new Uint8Array([1]));
  const final=m.finishWithPacket(new Uint8Array([2]),25*960);
  assert.equal(final.length,1);assert(O.readPage(final[0]).eos);
  // PRE_SKIP pre-roll is silent; normal input follows rather than deleting the first samples.
  assert.equal(P.PRE_SKIP,312);
  assert.equal(opened,1);
  console.log('STUDIO-OPUS-COMPACT-026: bounded 20ms WAV reads, WebCodecs gating, Ogg EOS, 48k duration, safe OPFS output PASS');
}
check().catch(e=>{console.error(e);process.exitCode=1});
