/* ============================================================
 *  COZINHA MALUCA — guia: "para onde ir agora".
 *  - hintTarget(): a estação certa para o que você está segurando (brilho de dica).
 *  - tutorialStep(): o treino guiado dos 3 primeiros dias. O passo vem do
 *    estado da cozinha (robusto: se o jogador derrubar algo, o guia volta).
 * ============================================================ */
import { t } from '../../i18n';
import { INGS, RECIPES, ingName, compIng, compRoute, compStage, type Proc } from './data';
import { COOKERS, IK, type Item, type Player, type Sim, type Station } from './sim';

const KIND: Record<Proc, Station['k']> = { chop: 'board', boil: 'pot', fry: 'pan', bake: 'oven', blend: 'blender' };

function nearest(sim: Sim, me: Player, f: (s: Station) => boolean): number {
  let best = -1;
  let bd = 1e9;
  for (const s of sim.st) {
    if ((!s.fx && !s.fy) || !f(s)) continue;
    const d = Math.hypot(s.x + 0.5 - me.x, s.y + 0.5 - me.y);
    if (d < bd) {
      bd = d;
      best = s.i;
    }
  }
  return best;
}
/** o prato aceita esse componente para algum pedido? */
function plateWants(sim: Sim, plate: Item, c: number): boolean {
  if (plate.parts.includes(c)) return false;
  for (const o of sim.orders) {
    const parts = RECIPES[o.r].parts;
    if (parts.includes(c) && plate.parts.every((x) => parts.includes(x))) return true;
  }
  return false;
}

/** estação para levar o item que o jogador segura (-1 = nada a sugerir) */
export function hintTarget(sim: Sim, me: Player): number {
  const h = me.hold;
  const fire = nearest(sim, me, (s) => s.fire > 0);
  if (h && h.k === IK.Ext) return fire;
  if (!h) {
    if (fire >= 0) return nearest(sim, me, (s) => !!s.item && s.item.k === IK.Ext);
    return -1;
  }
  if (h.k === IK.Dirty) return nearest(sim, me, (s) => s.k === 'sink' && s.fire <= 0);
  if (h.k === IK.Ing) {
    if (h.burnt) return nearest(sim, me, (s) => s.k === 'trash');
    const np = sim.nextProc(h);
    const g = INGS[compIng(h.c)];
    // estágio 0 com rota ainda indefinida: escolhe a primeira rota que algum pedido quer
    let proc: Proc | null = np;
    if (compStage(h.c) === 0) {
      proc = null;
      for (let r = 0; r < g.routes.length; r++) {
        const route = g.routes[r];
        const want = sim.orders.some((o) => RECIPES[o.r].parts.some((c) => compIng(c) === compIng(h.c) && compRoute(c) === r));
        if (want) {
          proc = route[0] ?? null;
          break;
        }
      }
      if (proc === null && g.routes[0].length) proc = g.routes[0][0];
    }
    if (proc) return nearest(sim, me, (s) => s.k === KIND[proc] && !s.item && s.fire <= 0);
    const pl = nearest(sim, me, (s) => !!s.item && s.item.k === IK.Plate && s.fire <= 0 && plateWants(sim, s.item, h.c));
    if (pl >= 0) return pl;
    return nearest(sim, me, (s) => s.k === 'counter' && !s.item && s.fire <= 0);
  }
  if (h.k === IK.Plate) {
    if (h.parts.length && sim.matchOrder(h.parts)) return nearest(sim, me, (s) => s.k === 'window' || s.k === 'belt');
    if (h.parts.length && !sim.orders.some((o) => h.parts.every((x) => RECIPES[o.r].parts.includes(x)))) return nearest(sim, me, (s) => s.k === 'trash');
    const ready = nearest(sim, me, (s) => !!s.item && s.item.k === IK.Ing && !s.item.burnt && s.fire <= 0 && plateWants(sim, h, s.item.c) && (!COOKERS[s.k] || sim.nextProc(s.item) === null));
    if (ready >= 0) return ready;
    return nearest(sim, me, (s) => s.k === 'counter' && !s.item && s.fire <= 0);
  }
  return -1;
}

export interface Step {
  /** texto curto (uma linha) */
  txt: string;
  /** estação a destacar (-1 = nenhuma) */
  st: number;
  /** id estável do passo (para animar a troca) */
  id: string;
  /** seta grande (true) ou só o brilho de dica (passos "sozinho") */
  strong: boolean;
}

