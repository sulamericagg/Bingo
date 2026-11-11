/* ============================================================
 *  TESTE 3D DO APARELHO (~1,5–2,5 s, por trás da tela "Ajustando os gráficos…").
 *  Cena fora da tela parecida com a dos nossos jogos: chão com relevo e luz,
 *  grama de lâminas com vento (src/3d/nature), árvores instanciadas, pedras
 *  soltas (chamadas de desenho), sombras no nível Alto. Três cargas, uma por
 *  nível (1 Baixo, 2 Médio, 3 Alto), cada uma com o orçamento de natureQ(tier).
 *  Tempo de quadro = render + readPixels(1 px) (força a GPU a terminar).
 *  Para na primeira carga que não aguenta, respeita um prazo duro, e libera o
 *  contexto WebGL no fim. Qualquer erro → ok:false (quem chama cai no 2D).
 * ============================================================ */
import type { Tier } from './quality';

export interface BenchLevel {
  tier: 1 | 2 | 3;
  /** mediana do tempo de quadro (ms) */
  ms: number;
  frames: number;
  pass: boolean;
}

export interface GpuBenchResult {
  ok: boolean;
  /** maior nível que passou (0 se nem o Baixo passou) */
  tier: Tier;
  /** soma dos fps equivalentes das cargas medidas (maior = melhor; só para comparar aparelhos) */
  score: number;
  levels: BenchLevel[];
  ms: number;
  err?: string;
}

export interface GpuBenchOptions {
  /** prazo total (ms), incluindo carregar o three.js e montar a cena */
  budgetMs?: number;
  /** 0..1 */
  onProgress?: (f: number) => void;
}

/** resolução de referência (retrato, ~0,5 MP): a mesma em todo aparelho, para o score ser comparável */
const W = 540;
const H = 960;
/** limite da mediana para a carga passar (ms): folga para a lógica do jogo e telas maiores */
const PASS_MS: Record<1 | 2 | 3, number> = { 1: 28, 2: 17, 3: 12.5 };
/** cargas: árvores instanciadas, pedras soltas (1 draw call cada), sombras */
const LOAD: Record<1 | 2 | 3, { trees: number; rocks: number; shadows: boolean }> = {
  1: { trees: 12, rocks: 16, shadows: false },
  2: { trees: 28, rocks: 40, shadows: false },
  3: { trees: 56, rocks: 80, shadows: true },
};
const WARM = 2;
const MAX_FRAMES = 9;
const LEVEL_MS = 420;

const sleep0 = () => new Promise<void>((r) => setTimeout(r, 0));

