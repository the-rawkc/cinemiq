import { create } from 'zustand';

export type ActiveTab = 'media' | 'audio' | 'effects' | 'transitions' | 'templates' | 'ai';

export interface PanelSizes {
  mediaWidth: number;      // percentage (e.g. 35)
  previewWidth: number;    // percentage (e.g. 40)
  inspectorWidth: number;  // percentage (e.g. 25)
  timelineHeight: number;  // percentage (e.g. 40)
}

interface UIState {
  isPlaying: boolean;
  playheadTime: number;      // time in seconds
  zoom: number;              // pixels per second on the timeline ruler (default: 30)
  selectedClipId: string | null;
  selectedTrackId: string | null;
  activeExplorerTab: ActiveTab;
  panelSizes: PanelSizes;
  isMediaLoading: boolean;
  
  // Actions
  setIsPlaying: (isPlaying: boolean) => void;
  setPlayheadTime: (time: number) => void;
  setZoom: (zoom: number) => void;
  setSelectedClipId: (clipId: string | null) => void;
  setSelectedTrackId: (trackId: string | null) => void;
  setActiveExplorerTab: (tab: ActiveTab) => void;
  setPanelSizes: (sizes: Partial<PanelSizes>) => void;
  setIsMediaLoading: (loading: boolean) => void;
}

export const useUIStore = create<UIState>((set) => ({
  isPlaying: false,
  playheadTime: 0,
  zoom: 35,
  selectedClipId: null,
  selectedTrackId: 'v1',
  activeExplorerTab: 'media',
  isMediaLoading: false,
  panelSizes: {
    mediaWidth: 33,
    previewWidth: 42,
    inspectorWidth: 25,
    timelineHeight: 40,
  },

  setIsPlaying: (isPlaying) => set({ isPlaying }),
  setPlayheadTime: (playheadTime) => set({ playheadTime: Math.max(0, playheadTime) }),
  setZoom: (zoom) => set({ zoom: Math.min(200, Math.max(5, zoom)) }),
  setSelectedClipId: (selectedClipId) => set({ selectedClipId }),
  setSelectedTrackId: (selectedTrackId) => set({ selectedTrackId }),
  setActiveExplorerTab: (activeExplorerTab) => set({ activeExplorerTab }),
  setPanelSizes: (sizes) => set((state) => ({
    panelSizes: { ...state.panelSizes, ...sizes }
  })),
  setIsMediaLoading: (isMediaLoading) => set({ isMediaLoading }),
}));
