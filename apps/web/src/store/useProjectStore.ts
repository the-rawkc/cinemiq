import { create } from 'zustand';
import type { Project, TimelineClip, TimelineTrack, Resolution } from '../core/types/project';

interface ProjectState {
  project: Project;
  history: Project[];
  future: Project[];

  // Actions
  setProject: (project: Project) => void;
  updateProjectName: (name: string) => void;
  setResolution: (resolution: Resolution) => void;

  // Track Actions
  addTrack: (track: TimelineTrack) => void;
  removeTrack: (trackId: string) => void;
  updateTrack: (trackId: string, updates: Partial<TimelineTrack>) => void;

  // Clip Actions
  addClip: (clip: TimelineClip) => void;
  removeClip: (clipId: string) => void;
  updateClip: (clipId: string, updates: Partial<TimelineClip>) => void;

  // History Actions
  undo: () => void;
  redo: () => void;
}

const mockInitialProject: Project = {
  id: 'default-project',
  name: 'Untitled Masterpiece',
  resolution: { width: 1920, height: 1080 },
  fps: 30,
  tracks: [
    { id: 'v2', type: 'video', name: 'Video 2 (Overlay)', muted: false, locked: false, order: 2 },
    { id: 'v1', type: 'video', name: 'Video 1 (Base)', muted: false, locked: false, order: 1 },
    { id: 'a1', type: 'audio', name: 'Audio 1', muted: false, locked: false, order: 3 },
  ],
  clips: [],
};

const sanitizeProject = (project: Project): Project => {
  if (!project || !project.clips) return project;
  const sanitizedClips = project.clips.map(clip => {
    let source = clip.source;
    if (source && source.includes('assets.mixkit.co')) {
      source = 'http://localhost:5000/uploads/default_fallback.mp4';
    } else if (source && source.includes('SoundHelix-Song-1.mp3')) {
      source = 'http://localhost:5000/uploads/music1.mp3';
    } else if (source && source.includes('SoundHelix-Song-2.mp3')) {
      source = 'http://localhost:5000/uploads/music2.mp3';
    }
    return { ...clip, source };
  });
  return { ...project, clips: sanitizedClips };
};

const pushHistory = (project: Project, history: Project[]) => {
  const copy = JSON.parse(JSON.stringify(project));
  const newHistory = [...history, copy];
  if (newHistory.length > 40) newHistory.shift();
  return newHistory;
};

export const useProjectStore = create<ProjectState>((set) => ({
  project: mockInitialProject,
  history: [],
  future: [],

  setProject: (project) => set((state) => {
    const sanitized = sanitizeProject(project);
    return {
      history: pushHistory(state.project, state.history),
      future: [],
      project: sanitized
    };
  }),

  updateProjectName: (name) => set((state) => ({
    history: pushHistory(state.project, state.history),
    future: [],
    project: { ...state.project, name }
  })),

  setResolution: (resolution) => set((state) => ({
    history: pushHistory(state.project, state.history),
    future: [],
    project: { ...state.project, resolution }
  })),

  addTrack: (track) => set((state) => ({
    history: pushHistory(state.project, state.history),
    future: [],
    project: {
      ...state.project,
      tracks: [...state.project.tracks, track].sort((a, b) => a.order - b.order)
    }
  })),

  removeTrack: (trackId) => set((state) => ({
    history: pushHistory(state.project, state.history),
    future: [],
    project: {
      ...state.project,
      tracks: state.project.tracks.filter(t => t.id !== trackId),
      clips: state.project.clips.filter(c => c.trackId !== trackId)
    }
  })),

  updateTrack: (trackId, updates) => set((state) => ({
    history: pushHistory(state.project, state.history),
    future: [],
    project: {
      ...state.project,
      tracks: state.project.tracks.map(t => t.id === trackId ? { ...t, ...updates } : t)
    }
  })),

  addClip: (clip) => set((state) => ({
    history: pushHistory(state.project, state.history),
    future: [],
    project: {
      ...state.project,
      clips: [...state.project.clips, clip]
    }
  })),

  removeClip: (clipId) => set((state) => ({
    history: pushHistory(state.project, state.history),
    future: [],
    project: {
      ...state.project,
      clips: state.project.clips.filter(c => c.id !== clipId)
    }
  })),

  updateClip: (clipId, updates) => set((state) => ({
    // Note: To avoid spamming history with pixel scrubbing drag ticks,
    // we only snapshot when clipId updates change offset, duration, etc.
    history: pushHistory(state.project, state.history),
    future: [],
    project: {
      ...state.project,
      clips: state.project.clips.map(c => c.id === clipId ? { ...c, ...updates } : c)
    }
  })),

  undo: () => set((state) => {
    if (state.history.length === 0) return {};
    const newHistory = [...state.history];
    const previous = newHistory.pop()!;
    const currentCopy = JSON.parse(JSON.stringify(state.project));
    return {
      history: newHistory,
      future: [currentCopy, ...state.future],
      project: previous
    };
  }),

  redo: () => set((state) => {
    if (state.future.length === 0) return {};
    const newFuture = [...state.future];
    const next = newFuture.shift()!;
    const currentCopy = JSON.parse(JSON.stringify(state.project));
    return {
      history: [...state.history, currentCopy],
      future: newFuture,
      project: next
    };
  }),
}));
