/* Vitrine do Bloop Cinema no menu do hub (carregada sob demanda). */
import { t } from '../i18n';
import { gameFont } from '../i18n/font';
import { drawBg } from './bg2d';
import { presetById } from './data';
import type { CastMember } from './format';
import { drawBubbles } from './fx2d';
import { drawActor2D, poseRig, restRig } from './rig2d';

const A: CastMember = { id: 'a', name: 'Pipoca', kind: 'avatar', avatar: presetById('pipoca')!.av, voice: 'normal' };
const B: CastMember = { id: 'b', name: 'Lumi', kind: 'avatar', avatar: presetById('lumi')!.av, voice: 'normal' };
const rig = restRig();

export function drawShowcase(x: CanvasRenderingContext2D, w: number, h: number, time: number): void {
  const ppu = w / 13;
  x.save();
  x.translate(w / 2, h / 2);
  x.scale(ppu, ppu);
  x.translate(-8, -4.9);
  drawBg(x, 'stage', 'day', time, ppu);
  x.restore();
  const fy = h * 0.86;
  const ah = h * 0.42;
  const phase = Math.floor(time / 2.4) % 2;
  const k = (time % 2.4) / 2.4;
  x.save();
  x.translate(w * 0.3, fy);
  poseRig(phase ? 'stand' : 'wave', time, rig);
  rig.lookX = 0.45;
  drawActor2D(x, A, ah, { rig, expr: phase ? 'surprised' : 'happy', talk: phase ? 0 : Math.abs(Math.sin(time * 14)) * 0.8, t: time, face: 1, blink: 0 });
  x.restore();
  x.save();
  x.translate(w * 0.7, fy);
  poseRig(phase ? 'dance' : 'stand', time, rig);
  rig.lookX = 0.45;
  drawActor2D(x, B, ah, { rig, expr: phase ? 'laughing' : 'love', talk: phase ? Math.abs(Math.sin(time * 13)) * 0.8 : 0, t: time, face: -1, blink: 0 });
  x.restore();
  const head = fy - ah * 1.05;
  drawBubbles(x, w, h, [
    {
      text: phase ? t('cin.show.b2', 'Ação!') : t('cin.show.b1', 'Vamos fazer um filme?'),
      style: phase ? 'shout' : 'speech',
      age: k * 2.4,
      left: (1 - k) * 2.4,
      speaker: { cast: 'x', x: phase ? w * 0.7 : w * 0.3, y: fy, headY: head, mouthY: head, ppu, visible: true },
    },
  ]);
  // REC + faixa de filme
  x.fillStyle = 'rgba(0,0,0,.55)';
  x.fillRect(0, 0, w, h * 0.07);
  x.fillRect(0, h * 0.93, w, h * 0.07);
  x.fillStyle = '#fff';
  for (let i = 0; i < 14; i++) {
    const px = ((i / 14) * w + time * 30) % w;
    x.fillRect(px, h * 0.018, w * 0.025, h * 0.034);
    x.fillRect(px, h * 0.948, w * 0.025, h * 0.034);
  }
  if (Math.sin(time * 5) > 0) {
    x.fillStyle = '#ff3d6e';
    x.beginPath();
    x.arc(w * 0.06, h * 0.13, h * 0.025, 0, Math.PI * 2);
    x.fill();
  }
  x.fillStyle = '#fff';
  x.font = gameFont(700, Math.round(h * 0.045));
  x.fillText('REC', w * 0.085, h * 0.145);
}
