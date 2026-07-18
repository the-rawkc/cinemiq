import React, { useState } from 'react';
import { 
  Play, 
  Pause, 
  Square, 
  SkipBack, 
  SkipForward, 
  Volume2, 
  VolumeX, 
  Maximize2,
  Tv,
  Grid
} from 'lucide-react';
import { useUIStore } from '../../store/useUIStore';
import { CanvasPreviewRenderer } from './CanvasPreviewRenderer';

export const PreviewMonitor: React.FC = () => {
  const { isPlaying, setIsPlaying, playheadTime, setPlayheadTime } = useUIStore();
  const [aspectRatio, setAspectRatio] = useState<'16:9' | '9:16' | '1:1'>('16:9');
  const [showSafeArea, setShowSafeArea] = useState(false);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(80);

  // Helper to format SMPTE Timecode (HH:MM:SS:FF)
  const formatTimecode = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    const frames = Math.floor((seconds % 1) * 30);

    const pad = (val: number) => String(val).padStart(2, '0');
    return `${pad(hours)}:${pad(mins)}:${pad(secs)}:${pad(frames)}`;
  };

  // Next/prev frame changes playheadTime by ~1/30th of a second
  const stepFrame = (forward: boolean) => {
    const delta = 1 / 30;
    setPlayheadTime(forward ? playheadTime + delta : Math.max(0, playheadTime - delta));
  };

  return (
    <div className="h-full w-full bg-zinc-950 flex flex-col overflow-hidden text-zinc-300 font-medium border-l border-r border-zinc-900/60 p-4 justify-between">
      {/* Top Options Bar */}
      <div className="flex items-center justify-between border-b border-zinc-900/60 pb-2.5 flex-shrink-0">
        <div className="flex items-center gap-2">
          <Tv size={13} className="text-cyan-400" />
          <span className="text-[10px] uppercase font-bold tracking-wider text-zinc-200">Active Output</span>
        </div>
        
        {/* Toggle Guidelines & Aspect Ratio */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowSafeArea(!showSafeArea)}
            title="Toggle Safe Area Overlay"
            className={`p-1.5 rounded-lg border transition-all ${
              showSafeArea 
                ? 'bg-cyan-500/10 border-cyan-500/30 text-cyan-400' 
                : 'bg-zinc-900 border-zinc-800 text-zinc-500 hover:text-zinc-300'
            }`}
          >
            <Grid size={12} />
          </button>

          <div className="flex items-center gap-1 bg-zinc-900 border border-zinc-800 p-0.5 rounded-lg">
            {(['16:9', '9:16', '1:1'] as const).map((ratio) => (
              <button
                key={ratio}
                onClick={() => setAspectRatio(ratio)}
                className={`px-2.5 py-1 rounded text-[9px] font-extrabold uppercase transition-all ${
                  aspectRatio === ratio
                    ? 'bg-zinc-800 text-white shadow-sm'
                    : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                {ratio}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Monitor Display Screen */}
      <div className="flex-1 w-full flex items-center justify-center my-3 relative overflow-hidden bg-zinc-950/40">
        <CanvasPreviewRenderer aspectRatio={aspectRatio} showSafeArea={showSafeArea} />
      </div>

      {/* Transport Bar Controls */}
      <div className="flex flex-col gap-2.5 border-t border-zinc-900/60 pt-3 flex-shrink-0">
        <div className="flex items-center justify-between">
          {/* Timecodes */}
          <div className="flex items-center gap-1">
            <span className="text-[11px] font-bold text-zinc-200 font-mono tracking-wider">
              {formatTimecode(playheadTime)}
            </span>
            <span className="text-[9px] text-zinc-600 font-bold font-mono">/ 00:00:15:00</span>
          </div>

          {/* Transport Core */}
          <div className="flex items-center gap-2">
            <button 
              onClick={() => setPlayheadTime(0)}
              title="Return to Start"
              className="p-1.5 hover:bg-zinc-900 rounded-lg text-zinc-400 hover:text-white transition-all"
            >
              <SkipBack size={12} />
            </button>
            <button 
              onClick={() => stepFrame(false)}
              title="Prev Frame (Left Arrow)"
              className="p-1.5 hover:bg-zinc-900 rounded-lg text-zinc-400 hover:text-white transition-all"
            >
              <SkipBack size={12} className="rotate-18" />
            </button>

            <button
              onClick={() => setIsPlaying(!isPlaying)}
              className="w-8 h-8 rounded-full bg-cyan-500 hover:bg-cyan-400 text-white flex items-center justify-center shadow-lg shadow-cyan-500/20 active:scale-95 transition-all"
            >
              {isPlaying ? <Pause size={13} fill="currentColor" /> : <Play size={13} fill="currentColor" className="ml-0.5" />}
            </button>

            <button 
              onClick={() => stepFrame(true)}
              title="Next Frame (Right Arrow)"
              className="p-1.5 hover:bg-zinc-900 rounded-lg text-zinc-400 hover:text-white transition-all"
            >
              <SkipForward size={12} />
            </button>
            <button 
              onClick={() => setIsPlaying(false)}
              title="Stop"
              className="p-1.5 hover:bg-zinc-900 rounded-lg text-zinc-400 hover:text-white transition-all"
            >
              <Square size={12} fill="currentColor" />
            </button>
          </div>

          {/* Audio volume sliders */}
          <div className="flex items-center gap-1.5">
            <button 
              onClick={() => setMuted(!muted)}
              className="p-1.5 hover:bg-zinc-900 rounded-lg text-zinc-400 hover:text-white transition-all"
            >
              {muted ? <VolumeX size={13} className="text-rose-400" /> : <Volume2 size={13} />}
            </button>
            <input
              type="range"
              min="0"
              max="100"
              value={muted ? 0 : volume}
              onChange={(e) => {
                setVolume(Number(e.target.value));
                if (muted) setMuted(false);
              }}
              className="w-14 accent-cyan-500 bg-zinc-800 rounded-lg appearance-none h-1 cursor-pointer"
            />
            <button className="p-1.5 hover:bg-zinc-900 rounded-lg text-zinc-400 hover:text-white transition-all">
              <Maximize2 size={12} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
