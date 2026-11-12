/* ============================================================
 *  BLOCOS DE LÓGICA — editor para celular (blocos empilhados).
 *  Cada script = um "chapéu" de evento + pilha de blocos coloridos.
 *  Tocar num pedaço destacado (chip) edita o valor; tocar no nome do
 *  bloco abre ↑ ↓ duplicar apagar; "+ bloco" abre a paleta por categoria.
 *  Nada de código do usuário: só dados validados pelo format.ts.
 * ============================================================ */
import { t } from '../../i18n';
import { SOUNDS, type Block, type BlockKind, type Cond, type Expr, type ExprQuery, type Script, type ScriptEventKind, type Vec3 } from '../format';
import type { Editor } from '../editor/editor';
import { esc } from '../studio';
import { filterMessage } from '../../../shared/moderation';
import { notify } from '../../ui/notify';
import { sicon } from './sicons';

export interface BlocksCtx {
  ed: Editor;
  pick(msg: string): Promise<number | null>;
  rerender(): void;
  sheet(html: string): HTMLElement;
  closeSheet(): void;
}

type Cat = 'motion' | 'looks' | 'game' | 'control' | 'vars';
// W0: só os blocos v3 têm categoria → a paleta continua igual; o W1 acrescenta os da v4
const CAT: Partial<Record<BlockKind, Cat>> = {
  move: 'motion', rotate: 'motion', force: 'motion', teleport: 'motion',
  color: 'looks', light: 'looks', say: 'looks', door: 'looks', sound: 'looks',
  score: 'game', lives: 'game', checkpoint: 'game', team: 'game', match: 'game', spawn: 'game', destroy: 'game',
  wait: 'control', repeat: 'control', if: 'control', send: 'control', motor: 'control',
  set: 'vars', change: 'vars',
};
const catName = (c: Cat) =>
  ({ motion: t('studio.bc.motion', 'Movimento'), looks: t('studio.bc.looks', 'Aparência e som'), game: t('studio.bc.game', 'Jogo'), control: t('studio.bc.control', 'Controle'), vars: t('studio.bc.vars', 'Variáveis') })[c];

export const evName = (k: ScriptEventKind): string =>
  ({
    start: t('studio.ev.start', 'ao iniciar'),
    touch: t('studio.ev.touch', 'ao tocar'),
    zone: t('studio.ev.zone', 'ao entrar na zona'),
    every: t('studio.ev.every', 'a cada'),
    collect: t('studio.ev.collect', 'ao coletar'),
    die: t('studio.ev.die', 'ao morrer'),
    button: t('studio.ev.button', 'ao apertar'),
    message: t('studio.ev.message', 'ao receber'),
  } as Partial<Record<ScriptEventKind, string>>)[k] ?? k;

const blockName = (k: BlockKind): string =>
  ({
    move: t('studio.bk.move', 'mover'),
    rotate: t('studio.bk.rotate', 'girar'),
    force: t('studio.bk.force', 'empurrar'),
    teleport: t('studio.bk.teleport', 'teletransportar jogador para'),
    color: t('studio.bk.color', 'mudar cor'),
    light: t('studio.bk.light', 'liga/desliga luz'),
    say: t('studio.bk.say', 'mostrar texto'),
    door: t('studio.bk.door', 'abrir/fechar porta'),
    sound: t('studio.bk.sound', 'tocar som'),
    score: t('studio.bk.score', 'dar pontos'),
    lives: t('studio.bk.lives', 'vidas ='),
    checkpoint: t('studio.bk.checkpoint', 'salvar checkpoint em'),
    team: t('studio.bk.team', 'entrar no time'),
    match: t('studio.bk.match', 'partida:'),
    spawn: t('studio.bk.spawn', 'criar cópia de'),
    destroy: t('studio.bk.destroy', 'destruir'),
    wait: t('studio.bk.wait', 'esperar'),
    repeat: t('studio.bk.repeat', 'repetir'),
    if: t('studio.bk.if', 'se'),
    send: t('studio.bk.send', 'enviar mensagem'),
    motor: t('studio.bk.motor', 'liga/desliga motor'),
    set: t('studio.bk.set', 'definir'),
    change: t('studio.bk.change', 'somar em'),
  } as Partial<Record<BlockKind, string>>)[k] ?? k;

