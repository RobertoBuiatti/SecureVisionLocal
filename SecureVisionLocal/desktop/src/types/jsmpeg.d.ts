declare module '@cycjimmy/jsmpeg-player' {
  interface PlayerOptions {
    canvas?: HTMLCanvasElement;
    audio?: boolean;
    video?: boolean;
    autoplay?: boolean;
    loop?: boolean;
    pauseWhenHidden?: boolean;
    [key: string]: unknown;
  }

  class Player {
    constructor(url: string, options: PlayerOptions);
    play(): void;
    pause(): void;
    stop(): void;
    destroy(): void;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  class VideoElement {
    constructor(element: HTMLElement, url: string, options?: PlayerOptions, overlay?: unknown);
    destroy(): void;
  }

  const JSMpeg: { Player: typeof Player; VideoElement: typeof VideoElement };
  export default JSMpeg;
  export { Player, VideoElement };
}
