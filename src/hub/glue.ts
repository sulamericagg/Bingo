/**
 * Liga os módulos independentes entre si (feito pelo integrador):
 * passe → coleção de criaturas, níveis das criaturas, foto de perfil.
 */
import { bus } from '../core/events';
import { grantCreature, getProfileCreature, setCreatureLevelResolver } from '../creatures/state';
import { defaultProfile, refreshProfile, setProfileRenderer } from './hub';

const PASS_LEVEL = { common: 1, medio: 20, rare: 30, epic: 40, legendary: 50 } as const;

export function wireGlue(): void {
  bus.on('creature-grant', (e: { id: string }) => {
    if (e?.id) grantCreature(e.id);
  });
  setCreatureLevelResolver((_season, rarity) => PASS_LEVEL[rarity] ?? null);

  setProfileRenderer((canvas, size) => {
    const id = getProfileCreature();
    if (!id) return defaultProfile(canvas, size);
    import('../creatures/render')
      .then(({ renderCreatureIcon }) => {
        const d = Math.min(2, window.devicePixelRatio || 1);
        const icon = renderCreatureIcon(id, Math.round(size * d));
        canvas.width = Math.round(size * d);
        canvas.height = Math.round(size * d);
        const x = canvas.getContext('2d')!;
        x.clearRect(0, 0, canvas.width, canvas.height);
        x.drawImage(icon, 0, 0, canvas.width, canvas.height);
      })
      .catch(() => defaultProfile(canvas, size));
  });
  bus.on('profile-creature-changed', () => refreshProfile());
}
