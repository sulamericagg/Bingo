/* ============================================================
 *  GARIMPO — vista da câmera (1ª pessoa → 3ª atrás → 3ª de frente), estilo Roblox.
 *  Ajudante LOCAL com a mesma ideia do src/3d/camview.ts compartilhado (outro ramo):
 *  um botão pequeno de câmera no topo troca a vista; a escolha fica salva por jogo
 *  (a pé e em máquinas separadas). Padrão: a pé em 1ª pessoa; máquinas na câmera de
 *  perseguição de sempre (a 1ª pessoa delas = vista do capô/cabine).
 *  Para trocar pelo compartilhado depois: só get/cycle/label são usados pelo jogo.
 * ============================================================ */
import { t } from '../../i18n';

export type CamView = 'fp' | 'back' | 'front';
export type CamCtx = 'foot' | 'veh' | 'heli';
const ORDER: CamView[] = ['fp', 'back', 'front'];
const DEF: Record<CamCtx, CamView> = { foot: 'fp', veh: 'back', heli: 'back' };

export class CamViews {
  private v: Record<CamCtx, CamView> = { ...DEF };
  constructor(private key: string) {
    try {
      const o = JSON.parse(localStorage.getItem(key) || '{}') as Partial<Record<CamCtx, string>>;
      for (const c of Object.keys(DEF) as CamCtx[]) if (ORDER.includes(o[c] as CamView)) this.v[c] = o[c] as CamView;
    } catch {
      /* sem storage: padrão */
    }
  }
  /** vistas que este contexto aceita (helicóptero anda relativo à tela: só atrás) */
  private allowed(c: CamCtx): CamView[] {
    return c === 'heli' ? ['back'] : ORDER;
  }
  get(c: CamCtx): CamView {
    const a = this.allowed(c);
    return a.includes(this.v[c]) ? this.v[c] : a[0];
  }
  cycle(c: CamCtx): CamView {
    const a = this.allowed(c);
    const i = a.indexOf(this.get(c));
    this.v[c] = a[(i + 1) % a.length];
    try {
      localStorage.setItem(this.key, JSON.stringify(this.v));
    } catch {
      /* */
    }
    return this.v[c];
  }
}

export function camLabel(v: CamView): string {
  return v === 'fp' ? t('gb.cam.fp', '1ª pessoa') : v === 'back' ? t('gb.cam.back', '3ª pessoa') : t('gb.cam.front', 'De frente');
}
/** selo curto no botão */
export function camBadge(v: CamView): string {
  return v === 'fp' ? '1ª' : v === 'back' ? '3ª' : '3ª↺';
}
