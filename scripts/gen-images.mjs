// Renders placeholder saree swatches with ffmpeg — two per product:
//   -1.jpg  the drape: gradient body, zari border down the right, pallu along the bottom
//   -2.jpg  a border/pallu detail, so second-image-on-hover has something to swap to
// These are deliberately abstract textile swatches, not fake product photography.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdirSync } from 'node:fs';
import { PRODUCTS } from './catalog.mjs';

const run = promisify(execFile);
const OUT = new URL('./mock-images/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

const W = 900, H = 1200;

function drapeFilter([lo, hi, gold]) {
  return `noise=alls=6:allf=t+u,` +
    `drawbox=x=780:y=0:w=120:h=${H}:color=0x${gold}@0.85:t=fill,` +
    `drawbox=x=760:y=0:w=8:h=${H}:color=0x${gold}@0.55:t=fill,` +
    `drawbox=x=0:y=1080:w=${W}:h=120:color=0x${gold}@0.8:t=fill,` +
    `drawbox=x=0:y=1068:w=${W}:h=6:color=0x${gold}@0.55:t=fill`;
}

// Detail: the border occupies most of the frame, with fine zari stripes.
function detailFilter([lo, hi, gold]) {
  const stripes = [];
  for (let x = 380; x < W; x += 46) {
    stripes.push(`drawbox=x=${x}:y=0:w=10:h=${H}:color=0x${gold}@0.55:t=fill`);
  }
  return `noise=alls=8:allf=t+u,` +
    `drawbox=x=360:y=0:w=${W - 360}:h=${H}:color=0x${gold}@0.9:t=fill,` +
    stripes.join(',') + `,` +
    `drawbox=x=344:y=0:w=10:h=${H}:color=0x${gold}@0.5:t=fill`;
}

let made = 0;
for (const p of PRODUCTS) {
  const [lo, hi] = p.c;
  for (const [suffix, filt] of [['1', drapeFilter], ['2', detailFilter]]) {
    const args = [
      '-hide_banner', '-loglevel', 'error', '-y',
      '-f', 'lavfi',
      '-i', `gradients=s=${W}x${H}:c0=0x${lo}:c1=0x${hi}:type=linear:nb_colors=2`,
      '-vf', filt(p.c),
      '-frames:v', '1', '-q:v', '4',
      `${OUT}${p.h}-${suffix}.jpg`,
    ];
    await run('ffmpeg', args);
    made++;
  }
}
console.log(`rendered ${made} images into scripts/mock-images/`);
