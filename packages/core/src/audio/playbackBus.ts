/**
 * Reproduz o áudio remoto e guarda, num só lugar, exatamente o que foi tocado.
 *
 * Existe por causa de um defeito concreto: o loopback do Windows captura a
 * mistura inteira da saída de áudio, então o áudio do sistema publicado
 * continha as vozes da própria sala e cada participante escutava a si mesmo de
 * volta. Para removê-las é preciso ter o sinal exato que saiu — e é isso que
 * este barramento é.
 *
 * A reprodução deixou de ser por elemento `<audio>` por um motivo medido:
 * `createMediaElementSource` sobre um elemento alimentado por `srcObject`
 * entrega silêncio no Chromium. O elemento tocava, o grafo não via nada, e a
 * referência ficava zerada — o que também teria estragado o ganho unitário de
 * que a subtração depende, já que o volume do elemento não apareceria nela.
 *
 * Tocando aqui, o volume por participante passa a ser um ganho deste grafo: o
 * que se ouve e o que se subtrai são o mesmo sinal, por construção.
 */
interface Reproducao {
  fonte: MediaStreamAudioSourceNode;
  ganho: GainNode;
  bomba: HTMLAudioElement;
}

/** Onde ficam os elementos que mantêm as faixas remotas fluindo. */
const CONTAINER_ID = 'nigord-audio';

export class PlaybackBus {
  private context: AudioContext | null = null;
  private mixer: GainNode | null = null;
  private readonly tocando = new Map<string, Reproducao>();

  /** Criado sob demanda: sem áudio remoto, não há motivo para existir. */
  private ensure(): { context: AudioContext; mixer: GainNode } {
    if (this.context && this.mixer) return { context: this.context, mixer: this.mixer };
    const context = new AudioContext();
    const mixer = context.createGain();
    mixer.connect(context.destination);
    this.context = context;
    this.mixer = mixer;
    return { context, mixer };
  }

  /** Começa a tocar uma faixa remota, identificada por uma chave estável. */
  play(key: string, track: MediaStreamTrack): void {
    if (this.tocando.has(key)) return;
    const { context, mixer } = this.ensure();

    const stream = new MediaStream([track]);

    // O elemento existe mudo e não reproduz nada: é uma bomba. Uma faixa remota
    // entregue apenas ao Web Audio não flui no Chromium — medido aqui como
    // referência com energia exatamente zero, com o grafo todo conectado e o
    // contexto rodando. Com o elemento consumindo a faixa, o áudio anda.
    const bomba = document.createElement('audio');
    bomba.srcObject = stream;
    bomba.muted = true;
    bomba.autoplay = true;
    bomba.dataset['nigordAudio'] = key;
    this.container().append(bomba);
    void bomba.play().catch(() => undefined);

    const fonte = context.createMediaStreamSource(stream);
    const ganho = context.createGain();
    fonte.connect(ganho).connect(mixer);
    this.tocando.set(key, { fonte, ganho, bomba });

    // Um contexto suspenso significa sala muda. A interface já tem o aviso e a
    // ação para isso; aqui só se tenta, porque frequentemente já há gesto.
    if (context.state !== 'running') void context.resume().catch(() => undefined);
  }

  stop(key: string): void {
    const reproducao = this.tocando.get(key);
    if (!reproducao) return;
    reproducao.fonte.disconnect();
    reproducao.ganho.disconnect();
    reproducao.bomba.srcObject = null;
    reproducao.bomba.remove();
    this.tocando.delete(key);
  }

  /** Encerra toda a reprodução, para quando a sessão inteira acaba de uma vez. */
  stopAll(): void {
    for (const chave of [...this.tocando.keys()]) this.stop(chave);
  }

  /** Volume de uma faixa, 0..1. É o mesmo ganho que entra na referência. */
  setVolume(key: string, volume: number): void {
    const reproducao = this.tocando.get(key);
    if (reproducao) reproducao.ganho.gain.value = volume;
  }

  private container(): HTMLElement {
    const existente = document.getElementById(CONTAINER_ID);
    if (existente) return existente;
    const container = document.createElement('div');
    container.id = CONTAINER_ID;
    container.style.position = 'absolute';
    container.style.width = '0';
    container.style.height = '0';
    container.style.overflow = 'hidden';
    document.body.append(container);
    return container;
  }

  async resume(): Promise<void> {
    if (this.context?.state === 'suspended') await this.context.resume();
  }

  /** False enquanto o sistema não deixa este contexto tocar. */
  get running(): boolean {
    return this.context === null || this.context.state === 'running';
  }

  /** A referência para subtrair, ou null quando nada foi reproduzido ainda. */
  referenceNode(): { context: AudioContext; node: GainNode } | null {
    return this.context && this.mixer ? { context: this.context, node: this.mixer } : null;
  }

  /**
   * O que um roteiro automatizado consegue observar sobre a reprodução.
   *
   * Antes isso se via contando elementos `<audio>` no documento; sem eles, o
   * estado precisa ser exposto de propósito — "o áudio saiu?" é a pergunta que
   * já ficou sem resposta uma sessão inteira.
   */
  snapshot(): { fontes: number; estado: string } {
    return { fontes: this.tocando.size, estado: this.context?.state ?? 'sem contexto' };
  }
}
