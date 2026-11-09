// Receitas de captura de cada tela do Bloop World (hub + minigames + recursos).
// Cada receita: { url, prep(page), tick? (código injetado a cada passo do relógio = "bot"), speed? }
// prep deixa a tela pronta (com o relógio em tempo real quando precisa de carregamento).
import { realtime, run } from './scene.mjs';

const APP = 'index.html?debug&nointro';
export const EXTRA_LS = {
  'bo-quality': '3',
  'bo-disaster': JSON.stringify({ next: 14, best: 42, survived: 31, played: 24 }),
};
// esconde ofertas/compras e avisos que não fazem sentido num vídeo de loja
export const CLEAN_CSS = '.tubo-btn-round[data-act=pause],.tubo-hint{display:none!important}';

async function boot(page) {
  await page.waitForFunction(() => !!window.__bloop, null, { timeout: 90000, polling: 250 });
  await realtime(page, 1200);
}
async function launch(page, id) {
  await boot(page);
  const ok = await page.evaluate((id) => {
    const B = window.__bloop;
    const d = B.listGames().find((g) => g.id === id);
    if (!d) return false;
    const o = d.launch;
    d.launch = async (...a) => (window.__h = await o.apply(d, a));
    B.launchGame(d);
    return true;
  }, id);
  if (!ok) throw new Error(`jogo ${id} não registrado`);
  await page.waitForFunction(() => !!window.__h, null, { timeout: 30000, polling: 200 });
  await realtime(page, 1200);
}
async function panel(page, id) {
  await boot(page);
  const ok = await page.evaluate((id) => {
    const p = window.__bloop.listPanels().find((x) => x.id === id);
    if (p) p.open();
    return !!p;
  }, id);
  if (!ok) throw new Error(`painel ${id} não registrado`);
  await realtime(page, 2500);
}
const tick = (page, fn) => page.evaluate(`window.__promoTick = ${fn}`);

export const RECIPES = {
  hub: {
    url: APP,
    async prep(page) {
      await boot(page);
      await realtime(page, 600);
    },
    // carrossel: troca de jogo a cada ~0,85 s
    onFrame: async (page, t) => {
      const k = Math.round(t * 30);
      if (k > 0 && k % 26 === 0) await page.evaluate(() => document.querySelector('.hub-arrow.next')?.click());
    },
  },
  tubo: {
    url: APP,
    async prep(page) {
      await launch(page, 'tubo');
      await tick(
        page,
        `(ms) => { const g = window.__tuboGame; if (!g) return;
          if (g.mode === 'ready') g.onTap();
          if (g.mode === 'hop' && !(g.stun > 0)) { const r = g.ringByIdx(g.ringI); if (r && [1, 3].includes(window.__tuboHit(r, g.geo).hit)) g.onTap(); } }`,
      );
      await run(page, 2.5);
    },
    speed: 1.6,
  },
  rally: {
    url: APP,
    async prep(page) {
      await launch(page, 'rally');
      await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => /Acelerar/i.test(b.textContent))?.click());
      await realtime(page, 1500);
      await tick(page, `() => { const r = window.__rally; if (!r || !r.car) return; const c = r.car; let rel = 0; try { rel = c.a - Math.atan(r.terrain.slope(c.x)); } catch {} r.keys.gas = Math.abs(rel) < 0.35; }`);
      await run(page, 2.5);
    },
  },
  tycoon: {
    url: APP + '&tymode=match&tybot',
    async prep(page) {
      await launch(page, 'tycoon');
      await realtime(page, 1500);
      await run(page, 20);
    },
    speed: 2,
  },
  disaster: {
    url: APP,
    async prep(page) {
      await launch(page, 'disaster');
      await page.evaluate(() => (window.__h.autoMe = true));
      await run(page, 4);
      // pula a fase de preparação: grava o desastre em si
      await page.evaluate(() => {
        const g = window.__h;
        if (g.phase === 'prepare') g.phaseT = g.phaseDur - 0.3;
      });
      await run(page, 4.5);
    },
  },
  band: {
    url: APP,
    async prep(page) {
      await launch(page, 'band');
      await page.evaluate(async () => {
        const S = await import('/src/games/band/songs.ts');
        const g = window.__h;
        const list = S.allSongs();
        const song = list.find((s) => s.tier === 'free') ?? list[0];
        g.autoplay = true;
        g.startSong(song, 'guitar', 'medio', g.soloSlots('guitar'));
      });
      await realtime(page, 800);
      await run(page, 6);
    },
  },
  pet: {
    url: APP,
    async prep(page) {
      await panel(page, 'pet');
    },
    onFrame: async (page, t) => {
      const k = Math.round(t * 30);
      if (k === 20 || k === 75) await page.mouse.click(270, 470);
    },
  },
  home: {
    url: APP + '&mock',
    async prep(page) {
      await panel(page, 'casa');
      // primeira visita pede um @nome: "Agora não"
      await page.evaluate(() => document.querySelector('.hm-later')?.click());
      await realtime(page, 1500);
    },
  },
  home3d: {
    url: 'scripts/dev/home3d.html?auto=party&skip&tier=2',
    gl: true,
    async prep(page) {
      await page.waitForFunction(() => !!document.querySelector('canvas'), null, { timeout: 60000, polling: 300 });
      await realtime(page, 5000);
      await page.evaluate(() => document.querySelectorAll('#ui,#out').forEach((e) => (e.style.display = 'none')));
      // vira a câmera para a mesa da festa (arrasta na tela)
      await page.mouse.move(380, 420);
      await page.mouse.down();
      for (let i = 1; i <= 10; i++) await page.mouse.move(380 - i * 14, 420 + i * 2);
      await page.mouse.up();
      await run(page, 6);
    },
  },
  creatures: {
    url: APP,
    async prep(page) {
      await boot(page);
      // coleção de um jogador dedicado: ~2/3 dos bichinhos já obtidos (determinístico)
      await page.evaluate(async () => {
        const C = await import('/src/creatures/catalog.ts');
        window.__bloop.save.creatures = C.CREATURES.filter((c, i) => i % 3 !== 2).map((c) => c.id);
        window.__bloop.save.creaturesNew = [];
      });
      await panel(page, 'colecao');
    },
  },
  pass: {
    url: APP,
    async prep(page) {
      await panel(page, 'pass');
    },
  },
};
