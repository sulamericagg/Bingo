/**
 * CAÇA BLOOP — "AR-lite": câmera traseira de fundo + bichinho ancorado pela orientação do aparelho.
 * Sem oclusão real (precisa de um módulo nativo de AR depois): `ArProvider` é a interface para plugá-lo.
 * A câmera só liga com o AR ativado pelo jogador, fica só na tela de encontro e desliga ao sair.
 * Nenhuma imagem é gravada nem enviada.
 */

export interface ArPose {
  /** rad: giro horizontal (positivo = virou para a direita) */
  yaw: number;
  /** rad: inclinação (positivo = apontou para cima) */
  pitch: number;
}

export interface ArProvider {
  readonly kind: 'web-lite' | 'native';
  /** suporta oclusão/planos reais? (web-lite: não) */
  readonly occlusion: boolean;
  /** Liga câmera + sensores. `video` recebe o fluxo (web-lite). Devolve se a câmera ligou. */
  start(video: HTMLVideoElement): Promise<{ camera: boolean; sensors: boolean }>;
  /** pose atual relativa à pose de quando `anchor()` foi chamado */
  pose(): ArPose | null;
  /** ancora o bichinho onde o aparelho aponta agora */
  anchor(): void;
  stop(): void;
}

const D = Math.PI / 180;
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

export class WebArLite implements ArProvider {
  readonly kind = 'web-lite' as const;
  readonly occlusion = false;
  private stream: MediaStream | null = null;
  private yaw = 0;
  private pitch = 0;
  private y0 = 0;
  private p0 = 0;
  private got = false;
  private sm: ArPose = { yaw: 0, pitch: 0 };

  private onOri = (e: DeviceOrientationEvent) => {
    if (e.alpha === null || e.beta === null) return;
    this.got = true;
    const ang = ((screen.orientation?.angle ?? 0) as number) * D;
    // retrato, câmera traseira: alpha = bússola (anti-horário), beta = 90 quando o aparelho está em pé
    this.yaw = -(e.alpha * D) - ang;
    this.pitch = (e.beta - 90) * D;
  };

  async start(video: HTMLVideoElement): Promise<{ camera: boolean; sensors: boolean }> {
    let sensors = false;
    try {
      const DOE = DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> };
      if (typeof DOE.requestPermission === 'function') sensors = (await DOE.requestPermission()) === 'granted';
      else sensors = 'DeviceOrientationEvent' in window;
    } catch {
      sensors = false;
    }
    if (sensors) window.addEventListener('deviceorientation', this.onOri);
    let camera = false;
    try {
      if (navigator.mediaDevices?.getUserMedia) {
        this.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
        video.srcObject = this.stream;
        video.muted = true;
        video.playsInline = true;
        await video.play().catch(() => {});
        camera = true;
      }
    } catch {
      camera = false;
    }
    this.anchor();
    return { camera, sensors };
  }

  anchor(): void {
    this.y0 = this.yaw;
    this.p0 = this.pitch;
  }

  pose(): ArPose | null {
    if (!this.got) return null;
    const ty = wrap(this.yaw - this.y0);
    const tp = this.pitch - this.p0;
    // filtro leve para não tremer
    this.sm.yaw += wrap(ty - this.sm.yaw) * 0.25;
    this.sm.pitch += (tp - this.sm.pitch) * 0.25;
    return this.sm;
  }

  stop(): void {
    window.removeEventListener('deviceorientation', this.onOri);
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
  }
}
