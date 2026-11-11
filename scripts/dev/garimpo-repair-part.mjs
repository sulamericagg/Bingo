// roteiro: peça quebrada
export async function play(h) {
  const { open, drag, tap, twist, shot, ev, wait, done, tag, art } = h;
  await open(`g=part&art=${art}&lvl=${art === 'pin' || art === 'rotor' ? 2 : 1}`);
  await wait(2300);
  await shot(`${tag}-0-start`);
  for (let i = 0; i < 4; i++) {
    const [x, y] = await ev((i) => window.__mg.boltPos(i), i);
    await twist(x, y, -1.05, 28, i === 0 ? 12 : -1, `${tag}-1-unbolt`);
    await wait(120);
  }
  await wait(800);
  const m = await ev(() => ({ mx: window.__mg.mx, my: window.__mg.my, bx: window.__mg.binX, by: window.__mg.binY }));
  await drag(m.mx + 60, m.my, m.mx - 170, 300, 16);
  await wait(500);
  await shot(`${tag}-2-open`);
  await drag(m.mx, m.my, m.bx, m.by - 40, 16);
  await wait(900);
  await shot(`${tag}-3-removed`);
  // tenta no lugar errado primeiro (orientação errada)
  const nw = await ev(() => ({ x: window.__mg.nw.x, y: window.__mg.nw.y }));
  await drag(nw.x, nw.y, m.mx, m.my, 14);
  await wait(120);
  await shot(`${tag}-4-wrong`);
  await wait(800);
  for (let k = 0; k < 4 && (await ev(() => window.__mg.rot)) !== 0; k++) {
    const [rx, ry] = await ev(() => window.__mg.rotBtn());
    await tap(rx, ry);
    await wait(250);
  }
  await shot(`${tag}-5-rotated`);
  const nw2 = await ev(() => ({ x: window.__mg.nw.x, y: window.__mg.nw.y }));
  await drag(nw2.x, nw2.y, m.mx, m.my, 14);
  await wait(900);
  await shot(`${tag}-6-fitted`);
  const cv = await ev(() => ({ x: window.__mg.cover.x, y: window.__mg.cover.y }));
  await drag(cv.x, cv.y, m.mx, m.my, 14);
  await wait(800);
  for (let i = 0; i < 4; i++) {
    const [x, y] = await ev((i) => window.__mg.boltPos(i), i);
    await tap(x, y);
    await wait(i === 1 ? 200 : 520);
    if (i === 1) await shot(`${tag}-7-bolting`), await wait(350);
  }
  await wait(500);
  const [tx, ty] = await ev(() => window.__mg.testBtn());
  await shot(`${tag}-8-ready`);
  await tap(tx, ty);
  await wait(700);
  await shot(`${tag}-9-test`);
  await done(tag);
}
