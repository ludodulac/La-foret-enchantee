/* Studio MP3 026 — bounded-memory WAV PCM16 stereo -> MP3 conversion.
 * Encoder is a separate, pinned LGPL-3.0 lamejs runtime dependency.
 * Does not modify original WAV, project, Supabase or Cloudflare.
 */
(function(root,factory) {
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.StudioMp3Export=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const BITRATE_KBPS=192;
  const INPUT_CHUNK_FRAMES=73728; // 288 KiB of interleaved stereo WAV per read
  const ENCODER_BLOCK_FRAMES=9216; // 8 MP3 frames per encoder invocation
  const HEADER_BYTES=44;
  function throwIfAborted(signal) {
    if(signal?.aborted) {
      const e=new Error('Export MP3 annulé');
      e.name='AbortError';
      throw e;
    }
  }
  function nextFrame() {
    return new Promise(resolve=>setTimeout(resolve,0));
  }
  function ascii(view,offset,len) {
    let text='';
    for(let i=offset;i<offset+len;i++)text+=String.fromCharCode(view.getUint8(i));
    return text;
  }
  async function inspectWav(wavBlob) {
    if(!(wavBlob instanceof Blob)||wavBlob.size<HEADER_BYTES)throw Error('WAV introuvable ou incomplet.');
    const first=await wavBlob.slice(0,HEADER_BYTES).arrayBuffer();
    const view=new DataView(first);
    if(ascii(view,0,4)!=='RIFF'||ascii(view,8,4)!=='WAVE'||ascii(view,12,4)!=='fmt '||ascii(view,36,4)!=='data')
      throw Error('Le WAV ne possède pas un en-tête PCM standard.');
    const format=view.getUint16(20,true),channels=view.getUint16(22,true);
    const sampleRate=view.getUint32(24,true),bits=view.getUint16(34,true);
    const dataBytes=view.getUint32(40,true);
    if(format!==1||channels!==2||sampleRate!==44100||bits!==16)
      throw Error('Le MP3 nécessite un WAV PCM 16 bits stéréo à 44 100 Hz.');
    if(dataBytes<4||dataBytes%4||HEADER_BYTES+dataBytes!==wavBlob.size)
      throw Error('Les données WAV ne correspondent pas à la taille du fichier.');
    return {frames:dataBytes/4,duration:dataBytes/4/sampleRate,sampleRate,channels,bitrateKbps:BITRATE_KBPS};
  }
  async function encodeWavBlob(wavBlob,{lame,onProgress,signal,yieldFn=nextFrame}={}) {
    throwIfAborted(signal);
    const info=await inspectWav(wavBlob);
    const lib=lame||(typeof globalThis!=='undefined'?globalThis.lamejs:null);
    if(!lib||typeof lib.Mp3Encoder!=='function')
      throw Error('L’encodeur MP3 n’est pas chargé. Vérifie ta connexion Internet.');
    const encoder=new lib.Mp3Encoder(2,info.sampleRate,BITRATE_KBPS);
    const parts=[];
    let encodedBytes=0;
    for(let base=0;base<info.frames;base+=INPUT_CHUNK_FRAMES) {
      throwIfAborted(signal);
      const frames=Math.min(INPUT_CHUNK_FRAMES,info.frames-base);
      const raw=await wavBlob.slice(HEADER_BYTES+base*4,HEADER_BYTES+(base+frames)*4).arrayBuffer();
      const view=new DataView(raw);
      const left=new Int16Array(frames),right=new Int16Array(frames);
      for(let i=0;i<frames;i++){
        left[i]=view.getInt16(i*4,true);
        right[i]=view.getInt16(i*4+2,true);
      }
      for(let j=0;j<frames;j+=ENCODER_BLOCK_FRAMES){
        throwIfAborted(signal);
        const end=Math.min(frames,j+ENCODER_BLOCK_FRAMES);
        const encoded=encoder.encodeBuffer(left.subarray(j,end),right.subarray(j,end));
        if(encoded?.length){
          const copy=Uint8Array.from(encoded);
          parts.push(copy);
          encodedBytes+=copy.byteLength;
        }
        await yieldFn();
      }
      if(onProgress)onProgress(Math.min(info.frames,base+frames),info.frames);
    }
    throwIfAborted(signal);
    const last=encoder.flush();
    if(last?.length){
      const copy=Uint8Array.from(last);
      parts.push(copy);
      encodedBytes+=copy.byteLength;
    }
    if(!encodedBytes)throw Error('L’encodeur MP3 n’a créé aucune donnée.');
    return {blob:new Blob(parts,{type:'audio/mpeg'}),frames:info.frames,duration:info.duration,bitrateKbps:BITRATE_KBPS,encodedBytes};
  }
  return {BITRATE_KBPS,inspectWav,encodeWavBlob};
});
