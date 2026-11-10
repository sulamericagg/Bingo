/* ============================================================
 *  BLOOP CINEMA — 6 histórias prontas (originais) para remixar.
 *  Os textos passam por t() para aparecerem no idioma do jogador.
 * ============================================================ */
import { t } from '../i18n';
import { save } from '../core/storage';
import { profile } from '../services/profile';
import type { AvatarData } from '../game/avatar';
import { presetById } from './data';
import {
  clone,
  newProject,
  newShot,
  uid,
  type ActorKey,
  type BubbleStyle,
  type Cam3dPreset,
  type CastMember,
  type Ease,
  type ExprId,
  type FxKind,
  type Mode,
  type PoseId,
  type Project,
  type Scene,
  type Shot,
  type TransitionKind,
} from './format';

export interface Template {
  id: string;
  readonly name: string;
  readonly desc: string;
  bg: string;
  mode: Mode;
  pro?: boolean;
  build(): Project;
}

/* ---------------------------- mini-DSL ---------------------------- */
type K = [t: number, x: number, pose?: PoseId, expr?: ExprId, face?: -1 | 0 | 1, ease?: Ease, z?: number];
function castOf(id: string, name?: string, av?: AvatarData): CastMember {
  const p = presetById(id);
  return { id: uid('c'), name: name ?? p?.name ?? 'Bloop', kind: 'avatar', avatar: clone(av ?? p!.av), voice: 'normal' };
}
function you(): CastMember {
  return { id: uid('c'), name: (profile.nick || t('cin.you', 'Você')).slice(0, 14), kind: 'avatar', avatar: clone(save.avatar), voice: 'normal' };
}
interface ShotSpec {
  dur: number;
  tr?: TransitionKind;
  cam?: { t: number; x?: number; y?: number; zoom?: number; focus?: CastMember; focus2?: CastMember; p3?: Cam3dPreset; yaw?: number; ease?: Ease }[];
  act: [CastMember, K[]][];
  say?: [t: number, who: CastMember | null, text: string, style?: BubbleStyle, dur?: number][];
  fx?: [t: number, kind: FxKind, dur: number, who?: CastMember][];
  sfx?: [t: number, id: string, vol?: number][];
}
function shot(s: ShotSpec): Shot {
  const h = newShot(s.dur);
  if (s.tr) h.transition = { kind: s.tr, dur: s.tr === 'fade' || s.tr === 'iris' ? 0.8 : 0.5 };
  if (s.cam)
    h.cam = s.cam.map((c) => ({ t: c.t, x: c.x ?? 8, y: c.y ?? 4.5, zoom: c.zoom ?? 1, focus: c.focus?.id, focus2: c.focus2?.id, p3: c.p3 ?? (c.focus ? 'closeup' : 'wide'), yaw: c.yaw, ease: c.ease ?? 'inout' }));
  h.actors = s.act.map(([c, ks]) => ({
    cast: c.id,
    keys: ks.map((k): ActorKey => ({ t: k[0], x: k[1], pose: k[2] ?? 'stand', expr: k[3] ?? 'neutral', face: k[4] ?? 0, ease: k[5] ?? 'inout', z: k[6] ?? 0, y: 0 })),
  }));
  h.lines = (s.say ?? []).map(([tt, who, text, style, dur]) => ({ id: uid('ln'), t: tt, dur: dur ?? Math.max(1.6, Math.min(4.5, text.length * 0.075)), cast: who?.id, text, style: style ?? (who ? 'speech' : 'narration') }));
  h.fx = (s.fx ?? []).map(([tt, kind, dur, who]) => ({ id: uid('fx'), t: tt, kind, dur, cast: who?.id }));
  h.sfx = (s.sfx ?? []).map(([tt, id, vol]) => ({ id: uid('sf'), t: tt, sfx: id, vol: vol ?? 0.9 }));
  return h;
}
function scene(bg: string, shots: Shot[], light: Scene['light'] = 'day'): Scene {
  return { id: uid('sc'), name: '', bg, light, shots };
}
function proj(id: string, title: string, mode: Mode, cast: CastMember[], scenes: Scene[], song?: string): Project {
  const p = newProject(title, mode);
  p.template = id;
  p.cast = cast;
  p.scenes = scenes;
  if (song) p.music = { song, offset: 8, vol: 0.55 };
  return p;
}