/** Treino guiado. day = 1 (picar), 2 (cozinhar + fogo), 3 (lavar louça). */
export class Tutorial {
  firedAt = -1;
  doneT = 0;
  constructor(
    readonly day: number,
    readonly sim: Sim,
  ) {}
  get finished(): boolean {
    return this.sim.served >= 2;
  }
  step(me: Player): Step {
    const sim = this.sim;
    const r = RECIPES[sim.menu[0]];
    const c = r.parts[0];
    const ing = compIng(c);
    const route = INGS[ing].routes[compRoute(c)];
    const proc = route[0] ?? 'chop';
    const kind = KIND[proc];
    const isIt = (it: Item | null | undefined, stage: number) => !!it && it.k === IK.Ing && compIng(it.c) === ing && !it.burnt && compStage(it.c) === stage;
    const h = me.hold;
    const S = (id: string, txt: string, st: number): Step => ({ id, txt, st, strong: id[0] !== 'f' });
    if (this.finished) return S('end', t('cozinha.tut.end', 'Muito bem! Você é chef!'), -1);
    // --------- dia 2: fogo + extintor (depois do 1º prato) ---------
    if (this.day === 2 && sim.served >= 1) {
      if (this.firedAt < 0) {
        this.firedAt = sim.time;
        const pot = sim.st.find((s) => s.k === kind);
        const near = sim.st.filter((s) => s.k === 'counter' && (s.fx || s.fy) && !s.item).sort((a, b) => (pot ? Math.hypot(a.x - pot.x, a.y - pot.y) - Math.hypot(b.x - pot.x, b.y - pot.y) : 0))[0];
        if (near) sim.ignite(near);
      }
      const fire = nearest(sim, me, (s) => s.fire > 0);
      if (fire >= 0) {
        if (h && h.k === IK.Ext) return S('spray', t('cozinha.tut.spray', 'Mire no fogo e segure APAGAR'), fire);
        if (h) return S('dropfire', t('cozinha.tut.dropForExt', 'Fogo! Solte o que está segurando'), nearest(sim, me, (s) => s.k === 'counter' && !s.item && s.fire <= 0));
        const ext = nearest(sim, me, (s) => !!s.item && s.item.k === IK.Ext);
        return S('ext', t('cozinha.tut.ext', 'Fogo! Pegue o extintor'), ext);
      }
      if (h && h.k === IK.Ext) return S('extback', t('cozinha.tut.extBack', 'Apagou! Deixe o extintor numa bancada'), nearest(sim, me, (s) => s.k === 'counter' && !s.item));
    }
    // --------- dia 3: pratos acabaram → lavar ---------
    const plates = sim.st.find((s) => s.k === 'plates');
    const sink = sim.st.find((s) => s.k === 'sink');
    const dirty = sim.st.find((s) => s.k === 'dirty');
    const cleanAround = (plates?.n ?? 0) > 0 || (h && h.k === IK.Plate) || sim.st.some((s) => s.item?.k === IK.Plate) || sim.floor.some((it) => it.k === IK.Plate);
    if (this.day === 3 && sim.served >= 1 && !cleanAround) {
      if (h && h.k === IK.Dirty && sink) return S('tosink', t('cozinha.tut.toSink', 'Leve os pratos sujos até a pia'), sink.i);
      if (sink && sink.n > 0) {
        if (h) return S('dropwash', t('cozinha.tut.dropFirst', 'Solte o que está segurando numa bancada'), nearest(sim, me, (s) => s.k === 'counter' && !s.item));
        return S('wash', t('cozinha.tut.wash', 'Segure LAVAR na pia'), sink.i);
      }
      if (dirty && dirty.n > 0) return S('dirty', t('cozinha.tut.dirty', 'Os pratos acabaram! Pegue os pratos sujos'), dirty.i);
      return S('waitdirty', t('cozinha.tut.waitDirty', 'O prato sujo já volta do salão...'), dirty?.i ?? -1);
    }
    const free = sim.served >= 1;
    const pre = free ? 'f' : '';
    // --------- receita (estado da cozinha → próximo passo) ---------
    const plateWithIt = (it: Item | null | undefined) => !!it && it.k === IK.Plate && it.parts.includes(c);
    if (h && h.k === IK.Plate && plateWithIt(h)) return S(pre + 'serve', t('cozinha.tut.serve', 'Entregue na janela!'), nearest(sim, me, (s) => s.k === 'window'));
    const plateSt = nearest(sim, me, (s) => plateWithIt(s.item));
    if (plateSt >= 0 && !h) return S(pre + 'takeplate', t('cozinha.tut.takePlate', 'Pegue o prato pronto'), plateSt);
    const readySt = nearest(sim, me, (s) => isIt(s.item, route.length));
    if (h && h.k === IK.Plate) {
      if (readySt >= 0) return S(pre + 'plate2food', t('cozinha.tut.plateToFood', 'Leve o prato até a comida pronta'), readySt);
      return S(pre + 'plateDown', t('cozinha.tut.plateDown', 'Solte o prato numa bancada vazia'), nearest(sim, me, (s) => s.k === 'counter' && !s.item && s.fire <= 0));
    }
    if (isIt(h, route.length)) {
      const pl = nearest(sim, me, (s) => !!s.item && s.item.k === IK.Plate && !s.item.parts.length);
      if (pl >= 0) return S(pre + 'onplate', t('cozinha.tut.onPlate', 'Coloque no prato'), pl);
      return S(pre + 'readyDown', t('cozinha.tut.readyDown', 'Solte numa bancada e pegue um prato'), nearest(sim, me, (s) => s.k === 'counter' && !s.item && s.fire <= 0));
    }
    if (readySt >= 0) {
      if (h) return S(pre + 'dropfirst', t('cozinha.tut.dropFirst', 'Solte o que está segurando numa bancada'), nearest(sim, me, (s) => s.k === 'counter' && !s.item));
      const pl = nearest(sim, me, (s) => !!s.item && s.item.k === IK.Plate && !s.item.parts.length);
      if (pl >= 0) return S(pre + 'getplate2', t('cozinha.tut.getPlateBack', 'Pegue o prato e leve até a comida'), pl);
      if (COOKERS[sim.st[readySt].k]) return S(pre + 'cooked', t('cozinha.tut.cooked', 'Ficou pronto! Pegue um prato, rápido, antes de queimar'), plates?.i ?? -1);
      return S(pre + 'getplate', t('cozinha.tut.getPlate', 'Pegue um prato limpo'), plates?.i ?? -1);
    }
    const burnt = nearest(sim, me, (s) => !!s.item && s.item.k === IK.Ing && s.item.burnt);
    if (h && h.k === IK.Ing && h.burnt) return S('trash', t('cozinha.tut.trash', 'Queimou! Jogue no lixo'), nearest(sim, me, (s) => s.k === 'trash'));
    if (burnt >= 0 && !h && sim.st[burnt].fire <= 0) return S('takeburnt', t('cozinha.tut.takeBurnt', 'Queimou! Pegue e jogue no lixo'), burnt);
    const onSt = nearest(sim, me, (s) => s.k === kind && isIt(s.item, 0));
    if (onSt >= 0) {
      if (proc === 'chop') return S(pre + 'chop', t('cozinha.tut.chop2', 'Segure CORTAR até terminar'), onSt);
      return S(pre + 'wait', t('cozinha.tut.wait', 'Está cozinhando... Fique de olho!'), onSt);
    }
    if (isIt(h, 0)) {
      if (proc === 'chop') return S(pre + 'toboard', t('cozinha.tut.toBoard', 'Leve até a tábua e solte'), nearest(sim, me, (s) => s.k === 'board' && !s.item));
      return S(pre + 'topot', t('cozinha.tut.toPot', 'Coloque na panela'), nearest(sim, me, (s) => s.k === kind && !s.item));
    }
    if (h) return S('dropother', t('cozinha.tut.dropFirst', 'Solte o que está segurando numa bancada'), nearest(sim, me, (s) => s.k === 'counter' && !s.item));
    const crate = nearest(sim, me, (s) => s.k === 'crate' && s.ing === ing);
    if (free) return S('fcrate', t('cozinha.tut.again', 'Mais um pedido! Agora é com você'), crate);
    return S('crate', t('cozinha.tut.crateX', 'Pegue: {x} (na caixa)', { x: ingName(INGS[ing].id) }), crate);
  }
}
