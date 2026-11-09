// Edição com ffmpeg: cortes com transições (xfade), textos animados, composição horizontal, mixagem.
import { spawn } from 'node:child_process';

export function ff(args, { quiet = true } = {}) {
  return new Promise((res, rej) => {
    const p = spawn('ffmpeg', ['-y', '-hide_banner', '-loglevel', quiet ? 'error' : 'info', ...args], { stdio: ['ignore', 'inherit', 'pipe'] });
    let err = '';
    p.stderr.on('data', (d) => (err += d));
    p.on('close', (c) => (c === 0 ? res() : rej(new Error(`ffmpeg falhou (${c}): ${err.slice(-2000)}`))));
  });
}

export function probe(file) {
  return new Promise((res, rej) => {
    const p = spawn('ffprobe', ['-v', 'error', '-show_entries', 'format=duration,size:stream=codec_name,codec_type,width,height,r_frame_rate', '-of', 'json', file]);
    let out = '';
    p.stdout.on('data', (d) => (out += d));
    p.on('close', (c) => (c === 0 ? res(JSON.parse(out)) : rej(new Error('ffprobe ' + file))));
  });
}

const ENC = ['-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', '-r', '30'];
const ENC_FAST = ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '15', '-pix_fmt', 'yuv420p', '-r', '30'];

/**
 * Junta segmentos com transições xfade.
 * segs: [{ file, in, dur, trans?: 'fadewhite'|'zoomin'|..., zoom?: number }]  (trans = transição PARA este segmento)
 * Os cortes caem em `cuts` (tempo de saída) — a duração de cada segmento já inclui a sobreposição td.
 */
export async function chain(segs, out, { w, h, td = 0.24 }) {
  const args = [];
  const fc = [];
  segs.forEach((s, i) => {
    args.push('-ss', s.in.toFixed(3), '-t', (s.dur + 0.1).toFixed(3), '-i', s.file);
    const z = s.zoom ?? 0;
    const zoom = z ? `,scale=w='${w}*(1+${z}*t/${s.dur.toFixed(3)})':h=-2:eval=frame,crop=${w}:${h}` : '';
    fc.push(`[${i}:v]fps=30,scale=${w}:${h}:flags=bicubic,setsar=1,format=yuv420p${zoom},trim=duration=${s.dur.toFixed(3)},setpts=PTS-STARTPTS,settb=AVTB[s${i}]`);
  });
  let cur = 's0';
  let t = segs[0].dur;
  for (let i = 1; i < segs.length; i++) {
    const off = t - td;
    const o = i === segs.length - 1 ? 'vout' : `x${i}`;
    fc.push(`[${cur}][s${i}]xfade=transition=${segs[i].trans ?? 'fade'}:duration=${td}:offset=${off.toFixed(3)}[${o}]`);
    cur = o;
    t = off + segs[i].dur;
  }
  if (segs.length === 1) fc.push(`[s0]null[vout]`);
  await ff([...args, '-filter_complex', fc.join(';'), '-map', '[vout]', ...ENC_FAST, out]);
  return t;
}

/**
 * Textos animados sobre um vídeo. Cada texto é uma sequência PNG transparente (animação de entrada
 * renderizada no navegador) cujo último quadro fica congelado até o fim.
 * ovs: [{ seq: 'dir/ov3_%03d.png', start, dur, y (px do topo) }]
 */
export async function overlays(input, ovs, out) {
  const args = ['-i', input];
  const fc = [];
  let cur = '0:v';
  ovs.forEach((o, i) => {
    args.push('-framerate', '30', '-i', o.seq);
    const k = i + 1;
    fc.push(`[${k}:v]format=rgba,tpad=stop_mode=clone:stop_duration=${o.dur.toFixed(3)},trim=duration=${o.dur.toFixed(3)},fade=t=out:st=${(o.dur - 0.2).toFixed(3)}:d=0.2:alpha=1,setpts=PTS-STARTPTS+${o.start.toFixed(3)}/TB[o${k}]`);
    const nxt = `v${k}`;
    fc.push(`[${cur}][o${k}]overlay=x=0:y=${Math.round(o.y)}:eof_action=pass:enable='between(t,${o.start.toFixed(3)},${(o.start + o.dur).toFixed(3)})'[${nxt}]`);
    cur = nxt;
  });
  const maps = ['-map', ovs.length ? `[${cur}]` : '0:v'];
  await ff([...args, ...(ovs.length ? ['-filter_complex', fc.join(';')] : []), ...maps, ...ENC_FAST, out]);
}

/** Vídeo vertical no centro de um quadro horizontal com fundo desfocado + moldura PNG. */
export async function horizontalize(input, frame, out, { W = 1920, H = 1080 } = {}) {
  const cw = Math.round((H * 9) / 16 / 2) * 2;
  const fc = [
    `[0:v]split[a][b]`,
    `[a]scale=${W}:-2,crop=${W}:${H},boxblur=28:3,eq=brightness=-0.08:saturation=1.25[bg]`,
    `[b]scale=${cw}:${H}[fg]`,
    `[bg][fg]overlay=x=(W-w)/2:y=0[m]`,
    `[m][1:v]overlay=0:0:shortest=1,format=yuv420p[v]`,
  ];
  await ff(['-i', input, '-loop', '1', '-framerate', '30', '-i', frame, '-filter_complex', fc.join(';'), '-map', '[v]', '-shortest', ...ENC_FAST, out]);
  return cw;
}

/** Final: acrescenta áudio e reencoda com qualidade de entrega. */
export async function finalize(video, audio, out, { faststart = true } = {}) {
  const args = ['-i', video];
  if (audio) args.push('-i', audio);
  const maps = ['-map', '0:v'];
  if (audio) maps.push('-map', '1:a', '-c:a', 'aac', '-b:a', '192k', '-ar', '44100', '-shortest');
  await ff([...args, ...maps, ...ENC, '-profile:v', 'high', '-level', '4.1', ...(faststart ? ['-movflags', '+faststart'] : []), out]);
}

/** Loop sem emenda: B=[1,dur+1] com o último 1 s fundido em [0,1]. */
export async function seamless(input, out, dur, { w, h }) {
  const fc = [
    `[0:v]fps=30,scale=${w}:${h},format=yuv420p,split[a][b]`,
    `[a]trim=start=1:duration=${dur},setpts=PTS-STARTPTS,settb=AVTB[A]`,
    `[b]trim=start=0:duration=1,setpts=PTS-STARTPTS,settb=AVTB[B]`,
    `[A][B]xfade=transition=fade:duration=1:offset=${dur - 1}[v]`,
  ];
  await ff(['-i', input, '-filter_complex', fc.join(';'), '-map', '[v]', ...ENC_FAST, out]);
}
