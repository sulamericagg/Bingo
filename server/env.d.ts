declare module '*.html' {
  const content: string;
  export default content;
}

interface Env {
  DATA: KVNamespace;
  ASSETS: Fetcher;
  /** Durable Object da Corrida Orbital (lobby + salas). */
  RACE: DurableObjectNamespace<import('./race').RaceRoom>;
  /** Presença drop-in (lobby por jogo + shards de até 6). */
  PRESENCE: DurableObjectNamespace<import('./presence').PresenceRoom>;
  /** Chat moderado (uma instância por sala). */
  CHAT: DurableObjectNamespace<import('./chat').ChatRoom>;
  /** Campeonatos (instância única 'hub' com alarme). */
  CHAMP: DurableObjectNamespace<import('./champ').Championship>;
  /** Segredo definido no painel da Cloudflare (Settings → Variables and Secrets). */
  ADMIN_PASSWORD?: string;
}
