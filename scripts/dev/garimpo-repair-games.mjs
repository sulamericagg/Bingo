// Garimpo — consertos: roteiros dos minijogos (usado por garimpo-repair-shots.mjs)
export async function run(h) {
  const { only, open, drag, tap, shot, ev, G, wait, done } = h;
  const all = only === 'all';
  if (all || only === 'electric') {
    for (const lvl of [1, 3]) {
      const tag = `elec-l${lvl}`;
      await open(`g=electric&lvl=${lvl}`);
      await wait(2300);
      await shot(`${tag}-0-closed`);
      const b = await ev(() => ({ bx: window.__mg.bx, by: window.__mg.by, bw: window.__mg.bw, bh: window.__mg.bh }));
      await drag(b.bx + b.bw - 30, b.by + b.bh / 2, b.bx - 120, b.by + b.bh / 2, 16);
      await wait(200);
      await shot(`${tag}-1-opening`);
      await wait(600);
      await shot(`${tag}-2-open`);
      // um errado primeiro (faísca)
      const ws = await ev(() => window.__mg.pz.wires.map((w) => ({ x: w.rope.ex, y: w.rope.ey, t: w.target })));
      const ss = await ev(() => window.__mg.pz.sockets.map((s) => ({ x: s.x, y: s.y })));
      const wrong = ss.findIndex((_, i) => i !== ws[0].t);
      await drag(ws[0].x, ws[0].y, ss[wrong].x, ss[wrong].y, 14);
      await wait(90);
      await shot(`${tag}-3-spark`);
      await wait(600);
      for (let i = 0; i < ws.length; i++) {
        const w = await ev((i) => ({ x: window.__mg.pz.wires[i].rope.ex, y: window.__mg.pz.wires[i].rope.ey }), i);
        const s = ss[ws[i].t];
        if (i === 1) {
          await h.touch('touchStart', w.x, w.y);
          for (let k = 1; k <= 10; k++) {
            await h.touch('touchMove', w.x + ((s.x - w.x) * k) / 14, w.y + ((s.y - w.y) * k) / 14);
            await wait(16);
          }
          await wait(120);
          await shot(`${tag}-4-dragging`);
          for (let k = 11; k <= 14; k++) {
            await h.touch('touchMove', w.x + ((s.x - w.x) * k) / 14, w.y + ((s.y - w.y) * k) / 14);
            await wait(16);
          }
          await h.touch('touchEnd', s.x, s.y);
        } else await drag(w.x, w.y, s.x, s.y, 14);
        await wait(250);
      }
      await wait(500);
      await shot(`${tag}-5-wired`);
      await drag(b.bx - 60, b.by + b.bh / 2, b.bx + b.bw, b.by + b.bh / 2, 16);
      await wait(700);
      await shot(`${tag}-6-closed`);
      await tap(b.bx + b.bw - 60, b.by + b.bh - 54);
      await wait(600);
      await shot(`${tag}-7-on`);
      await done(tag);
    }
  }
  for (const [g, art] of [['part', 'hose'], ['part', 'pin'], ['part', 'alt'], ['part', 'rotor'], ['part', 'cyl'], ['bushing', 'alt'], ['brake', 'cyl']]) {
    const tag = g === 'part' ? `part-${art}` : g;
    if (!(all || only === g || only === tag)) continue;
    const mod = await import(`./garimpo-repair-${g}.mjs`).catch((e) => (console.log('skip', g, e.message), null));
    if (mod) await mod.play({ ...h, tag, art });
  }
  void G;
}
