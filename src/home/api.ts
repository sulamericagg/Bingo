/**
 * CONTRATO "CASA, PLANETA & AMIGOS".
 * Servidor (agente backend): server/home*.ts, server/friends*.ts + rotas.
 * Cliente (agente casa): src/home/* usa SÓ estas funções (implementadas em src/services/home.ts).
 */

/* ---------- @nome de usuário ---------- */
/** 3–16 caracteres: a-z 0-9 _ . (sem espaço, sem dados pessoais; filtrado pela moderação). */
export interface HandleCheck {
  ok: boolean; // disponível e válido
  reason?: 'taken' | 'invalid' | 'blocked' | 'network';
  suggestions?: string[];
}

/* ---------- amizades ---------- */
export interface FriendInfo {
  id: string;
  handle: string; // sem o @
  name: string;
  skin: string;
  avatar?: unknown;
  creature?: string; // foto de perfil
  online: boolean;
  lastSeen: number;
  houseMess: number; // 0..1 (quão bagunçada está a casa dele) — para "ajude a limpar!"
}
export interface FriendRequest {
  from: FriendInfo;
  at: number;
}

/* ---------- casa & planeta ---------- */
/**
 * Design modular. Cada campo é um índice/ID de peça + cor. O agente da casa define o
 * catálogo (src/home/catalog.ts) com combinações > 10^12 (1 trilhão). O servidor só
 * armazena o JSON (limite 16 KB) sem interpretar.
 */
/** Permissões que o dono dá a cada amigo. Padrão para amigos: 'clean'. */
export type HomeRole = 'view' | 'clean' | 'decorate' | 'build';
export interface HomeAccess {
  visits: 'friends' | 'nobody';
  /** papel padrão de qualquer amigo */
  defaultRole: HomeRole;
  /** papel por amigo (id) — sobrescreve o padrão */
  roles: Record<string, HomeRole>;
}

export interface HomeDesign {
  v: 1;
  /** opcional (designs antigos não têm): quem pode visitar/ajudar/construir */
  access?: HomeAccess;
  /** pintura livre das paredes/pisos (pinceladas/rolo): por cômodo, lista compacta */
  paint?: Record<string, { wall: string; strokes?: string }>;
  planet: Record<string, string | number>;
  exterior: Record<string, string | number>;
  rooms: RoomDesign[];
}
export interface RoomDesign {
  id: string;
  floor: string;
  wall: string;
  items: { id: string; x: number; y: number; flip?: boolean; color?: string; layer?: number }[];
}

/** Sujeira persistente (até alguém limpar). */
export interface MessItem {
  id: string;
  kind: 'cake' | 'frosting' | 'juice' | 'crumbs' | 'confetti' | 'tomato' | 'pie' | 'balloon-pop' | 'mud';
  room: string;
  x: number;
  y: number;
  r: number; // tamanho
  rot?: number;
  /** objeto derrubado/fora do lugar: id do item do RoomDesign e posição original */
  moved?: { itemId: string; ox: number; oy: number };
}
export interface HomeState {
  ownerId: string;
  design: HomeDesign;
  mess: MessItem[];
  updatedAt: number;
}

/* ---------- festa (tempo real, na casa de alguém) ---------- */
export interface PartyPeer {
  id: string;
  name: string;
  handle: string;
  skin: string;
  avatar?: unknown;
  x: number;
  y: number;
  room: string;
  holding?: string; // comida na mão
  emote?: string;
  bot?: boolean;
}
export type PartyEvent =
  | { t: 'throw'; from: string; food: string; x: number; y: number; vx: number; vy: number }
  | { t: 'splat'; mess: MessItem }
  | { t: 'clean'; messId: string; by: string }
  | { t: 'eat'; by: string; food: string }
  | { t: 'cake'; slices: number }
  | { t: 'chat'; by: string; code: string };

export interface PartySession {
  readonly online: boolean;
  readonly hostId: string;
  send(state: Partial<PartyPeer>): void; // ~8 Hz
  event(e: PartyEvent): void;
  onPeers(cb: (peers: PartyPeer[]) => void): void;
  onEvent(cb: (e: PartyEvent) => void): void;
  leave(): void;
}

/* ---------- API do cliente (src/services/home.ts) ---------- */
export interface HomeApi {
  checkHandle(handle: string): Promise<HandleCheck>;
  claimHandle(handle: string): Promise<HandleCheck>;
  myHandle(): string | null;
  searchPlayer(handle: string): Promise<FriendInfo | null>;
  friends(): Promise<FriendInfo[]>;
  requests(): Promise<FriendRequest[]>;
  addFriend(handleOrId: string): Promise<'sent' | 'already' | 'not_found' | 'limit' | 'network'>;
  respond(fromId: string, accept: boolean): Promise<boolean>;
  removeFriend(id: string): Promise<boolean>;
  getHome(ownerId?: string): Promise<HomeState | null>; // sem id = minha (cache local offline)
  saveDesign(design: HomeDesign): Promise<boolean>;
  setMess(ownerId: string, mess: MessItem[]): Promise<boolean>; // dono ou amigo (limpando)
  joinParty(hostId: string, opts?: { botsIfAlone?: number }): Promise<PartySession>;
}
