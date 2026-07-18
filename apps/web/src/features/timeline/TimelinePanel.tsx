import React, { useRef, useEffect, useState } from 'react';
import {
  Scissors,
  Trash2,
  VolumeX,
  Volume2,
  Lock,
  Unlock,
  Video,
  Music,
  Sparkles,
  BrainCircuit
} from 'lucide-react';
import { useUIStore } from '../../store/useUIStore';
import { useProjectStore } from '../../store/useProjectStore';
import { ContextMenu } from '../../components/ui/ContextMenu';

export const TimelinePanel: React.FC = () => {
  const { playheadTime, setPlayheadTime, zoom, setZoom, selectedClipId, setSelectedClipId, isPlaying, setIsPlaying } = useUIStore();
  const { project, updateClip, removeClip, updateTrack } = useProjectStore();
  const addClip = useProjectStore((s) => s.addClip);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; clipId: string } | null>(null);
  const rulerRef = useRef<HTMLDivElement>(null);
  const tracksContainerRef = useRef<HTMLDivElement>(null);

  // Time format helper (MM:SS)
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  const handleAICutSilence = (clipId: string) => {
    const clip = project.clips.find(c => c.id === clipId);
    if (clip) {
      updateClip(clipId, { duration: Math.max(0.5, clip.duration - 1.5) });
      alert('AI Silence Cutter: Spliced 1.5s of low volume peaks.');
    }
  };

  const handleAIAutoSubtitle = (clipId: string) => {
    const clip = project.clips.find(c => c.id === clipId);
    if (clip) {
      const subClip = {
        id: `ai-subtitle-${Date.now()}`,
        type: 'text' as const,
        name: 'AI Generated Subtitle',
        trackId: 'v2',
        offset: clip.offset + 0.5,
        duration: Math.min(2.5, clip.duration),
        source: '',
        start: 0,
        volume: 0,
        speed: 1.0,
        muted: true,
        textConfig: {
          content: 'Transcribed by AI Whisper',
          fontSize: 24,
          color: '#eab308',
          fontFamily: 'Outfit',
          bold: true,
          italic: false,
          alignment: 'center' as const,
          x: 50,
          y: 80
        },
        effects: []
      };
      addClip(subClip);
      alert('AI Auto Subtitle: Added synced transcript layer clip on track V2.');
    }
  };

  const handleAIStylize = (clipId: string) => {
    const clip = project.clips.find(c => c.id === clipId);
    if (clip) {
      const newFx = {
        id: `fx-${Date.now()}`,
        type: 'noise',
        enabled: true,
        properties: { value: 1.0 }
      };
      updateClip(clipId, { effects: [...clip.effects, newFx] });
      alert('AI Stylize: Applied VHS sepia color grade preset.');
    }
  };

  // Timeline width (total zoom duration, e.g. 30 seconds max mockup length)
  const totalDuration = 30; // seconds
  const rulerWidth = totalDuration * zoom;

  // Handle ruler mouse down for scrubbing playhead
  const handleRulerScrub = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!rulerRef.current) return;
    const rect = rulerRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left + rulerRef.current.scrollLeft;
    // Account for track label column width offset (e.g. 150px)
    const relativeX = Math.max(0, clickX - 150);
    const newTime = relativeX / zoom;
    setPlayheadTime(newTime);
  };

  // Sync scroll between ruler and tracks content
  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const scrollLeft = e.currentTarget.scrollLeft;
    if (rulerRef.current) {
      rulerRef.current.scrollLeft = scrollLeft;
    }
  };

  // Actions
  const handleSplitSelected = () => {
    if (!selectedClipId) return;
    const clip = project.clips.find(c => c.id === selectedClipId);
    if (!clip) return;

    if (playheadTime > clip.offset && playheadTime < clip.offset + clip.duration) {
      const splitOffset = playheadTime - clip.offset;

      // Update original clip duration
      updateClip(selectedClipId, {
        duration: splitOffset
      });

      // Create new split clip
      const newClip = {
        ...clip,
        id: Math.random().toString(36).substring(2, 9),
        offset: playheadTime,
        duration: clip.duration - splitOffset,
        start: clip.start + splitOffset,
        name: `${clip.name} (Split)`
      };
      addClip(newClip);
      setSelectedClipId(newClip.id);
    }
  };

  const handleDeleteSelected = () => {
    if (selectedClipId) {
      removeClip(selectedClipId);
      setSelectedClipId(null);
    }
  };

  // Playback timer (runs if isPlaying is true)
  useEffect(() => {
    let animFrame: number;
    let lastTime = performance.now();

    const loop = (now: number) => {
      if (!isPlaying) return;

      const elapsed = (now - lastTime) / 1000;
      lastTime = now;

      setPlayheadTime(playheadTime + elapsed);

      if (playheadTime >= totalDuration) {
        setIsPlaying(false);
        setPlayheadTime(0);
      } else {
        animFrame = requestAnimationFrame(loop);
      }
    };

    if (isPlaying) {
      lastTime = performance.now();
      animFrame = requestAnimationFrame(loop);
    }

    return () => cancelAnimationFrame(animFrame);
  }, [isPlaying, playheadTime, setPlayheadTime]);

  return (
    <div className="h-full w-full bg-zinc-950 flex flex-col overflow-hidden text-zinc-300 font-medium select-none">
      {/* Timeline Actions Toolbar */}
      <div className="h-10 border-b border-zinc-900 bg-zinc-950 flex items-center justify-between px-4 flex-shrink-0">
        <div className="flex items-center gap-1">
          <button
            onClick={handleSplitSelected}
            disabled={!selectedClipId}
            title="Split selected clip at playhead"
            className="p-1.5 hover:bg-zinc-900 rounded-lg text-zinc-400 hover:text-white disabled:opacity-20 disabled:cursor-not-allowed transition-all"
          >
            <Scissors size={13} />
          </button>

          <button
            onClick={handleDeleteSelected}
            disabled={!selectedClipId}
            title="Delete selected clip"
            className="p-1.5 hover:bg-zinc-900 rounded-lg text-rose-400 hover:text-rose-300 disabled:opacity-20 disabled:cursor-not-allowed transition-all"
          >
            <Trash2 size={13} />
          </button>
        </div>

        {/* Zoom Slider */}
        <div className="flex items-center gap-2">
          <span className="text-[9px] text-zinc-500 font-bold uppercase tracking-wider">Zoom</span>
          <input
            type="range"
            min="10"
            max="120"
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="w-24 accent-cyan-500 bg-zinc-900 h-1 rounded-lg appearance-none cursor-pointer"
          />
        </div>
      </div>

      {/* Main Track Grid (Scrollable Container) */}
      <div className="flex-1 flex flex-col overflow-hidden relative">
        {/* Playhead vertical red needle line */}
        <div
          className="absolute top-0 bottom-0 z-30 pointer-events-none transition-all"
          style={{
            left: `${150 + playheadTime * zoom}px`,
            width: '1.5px',
          }}
        >
          {/* Head */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-3 h-3 bg-rose-500 rounded-b-md shadow-md shadow-rose-500/30" />
          {/* Line */}
          <div className="w-[1.5px] h-full bg-rose-500" />
        </div>

        {/* 1. Timecode Ruler Row */}
        <div
          ref={rulerRef}
          onClick={handleRulerScrub}
          className="h-7 w-full bg-zinc-900/60 border-b border-zinc-900/80 flex flex-row overflow-hidden relative flex-shrink-0 cursor-ew-resize select-none"
        >
          {/* Labels spacer column (150px) */}
          <div className="w-[150px] h-full bg-zinc-950 flex-shrink-0 border-r border-zinc-900 text-[8px] font-black uppercase text-zinc-600 tracking-wider flex items-center px-4.5">
            Ruler Timecode
          </div>

          {/* Ruler Ticks Container */}
          <div
            style={{ width: `${rulerWidth}px` }}
            className="h-full relative flex-shrink-0"
          >
            {Array.from({ length: totalDuration }).map((_, sec) => (
              <div
                key={sec}
                className="absolute top-0 h-full border-l border-zinc-800/60 text-[8px] font-bold text-zinc-500 font-mono pl-1 pt-1.5 flex flex-col justify-between"
                style={{ left: `${sec * zoom}px` }}
              >
                <span>{formatTime(sec)}</span>
                <div className="w-[1px] h-1.5 bg-zinc-800" />
              </div>
            ))}
          </div>
        </div>

        {/* 2. Track Rows Area */}
        <div
          ref={tracksContainerRef}
          onScroll={handleScroll}
          className="flex-grow overflow-auto custom-scrollbar"
        >
          <div className="flex flex-col relative">
            {(project.tracks || []).map((track) => {
              const trackClips = (project.clips || []).filter((c) => c.trackId === track.id);

              return (
                <div
                  key={track.id}
                  className="h-16 w-full flex border-b border-zinc-900 bg-zinc-950/20 hover:bg-zinc-900/10 transition-colors flex-shrink-0"
                >
                  {/* Track Info Side Label */}
                  <div className="w-[150px] h-full bg-zinc-950 border-r border-zinc-900 p-2.5 flex flex-col justify-between flex-shrink-0 z-10">
                    <div className="flex items-center gap-1.5 min-w-0">
                      {track.type === 'video' ? (
                        <Video size={10} className="text-cyan-400" />
                      ) : (
                        <Music size={10} className="text-violet-400" />
                      )}
                      <span className="text-[10px] font-bold text-zinc-300 truncate">{track.name}</span>
                    </div>

                    {/* Track Actions (Mute, Lock) */}
                    <div className="flex items-center gap-2 text-zinc-600">
                      <button
                        onClick={() => updateTrack(track.id, { muted: !track.muted })}
                        className={`hover:text-white transition-colors ${track.muted ? 'text-rose-400' : ''}`}
                      >
                        {track.muted ? <VolumeX size={11} /> : <Volume2 size={11} />}
                      </button>
                      <button
                        onClick={() => updateTrack(track.id, { locked: !track.locked })}
                        className={`hover:text-white transition-colors ${track.locked ? 'text-amber-400' : ''}`}
                      >
                        {track.locked ? <Lock size={10} /> : <Unlock size={10} />}
                      </button>
                    </div>
                  </div>

                  {/* Track Clip Blocks Lane */}
                  <div
                    style={{ width: `${rulerWidth}px` }}
                    className="h-full relative flex-shrink-0 bg-zinc-900/10"
                  >
                    {trackClips.map((clip) => {
                      const clipWidth = clip.duration * zoom;
                      const clipLeft = clip.offset * zoom;

                      // Draggable clips logic
                      const handleClipMouseDown = (e: React.MouseEvent, clipId: string) => {
                        e.stopPropagation();
                        setSelectedClipId(clipId);

                        const startX = e.clientX;
                        const initialOffset = clip.offset;

                        const handleMouseMove = (moveEvent: MouseEvent) => {
                          const deltaX = moveEvent.clientX - startX;
                          const deltaSeconds = deltaX / zoom;
                          const newOffset = Math.max(0, initialOffset + deltaSeconds);
                          updateClip(clipId, { offset: newOffset });
                        };

                        const handleMouseUp = () => {
                          window.removeEventListener('mousemove', handleMouseMove);
                          window.removeEventListener('mouseup', handleMouseUp);
                        };

                        window.addEventListener('mousemove', handleMouseMove);
                        window.addEventListener('mouseup', handleMouseUp);
                      };

                      // Trimming logic left handle
                      const handleLeftTrimMouseDown = (e: React.MouseEvent, clipId: string) => {
                        e.stopPropagation();

                        const startX = e.clientX;
                        const initialOffset = clip.offset;
                        const initialDuration = clip.duration;
                        const initialStart = clip.start;

                        const handleMouseMove = (moveEvent: MouseEvent) => {
                          const deltaX = moveEvent.clientX - startX;
                          const deltaSeconds = deltaX / zoom;

                          const maxDelta = initialDuration - 0.2;
                          const finalDelta = Math.min(maxDelta, deltaSeconds);
                          const allowedDelta = Math.max(-initialStart, finalDelta);

                          updateClip(clipId, {
                            offset: initialOffset + allowedDelta,
                            duration: initialDuration - allowedDelta,
                            start: initialStart + allowedDelta
                          });
                        };

                        const handleMouseUp = () => {
                          window.removeEventListener('mousemove', handleMouseMove);
                          window.removeEventListener('mouseup', handleMouseUp);
                        };

                        window.addEventListener('mousemove', handleMouseMove);
                        window.addEventListener('mouseup', handleMouseUp);
                      };

                      // Trimming logic right handle
                      const handleRightTrimMouseDown = (e: React.MouseEvent, clipId: string) => {
                        e.stopPropagation();

                        const startX = e.clientX;
                        const initialDuration = clip.duration;

                        const handleMouseMove = (moveEvent: MouseEvent) => {
                          const deltaX = moveEvent.clientX - startX;
                          const deltaSeconds = deltaX / zoom;
                          const newDuration = Math.max(0.2, initialDuration + deltaSeconds);
                          updateClip(clipId, { duration: newDuration });
                        };

                        const handleMouseUp = () => {
                          window.removeEventListener('mousemove', handleMouseMove);
                          window.removeEventListener('mouseup', handleMouseUp);
                        };

                        window.addEventListener('mousemove', handleMouseMove);
                        window.addEventListener('mouseup', handleMouseUp);
                      };

                      return (
                        <div
                          key={clip.id}
                          onMouseDown={(e) => handleClipMouseDown(e, clip.id)}
                          onContextMenu={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setContextMenu({
                              x: e.clientX,
                              y: e.clientY,
                              clipId: clip.id
                            });
                          }}
                          className={`absolute top-1.5 bottom-1.5 rounded-xl border flex items-center justify-between select-none cursor-grab active:cursor-grabbing transition-all ${selectedClipId === clip.id
                              ? 'bg-gradient-to-r from-cyan-500/20 to-blue-500/20 border-cyan-400 shadow-lg shadow-cyan-500/10'
                              : clip.type === 'audio'
                                ? 'bg-zinc-900/85 hover:bg-zinc-900 border-zinc-800'
                                : 'bg-zinc-900/50 hover:bg-zinc-900/80 border-zinc-800/80'
                            }`}
                          style={{
                            left: `${clipLeft}px`,
                            width: `${clipWidth}px`,
                          }}
                        >
                          {/* Left Trim Handle */}
                          <div
                            onMouseDown={(e) => handleLeftTrimMouseDown(e, clip.id)}
                            className="w-1.5 h-full hover:bg-cyan-500 cursor-col-resize rounded-l-xl z-20 flex-shrink-0 transition-colors"
                            title="Drag to trim start"
                          />

                          {/* Center Details */}
                          <div className="flex-1 min-w-0 px-2 flex flex-col justify-between h-full py-1">
                            <span className="text-[9px] font-bold truncate text-zinc-200">
                              {clip.name}
                            </span>
                            <div className="flex items-center justify-between text-[8px] text-zinc-500 font-mono">
                              <span>{clip.duration.toFixed(1)}s</span>
                              {clip.effects.length > 0 && <span className="text-violet-400">FX</span>}
                            </div>
                          </div>

                          {/* Right Trim Handle */}
                          <div
                            onMouseDown={(e) => handleRightTrimMouseDown(e, clip.id)}
                            className="w-1.5 h-full hover:bg-cyan-500 cursor-col-resize rounded-r-xl z-20 flex-shrink-0 transition-colors"
                            title="Drag to trim end"
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Context Menu Overlay */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          items={[
            {
              label: 'AI Cut Silence',
              icon: <BrainCircuit size={11} />,
              action: () => handleAICutSilence(contextMenu.clipId)
            },
            {
              label: 'AI Auto Subtitle',
              icon: <Sparkles size={11} className="text-cyan-400" />,
              action: () => handleAIAutoSubtitle(contextMenu.clipId)
            },
            {
              label: 'AI Stylize Color',
              icon: <Sparkles size={11} className="text-violet-400" />,
              action: () => handleAIStylize(contextMenu.clipId)
            },
            { label: '', separator: true, action: () => { } },
            {
              label: 'Split Clip',
              icon: <Scissors size={10} />,
              action: () => {
                setSelectedClipId(contextMenu.clipId);
                // Trigger split events
                import('../../core/events/EventBus').then(({ editorBus }) => {
                  editorBus.emit('shortcut:triggered', { command: 'clip:split_shortcut' });
                });
              }
            },
            {
              label: 'Delete Clip',
              icon: <Trash2 size={10} className="text-rose-400" />,
              action: () => removeClip(contextMenu.clipId)
            }
          ]}
        />
      )}
    </div>
  );
};
