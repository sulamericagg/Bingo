// roteiro: buchas
export async function play(h) {
  const { open, drag, tap, shot, ev, wait, done, tag } = h;
  await open(`g=bushing&lvl=1`);
  await wait(2300);
  await shot(`${tag}-0-start`);
  const ex = await ev(() => Array.from(window.__mg.ex));
  const ay = await ev(() => window.__mg.ay);
  for (let i = 0; i < 4; i++) {
    if (i === 1) {
      await h.touch('touchStart', ex[i], ay);
      for (let k = 1; k <= 6; k++) await h.touch('touchMove', ex[i] + k * 4, ay + k * 14), await wait(16);
      await shot(`${tag}-1-pulling`);
      await h.touch('touchEnd', ex[i] + 24, ay + 84);
    } else await drag(ex[i], ay, ex[i] + 20, ay + 110, 10);
    await wait(250);
  }
  await wait(900);
  await shot(`${tag}-2-empty`);
  for (let k = 0; k < 14 && (await ev(() => window.__mg.step)) === 1; k++) {
    const [hx, hy] = await ev(() => window.__mg.handle());
    await drag(hx, hy, hx, hy + 110, 8);
    await wait(260);
    if (k === 3) await shot(`${tag}-3-press`);
  }
  await wait(400);
  await shot(`${tag}-4-pressed`);
  for (let i = 0; i < 4; i++) {
    await tap(ex[i], ay);
    await wait(i === 1 ? 220 : 520);
    if (i === 1) await shot(`${tag}-5-bolts`), await wait(300);
  }
  await wait(500);
  const W = await ev(() => window.__mg.W);
  await h.touch('touchStart', W / 2, 80);
  for (let k = 1; k <= 8; k++) await h.touch('touchMove', W / 2, 80 + k * 10), await wait(16);
  await shot(`${tag}-6-push`);
  await h.touch('touchEnd', W / 2, 160);
  await wait(250);
  await shot(`${tag}-7-bounce`);
  await done(tag);
}
