/* ============================================================
 *  MODO 3D DA CASA — tipos públicos.
 *  Fonte da verdade: HomeDesign + MessItem[] (src/home/api.ts).
 *  O 3D só lê esses dados e devolve versões alteradas via onChange.
 * ============================================================ */
import type { HomeDesign, MessItem, PartySession } from '../home/api';

export type Mode3D = 'fps' | 'build';

export interface Open3DOpts {
  design: HomeDesign;
  mess: MessItem[];
  /** dono da casa (para festa/visita) */
  ownerId: string;
  /**
   * true = minha casa: modo construção liberado e mudanças no design são salvas.
   * false = visita/festa na casa de outra pessoa: design só leitura (móveis voltam
   * ao lugar ao sair), mas limpar sujeira É permitido (e recompensado).
   */
  editable: boolean;
  /** chamado ao sair (e a cada mudança importante, com throttle) */
  onChange(design: HomeDesign, mess: MessItem[]): void;
  /** modo inicial (padrão 'fps'); 'build' só se editable */
  mode?: Mode3D;
  /** cômodo inicial (padrão: 'party' em festa, senão 'living') */
  room?: string;
  /** festa em tempo real. Sem isso, em modo festa simulamos 2–3 amigos-robô locais. */
  party?: PartySession;
  /** liga o modo festa (bolo, comida na mesa, guerra de comida) mesmo sem PartySession */
  partyMode?: boolean;
  /** pele/avatar do jogador local (padrão: save.skin) */
  skin?: string;
  /** recompensa por limpar a casa dos outros: n = sujeiras limpas */
  onReward?(kind: 'clean', n: number): void;
  /** chamado depois que a tela 3D fechou (orientação já restaurada) */
  onClose?(result: Close3DResult): void;
  /** pula aviso de girar o telefone (testes) */
  skipRotate?: boolean;
  /** id de quem está jogando (permissões em design.access.roles e id na festa) */
  viewerId?: string;
  /** expõe window.__home3d (testes) */
  debug?: boolean;
  /** força abrir mesmo em aparelho Mínimo / sem confirmação */
  force?: boolean;
}

export interface Close3DResult {
  design: HomeDesign;
  mess: MessItem[];
  cleaned: number;
  broken: number;
  reason: 'exit' | 'webgl' | 'declined' | 'error';
}

/**
 * Campos OPCIONAIS que o 3D adiciona ao MessItem (o 2D pode ignorar):
 *  - broken: o móvel `moved.itemId` foi quebrado (desenhar caquinhos/esconder o móvel até ARRUMAR)
 *  - wall:   sujeira grudada numa parede ('n' = fundo, 'e'/'w' laterais, 's' frente); x,y ainda são
 *            uma posição aproximada no plano 2D, então o 2D pode desenhar no chão/parede do fundo.
 *  - h:      altura (m) da mancha na parede
 *  - yaw:    giro do móvel derrubado (rad) — o 2D pode usar `rot` (já existe) para inclinar
 * Para móveis fora do lugar: kind = 'crumbs', r = 0, moved = { itemId, ox, oy } (ox/oy identificam
 * QUAL instância — o mesmo id pode aparecer 2x no cômodo).
 */
export interface MessItem3D extends MessItem {
  broken?: boolean;
  wall?: 'n' | 'e' | 's' | 'w';
  h?: number;
  yaw?: number;
}

/** Item do RoomDesign com giro do 3D (quartos de volta 0..3). flip continua valendo no 2D (r3 === 2 → flip). */
export interface RoomItem3D {
  id: string;
  x: number;
  y: number;
  flip?: boolean;
  color?: string;
  layer?: number;
  r3?: number;
}
