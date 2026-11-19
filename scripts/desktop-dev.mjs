// A signed app bundle loads this loopback server; only UI files reload, never the installed app.
import { createServer } from 'node:http';
import { readFile, realpath, access } from 'node:fs/promises';
import { watch } from 'node:fs';
import { spawn, execFileSync } from 'node:child_process';
import { dirname, resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = resolve(repo, 'src');
const mime = {'.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.ttf':'font/ttf', '.png':'image/png'};

export async function serve(port = 18765) {
  const clients = new Set();
  let revision = 0, debounce;
  const server = createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const path = new URL(req.url, 'http://localhost').pathname;
      if (path === '/__changes') {
        res.writeHead(200, {'Content-Type':'text/event-stream'});
        res.write(`data: ${revision}\n\n`); clients.add(res);
        req.on('close', () => clients.delete(res)); return;
      }
      if (path === '/__ready' && req.method === 'POST') {
        console.log('Desktop UI ready; Accessibility granted:', new URL(req.url, 'http://localhost').searchParams.get('trusted')); res.writeHead(204); res.end(); return;
      }
      if (path === '/backend.js') {
        res.setHeader('Content-Type','text/javascript'); res.end("const BACKEND_URL = '';\n"); return;
      }
      const file = await realpath(resolve(source, '.' + decodeURIComponent(path === '/' ? '/index.html' : path)));
      if (!file.startsWith(source + sep)) { res.writeHead(403); res.end(); return; }
      res.setHeader('Content-Type', mime[extname(file)] || 'application/octet-stream');
      let content = await readFile(file);
      if (file === resolve(source, 'index.html')) content = content.toString() + `<script>
        let revision;
        const changes = new EventSource('/__changes');
        changes.onmessage = ({data}) => {
          if (revision !== undefined && revision !== data) location.reload();
          revision = data;
        };
        window.__TAURI__?.core.invoke('overlay_ready').then(() => window.__TAURI__.core.invoke('status'))
          .then(trusted => fetch('/__ready?trusted=' + trusted, {method:'POST'}));
      </script>`;
      res.end(content);
    } catch { res.writeHead(404); res.end(); }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
  const watcher = watch(source, {recursive:true}, () => {
    clearTimeout(debounce);
    debounce = setTimeout(() => { revision++; for (const client of clients) client.write(`data: ${revision}\n\n`); }, 100);
  });
  return { port:server.address().port, close:async()=>{
    watcher.close(); clearTimeout(debounce); for(const client of clients) client.end();
    server.closeAllConnections(); await new Promise(r=>server.close(r));
  }};
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command,args,{cwd:repo,stdio:'inherit'});
    child.on('error',reject); child.on('exit',code=>code===0?resolve():reject(new Error(`${command} exited ${code}`)));
  });
}
function stopApp(bundle) {
  let output;
  try { output=execFileSync('pgrep',['-f',`${bundle}/Contents/MacOS/nematode`],{encoding:'utf8'}); }
  catch(e) { if(e.status===1) return; throw e; }
  for(const id of output.trim().split('\n')) if(id) { try {process.kill(Number(id),'SIGTERM');} catch(e) {if(e.code!=='ESRCH') throw e;} }
}

async function main() {
  if(process.platform!=='darwin') throw new Error('desktop-dev currently supports macOS.');
  const server = await serve(); // a second session fails here, before touching the running app
  const bundle = resolve(repo,'src-tauri/target/debug/bundle/macos/Nematode.app');
  let launched=false, quitting=false;
  const close = async () => {
    if(quitting) return; quitting=true;
    try {
      if(launched) stopApp(bundle);
      await server.close();
      if(launched) await run('open',['/Applications/Nematode.app']);
    } finally { process.exit(0); }
  };
  process.on('SIGINT',close); process.on('SIGTERM',close);
  try {
    await access('/Applications/Nematode.app');
    await run('npx',['tauri','build','--debug','--bundles','app','--features','desktop-dev','--config','src-tauri/tauri.desktop-dev.conf.json']);
    await run('codesign',['--force','--deep','--sign','-','--identifier','com.nematode.app',
      '-r=designated => identifier "com.nematode.app"',bundle]);
    stopApp('/Applications/Nematode.app'); launched=true;
    console.log('Desktop dev: save src/ files to reload. Ctrl+C (or Quit Nematode) restores your installed app.');
    await run('open',['-n','-W',bundle]);
    await close();
  } catch(e) {
    console.error(e.message);
    if(launched) await close();
    await server.close(); process.exitCode=1;
  }
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) await main();