export async function runGpuBenchmark(o: GpuBenchOptions = {}): Promise<GpuBenchResult> {
  const t0 = performance.now();
  const budget = o.budgetMs ?? 2600;
  const left = () => budget - (performance.now() - t0);
  const prog = (f: number) => {
    try {
      o.onProgress?.(Math.max(0, Math.min(1, f)));
    } catch {
      /* */
    }
  };
  const res: GpuBenchResult = { ok: false, tier: 0, score: 0, levels: [], ms: 0 };
  const disposers: (() => void)[] = [];
  let renderer: import('three').WebGLRenderer | null = null;
  try {
    const [THREE, N] = await Promise.all([import('three'), import('../3d/nature')]);
    prog(0.12);
    if (left() < 600) throw new Error('import lento');

    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, stencil: false, powerPreference: 'high-performance', preserveDrawingBuffer: false });
    renderer.setPixelRatio(1);
    renderer.setSize(W, H, false);
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    const gl = renderer.getContext();

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#9fd8ff');
    scene.fog = new THREE.Fog('#9fd8ff', 30, 90);
    const cam = new THREE.PerspectiveCamera(62, W / H, 0.1, 120);
    scene.add(new THREE.HemisphereLight('#dff4ff', '#4a6a2a', 1.1));
    const sun = new THREE.DirectionalLight('#fff3d6', 2.2);
    sun.position.set(18, 30, 10);
    sun.shadow.mapSize.set(1024, 1024);
    const sc = sun.shadow.camera;
    sc.left = sc.bottom = -30;
    sc.right = sc.top = 30;
    sc.near = 1;
    sc.far = 90;
    scene.add(sun, sun.target);

    // chão com relevo (mesma ideia do mundo aberto)
    const hAt = (x: number, z: number) => N.fbm2(x * 0.03, z * 0.03, 7) * 5 - 2.5;
    const tg = new THREE.PlaneGeometry(160, 160, 96, 96);
    tg.rotateX(-Math.PI / 2);
    const tp = tg.attributes.position as import('three').BufferAttribute;
    const tc = new Float32Array(tp.count * 3);
    const col = new THREE.Color();
    for (let i = 0; i < tp.count; i++) {
      const x = tp.getX(i);
      const z = tp.getZ(i);
      tp.setY(i, hAt(x, z));
      col.setHSL(0.27 + N.vnoise2(x * 0.1, z * 0.1) * 0.05, 0.5, 0.32 + N.vnoise2(x * 0.3, z * 0.3) * 0.08);
      tc.set([col.r, col.g, col.b], i * 3);
    }
    tg.setAttribute('color', new THREE.BufferAttribute(tc, 3));
    tg.computeVertexNormals();
    const tm = new THREE.MeshLambertMaterial({ vertexColors: true });
    const terrain = new THREE.Mesh(tg, tm);
    terrain.receiveShadow = true;
    scene.add(terrain);
    disposers.push(() => (tg.dispose(), tm.dispose()));

    // grama de lâminas com vento (GPU)
    const grassCol = new THREE.Color('#4f9a35').convertSRGBToLinear();
    const grass = new N.GrassField(
      scene,
      {
        height: hAt,
        cell: (_x, _z, out) => {
          out[0] = grassCol.r;
          out[1] = grassCol.g;
          out[2] = grassCol.b;
          out[3] = 1;
          return 1;
        },
      },
      null,
    );
    disposers.push(() => grass.dispose());

    // árvores instanciadas (duas espécies) com vento no shader
    const treeGeos = [
      N.natureTree({ kind: 'oak', h: 6, trunk: '#7a4a2a', trunkDark: '#4a2a16', leaf: '#5cb84a', leaf2: '#2f7a3a', seed: 3 }),
      N.natureTree({ kind: 'pine', h: 7, trunk: '#6a3e22', leaf: '#3f8a4a', leaf2: '#1f5a32', seed: 5 }),
    ];
    const treeMat = N.natureMat({ amp: 0.004, y0: 1.5 });
    const MAXT = LOAD[3].trees;
    const trees = treeGeos.map((g) => {
      const im = new THREE.InstancedMesh(g, treeMat, MAXT);
      im.castShadow = true;
      im.receiveShadow = true;
      scene.add(im);
      return im;
    });
    disposers.push(() => (treeGeos.forEach((g) => g.dispose()), treeMat.dispose()));
    const R = N.rng(42);
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i < MAXT; i++) {
      const a = R() * Math.PI * 2;
      const d = 6 + R() * 40;
      const x = Math.cos(a) * d;
      const z = Math.sin(a) * d;
      const s = 0.8 + R() * 0.5;
      q.setFromAxisAngle(up, R() * 6.28);
      m4.compose(new THREE.Vector3(x, hAt(x, z) - 0.1, z), q, new THREE.Vector3(s, s, s));
      trees[i % 2].setMatrixAt(i >> 1, m4);
    }

    // pedras soltas: uma chamada de desenho cada (custo de CPU/driver por draw call)
    const rockGeo = N.natureRock(2);
    const rockMat = new THREE.MeshLambertMaterial({ vertexColors: true });
    disposers.push(() => (rockGeo.dispose(), rockMat.dispose()));
    const rocks: import('three').Mesh[] = [];
    for (let i = 0; i < LOAD[3].rocks; i++) {
      const r = new THREE.Mesh(rockGeo, rockMat);
      const a = R() * Math.PI * 2;
      const d = 3 + R() * 30;
      r.position.set(Math.cos(a) * d, 0, Math.sin(a) * d);
      r.position.y = hAt(r.position.x, r.position.z);
      r.scale.setScalar(0.4 + R() * 0.8);
      r.rotation.y = R() * 6;
      r.castShadow = true;
      scene.add(r);
      rocks.push(r);
    }

    const px = new Uint8Array(4);
    let yaw = 0;
    let wind = 0;
    const camY = hAt(0, 0) + 1.7;
    const frame = (): number => {
      const a = performance.now();
      yaw += 0.045;
      wind += 1 / 60;
      N.windTime.value = wind;
      cam.position.set(Math.sin(yaw * 0.3) * 2, camY, Math.cos(yaw * 0.3) * 2);
      cam.lookAt(cam.position.x + Math.sin(yaw) * 10, camY - 1.2, cam.position.z + Math.cos(yaw) * 10);
      grass.update(cam.position.x, cam.position.y, cam.position.z);
      renderer!.render(scene, cam);
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      return performance.now() - a;
    };

    const levels: (1 | 2 | 3)[] = [1, 2, 3];
    for (let li = 0; li < levels.length; li++) {
      const lv = levels[li];
      if (left() < 250) break;
      const L = LOAD[lv];
      grass.setQuality(N.natureQ(lv as Tier).grass);
      // monta todos os canteiros antes de medir (≤ 1 por update)
      for (let k = 0; k < 64 && left() > 200; k++) grass.update(0, camY, 0);
      trees.forEach((im) => (im.count = L.trees >> 1));
      rocks.forEach((r, i) => (r.visible = i < L.rocks));
      renderer.shadowMap.enabled = L.shadows;
      sun.castShadow = L.shadows;
      // compila shaders antes de medir (Mali antigo leva centenas de ms)
      renderer.compile(scene, cam);
      const times: number[] = [];
      const ls = performance.now();
      let n = 0;
      while (n < WARM + MAX_FRAMES && left() > 0) {
        const ms = frame();
        n++;
        if (n > WARM) times.push(ms);
        prog(0.15 + ((li + Math.min(1, (performance.now() - ls) / LEVEL_MS)) / levels.length) * 0.8);
        await sleep0();
        if (performance.now() - ls > LEVEL_MS && times.length >= 3) break;
        // carga claramente pesada demais: não precisa de mais amostras
        if (times.length >= 2 && Math.min(...times) > PASS_MS[lv] * 2.5) break;
      }
      if (!times.length) break;
      times.sort((x, y) => x - y);
      const med = times[times.length >> 1];
      const pass = med <= PASS_MS[lv];
      res.levels.push({ tier: lv, ms: Math.round(med * 10) / 10, frames: times.length, pass });
      res.score += 1000 / Math.max(1, med);
      if (!pass) break;
      res.tier = lv;
    }
    res.score = Math.round(res.score);
    res.ok = res.levels.length > 0;
    if (!res.ok) res.err = 'sem tempo';
  } catch (e) {
    res.ok = false;
    res.err = String((e as Error)?.message ?? e).slice(0, 120);
  } finally {
    for (const d of disposers) {
      try {
        d();
      } catch {
        /* */
      }
    }
    try {
      renderer?.dispose();
      renderer?.forceContextLoss();
    } catch {
      /* */
    }
    res.ms = Math.round(performance.now() - t0);
    prog(1);
  }
  return res;
}
