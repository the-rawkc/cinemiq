import React from 'react';
import { useUIStore } from '../../store/useUIStore';
import { useProjectStore } from '../../store/useProjectStore';

export const StatusBar: React.FC = () => {
  const playheadTime = useUIStore((s) => s.playheadTime);
  const isPlaying = useUIStore((s) => s.isPlaying);
  const clipsCount = useProjectStore((s) => s.project.clips.length);

  // Helper to format seconds to Filmora-style SMPTE Timecode (HH:MM:SS:FF)
  const formatTimecode = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    const frames = Math.floor((seconds % 1) * 30); // 30 FPS estimate

    const pad = (val: number) => String(val).padStart(2, '0');

    return `${pad(hours)}:${pad(mins)}:${pad(secs)}:${pad(frames)}`;
  };

  return (
    <div className="h-6 w-full bg-zinc-950 border-t border-zinc-900 px-4 flex items-center justify-between text-[10px] text-zinc-500 font-medium select-none z-50">
      {/* Playback / System Status */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1.5">
          <div className={`w-1.5 h-1.5 rounded-full ${isPlaying ? 'bg-cyan-400 animate-pulse' : 'bg-zinc-600'}`} />
          <span className="text-zinc-400 font-bold uppercase tracking-wider">
            {isPlaying ? 'Playback Running' : 'Idle'}
          </span>
        </div>
        <span>|</span>
        <span>Clips: {clipsCount}</span>
      </div>

      {/* RULER TIMECODE CENTER */}
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-bold text-zinc-300 font-mono tracking-wide bg-zinc-900 border border-zinc-800 px-2 py-0.5 rounded">
          {formatTimecode(playheadTime)}
        </span>
      </div>

      {/* SYSTEM PERFORMANCE OR WORKSPACE HEALTH */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1">
          <span>Engine Status:</span>
          <span className="text-cyan-400 font-bold">FFmpeg-lavfi (Proxy active)</span>
        </div>
        <span>|</span>
        <div className="flex items-center gap-1">
          <span>Performance:</span>
          <span className="text-emerald-500 font-bold">Excellent</span>
        </div>
      </div>
    </div>
  );
};
