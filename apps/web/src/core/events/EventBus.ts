type Callback<T> = (payload: T) => void;

export interface EditorEventMap {
  'playback:toggle': { playing: boolean };
  'playhead:seek': { time: number };
  'clip:select': { id: string | null };
  'clip:split': { id: string; time: number };
  'workspace:resize': { panelId: string; width: number; height: number };
  'shortcut:triggered': { command: string };
  'media:upload_start': { filename: string };
  'media:upload_complete': { id: string; url: string };
}

class EventBus {
  private listeners: { [K in keyof EditorEventMap]?: Callback<any>[] } = {};

  on<K extends keyof EditorEventMap>(event: K, cb: Callback<EditorEventMap[K]>): () => void {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event]!.push(cb);
    return () => this.off(event, cb);
  }

  off<K extends keyof EditorEventMap>(event: K, cb: Callback<EditorEventMap[K]>): void {
    if (!this.listeners[event]) return;
    this.listeners[event] = this.listeners[event]!.filter(listener => listener !== cb);
  }

  emit<K extends keyof EditorEventMap>(event: K, payload: EditorEventMap[K]): void {
    if (!this.listeners[event]) return;
    this.listeners[event]!.forEach(cb => cb(payload));
  }
}

export const editorBus = new EventBus();
export default editorBus;
