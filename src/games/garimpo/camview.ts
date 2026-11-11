/* ============================================================
 *  GARIMPO — vista da câmera por contexto, em cima da câmera COMPARTILHADA (src/3d/camview.ts):
 *  um botão pequeno no topo troca 1ª pessoa → 3ª atrás → 3ª de frente; a escolha fica salva
 *  (a pé e em máquinas separadas). Padrão: a pé em 1ª pessoa (fpkit); máquinas na câmera de
 *  perseguição (a 1ª pessoa delas = vista da cabine/capô); helicóptero só atrás.
 * ============================================================ */
import { CamView, type CamMode } from '../../3d/camview';
import { t } from '../../i18n';

export type { CamMode };
export type CamCtx = 'foot' | 'veh' | 'heli';

export class CamViews {
  private v: Record<'foot' | 'veh', CamView>;
  constructor(game: string) {
    this.v = { foot: new CamView(game, 'fp'), veh: new CamView(game + '-veh', 'tp') };
  }
  get(c: CamCtx): CamMode {
    return c === 'heli' ? 'tp' : this.v[c].mode;
  }
  cycle(c: CamCtx): CamMode {
    return c === 'heli' ? 'tp' : this.v[c].cycle();
  }
}

export function camLabel(v: CamMode): string {
  return v === 'fp' ? t('gb.cam.fp', '1ª pessoa') : v === 'tp' ? t('gb.cam.back', '3ª pessoa') : t('gb.cam.front', 'De frente');
}
/** selo curto no botão */
export function camBadge(v: CamMode): string {
  return v === 'fp' ? '1ª' : v === 'tp' ? '3ª' : '3ª↺';
}
