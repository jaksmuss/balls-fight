/* Enregistre la vidéo de présentation en MP4 (H.264, 30 i/s, sans son).
 * Prérequis : `npx vite --port 5199` lancé, ffmpeg installé, Playwright.
 * Usage : node tools/record-video.cjs 1920 1080 sortie.mp4 [seed] [roster] */
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const { spawn } = require('child_process');
const [w = 1920, h = 1080, out = 'preview.mp4', seed = '3862', roster = 'dynamite,ninja,pyro,thunder'] = process.argv.slice(2);
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: 1 });
  p.on('pageerror', e => console.error('ERR', e.message));
  await p.goto(`http://localhost:5199/tools/video.html?seed=${seed}&roster=${roster}`);
  await p.waitForFunction(() => document.title === 'ready', null, { timeout: 20000 });
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', '30', '-c:v', 'mjpeg', '-i', '-',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'slow', '-crf', '20', '-movflags', '+faststart', '-an', out], { stdio: ['pipe', 'inherit', 'inherit'] });
  let n = 0;
  for (;;) {
    const url = await p.evaluate(() => window.renderFrame());
    if (!url) break;
    if (!ff.stdin.write(Buffer.from(url.split(',')[1], 'base64'))) await new Promise(r => ff.stdin.once('drain', r));
    n++;
  }
  ff.stdin.end();
  await new Promise(r => ff.on('close', r));
  console.log(`${out} : ${n} images (${(n / 30).toFixed(1)} s)`);
  await b.close();
})();
