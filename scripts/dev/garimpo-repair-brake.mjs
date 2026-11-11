// roteiro: conserto do freio
export async function play(h) {
  const { open, drag, tap, shot, ev, wait, done, tag } = h;
  await open(`g=brake&heavy=1&lvl=2`);
  await wait(2300);
  await shot(`${tag}-0-start`);
  const ws = await ev(() => window.__mg.pz.wires.map((w) => ({ x: w.rope.ex, y: w.rope.ey, t: w.target })));
  const ss = await ev(() => window.__mg.pz.sockets.map((s) => ({ x: s.x, y: s.y })));
  const wrong = ss.findIndex((_, i) => i !== ws[0].t);
  await drag(ws[0].x, ws[0].y, ss[wrong].x, ss[wrong].y, 14);
  await wait(100);
  await shot(`${tag}-1-wrong`);
  await wait(600);
  for (let i = 0; i < ws.length; i++) {
    const w = await ev((i) => ({ x: window.__mg.pz.wires[i].rope.ex, y: window.__mg.pz.wires[i].rope.ey }), i);
    await drag(w.x, w.y, ss[ws[i].t].x, ss[ws[i].t].y, 14);
    await wait(250);
  }
  await wait(500);
  await shot(`${tag}-2-hoses`);
  for (let k = 0; k < 10 && (await ev(() => window.__mg.step)) === 1; k++) {
    const [x, y] = await ev(() => window.__mg.pedalPad());
    await drag(x, y, x - 10, y + 100, 8);
    await wait(k === 1 ? 300 : 500);
    if (k === 1) await shot(`${tag}-3-bleed`);
  }
  await wait(600);
  const b = await ev(() => ({ x: window.__mg.bottle.x, y: window.__mg.bottle.y }));
  const [rx, ry] = await ev(() => window.__mg.resTop());
  await h.touch('touchStart', b.x, b.y);
  for (let k = 1; k <= 14; k++) await h.touch('touchMove', b.x + (rx + 40 - b.x) * k / 14, b.y + (ry - 60 - b.y) * k / 14), await wait(16);
  await wait(1200);
  await shot(`${tag}-4-pour`);
  await wait(2000);
  await h.touch('touchEnd', rx + 40, ry - 60);
  await wait(500);
  await shot(`${tag}-5-full`);
  const [px, py] = await ev(() => window.__mg.pedalPad());
  await tap(px, py);
  await wait(500);
  await shot(`${tag}-6-test`);
  await done(tag);
}
