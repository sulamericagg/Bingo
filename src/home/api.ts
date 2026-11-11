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
  /** (opcional) troca de @nome bloqueada até esta data (1x a cada 30 dias) — vem com reason 'invalid' */
  until?: number;
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

/** Resultado da busca de @ (o servidor nunca manda o id de quem você ainda não é amigo). */
export interface HandleHit {
  handle: string;
  name: string;
  skin: string;
  avatar?: unknown;
  creature?: string;
  online: boolean;
  /** relação comigo: amigo / pedido enviado / pedido recebido */
  rel: 'friend' | 'sent' | 'received' | null;
}
export type InviteKind = 'party' | 'house' | 'game' | 'squad';
export interface FriendInvite {
  from: FriendInfo;
  kind: InviteKind;
  game?: string;
  /** grupo (squad) do convite */
  room?: string;
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
  /** (opcional) casa aberta para amigos visitarem com o dono offline (padrão true) */
  visitsOpen?: boolean;
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
  | { t: 'chat'; by: string; code: string }
  /** (opcional) design inteiro novo — só amigos com papel 'decorate'/'build' (ou o dono); o servidor confere */
  | { t: 'design'; by: string; design: HomeDesign };

export interface PartySession {
  readonly online: boolean;
  readonly hostId: string;
  /** (opcional) por que ficou offline: 'not_friend' | 'closed' | 'full' | 'network' */
  readonly reason?: string;
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
  /** (opcional) amigo com papel 'decorate'/'build' salva o design da casa de outro (fora da festa) */
  saveFriendDesign?(ownerId: string, design: HomeDesign): Promise<boolean>;
  /** (opcional) bloqueia/desbloqueia no servidor (desfaz amizade e some com pedidos) */
  blockPlayer?(id: string, on: boolean): Promise<boolean>;
  /** (opcional) busca de @ enquanto digita: até 10 parecidos. 'rate' = muitas buscas seguidas; null = sem rede */
  searchHandles?(q: string): Promise<HandleHit[] | 'rate' | null>;
  /** (opcional) convites recebidos de amigos (festa/casa/jogo) */
  invites?(): Promise<FriendInvite[]>;
  invite?(friendId: string, kind: InviteKind, game?: string): Promise<'sent' | 'not_friend' | 'wait' | 'network'>;
  clearInvite?(fromId: string): Promise<void>;
  /** (opcional) aparecer na busca de @ (padrão: sim) */
  discoverable?(): boolean;
  setDiscoverable?(on: boolean): Promise<boolean>;
  /** (opcional) quem pode te convidar: amigos (padrão) ou ninguém */
  invitesFrom?(): 'friends' | 'nobody';
  setInvitesFrom?(v: 'friends' | 'nobody'): Promise<boolean>;
  /** (opcional) denunciar jogador (por id ou, vindo da busca, pelo @) */
  report?(target: { id?: string; handle?: string; name?: string }, reason: string): Promise<boolean>;
}