const teamName = (n: number) => [t('studio.team0', 'sem time'), t('studio.team1', 'vermelho'), t('studio.team2', 'azul')][n] ?? '?';
const matchName = (on: string) => (on === 'win' ? t('studio.match.win', 'vencer') : on === 'lose' ? t('studio.match.lose', 'perder') : t('studio.match.start', 'começar'));

function defaultBlock(k: BlockKind, ed: Editor): Block | null {
  const j = ed.doc.joints[0]?.id;
  switch (k) {
    case 'move': return { k, d: [0, 1, 0], t: 0.5 };
    case 'rotate': return { k, r: [0, 90, 0], t: 0.5 };
    case 'force': return { k, d: [0, 6, 0] };
    case 'color': return { k, c: '#ffd34a' };
    case 'say': return { k, text: t('studio.sayDefault', 'Boa!') };
    case 'sound': return { k, snd: 'ding' };
    case 'score': return { k, n: 1 };
    case 'lives': return { k, n: 3 };
    case 'checkpoint': return { k };
    case 'team': return { k, team: 1 };
    case 'match': return { k, on: 'win' };
    case 'destroy': return { k };
    case 'wait': return { k, sec: 1 };
    case 'repeat': return { k, n: 3, body: [] };
    case 'if': return { k, c: { op: '>', a: { q: 'score' }, b: 10 }, then: [] };
    case 'send': return { k, msg: 'vai' };
    case 'motor': return j ? { k, joint: j } : null;
    case 'set': return { k, v: 'contador', e: 0 };
    case 'change': return { k, v: 'contador', e: 1 };
    default: return null; // teleport/spawn/door/light pedem uma peça
  }
}

const exprText = (e: Expr): string => {
  if (typeof e === 'number') return String(Math.round(e * 100) / 100);
  if ('v' in e) return e.v;
  if ('q' in e) return ({ score: t('studio.q.score', 'pontos'), time: t('studio.q.time', 'tempo'), lives: t('studio.q.lives', 'vidas'), team: t('studio.q.team', 'time'), players: t('studio.q.players', 'jogadores') } as Partial<Record<ExprQuery, string>>)[e.q] ?? e.q;
  if (e.op === 'rand') return `${t('studio.q.rand', 'sorteio')} ${exprText(e.a)}–${exprText(e.b)}`;
  return `(${exprText(e.a)} ${e.op} ${exprText(e.b)})`;
};
const v3Text = (v: Vec3) => v.map((x) => (Math.round(x * 10) / 10).toString()).join(' · ');

export class BlocksEditor {
  private open: number | null = null;
  constructor(private c: BlocksCtx) {}

  private get scripts(): Script[] {
    return JSON.parse(JSON.stringify(this.c.ed.doc.scripts ?? [])) as Script[];
  }
  private commit(work: Script[]): void {
    const ed = this.c.ed;
    ed.change('blocks', () => {
      if (work.length) ed.doc.scripts = work;
      else delete ed.doc.scripts;
    });
    this.c.rerender();
  }

  private partLabel(id: number | undefined, selfOk: boolean): string {
    if (id == null) return selfOk ? t('studio.thisPart', 'esta peça') : t('studio.choose', 'escolher…');
    const p = this.c.ed.part(id);
    return p ? `${p.name ? esc(p.name) : '#' + id}` : '?';
  }

