export type ClipType = 'video' | 'audio' | 'image' | 'text' | 'effect' | 'transition';

export interface TransformConfig {
  x: number;          // Position offset percentage (-100 to 100)
  y: number;          // Position offset percentage (-100 to 100)
  scaleX: number;     // Scale multiplier (default 1.0)
  scaleY: number;     // Scale multiplier (default 1.0)
  rotation: number;   // Rotation in degrees (0-360)
  opacity: number;    // Alpha transparency (0.0 to 1.0)
}

export interface EffectConfig {
  id: string;
  type: string;       // e.g., 'lut', 'blur', 'chroma_key', 'color_correct'
  enabled: boolean;
  properties: Record<string, any>;
}

export interface TextConfig {
  content: string;
  fontSize: number;
  color: string;
  fontFamily: string;
  bold: boolean;
  italic: boolean;
  alignment: 'left' | 'center' | 'right';
  x: number;          // Visual X percentage on screen (0-100)
  y: number;          // Visual Y percentage on screen (0-100)
}

export interface ShapeConfig {
  type: 'rect' | 'circle' | 'triangle' | 'star' | 'hexagon' | 'sticker';
  fill: string;
  x?: number;
  y?: number;
  stickerUrl?: string;
}

export interface TimelineClip {
  id: string;
  type: ClipType;
  name: string;
  trackId: string;
  offset: number;     // Start timestamp on timeline ruler (seconds)
  duration: number;   // Active duration of the clip block (seconds)
  source: string;     // URL or Local file path reference
  start: number;      // Trim/crop start point in the media asset source (seconds)
  volume: number;     // Audio level multiplier (0.0 to 2.0, default 1.0)
  speed: number;      // Playback speed multiplier (default 1.0)
  muted: boolean;
  transform?: TransformConfig;
  textConfig?: TextConfig;
  shapeConfig?: ShapeConfig;
  effects: EffectConfig[];
}

export interface TimelineTrack {
  id: string;
  type: 'video' | 'audio';
  name: string;
  muted: boolean;
  locked: boolean;
  order: number;
}

export interface Resolution {
  width: number;
  height: number;
}

export interface Project {
  id: string;
  name: string;
  resolution: Resolution;
  fps: number;
  tracks: TimelineTrack[];
  clips: TimelineClip[];
}

export interface Keyframe<T> {
  timeOffset: number; // position relative to clip start (seconds)
  value: T;
  easing: 'linear' | 'ease-in' | 'ease-out' | 'bezier' | 'elastic';
  controlPoints?: [number, number, number, number];
}

export interface KeyframedProperty<T> {
  keyframes: Keyframe<T>[];
  defaultValue: T;
}

export interface TimelineOperation {
  id: string;
  type: 'add_clip' | 'remove_clip' | 'move_clip' | 'trim_clip' | 'apply_effect' | 'update_transform' | 'split_clip';
  timestamp: number;
  payload: Record<string, any>;
  inversePayload: Record<string, any>;
}
