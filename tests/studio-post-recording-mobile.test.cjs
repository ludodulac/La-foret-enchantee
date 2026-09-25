const fs=require('fs'),assert=require('assert');
const s=fs.readFileSync('studio.html','utf8');
assert(s.includes('white-space:nowrap;pointer-events:none}.recording'),'toast must never intercept pointer input');
assert(s.includes('async function wavCooperative(ab)'),'cooperative autosave encoder missing');
assert(s.includes('await StudioExportCore.yieldToEventLoop()'),'autosave encoder must yield to UI');
assert(s.includes('fresh.push({id,blob:await wavCooperative(c.buffer)})'),'autosave must use cooperative encoder');
assert(!s.includes('fresh.push({id,blob:wav(c.buffer)})'),'blocking autosave encoder still used');
console.log('post-recording mobile regression checks: OK');