  render(host: HTMLElement): void {
    const work = this.scripts;
    const add = document.createElement('div');
    add.className = 'bs-row2';
    add.innerHTML = `<button class="bs-btn bs-accent" data-new>${sicon('plus', 18)}${t('studio.newScript', 'Novo script')}</button><button class="bs-btn" data-tpl>${sicon('logic', 18)}${t('studio.tplScript', 'Exemplo pronto')}</button>`;
    host.appendChild(add);
    add.querySelector('[data-new]')!.addEventListener('click', () => {
      const id = work.reduce((m, s) => Math.max(m, s.id), 0) + 1;
      const sel = this.c.ed.selected()[0];
      work.push({ id, on: sel ? { k: sel.role === 'collect' ? 'collect' : sel.role === 'zone' ? 'zone' : 'touch', part: sel.id } : { k: 'start' }, body: [] });
      this.open = id;
      this.commit(work);
    });
    add.querySelector('[data-tpl]')!.addEventListener('click', () => this.templates(work));
    if (!work.length) {
      const p = document.createElement('p');
      p.className = 'bs-hint bs-callout';
      p.textContent = t('studio.blocksHint', 'Blocos fazem jogos de verdade: eventos (ao tocar, ao coletar, a cada X s…) disparam blocos (mover, dar pontos, vidas, vencer…), com variáveis, "se" e "repetir".');
      host.appendChild(p);
    }
    for (const sc of work) {
      const card = document.createElement('div');
      card.className = 'bs-script' + (this.open === sc.id ? ' open' : '');
      host.appendChild(card);
      const hat = document.createElement('div');
      hat.className = 'bs-hat';
      const evChips =
        (sc.on.k === 'touch' || sc.on.k === 'zone' || sc.on.k === 'button' || sc.on.k === 'collect' ? ` <button class="bs-pc" data-ev="part">${this.partLabel(sc.on.part, false).replace(t('studio.choose', 'escolher…'), sc.on.k === 'collect' ? t('studio.anyCollect', 'qualquer') : t('studio.choose', 'escolher…'))}</button>` : '') +
        (sc.on.k === 'every' ? ` <button class="bs-pc" data-ev="sec">${sc.on.sec ?? 1}s</button>` : '') +
        (sc.on.k === 'message' ? ` <button class="bs-pc" data-ev="msg">${esc(sc.on.msg ?? '')}</button>` : '');
      hat.innerHTML = `<button class="bs-pc bs-evk" data-ev="kind">${evName(sc.on.k)}</button>${evChips}<span class="bs-sp"></span><small>${countBlocks(sc.body)}</small><button class="bs-mini" data-ev="del">${sicon('trash', 14)}</button>`;
      card.appendChild(hat);
      hat.addEventListener('click', async (e) => {
        const b = (e.target as HTMLElement).closest<HTMLElement>('[data-ev]');
        if (!b) {
          this.open = this.open === sc.id ? null : sc.id;
          this.c.rerender();
          return;
        }
        const w = b.dataset.ev;
        if (w === 'del') {
          this.commit(work.filter((x) => x !== sc));
        } else if (w === 'kind') {
          const kinds: ScriptEventKind[] = ['start', 'touch', 'zone', 'button', 'collect', 'every', 'die', 'message'];
          const s = this.c.sheet(`<h3>${t('studio.whenTitle', 'Quando?')}</h3><div class="bs-chips">${kinds.map((k) => `<button class="bs-chip${sc.on.k === k ? ' on' : ''}" data-k="${k}">${evName(k)}</button>`).join('')}</div>`);
          s.addEventListener('click', (ev) => {
            const k = (ev.target as HTMLElement).closest<HTMLElement>('[data-k]')?.dataset.k as ScriptEventKind | undefined;
            if (!k) return;
            this.c.closeSheet();
            sc.on = { k };
            if (k === 'every') sc.on.sec = 1;
            if (k === 'message') sc.on.msg = 'vai';
            this.open = sc.id;
            this.commit(work);
          });
        } else if (w === 'part') {
          const id = await this.c.pick(t('studio.pickEvPart', 'Toque na peça do evento'));
          if (id != null) {
            sc.on.part = id;
            const p = this.c.ed.part(id);
            if (p && sc.on.k === 'zone' && p.role !== 'zone') this.setRole(id, 'zone');
            if (p && sc.on.k === 'button' && p.role !== 'button') this.setRole(id, 'button');
            if (p && sc.on.k === 'collect' && p.role !== 'collect') this.setRole(id, 'collect');
          } else if (sc.on.k === 'collect') delete sc.on.part;
          this.commit(work);
        } else if (w === 'sec') {
          this.numSheet(sc.on.sec ?? 1, [0.5, 1, 2, 5, 10, 30], (n) => {
            sc.on.sec = Math.max(0.1, n);
            this.commit(work);
          });
        } else if (w === 'msg') {
          this.textSheet(sc.on.msg ?? '', 16, (v) => {
            sc.on.msg = v || 'vai';
            this.commit(work);
          });
        }
      });
      if (this.open !== sc.id) {
        const prev = document.createElement('div');
        prev.className = 'bs-bprev';
        prev.innerHTML = sc.body.slice(0, 4).map((b) => `<span class="bs-blk c-${CAT[b.k]}">${blockName(b.k)}</span>`).join('') + (sc.body.length > 4 ? '…' : '');
        prev.addEventListener('click', () => {
          this.open = sc.id;
          this.c.rerender();
        });
        card.appendChild(prev);
        continue;
      }
      const stack = document.createElement('div');
      stack.className = 'bs-stack';
      card.appendChild(stack);
      this.renderList(stack, sc.body, work, sc, 0);
    }
  }

