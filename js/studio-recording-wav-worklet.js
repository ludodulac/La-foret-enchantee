/* AudioWorklet autonome : microphone -> mono PCM16, transfert d'un fragment par seconde. */
class StudioRecordingWavProcessor extends AudioWorkletProcessor{
  constructor(){super();this.framesPerChunk=Math.max(1,Math.round(sampleRate));this.buffer=new ArrayBuffer(this.framesPerChunk*2);this.view=new DataView(this.buffer);this.used=0;this.stopped=false;this.port.onmessage=e=>{if(e.data?.type==='stop'){this.flush();this.stopped=true;this.port.postMessage({type:'stopped'})}}}
  flush(){if(!this.used)return;const output=this.buffer.slice(0,this.used*2);this.port.postMessage({type:'pcm',bytes:output},[output]);this.buffer=new ArrayBuffer(this.framesPerChunk*2);this.view=new DataView(this.buffer);this.used=0}
  process(inputs){if(this.stopped)return false;const channels=inputs[0]||[];if(!channels.length)return true;const a=channels[0];for(let i=0;i<a.length;i++){const f=Number.isFinite(a[i])?Math.max(-1,Math.min(1,a[i])):0;this.view.setInt16(this.used*2,Math.round(f<0?f*32768:f*32767),true);this.used++;if(this.used===this.framesPerChunk)this.flush()}return true}
}
registerProcessor('studio-recording-wav',StudioRecordingWavProcessor);
