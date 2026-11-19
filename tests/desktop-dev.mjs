import assert from 'node:assert/strict';
import { utimes, stat } from 'node:fs/promises';
import { serve } from '../scripts/desktop-dev.mjs';
const server = await serve(0), base = `http://127.0.0.1:${server.port}`;
try {
  const html=await (await fetch(base)).text();
  assert(html.includes("new EventSource('/__changes')"));
  assert(html.includes("invoke('overlay_ready')"));
  assert.equal(await (await fetch(base+'/backend.js')).text(),"const BACKEND_URL = '';\n");
  assert.equal((await fetch(base+'/.env')).status,404);
  assert.equal((await fetch(base+'/%2e%2e%2fpackage.json')).status,403);
  const controller=new AbortController();
  const events=await fetch(base+'/__changes',{signal:controller.signal});
  const reader=events.body.getReader();
  assert(new TextDecoder().decode((await reader.read()).value).includes('data: 0'));
  const file=new URL('../src/hats.js',import.meta.url), original=await stat(file);
  await utimes(file,new Date(),new Date());
  const change=await Promise.race([reader.read(),new Promise((_,reject)=>setTimeout(()=>reject(new Error('No reload event')),2000))]);
  assert(new TextDecoder().decode(change.value).includes('data: 1'));
  controller.abort(); await utimes(file,original.atime,original.mtime);
  console.log('Passed: loopback UI, reload event, native-state restore hook, local-only gestures, and source-directory confinement.');
} finally {await server.close();}