  private setRole(id: number, role: 'zone' | 'button' | 'collect'): void {
    const ed = this.c.ed;
    const keep = [...ed.sel];
    ed.select([id]);
    ed.setRole(role);
    ed.select(keep);
  }

  private renderList(host: HTMLElement, list: Block[], work: Script[], sc: Script, depth: number): void {
    list.forEach((b, i) => {
      const row = document.createElement('div');
      row.className = `bs-brow c-${CAT[b.k]}`;
      row.innerHTML = `<button class="bs-bname" data-op>${blockName(b.k)}</button>${this.params(b, sc)}`;
      host.appendChild(row);
      row.addEventListener('click', (e) => {
        const el = (e.target as HTMLElement).closest<HTMLElement>('[data-op],[data-p]');
        if (!el || !row.contains(el) || el.closest('.bs-bnest') !== null && el.closest('.bs-brow') !== row) return;
        e.stopPropagation();
        if (el.hasAttribute('data-op')) this.blockOps(list, i, work);
        else void this.editParam(b, el.dataset.p!, work, sc);
      });
      if (b.k === 'if' || b.k === 'repeat') {
        const nest = document.createElement('div');
        nest.className = 'bs-bnest';
        row.after(nest);
        this.renderList(nest, b.k === 'if' ? b.then : b.body, work, sc, depth + 1);
        if (b.k === 'if') {
          const els = document.createElement('div');
          els.className = 'bs-belse';
          if (b.else) {
            els.innerHTML = `<b>${t('studio.else', 'senão')}</b>`;
            nest.after(els);
            const n2 = document.createElement('div');
            n2.className = 'bs-bnest';
            els.after(n2);
            this.renderList(n2, b.else, work, sc, depth + 1);
          } else {
            els.innerHTML = `<button class="bs-link" data-else>+ ${t('studio.else', 'senão')}</button>`;
            nest.after(els);
            els.querySelector('[data-else]')!.addEventListener('click', () => {
              b.else = [];
              this.commit(work);
            });
          }
        }
      }
    });
    const plus = document.createElement('button');
    plus.className = 'bs-badd';
    plus.innerHTML = `${sicon('plus', 14)}${t('studio.addBlock', 'bloco')}`;
    host.appendChild(plus);
    plus.addEventListener('click', () => this.palette(list, work, depth));
  }

  private params(b: Block, sc: Script): string {
    const chip = (key: string, text: string) => `<button class="bs-pc" data-p="${key}">${text}</button>`;
    const selfOk = sc.on.part != null || sc.on.k === 'collect';
    switch (b.k) {
      case 'move':
        return chip('part', this.partLabel(b.part, selfOk)) + chip('d', v3Text(b.d) + ' m') + chip('t', (b.t ?? 0.5) + 's');
      case 'rotate':
        return chip('part', this.partLabel(b.part, selfOk)) + chip('r', v3Text(b.r) + '°') + chip('t', (b.t ?? 0.5) + 's');
      case 'force':
        return chip('part', this.partLabel(b.part, selfOk)) + chip('d', v3Text(b.d));
      case 'teleport':
      case 'spawn':
      case 'door':
      case 'light':
        return chip('part', this.partLabel(b.part, false));
      case 'destroy':
        return chip('part', this.partLabel(b.part, selfOk));
      case 'checkpoint':
        return chip('part', b.part == null ? t('studio.here', 'aqui') : this.partLabel(b.part, false));
      case 'color':
        return chip('part', this.partLabel(b.part, selfOk)) + `<button class="bs-pc" data-p="c"><i class="bs-dot" style="background:${b.c}"></i></button>`;
      case 'say':
        return chip('text', '“' + esc(b.text) + '”');
      case 'sound':
        return chip('snd', b.snd);
      case 'score':
      case 'lives':
        return chip('n', esc(exprText(b.n)));
      case 'wait':
        return chip('sec', esc(exprText(b.sec)) + 's');
      case 'repeat':
        return chip('n', esc(exprText(b.n))) + `<small>${t('studio.times', 'vezes')}</small>`;
      case 'if':
        return chip('ca', esc(exprText(b.c.a))) + chip('cop', b.c.op) + chip('cb', esc(exprText(b.c.b)));
      case 'team':
        return chip('team', teamName(b.team));
      case 'match':
        return chip('on', matchName(b.on));
      case 'send':
        return chip('msg', esc(b.msg));
      case 'motor':
        return chip('joint', '#' + b.joint);
      case 'set':
      case 'change':
        return chip('v', esc(b.v)) + `<small>${b.k === 'set' ? '=' : '+'}</small>` + chip('e', esc(exprText(b.e)));
      default:
        return ''; // blocos v4: o W1 desenha
    }
  }

