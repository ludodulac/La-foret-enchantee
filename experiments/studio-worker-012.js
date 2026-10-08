importScripts('studio-progressive-chunk-writer-010.js','studio-mp3-progressive-import-010.js');
const stage=(name,extra={})=>postMessage({kind:'stage',stage:name,...extra});
stage('WORKER_CREATED');
stage('WORKER_READY');
onmessage=async e=>{stage('FILE_RECEIVED',{bytes:e.data.blob?.size||0});const {blob}=e.data;let decoder,frames=0,outputs=0,wavCount=0,persistedBytes=0,outputChain=Promise.resolve(),lastSubmitted=false;const t0=performance.now();
try{
 stage('DECODER_CONFIG_SUPPORTED');const support=typeof AudioDecoder!=='undefined'&&await AudioDecoder.isConfigSupported({codec:'mp3',sampleRate:44100,numberOfChannels:1});if(!support?.supported)throw Error('WORKER_MP3_UNSUPPORTED');
 const writer=StudioProgressiveChunks.createChunkWriter({sourceId:'LONG',sampleRate:44100,channels:1,chunkSeconds:5,writeChunk:async(id,bytes)=>{persistedBytes+=bytes.byteLength;wavCount++;}});
 stage('DEMUX_STARTED');
 const result=await StudioMp3ProgressiveImport.demuxMp3Progressive(blob,{readSize:4096,onFrame:async f=>{frames++;if(!decoder){decoder=new AudioDecoder({output:data=>{if(outputs===0)stage('FIRST_AUDIO_DATA');outputChain=outputChain.then(async()=>{try{const blocks=[];for(let c=0;c<data.numberOfChannels;c++){const a=new Float32Array(data.numberOfFrames);data.copyTo(a,{planeIndex:c,format:'f32-planar'});blocks.push(a)}await writer.push(blocks);outputs++;}finally{data.close()}});},error:x=>stage('DECODER_ERROR',{error:String(x)})});decoder.configure(f.config);stage('DECODER_CONFIGURED')}
 const chunk=new EncodedAudioChunk({type:'key',timestamp:Math.round(f.timestamp),duration:Math.round(f.duration),data:f.bytes});decoder.decode(chunk);if(frames===1)stage('FIRST_FRAME_SUBMITTED');}});
 stage('DEMUX_FINISHED',{frames:result.frames});stage('LAST_FRAME_SUBMITTED',{frames});
 stage('DECODER_FLUSH_STARTED');await decoder.flush();stage('DECODER_FLUSH_FINISHED');await outputChain;stage('LAST_AUDIO_DATA',{outputs});
 const manifest=await writer.finish();stage('WRITER_FINISHED',{wavCount});decoder.close();const m=writer.metrics();
 const payload={kind:'result',audioDecoder:true,frames,outputs,wavCount,persistedBytes,maxPcmSamples:m.maxBufferedSamples,pcmCapacitySamples:m.chunkCapacitySamples,manifestChunks:manifest.chunks.length,elapsedMs:performance.now()-t0};stage('RESULT_POSTED');postMessage(payload);
}catch(err){postMessage({kind:'fatal',error:String(err?.stack||err)});}
};