import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const profile=await mkdtemp(join(tmpdir(),'nematode-hat-icons-'));
try {
  const {stdout}=await promisify(execFile)(process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    ['--headless','--disable-gpu',`--user-data-dir=${profile}`,'--dump-dom',new URL('hat-icons.html',import.meta.url).href],{maxBuffer:1024*1024});
  const directory=new URL('../src-tauri/icons/hats/',import.meta.url);await mkdir(directory,{recursive:true});
  const icons=[...stdout.matchAll(/<img data-hat="([a-z]+)" src="data:image\/png;base64,([^"]+)"/g)];
  if(!icons.length) throw new Error('No hat icons rendered');
  for(const [,id,data] of icons) await writeFile(new URL(`${id}-menu.png`,directory),Buffer.from(data,'base64'));
  console.log(`Rendered ${icons.length} hat menu previews.`);
} finally {await rm(profile,{recursive:true,force:true});}