  private async editParam(b: Block, key: string, work: Script[], sc: Script): Promise<void> {
    const done = () => this.commit(work);
    const B = b as Record<string, unknown>;
    switch (key) {
      case 'part': {
        const selfOk = (sc.on.part != null || sc.on.k === 'collect') && b.k !== 'teleport' && b.k !== 'spawn' && b.k !== 'door' && b.k !== 'light';
        const id = await this.c.pick(t('studio.pickBlockPart', 'Toque na peça') + (selfOk ? ' · ' + t('studio.cancelSelf', 'Cancelar = esta peça') : ''));
        if (id != null) B.part = id;
        else if (selfOk || b.k === 'checkpoint') delete B.part;
        return done();
      }
      case 'd':
      case 'r':
        return this.vecSheet(B[key] as Vec3, key === 'r' ? [15, 45, 90] : [0.5, 1, 2], (v) => {
          B[key] = v;
          done();
        });
      case 't':
        return this.numSheet((B.t as number) ?? 0.5, [0, 0.25, 0.5, 1, 2], (n) => {
          B.t = Math.max(0, n);
          done();
        });
      case 'c': {
        const cols = ['#ff5cc8', '#ff4f6a', '#ff9a2e', '#ffd34a', '#4fd67a', '#5ec8ff', '#3f6aff', '#8a5cff', '#ffffff', '#2e2440'];
        const s = this.c.sheet(`<h3>${t('studio.color', 'Cor')}</h3><div class="bs-swatches">${cols.map((c) => `<button class="bs-sw" data-c="${c}" style="--c:${c}"></button>`).join('')}</div>`);
        s.addEventListener('click', (e) => {
          const c = (e.target as HTMLElement).closest<HTMLElement>('[data-c]')?.dataset.c;
          if (!c) return;
          this.c.closeSheet();
          B.c = c;
          done();
        });
        return;
      }
      case 'text':
        return this.textSheet(B.text as string, 60, (v) => {
          if (v) B.text = v;
          done();
        });
      case 'msg':
        return this.textSheet(B.msg as string, 16, (v) => {
          if (v) B.msg = v;
          done();
        });
      case 'snd':
        B.snd = SOUNDS[(SOUNDS.indexOf(B.snd as 'ding') + 1) % SOUNDS.length];
        return done();
      case 'team':
        B.team = (((B.team as number) + 1) % 3) as 0;
        return done();
      case 'on':
        B.on = B.on === 'win' ? 'lose' : B.on === 'lose' ? 'start' : 'win';
        return done();
      case 'joint': {
        const js = this.c.ed.doc.joints.map((j) => j.id);
        if (js.length) B.joint = js[(js.indexOf(B.joint as number) + 1) % js.length];
        return done();
      }
      case 'cop': {
        const ops: Cond['op'][] = ['>', '<', '=', '!=', '>=', '<='];
        const c = (b as { c: Cond }).c;
        c.op = ops[(ops.indexOf(c.op) + 1) % ops.length];
        return done();
      }
      case 'n':
      case 'sec':
      case 'e':
      case 'ca':
      case 'cb': {
        const get = (): Expr => (key === 'ca' ? (b as { c: Cond }).c.a : key === 'cb' ? (b as { c: Cond }).c.b : (B[key] as Expr));
        const set = (x: Expr) => {
          if (key === 'ca') (b as { c: Cond }).c.a = x;
          else if (key === 'cb') (b as { c: Cond }).c.b = x;
          else B[key] = x;
          done();
        };
        return this.exprSheet(get(), set);
      }
      case 'v':
        return this.varSheet(B.v as string, (v) => {
          B.v = v;
          done();
        });
    }
  }

