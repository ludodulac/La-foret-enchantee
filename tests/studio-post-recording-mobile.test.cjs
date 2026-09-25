const fs=require('fs'),assert=require('assert');
const s=fs.readFileSync('studio.html','utf8');
assert(s.includes('white-space:nowrap;pointer-events:none}.recording'),'toast must never intercept pointer input');
assert(s.includes('async function wavCooperative(ab)'),'cooperative autosave encoder missing');
assert(s.includes('await StudioExportCore.yieldToEventLoop()'),'autosave encoder must yield to UI');
assert(s.includes('fresh.push({id,blob:await wavCooperative(c.buffer)})'),'autosave must use cooperative encoder');
assert(!s.includes('fresh.push({id,blob:wav(c.buffer)})'),'blocking autosave encoder still used');
console.log('post-recording mobile regression checks: OK');

assert(s.includes('js/studio-diagnostic.js'),'diagnostic runtime missing');
assert(s.includes('COPIER DIAGNOSTIC'),'copy diagnostic control missing');
assert(s.includes("StudioDiag.watchdog"),'post-stop watchdog missing');
assert(s.includes("StudioDiag.add('BLOB_FINALIZED'"),'blob diagnostic missing');
assert(s.includes("StudioDiag.add('DECODE_BEGIN'"),'decode diagnostic missing');
assert(s.includes("StudioDiag.add('AUTOSAVE_BEGIN'"),'autosave diagnostic missing');
