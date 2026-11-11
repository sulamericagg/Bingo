// Página de desenvolvimento para conferir a vegetação/terreno 3D (screenshots e FPS).
// /scripts/dev/nature.html?g=world|fl3d|noites &tier=0..3 &biome=N &x= &z= &yaw= &pitch= &up=(m acima do olho) &hud=0
import { saveMode } from '../../src/core/quality';

const qs = new URLSearchParams(location.search);
const app = document.getElementById('app')!;
const g = qs.get('g') ?? 'world';
const tier = Number(qs.get('tier') ?? 2) as 0 | 1 | 2 | 3;
saveMode(tier);
const num = (k: string, d: number) => (qs.has(k) ? Number(qs.get(k)) : d);
const W = window as any;
W.__fps = { n: 0, t0: 0 };
const countFrames = () => {
  W.__fps.n++;
  requestAnimationFrame(countFrames);
};
requestAnimationFrame(countFrames);
if (qs.get('hud') === '0') {
  const st = document.createElement('style');
  st.textContent = '.fw-hud,.fl-hud,.nc-hud,[class*="hud"]{display:none!important}';
  document.head.appendChild(st);
}

if (g === 'world') {
  const { createWorld } = await import('../../src/games/floresta/world/worldgame');
  const { freshWorld } = await import('../../src/games/floresta/world/wsave');
  const { WorldGen } = await import('../../src/games/floresta/world/gen');
  const sv = freshWorld(num('seed', 20261110));
  let x = num('x', 0);
  let z = num('z', 30);
  if (qs.has('biome')) {
    // procura um ponto seco bem dentro do bioma pedido (espiral a partir da origem)
    const want = Number(qs.get('biome'));
    const gen = new WorldGen(sv.seed);
    const w = new Float32Array(16);
    let found = false;
    let skip = num('skip', 0);
    for (let r = 0; r < 4000 && !found; r += 48)
      for (let a = 0; a < 64 && !found; a++) {
        const px = Math.cos((a / 64) * Math.PI * 2) * r;
        const pz = Math.sin((a / 64) * Math.PI * 2) * r;
        const b = gen.weights(px, pz, w);
        const h0 = gen.height(px, pz);
        let flat = true;
        for (let k = 0; k < 8; k++) if (Math.abs(gen.height(px + Math.cos(k) * 10, pz + Math.sin(k) * 10) - h0) > 1.6) flat = false;
        if (b === want && w[b] > 0.85 && h0 > 1.5 && flat && Math.abs(pz % 384) > 40 && skip-- <= 0) {
          x = px;
          z = pz;
          found = true;
        }
      }
  }
  if (qs.has('camp')) {
    const gen = new WorldGen(sv.seed);
    const cp = gen.nearestCamp(x, z, 1e9);
    if (cp) {
      x = cp.x + num('cdx', 0);
      z = cp.z + num('cdz', 14);
    }
  }
  sv.px = x;
  sv.pz = z;
  sv.yaw = num('yaw', 0);
  const game = createWorld(app, { tier, exit: () => {}, save: sv, onSave: () => {} });
  W.game = game;
  if (qs.get('hand') === '0') {
    game.hand.visible = false;
    game.handMesh.visible = false;
    game.arm.mesh.visible = false;
  }
  const up = num('up', 0);
  const pitch = num('pitch', -0.08);
  game.tPitch = pitch;
  const step = game.step.bind(game);
  game.step = (dt: number) => {
    game.tPitch = pitch;
    step(dt);
    if (up) {
      game.camera.position.y += up;
      game.camera.updateMatrixWorld();
    }
  };
} else if (g === 'fl3d') {
  const { registerFloresta } = await import('../../src/games/floresta/register');
  registerFloresta();
  const { launch } = await import('../../src/games/floresta/game');
  const h = (await launch(app, () => {}, { mode: '3d' })) as any;
  W.game = h;
  if (qs.has('x')) h.sim.me.x = Number(qs.get('x'));
} else if (g === 'noites') {
  const { launch } = await import('../../src/games/noites/game');
  const h = (await launch(app, () => {})) as any;
  W.game = h;
  h.startSolo();
  if (qs.has('nx')) {
    const p = h.sim.player(h.myId);
    p.x = num('nx', 0);
    p.z = num('nz', 0);
    if (qs.has('cyaw')) h.view.camYaw = num('cyaw', 0);
    if (qs.has('cpitch')) h.view.camPitch = num('cpitch', 0.46);
  }
}
setTimeout(() => (document.title = 'ready'), 300);