  /* ------------------------------- folhas ------------------------------- */

  private numSheet(cur: number, quick: number[], ok: (n: number) => void): void {
    let v = cur;
    const s = this.c.sheet(`<h3>${t('studio.value', 'Valor')}</h3>
      <div class="bs-step"><button data-d="-10">−10</button><button data-d="-1">−1</button><input type="number" value="${v}" step="any"><button data-d="1">+1</button><button data-d="10">+10</button></div>
      <div class="bs-chips">${quick.map((q) => `<button class="bs-chip" data-q="${q}">${q}</button>`).join('')}</div>
      <button class="bs-btn bs-accent" data-ok>${t('studio.done', 'Pronto')}</button>`);
    const inp = s.querySelector('input')!;
    s.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('button');
      if (!b) return;
      if (b.dataset.d) inp.value = String(Math.round((Number(inp.value) + Number(b.dataset.d)) * 100) / 100);
      else if (b.dataset.q) inp.value = b.dataset.q;
      else if (b.hasAttribute('data-ok')) {
        v = Number(inp.value);
        this.c.closeSheet();
        ok(Number.isFinite(v) ? v : cur);
      }
    });
  }

  private vecSheet(cur: Vec3, steps: number[], ok: (v: Vec3) => void): void {
    const v: Vec3 = [...cur] as Vec3;
    const s = this.c.sheet(`<h3>X · Y · Z</h3>
      ${[0, 1, 2].map((i) => `<div class="bs-step"><b class="ax a${i}">${'XYZ'[i]}</b><button data-i="${i}" data-d="-1">−</button><input data-i="${i}" type="number" value="${v[i]}" step="any"><button data-i="${i}" data-d="1">+</button></div>`).join('')}
      <div class="bs-chips">${steps.map((q) => `<button class="bs-chip" data-st="${q}">±${q}</button>`).join('')}</div>
      <button class="bs-btn bs-accent" data-ok>${t('studio.done', 'Pronto')}</button>`);
    let step = steps[1] ?? 1;
    s.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('button');
      if (!b) return;
      if (b.dataset.st) {
        step = Number(b.dataset.st);
        s.querySelectorAll('[data-st]').forEach((x) => x.classList.toggle('on', x === b));
      } else if (b.dataset.d) {
        const inp = s.querySelector<HTMLInputElement>(`input[data-i="${b.dataset.i}"]`)!;
        inp.value = String(Math.round((Number(inp.value) + Number(b.dataset.d) * step) * 100) / 100);
      } else if (b.hasAttribute('data-ok')) {
        s.querySelectorAll<HTMLInputElement>('input').forEach((inp) => (v[Number(inp.dataset.i)] = Number(inp.value) || 0));
        this.c.closeSheet();
        ok(v);
      }
    });
  }

  private textSheet(cur: string, max: number, ok: (v: string) => void): void {
    const s = this.c.sheet(`<h3>${t('studio.text', 'Texto')}</h3><input class="bs-tin" maxlength="${max}" value="${esc(cur)}"><p class="bs-hint">${t('studio.textHint', 'Use {pontos} ou {score}, {vidas}/{lives}, {tempo}/{time} ou o nome de uma variável entre chaves.')}</p><button class="bs-btn bs-accent" data-ok>${t('studio.done', 'Pronto')}</button>`);
    s.querySelector('[data-ok]')!.addEventListener('click', () => {
      const v = (s.querySelector('input') as HTMLInputElement).value.trim().replace(/\{pontos\}/g, '{score}').replace(/\{vidas\}/g, '{lives}').replace(/\{tempo\}/g, '{time}');
      const f = filterMessage(v.replace(/\{[^}]*\}/g, ' '));
      if (v && (!f.ok || f.filtered)) return notify(t('studio.badText', 'Esse texto não pode — tente outras palavras'), { icon: 'warning', kind: 'warn' });
      this.c.closeSheet();
      ok(v);
    });
  }

  private vars(): string[] {
    const out = new Set<string>();
    const walk = (l: Block[]) =>
      l.forEach((b) => {
        if (b.k === 'set' || b.k === 'change') out.add(b.v);
        if (b.k === 'if') {
          walk(b.then);
          if (b.else) walk(b.else);
        }
        if (b.k === 'repeat') walk(b.body);
      });
    for (const sc of this.c.ed.doc.scripts ?? []) walk(sc.body);
    return [...out];
  }

  private varSheet(cur: string, ok: (v: string) => void): void {
    const vs = this.vars();
    const s = this.c.sheet(`<h3>${t('studio.variable', 'Variável')}</h3><div class="bs-chips">${vs.map((v) => `<button class="bs-chip${v === cur ? ' on' : ''}" data-v="${esc(v)}">${esc(v)}</button>`).join('')}</div>
      <input class="bs-tin" maxlength="16" placeholder="${t('studio.newVar', 'nova variável')}"><button class="bs-btn bs-accent" data-ok>${t('studio.done', 'Pronto')}</button>`);
    s.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('button');
      if (!b) return;
      let v = b.dataset.v ?? '';
      if (b.hasAttribute('data-ok')) v = (s.querySelector('input') as HTMLInputElement).value.trim().replace(/[^A-Za-zÀ-ÿ0-9_ ]/g, '').slice(0, 16) || cur;
      if (!v) return;
      this.c.closeSheet();
      ok(v);
    });
  }

  private exprSheet(cur: Expr, ok: (e: Expr) => void): void {
    const vs = this.vars();
    const s = this.c.sheet(`<h3>${t('studio.value', 'Valor')}</h3>
      <div class="bs-step"><button data-d="-10">−10</button><button data-d="-1">−1</button><input type="number" value="${typeof cur === 'number' ? cur : 0}" step="any"><button data-d="1">+1</button><button data-d="10">+10</button></div>
      <button class="bs-btn" data-num>${t('studio.useNumber', 'Usar este número')}</button>
      <h4>${t('studio.orRead', 'ou ler do jogo')}</h4>
      <div class="bs-chips">${(['score', 'time', 'lives', 'team'] as const).map((q) => `<button class="bs-chip" data-q="${q}">${exprText({ q })}</button>`).join('')}
      <button class="bs-chip" data-rand>${t('studio.q.rand', 'sorteio')} 1–6</button>
      ${vs.map((v) => `<button class="bs-chip" data-v="${esc(v)}">${esc(v)}</button>`).join('')}</div>`);
    const inp = s.querySelector('input')!;
    s.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('button');
      if (!b) return;
      if (b.dataset.d) {
        inp.value = String(Math.round((Number(inp.value) + Number(b.dataset.d)) * 100) / 100);
        return;
      }
      let x: Expr | null = null;
      if (b.hasAttribute('data-num')) x = Number(inp.value) || 0;
      else if (b.dataset.q) x = { q: b.dataset.q as 'score' };
      else if (b.dataset.v) x = { v: b.dataset.v };
      else if (b.hasAttribute('data-rand')) x = { op: 'rand', a: 1, b: 6 };
      if (x == null) return;
      this.c.closeSheet();
      ok(x);
    });
  }

  private blockOps(list: Block[], i: number, work: Script[]): void {
    const s = this.c.sheet(`<h3>${blockName(list[i].k)}</h3><div class="bs-row2">
      <button class="bs-btn" data-o="up">${sicon('up', 18)}${t('studio.up', 'Subir')}</button><button class="bs-btn" data-o="down">${sicon('down', 18)}${t('studio.down', 'Descer')}</button>
      <button class="bs-btn" data-o="dup">${sicon('dup', 18)}${t('studio.dup', 'Duplicar')}</button><button class="bs-btn" data-o="del">${sicon('trash', 18)}${t('studio.del', 'Apagar')}</button></div>`);
    s.addEventListener('click', (e) => {
      const o = (e.target as HTMLElement).closest<HTMLElement>('[data-o]')?.dataset.o;
      if (!o) return;
      this.c.closeSheet();
      if (o === 'up' && i > 0) [list[i - 1], list[i]] = [list[i], list[i - 1]];
      else if (o === 'down' && i < list.length - 1) [list[i + 1], list[i]] = [list[i], list[i + 1]];
      else if (o === 'dup') list.splice(i + 1, 0, JSON.parse(JSON.stringify(list[i])));
      else if (o === 'del') list.splice(i, 1);
      this.commit(work);
    });
  }

  private palette(list: Block[], work: Script[], depth: number): void {
    const cats: Cat[] = ['motion', 'looks', 'game', 'control', 'vars'];
    const kinds = Object.keys(CAT) as BlockKind[];
    const s = this.c.sheet(`<h3>${t('studio.addBlockTitle', 'Adicionar bloco')}</h3>${cats
      .map((c) => `<h4>${catName(c)}</h4><div class="bs-chips">${kinds.filter((k) => CAT[k] === c && !(depth >= 6 && (k === 'if' || k === 'repeat'))).map((k) => `<button class="bs-blk c-${c}" data-k="${k}">${blockName(k)}</button>`).join('')}</div>`)
      .join('')}`);
    s.addEventListener('click', async (e) => {
      const k = (e.target as HTMLElement).closest<HTMLElement>('[data-k]')?.dataset.k as BlockKind | undefined;
      if (!k) return;
      this.c.closeSheet();
      let b = defaultBlock(k, this.c.ed);
      if (!b && k === 'motor') return;
      if (!b) {
        const id = await this.c.pick(t('studio.pickBlockPart', 'Toque na peça'));
        if (id == null) return this.c.rerender();
        b = { k, part: id } as Block;
      }
      list.push(b);
      this.commit(work);
    });
  }

  /** scripts prontos para começar rápido */
  private templates(work: Script[]): void {
    const ed = this.c.ed;
    const sel = ed.selected()[0];
    const T: [string, () => Script[]][] = [
      [t('studio.tpl.coins', 'Moedas: coletar dá ponto; 5 = vence'), () => [
        { id: 0, on: { k: 'collect' }, body: [{ k: 'score', n: 1 }, { k: 'sound', snd: 'ding' }, { k: 'if', c: { op: '>=', a: { q: 'score' }, b: 5 }, then: [{ k: 'say', text: 'Peguei todas!' }, { k: 'match', on: 'win' }] }] },
      ]],
      [t('studio.tpl.lives', '3 vidas: perigo tira vida'), () => [
        { id: 0, on: { k: 'start' }, body: [{ k: 'lives', n: 3 }, { k: 'say', text: 'Você tem {lives} vidas!' }] },
      ]],
      [t('studio.tpl.spin', 'Esta peça gira sem parar'), () => (sel ? [{ id: 0, on: { k: 'every', sec: 0.5, part: sel.id }, body: [{ k: 'rotate', r: [0, 45, 0], t: 0.5 }] }] : [])],
      [t('studio.tpl.jump', 'Trampolim: tocar joga para cima'), () => (sel ? [{ id: 0, on: { k: 'touch', part: sel.id }, body: [{ k: 'sound', snd: 'boing' }, { k: 'score', n: 1 }] }] : [])],
      [t('studio.tpl.timer', 'Contra o relógio: 60 s'), () => [
        { id: 0, on: { k: 'every', sec: 1 }, body: [{ k: 'if', c: { op: '>=', a: { q: 'time' }, b: 60 }, then: [{ k: 'say', text: 'Acabou o tempo!' }, { k: 'match', on: 'lose' }] }] },
      ]],
    ];
    const s = this.c.sheet(`<h3>${t('studio.tplScript', 'Exemplo pronto')}</h3><div class="bs-col">${T.map(([n], i) => `<button class="bs-btn" data-i="${i}">${n}</button>`).join('')}</div><p class="bs-hint">${t('studio.tplHint', 'Os de "esta peça" usam a peça selecionada.')}</p>`);
    s.addEventListener('click', (e) => {
      const i = (e.target as HTMLElement).closest<HTMLElement>('[data-i]')?.dataset.i;
      if (i == null) return;
      this.c.closeSheet();
      const add = T[Number(i)][1]();
      let id = work.reduce((m, x) => Math.max(m, x.id), 0);
      for (const sc of add) {
        sc.id = ++id;
        work.push(sc);
        this.open = sc.id;
      }
      this.commit(work);
    });
  }
}

function countBlocks(l: Block[]): number {
  let n = 0;
  for (const b of l) {
    n++;
    if (b.k === 'if') n += countBlocks(b.then) + (b.else ? countBlocks(b.else) : 0);
    if (b.k === 'repeat') n += countBlocks(b.body);
  }
  return n;
}