/* ---------------------------- histórias ---------------------------- */
export const TEMPLATES: Template[] = [
  {
    id: 'bolo',
    get name() {
      return t('cin.tpl.bolo', 'O Bolo Sumiu!');
    },
    get desc() {
      return t('cin.tpl.bolo.d', 'Um mistério delicioso na cozinha.');
    },
    bg: 'kitchen',
    mode: '2d',
    build() {
      const pip = castOf('pipoca');
      const bol = castOf('bolota');
      const zec = castOf('zeca');
      return proj('bolo', t('cin.tpl.bolo', 'O Bolo Sumiu!'), '2d', [pip, bol, zec], [
        scene('kitchen', [
          shot({
            dur: 5,
            tr: 'fade',
            act: [[pip, [[0, 2, 'stand', 'happy', 1], [1.6, 6.5, 'stand', 'happy', 1], [2.2, 6.5, 'wave', 'happy', 1]]]],
            say: [[0.3, null, t('cin.tpl.bolo.n1', 'Na cozinha da Vovó Gema...'), 'narration', 2.2], [2.3, pip, t('cin.tpl.bolo.l1', 'Prontinho! O bolo de aniversário ficou perfeito!'), 'speech', 2.6]],
            sfx: [[0.2, 'steps', 0.6]],
          }),
          shot({
            dur: 4,
            cam: [{ t: 0, zoom: 1.4, focus: pip }, { t: 0.6, zoom: 2.4, focus: pip, ease: 'back' }],
            act: [[pip, [[0, 6.5, 'stand', 'neutral', 1], [0.6, 6.5, 'scared', 'surprised', 0]]]],
            say: [[0.8, pip, t('cin.tpl.bolo.l2', 'Ué... CADÊ O BOLO?!'), 'shout', 2.6]],
            fx: [[0.6, 'zoomlines', 1.2], [0.6, 'shake', 0.6]],
            sfx: [[0.6, 'bonk']],
          }),
          shot({
            dur: 5,
            tr: 'slide',
            act: [
              [pip, [[0, 5, 'think', 'thinking', 1]]],
              [bol, [[0, 14, 'stand', 'shy', -1], [1.2, 10.5, 'stand', 'shy', -1]]],
            ],
            say: [[1.3, bol, t('cin.tpl.bolo.l3', 'Não fui eu! Eu tava... hã... dormindo!'), 'speech', 2.6], [3.9, pip, t('cin.tpl.bolo.l4', 'Hmm...'), 'think', 1.1]],
            fx: [[1.4, 'sweat', 3, bol]],
          }),
          shot({
            dur: 5.5,
            tr: 'dissolve',
            act: [
              [pip, [[0, 4.5, 'stand', 'surprised', 1], [2.6, 4.5, 'facepalm', 'sad', 1]]],
              [bol, [[0, 8, 'stand', 'neutral', 1], [2.6, 8, 'stand', 'laughing', 1]]],
              [zec, [[0, 15, 'stand', 'happy', -1], [1.4, 11.5, 'stand', 'happy', -1]]],
            ],
            say: [[1.4, zec, t('cin.tpl.bolo.l5', 'Alguém viu um bolo? Tava uma delícia!'), 'speech', 2.6], [4.0, bol, t('cin.tpl.bolo.l6', 'Hahaha!'), 'speech', 1.3]],
            sfx: [[2.7, 'rimshot']],
          }),
        ]),
      ], 'free-03');
    },
  },
  {
    id: 'aula',
    get name() {
      return t('cin.tpl.aula', 'Primeiro Dia de Aula');
    },
    get desc() {
      return t('cin.tpl.aula.d', 'Você é o aluno novo da turma!');
    },
    bg: 'classroom',
    mode: '2d',
    build() {
      const me = you();
      const prof = castOf('bolha');
      const lumi = castOf('lumi');
      return proj('aula', t('cin.tpl.aula', 'Primeiro Dia de Aula'), '2d', [me, prof, lumi], [
        scene('classroom', [
          shot({
            dur: 4.5,
            tr: 'fade',
            act: [
              [prof, [[0, 8, 'stand', 'happy', 0], [0.8, 8, 'point', 'happy', -1]]],
              [me, [[0, 3.6, 'stand', 'shy', 1]]],
              [lumi, [[0, 12.5, 'sit', 'neutral', -1]]],
            ],
            say: [[0.2, null, t('cin.tpl.aula.n1', 'Primeiro dia na escola nova...'), 'narration', 2], [1.0, prof, t('cin.tpl.aula.l1', 'Turma, temos um aluno novo hoje!'), 'speech', 2.8]],
          }),
          shot({
            dur: 4.5,
            cam: [{ t: 0, zoom: 1.9, focus: me }],
            act: [[me, [[0, 3.6, 'stand', 'shy', 1]]]],
            say: [[0.4, me, t('cin.tpl.aula.l2', 'Oi... eu sou novo aqui.'), 'whisper', 2.5]],
            fx: [[0.4, 'sweat', 3, me]],
          }),
          shot({
            dur: 5,
            act: [
              [me, [[0, 3.6, 'stand', 'surprised', 1], [2.8, 3.6, 'jump', 'happy', 1]]],
              [lumi, [[0, 12.5, 'sit', 'happy', -1], [0.3, 12.5, 'wave', 'happy', -1]]],
              [prof, [[0, 8, 'stand', 'happy', 0]]],
            ],
            say: [[0.4, lumi, t('cin.tpl.aula.l3', 'Oi! Senta do meu lado!'), 'speech', 2.2], [2.8, me, t('cin.tpl.aula.l4', 'Acho que vou gostar daqui!'), 'speech', 2]],
            fx: [[2.8, 'sparkles', 2, me]],
            sfx: [[2.8, 'ding']],
          }),
        ]),
      ], 'free-07');
    },
  },
  {
    id: 'show',
    get name() {
      return t('cin.tpl.show', 'Show de Talentos');
    },
    get desc() {
      return t('cin.tpl.show.d', 'Medo de palco? Os amigos ajudam!');
    },
    bg: 'stage',
    mode: '2d',
    build() {
      const tro = castOf('trovao');
      const fai = castOf('faisca');
      const nin = castOf('nina');
      return proj('show', t('cin.tpl.show', 'Show de Talentos'), '2d', [tro, fai, nin], [
        scene('stage', [
          shot({
            dur: 4.5,
            tr: 'iris',
            act: [[tro, [[0, 8.9, 'stand', 'happy', 0], [1.4, 8.9, 'point', 'happy', 1]]]],
            say: [[0.2, null, t('cin.tpl.show.n1', 'Grande Show de Talentos!'), 'narration', 1.8], [1.2, tro, t('cin.tpl.show.l1', 'E agora... com vocês... FAÍSCA!'), 'shout', 2.8]],
            sfx: [[0.1, 'drumroll', 0.7]],
          }),
          shot({
            dur: 4.5,
            cam: [{ t: 0, zoom: 2.1, focus: fai }],
            act: [[fai, [[0, 8, 'stand', 'scared', 0]]]],
            say: [[0.4, fai, t('cin.tpl.show.l2', 'Eu... esqueci a letra!'), 'speech', 2], [2.6, fai, t('cin.tpl.show.l3', 'E agora?!'), 'think', 1.6]],
            fx: [[0.3, 'sweat', 4, fai], [0.3, 'shake', 0.5]],
            sfx: [[2.4, 'crickets', 0.6]],
          }),
          shot({
            dur: 4,
            act: [
              [fai, [[0, 8, 'stand', 'sad', 1]]],
              [nin, [[0, 15, 'stand', 'happy', -1], [1.0, 11, 'wave', 'happy', -1]]],
            ],
            say: [[1.1, nin, t('cin.tpl.show.l4', 'Você consegue! Só dança!'), 'speech', 2.4]],
          }),
          shot({
            dur: 5.5,
            tr: 'zoom',
            act: [
              [fai, [[0, 8, 'dance', 'happy', 0]]],
              [nin, [[0, 11.5, 'dance', 'laughing', -1]]],
              [tro, [[0, 4, 'wave', 'happy', 1]]],
            ],
            say: [[2.6, tro, t('cin.tpl.show.l5', 'Que show!'), 'shout', 2]],
            fx: [[0, 'sparkles', 5.5], [0.5, 'hearts', 3, fai]],
            sfx: [[2.4, 'applause']],
          }),
        ], 'night'),
      ], 'free-01');
    },
  },
  {
    id: 'chuva',
    get name() {
      return t('cin.tpl.chuva', 'Piquenique Molhado');
    },
    get desc() {
      return t('cin.tpl.chuva.d', 'Quando chove, a gente dança!');
    },
    bg: 'park',
    mode: '2d',
    build() {
      const pip = castOf('pipoca');
      const lum = castOf('lumi');
      return proj('chuva', t('cin.tpl.chuva', 'Piquenique Molhado'), '2d', [pip, lum], [
        scene('park', [
          shot({
            dur: 4,
            tr: 'fade',
            act: [
              [pip, [[0, 6, 'sit', 'happy', 1]]],
              [lum, [[0, 9.5, 'sit', 'happy', -1]]],
            ],
            say: [[0.5, pip, t('cin.tpl.chuva.l1', 'Que dia lindo pra um piquenique!'), 'speech', 2.6]],
            sfx: [[0, 'pop', 0.4]],
          }),
          shot({
            dur: 4,
            act: [
              [pip, [[0, 6, 'sit', 'happy', 1], [0.8, 6, 'stand', 'surprised', 1]]],
              [lum, [[0, 9.5, 'sit', 'happy', -1], [0.8, 9.5, 'stand', 'sad', -1]]],
            ],
            say: [[1.2, lum, t('cin.tpl.chuva.l2', 'Ah não... chuva!'), 'speech', 2]],
            fx: [[0.6, 'rain', 3.4], [0.6, 'shake', 0.4]],
            sfx: [[0.6, 'thunder', 0.8]],
          }),
          shot({
            dur: 5.5,
            act: [
              [pip, [[0, 6, 'stand', 'sad', 1], [2.4, 6, 'dance', 'laughing', 1]]],
              [lum, [[0, 9.5, 'jump', 'happy', -1], [2.4, 9.5, 'dance', 'happy', -1]]],
            ],
            say: [[0.2, lum, t('cin.tpl.chuva.l3', 'Sabe o que combina com chuva? DANÇAR!'), 'shout', 2.2], [3.0, pip, t('cin.tpl.chuva.l4', 'Melhor piquenique!'), 'speech', 2]],
            fx: [[0, 'rain', 5.5]],
            sfx: [[2.4, 'boing']],
          }),
        ]),
      ], 'free-05');
    },
  },
  {
    id: 'lua',
    get name() {
      return t('cin.tpl.lua', 'Missão Lua');
    },
    get desc() {
      return t('cin.tpl.lua.d', 'Um encontro muito doce no espaço.');
    },
    bg: 'space',
    mode: '2d',
    build() {
      const bip = castOf('robozinho');
      const tro = castOf('trovao');
      const ali = castOf('lumi', 'Zuz', {
        parts: { body: 'b_drop', material: 'm_jelly', pattern: 'p_spots', eyes: 'e_cyclops', mouth: 'mo_grin', head: 'h_antenna', face: 'f_none', back: 'k_none', aura: 'a_none' },
        colors: { primary: '#9be15d', secondary: '#3ecf8e' },
      });
      return proj('lua', t('cin.tpl.lua', 'Missão Lua'), '2d', [bip, tro, ali], [
        scene('space', [
          shot({
            dur: 5,
            tr: 'fade',
            act: [
              [bip, [[0, 1.5, 'stand', 'happy', 1], [1.6, 5, 'stand', 'happy', 1]]],
              [tro, [[0, 0, 'stand', 'neutral', 1], [1.8, 3.2, 'stand', 'neutral', 1]]],
            ],
            say: [[1.7, bip, t('cin.tpl.lua.l1', 'Pouso na Lua: completo! Bip bop.'), 'speech', 1.6], [3.3, tro, t('cin.tpl.lua.l2', 'Dizem que aqui tem alienígenas...'), 'whisper', 1.7]],
            sfx: [[0.1, 'steps', 0.5]],
          }),
          shot({
            dur: 4.5,
            act: [
              [bip, [[0, 5, 'stand', 'surprised', 1]]],
              [tro, [[0, 3.2, 'scared', 'scared', 1]]],
              [ali, [[0, 11, 'stand', 'happy', -1], [0.4, 11, 'wave', 'happy', -1]]],
            ],
            say: [[0.8, ali, t('cin.tpl.lua.l3', 'Olá, terráqueos! Querem biscoito?'), 'speech', 3]],
            fx: [[0, 'sparkles', 1.2, ali], [0.2, 'sweat', 4, tro]],
            sfx: [[0, 'magic']],
          }),
          shot({
            dur: 4.5,
            cam: [{ t: 0, zoom: 1.0 }, { t: 1, zoom: 2, focus: tro }],
            act: [
              [bip, [[0, 5, 'stand', 'laughing', 1]]],
              [tro, [[0, 3.2, 'stand', 'surprised', 1], [1.2, 3.2, 'jump', 'love', 1]]],
              [ali, [[0, 11, 'stand', 'happy', -1]]],
            ],
            say: [[1.2, tro, t('cin.tpl.lua.l4', '...Eu AMO biscoito!'), 'shout', 2.4]],
            fx: [[1.2, 'hearts', 3, tro]],
            sfx: [[1.2, 'boing']],
          }),
        ], 'night'),
      ], 'free-11');
    },
  },
  {
    id: 'castelo',
    pro: true,
    get name() {
      return t('cin.tpl.castelo', 'O Castelo Encantado (3D)');
    },
    get desc() {
      return t('cin.tpl.castelo.d', 'Aventura em 3D com câmeras de cinema.');
    },
    bg: 'castle',
    mode: '3d',
    build() {
      const gem = castOf('gema', undefined, {
        ...clone(presetById('gema')!.av),
        parts: { ...presetById('gema')!.av.parts, head: 'h_crown' },
      });
      const pip = castOf('pipoca');
      const bol = castOf('bolota');
      return proj('castelo', t('cin.tpl.castelo', 'O Castelo Encantado (3D)'), '3d', [gem, pip, bol], [
        scene('castle', [
          shot({
            dur: 5,
            tr: 'fade',
            cam: [{ t: 0, p3: 'orbit', zoom: 1.1 }],
            act: [
              [gem, [[0, 8, 'stand', 'angry', 0, 'inout', -1.8]]],
              [pip, [[0, 2.5, 'stand', 'scared', 1, 'inout', 0.8], [2, 5.6, 'stand', 'scared', 1, 'inout', 0.8]]],
              [bol, [[0, 0, 'stand', 'scared', 1, 'inout', 1.6], [2.2, 3.0, 'stand', 'scared', 1, 'inout', 1.6]]],
            ],
            say: [[0.8, gem, t('cin.tpl.castelo.l1', 'Quem ousa entrar no meu castelo?'), 'shout', 2.6]],
            sfx: [[0.6, 'thunder', 0.6]],
          }),
          shot({
            dur: 4.5,
            cam: [{ t: 0, p3: 'ots', focus: gem, focus2: pip }],
            act: [
              [gem, [[0, 8, 'stand', 'neutral', 0, 'inout', -1.8]]],
              [pip, [[0, 5.6, 'bow', 'happy', 1, 'inout', 0.8]]],
              [bol, [[0, 3.0, 'stand', 'happy', 1, 'inout', 1.6]]],
            ],
            say: [[0.5, pip, t('cin.tpl.castelo.l2', 'Majestade, achamos sua coroa perdida!'), 'speech', 2.8]],
          }),
          shot({
            dur: 5,
            tr: 'dissolve',
            cam: [{ t: 0, p3: 'dolly', focus: gem }],
            act: [
              [gem, [[0, 8, 'stand', 'surprised', 0, 'inout', -1.8], [1.2, 8, 'cheer', 'love', 0, 'inout', -1.8]]],
              [pip, [[0, 5.6, 'cheer', 'laughing', 1, 'inout', 0.8]]],
              [bol, [[0, 3.0, 'dance', 'happy', 1, 'inout', 1.6]]],
            ],
            say: [[1.2, gem, t('cin.tpl.castelo.l3', 'Minha coroa! Vocês são heróis!'), 'speech', 2.6]],
            fx: [[1.2, 'confetti', 3.8], [1.2, 'sparkles', 2, gem]],
            sfx: [[1.1, 'magic'], [2.4, 'applause', 0.7]],
          }),
        ]),
      ], 'free-09');
    },
  },
];
