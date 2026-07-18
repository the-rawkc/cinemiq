import { create } from 'zustand';

export interface TimelineClip {
  id: string;
  assetId: string;
  name: string;
  type: 'video' | 'audio' | 'image' | 'text';
  start: number; // Start time in timeline (seconds)
  duration: number; // Duration of clip (seconds)
  sourceStart: number; // Start time within source asset (seconds)
  trackIndex: number;
  url: string;
}

interface EditorState {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  zoom: number;
  clips: TimelineClip[];
  selectedClipId: string | null;
  
  // Actions
  setIsPlaying: (isPlaying: boolean) => void;
  setCurrentTime: (time: number) => void;
  setDuration: (duration: number) => void;
  setZoom: (zoom: number) => void;
  addClip: (clip: TimelineClip) => void;
  updateClip: (id: string, updates: Partial<TimelineClip>) => void;
  removeClip: (id: string) => void;
  setSelectedClip: (id: string | null) => void;
}

export const useEditorStore = create<EditorState>((set) => ({
  isPlaying: false,
  currentTime: 0,
  duration: 60, // Default 1 minute
  zoom: 10, // Pixels per second
  clips: [],
  selectedClipId: null,

  setIsPlaying: (isPlaying) => set({ isPlaying }),
  setCurrentTime: (currentTime) => set({ currentTime }),
  setDuration: (duration) => set({ duration }),
  setZoom: (zoom) => set({ zoom }),
  
  addClip: (clip) => set((state) => ({ 
    clips: [...state.clips, clip] 
  })),
  
  updateClip: (id, updates) => set((state) => ({
    clips: state.clips.map((clip) => clip.id === id ? { ...clip, ...updates } : clip)
  })),
  
  removeClip: (id) => set((state) => ({
    clips: state.clips.filter((clip) => clip.id !== id),
    selectedClipId: state.selectedClipId === id ? null : state.selectedClipId
  })),
  
  setSelectedClip: (id) => set({ selectedClipId: id }),
}));
