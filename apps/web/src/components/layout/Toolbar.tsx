import React, { useState } from 'react';
import { 
  MousePointer, 
  Scissors, 
  Crop, 
  Type, 
  Mic, 
  Sparkles, 
  Play, 
  FileVideo, 
  Redo2, 
  Undo2,
  ZoomIn,
  ZoomOut
} from 'lucide-react';
import { useUIStore } from '../../store/useUIStore';
import { editorBus } from '../../core/events/EventBus';

export const Toolbar: React.FC = () => {
  const { isPlaying, setIsPlaying, zoom, setZoom } = useUIStore();
  const [activeTool, setActiveTool] = useState<'select' | 'split' | 'crop'>('select');

  const tools = [
    { id: 'select', name: 'Select Tool (V)', icon: <MousePointer size={14} />, action: () => setActiveTool('select') },
    { id: 'split', name: 'Split Clip (S)', icon: <Scissors size={14} />, action: () => {
      setActiveTool('split');
      editorBus.emit('shortcut:triggered', { command: 'clip:split_shortcut' });
    }},
    { id: 'crop', name: 'Crop & Zoom (C)', icon: <Crop size={14} />, action: () => setActiveTool('crop') },
  ];

  return (
    <div className="h-12 w-full bg-zinc-950/80 backdrop-blur-md border-b border-zinc-900 flex items-center justify-between px-3 sm:px-4 select-none overflow-x-auto scrollbar-none gap-3">
      {/* Editing Tools */}
      <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
        {tools.map((tool) => (
          <button
            key={tool.id}
            onClick={tool.action}
            title={tool.name}
            className={`p-2 rounded-lg transition-all ${
              activeTool === tool.id 
                ? 'bg-gradient-to-tr from-cyan-500 to-blue-600 text-white shadow-lg shadow-cyan-500/20' 
                : 'hover:bg-zinc-900 text-zinc-400 hover:text-white'
            }`}
          >
            {tool.icon}
          </button>
        ))}

        <div className="w-[1px] h-6 bg-zinc-800/80 mx-1 sm:mx-2" />

        {/* Dynamic Modifiers */}
        <button 
          onClick={() => editorBus.emit('shortcut:triggered', { command: 'clip:add_text' })}
          title="Add Text Clip (T)"
          className="p-2 rounded-lg hover:bg-zinc-900 text-zinc-400 hover:text-white transition-all"
        >
          <Type size={14} />
        </button>

        <button 
          onClick={() => editorBus.emit('shortcut:triggered', { command: 'ai:voiceover' })}
          title="Record Voiceover (R)"
          className="p-2 rounded-lg hover:bg-zinc-900 text-zinc-400 hover:text-white transition-all"
        >
          <Mic size={14} />
        </button>
      </div>

      {/* AI Center & Playback Actions */}
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={() => editorBus.emit('shortcut:triggered', { command: 'ai:open_studio' })}
          className="hidden sm:flex px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 hover:border-cyan-500/30 items-center gap-2 group transition-all text-zinc-300 hover:text-white font-medium text-[11px]"
        >
          <Sparkles size={12} className="text-cyan-400 group-hover:scale-110 transition-transform" />
          <span>AI Generator Studio</span>
        </button>

        <button
          onClick={() => setIsPlaying(!isPlaying)}
          className={`px-3 sm:px-4 py-1.5 rounded-lg font-bold text-[11px] flex items-center gap-1.5 uppercase transition-all ${
            isPlaying 
              ? 'bg-rose-500 hover:bg-rose-600 text-white shadow-lg shadow-rose-500/20'
              : 'bg-gradient-to-r from-cyan-400 to-blue-500 hover:from-cyan-500 hover:to-blue-600 text-white shadow-lg shadow-cyan-500/20'
          }`}
        >
          <Play size={10} fill="currentColor" />
          <span>{isPlaying ? 'Pause' : 'Play Preview'}</span>
        </button>

        <button 
          onClick={() => editorBus.emit('shortcut:triggered', { command: 'editor:render' })}
          className="px-2.5 sm:px-3 py-1.5 rounded-lg bg-zinc-900/60 hover:bg-zinc-900 border border-zinc-800 text-zinc-300 hover:text-white transition-all text-[11px] font-medium flex items-center gap-1.5"
        >
          <FileVideo size={12} />
          <span className="hidden sm:inline">Render Project</span>
          <span className="sm:hidden">Render</span>
        </button>
      </div>

      {/* Undo/Redo & Zoom Controls */}
      <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
        <button 
          onClick={() => editorBus.emit('shortcut:triggered', { command: 'history:undo' })}
          title="Undo (Ctrl+Z)"
          className="p-2 rounded-lg hover:bg-zinc-900 text-zinc-400 hover:text-white transition-all"
        >
          <Undo2 size={14} />
        </button>
        <button 
          onClick={() => editorBus.emit('shortcut:triggered', { command: 'history:redo' })}
          title="Redo (Ctrl+Y)"
          className="p-2 rounded-lg hover:bg-zinc-900 text-zinc-400 hover:text-white transition-all"
        >
          <Redo2 size={14} />
        </button>

        <div className="w-[1px] h-6 bg-zinc-800/80 mx-2" />

        <button 
          onClick={() => setZoom(zoom - 5)}
          title="Zoom Out Timeline"
          className="p-1.5 rounded-lg hover:bg-zinc-900 text-zinc-400 hover:text-white transition-all"
        >
          <ZoomOut size={13} />
        </button>
        
        <span className="text-[10px] text-zinc-500 font-semibold min-w-[28px] text-center">{zoom}px</span>

        <button 
          onClick={() => setZoom(zoom + 5)}
          title="Zoom In Timeline"
          className="p-1.5 rounded-lg hover:bg-zinc-900 text-zinc-400 hover:text-white transition-all"
        >
          <ZoomIn size={13} />
        </button>
      </div>
    </div>
  );
};
