/**
 * Auditoria da Casa 3D: TODO móvel do catálogo precisa poder ser colocado, escolhido com o dedo,
 * movido, girado (se for de chão) e guardado. Falha (exit 1) se algum não der.
 *   npx vite --port 5191  &  node scripts/dev/test-home3d-items.mjs [http://localhost:5191]
 * (precisa do Playwright instalado: require('playwright'))
 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
let pw;
try {
  pw = require('playwright');
} catch {
  pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
}
const base = process.argv[2] || 'http://localhost:5191';
const b = await pw.chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 844, height: 390 }, hasTouch: true });
const errs = [];
p.on('pageerror', (e) => errs.push(String(e)));
await p.addInitScript(() => localStorage.setItem('bw-h3-coach-v1', '1'));
await p.goto(base + '/scripts/dev/home3d.html?auto=build&skip');
for (let i = 0; i < 40 && !(await p.evaluate(() => !!window.__home3d)); i++) await p.waitForTimeout(1000);
await p.waitForTimeout(2500);
const res = await p.evaluate(async () => {
  const h = window.__home3d;
  const { eng, decor, build, THREE } = h;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const room = eng.roomById('kitchen');
  // cômodo vazio e câmera de frente para ele
  for (const it of eng.items.filter((i) => i.room === room)) {
    room.design.items.splice(room.design.items.indexOf(it.data), 1);
    eng.removeItem(it);
  }
  build.target.copy(room.center);
  build.yaw = 0;
  build.pitch = 0.9;
  build.dist = 7;
  await wait(1500);
  const cv = eng.renderer.domElement.getBoundingClientRect();
  const fails = [];
  const ids = h.catalogIds();
  for (const id of ids) {
    const why = [];
    decor.spawnAt = () => ({ room, x: 3, z: 2.4, y: 1.4 });
    decor.spawn(id);
    if (!decor.mv) {
      fails.push(id + ': não nasceu');
      continue;
    }
    await decor.confirm();
    const it = eng.items[eng.items.length - 1];
    if (!it || it.data.id !== id) {
      fails.push(id + ': não foi colocado');
      continue;
    }
    await wait(60);
    eng.render();
    // escolher com o "dedo" no meio do objeto
    const c = new THREE.Box3().setFromObject(it.obj).getCenter(new THREE.Vector3());
    if (it.info.flat) c.y = 0.01;
    c.project(eng.camera);
    const sx = cv.left + ((c.x + 1) / 2) * cv.width,
      sy = cv.top + ((1 - c.y) / 2) * cv.height;
    const picked = decor.pickAt(sx, sy);
    if (picked !== it) why.push('não dá para escolher' + (picked ? ' (pegou ' + picked.kind + ')' : ''));
    // mover
    const before = it.homeP.clone();
    decor.startMove(it);
    if (!decor.mv) why.push('não começa a mover');
    else {
      decor.aimLocal(room, it.info.wall ? 1.4 : 1.2, it.info.wall ? 1.6 : 0, it.info.wall ? 0.1 : 3.6);
      if (!it.info.wall && !it.info.ceil) decor.rotate();
      await decor.confirm();
      if (decor.mv) {
        why.push('não coloca depois de mover');
        decor.cancel();
      } else if (it.homeP.distanceTo(before) < 0.2) why.push('não saiu do lugar');
      if (!it.obj.visible) why.push('sumiu depois de mover');
    }
    // guardar
    decor.select(it);
    if (decor.sel !== it) why.push('não seleciona para o menu');
    room.design.items.splice(room.design.items.indexOf(it.data), 1);
    eng.removeItem(it);
    decor.select(null);
    if (why.length) fails.push(id + ': ' + why.join(', '));
  }
  return { n: ids.length, fails };
});
await b.close();
console.log(`itens testados: ${res.n}`);
if (errs.length) console.log('erros na página:\n' + errs.join('\n'));
if (res.fails.length) {
  console.log('FALHOU:\n  ' + res.fails.join('\n  '));
  process.exit(1);
}
console.log('OK: todos os itens podem ser colocados, escolhidos, movidos e guardados');
process.exit(errs.length ? 1 : 0);
