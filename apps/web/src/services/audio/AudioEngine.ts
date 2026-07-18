export interface AudioPlaybackInstance {
  clipId: string;
  element: HTMLAudioElement;
  sourceNode: MediaElementAudioSourceNode;
  gainNode: GainNode;
}

class AudioEngine {
  private ctx: AudioContext | null = null;
  private instances: Map<string, AudioPlaybackInstance> = new Map();
  private masterGain: GainNode | null = null;

  init() {
    if (this.ctx) return;
    
    // Initialize standard AudioContext
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    this.ctx = new AudioContextClass();
    
    // Master Node
    this.masterGain = this.ctx.createGain();
    this.masterGain.connect(this.ctx.destination);
    this.masterGain.gain.setValueAtTime(1.0, this.ctx.currentTime);
  }

  getAudioContext(): AudioContext | null {
    return this.ctx;
  }

  // Set master volume level (0.0 to 1.0)
  setMasterVolume(level: number) {
    this.init();
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.linearRampToValueAtTime(
        Math.max(0, Math.min(1.5, level)), 
        this.ctx.currentTime + 0.1
      );
    }
  }

  // Preload and play/sync audio track source
  syncAudioClip(clipId: string, url: string, offset: number, duration: number, startTrim: number, playheadTime: number, isPlaying: boolean, volume: number, muted: boolean) {
    this.init();
    if (!this.ctx || !this.masterGain) return;

    let instance = this.instances.get(clipId);

    // 1. Create instance if not exists
    if (!instance) {
      const audio = new Audio();
      audio.src = url;
      audio.crossOrigin = 'anonymous';
      audio.loop = false;

      const sourceNode = this.ctx.createMediaElementSource(audio);
      const gainNode = this.ctx.createGain();

      sourceNode.connect(gainNode);
      gainNode.connect(this.masterGain);

      instance = {
        clipId,
        element: audio,
        sourceNode,
        gainNode
      };

      this.instances.set(clipId, instance);
    }

    const audio = instance.element;
    const gainNode = instance.gainNode;

    // Apply mute and volume values
    const targetVolume = muted ? 0 : volume;
    gainNode.gain.setValueAtTime(targetVolume, this.ctx.currentTime);

    const relativeTime = playheadTime - offset;
    const inRange = relativeTime >= 0 && relativeTime <= duration;

    if (inRange && isPlaying) {
      const targetSec = relativeTime + startTrim;
      
      // Sync seek position if drifting more than 0.1 seconds
      if (Math.abs(audio.currentTime - targetSec) > 0.1) {
        audio.currentTime = targetSec;
      }
      
      if (audio.paused) {
        audio.play().catch((err) => console.log('Audio Autoplay Blocked:', err.message));
      }
    } else {
      if (!audio.paused) {
        audio.pause();
      }
      // If playhead seeks manually, update element currentTime for preview
      if (inRange) {
        audio.currentTime = relativeTime + startTrim;
      }
    }
  }

  // Pause all running elements
  pauseAll() {
    this.instances.forEach((inst) => {
      inst.element.pause();
    });
  }

  // Cleanup completed clips
  stopUnusedClips(activeClipIds: string[]) {
    this.instances.forEach((inst, clipId) => {
      if (!activeClipIds.includes(clipId)) {
        inst.element.pause();
        inst.element.src = '';
        inst.sourceNode.disconnect();
        inst.gainNode.disconnect();
        this.instances.delete(clipId);
      }
    });
  }

  destroy() {
    this.pauseAll();
    this.instances.clear();
    if (this.ctx) {
      this.ctx.close();
      this.ctx = null;
      this.masterGain = null;
    }
  }
}

export const audioEngine = new AudioEngine();
export default audioEngine;
