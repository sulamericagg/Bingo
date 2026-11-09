declare module '*.html' {
  const content: string;
  export default content;
}

interface Env {
  DATA: KVNamespace;
  ASSETS: Fetcher;
  /** Segredo definido no painel da Cloudflare (Settings → Variables and Secrets). */
  ADMIN_PASSWORD?: string;
}
