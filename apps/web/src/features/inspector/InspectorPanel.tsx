import React, { useState } from 'react';
import { 
  Sliders, 
  Type, 
  Sparkles, 
  HelpCircle
} from 'lucide-react';
import { useUIStore } from '../../store/useUIStore';
import { useProjectStore } from '../../store/useProjectStore';

interface InspectorTab {
  id: 'video' | 'text' | 'effects';
  label: string;
  icon: React.ReactNode;
  disabled?: boolean;
}

export const InspectorPanel: React.FC = () => {
  const selectedClipId = useUIStore((s) => s.selectedClipId);
  const project = useProjectStore((s) => s.project);
  const updateClip = useProjectStore((s) => s.updateClip);
  const [activeTab, setActiveTab] = useState<'video' | 'text' | 'effects'>('video');

  const selectedClip = project.clips.find(c => c.id === selectedClipId);

  const tabs: InspectorTab[] = [
    { id: 'video', label: 'Transform', icon: <Sliders size={12} /> },
    { id: 'text', label: 'Text Config', icon: <Type size={12} />, disabled: selectedClip?.type !== 'text' },
    { id: 'effects', label: 'Effects', icon: <Sparkles size={12} /> },
  ];

  const handleTransformChange = (key: string, value: number) => {
    if (!selectedClipId || !selectedClip) return;
    const currentTransform = selectedClip.transform || { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1 };
    updateClip(selectedClipId, {
      transform: {
        ...currentTransform,
        [key]: value
      }
    });
  };

  const handleTextChange = (key: string, value: any) => {
    if (!selectedClipId || !selectedClip || selectedClip.type !== 'text') return;
    const currentText = selectedClip.textConfig || { content: '', fontSize: 24, color: '#ffffff', fontFamily: 'Outfit', bold: false, italic: false, alignment: 'center', x: 50, y: 50 };
    updateClip(selectedClipId, {
      textConfig: {
        ...currentText,
        [key]: value
      }
    });
  };

  return (
    <div className="h-full w-full bg-zinc-950 flex flex-col overflow-hidden text-zinc-300 font-medium">
      {/* Tabs */}
      <div className="flex border-b border-zinc-900 bg-zinc-950/60 p-1 flex-shrink-0">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            disabled={tab.disabled}
            onClick={() => setActiveTab(tab.id as any)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[10px] uppercase font-bold transition-all ${
              tab.disabled 
                ? 'opacity-25 cursor-not-allowed'
                : activeTab === tab.id
                ? 'bg-zinc-900 text-white shadow-inner border border-zinc-800'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            {tab.icon}
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Content Body */}
      <div className="flex-grow overflow-y-auto custom-scrollbar p-4 space-y-4">
        {selectedClip ? (
          <>
            {/* Header Description */}
            <div className="flex items-center justify-between border-b border-zinc-900 pb-3">
              <div>
                <h3 className="text-[11px] font-bold text-zinc-100 truncate max-w-[150px]">{selectedClip.name}</h3>
                <span className="text-[8px] text-zinc-500 uppercase tracking-widest font-black">{selectedClip.type} Asset</span>
              </div>
              <span className="text-[9px] font-bold text-zinc-500 font-mono">ID: {selectedClip.id}</span>
            </div>

            {/* Transform Settings Tab */}
            {activeTab === 'video' && (
              <div className="space-y-4">
                {/* Opacity */}
                <div className="space-y-1.5">
                  <div className="flex justify-between text-[10px] font-bold text-zinc-400">
                    <span>Opacity</span>
                    <span>{Math.round((selectedClip.transform?.opacity ?? 1) * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={selectedClip.transform?.opacity ?? 1}
                    onChange={(e) => handleTransformChange('opacity', Number(e.target.value))}
                    className="w-full accent-cyan-500 bg-zinc-900 h-1 rounded-lg appearance-none cursor-pointer"
                  />
                </div>

                {/* Scale */}
                <div className="space-y-1.5">
                  <div className="flex justify-between text-[10px] font-bold text-zinc-400">
                    <span>Scale Factor</span>
                    <span>{(selectedClip.transform?.scaleX ?? 1).toFixed(2)}x</span>
                  </div>
                  <input
                    type="range"
                    min="0.2"
                    max="3"
                    step="0.05"
                    value={selectedClip.transform?.scaleX ?? 1}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      handleTransformChange('scaleX', val);
                      handleTransformChange('scaleY', val);
                    }}
                    className="w-full accent-cyan-500 bg-zinc-900 h-1 rounded-lg appearance-none cursor-pointer"
                  />
                </div>

                {/* Rotation */}
                <div className="space-y-1.5">
                  <div className="flex justify-between text-[10px] font-bold text-zinc-400">
                    <span>Rotation</span>
                    <span>{selectedClip.transform?.rotation ?? 0}°</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="360"
                    value={selectedClip.transform?.rotation ?? 0}
                    onChange={(e) => handleTransformChange('rotation', Number(e.target.value))}
                    className="w-full accent-cyan-500 bg-zinc-900 h-1 rounded-lg appearance-none cursor-pointer"
                  />
                </div>

                {/* Positions X/Y */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <span className="text-[10px] text-zinc-400 font-bold block">Position X (%)</span>
                    <input
                      type="number"
                      value={selectedClip.transform?.x ?? 0}
                      onChange={(e) => handleTransformChange('x', Number(e.target.value))}
                      className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1 text-[10px] outline-none text-zinc-200 focus:border-cyan-500/30"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <span className="text-[10px] text-zinc-400 font-bold block">Position Y (%)</span>
                    <input
                      type="number"
                      value={selectedClip.transform?.y ?? 0}
                      onChange={(e) => handleTransformChange('y', Number(e.target.value))}
                      className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1 text-[10px] outline-none text-zinc-200 focus:border-cyan-500/30"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Text Settings Tab */}
            {activeTab === 'text' && selectedClip.type === 'text' && (
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <span className="text-[10px] text-zinc-400 font-bold block">Text Value</span>
                  <textarea
                    rows={3}
                    value={selectedClip.textConfig?.content ?? ''}
                    onChange={(e) => handleTextChange('content', e.target.value)}
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-lg p-2 text-[10px] outline-none text-zinc-200 focus:border-cyan-500/30 resize-none font-medium"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <span className="text-[10px] text-zinc-400 font-bold block">Font Size (px)</span>
                    <input
                      type="number"
                      value={selectedClip.textConfig?.fontSize ?? 24}
                      onChange={(e) => handleTextChange('fontSize', Number(e.target.value))}
                      className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1 text-[10px] outline-none text-zinc-200 focus:border-cyan-500/30"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <span className="text-[10px] text-zinc-400 font-bold block">Color Hex</span>
                    <div className="flex items-center gap-1 bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-0.5">
                      <input
                        type="color"
                        value={selectedClip.textConfig?.color ?? '#ffffff'}
                        onChange={(e) => handleTextChange('color', e.target.value)}
                        className="w-5 h-5 bg-transparent border-none outline-none cursor-pointer"
                      />
                      <span className="text-[10px] font-mono text-zinc-400">{selectedClip.textConfig?.color ?? '#FFFFFF'}</span>
                    </div>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <span className="text-[10px] text-zinc-400 font-bold block">Font Family</span>
                  <select
                    value={selectedClip.textConfig?.fontFamily ?? 'Outfit'}
                    onChange={(e) => handleTextChange('fontFamily', e.target.value)}
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1 text-[10px] outline-none text-zinc-300 focus:border-cyan-500/30 cursor-pointer"
                  >
                    <option value="Outfit">Outfit</option>
                    <option value="Inter">Inter</option>
                    <option value="Roboto">Roboto</option>
                    <option value="monospace">Monospace</option>
                  </select>
                </div>
              </div>
            )}

            {/* Effects Tab */}
            {activeTab === 'effects' && (
              <div className="space-y-3">
                {selectedClip.effects.length > 0 ? (
                  selectedClip.effects.map((effect) => (
                    <div 
                      key={effect.id}
                      className="flex items-center justify-between p-3 bg-zinc-900 border border-zinc-800 rounded-xl"
                    >
                      <div>
                        <p className="text-[10px] font-bold text-zinc-200">{effect.type.toUpperCase()}</p>
                        <span className="text-[8px] text-zinc-500">Status: {effect.enabled ? 'Enabled' : 'Bypassed'}</span>
                      </div>

                      <button
                        onClick={() => {
                          const updatedEffects = selectedClip.effects.map(fx => 
                            fx.id === effect.id ? { ...fx, enabled: !fx.enabled } : fx
                          );
                          updateClip(selectedClip.id, { effects: updatedEffects });
                        }}
                        className={`px-2.5 py-1 rounded text-[9px] font-extrabold uppercase transition-all ${
                          effect.enabled
                            ? 'bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 border border-cyan-500/20'
                            : 'bg-zinc-950 text-zinc-500 border border-zinc-800'
                        }`}
                      >
                        {effect.enabled ? 'On' : 'Off'}
                      </button>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-6 select-none opacity-40 space-y-1">
                    <Sparkles size={24} className="mx-auto text-zinc-500" />
                    <p className="text-[9px] font-bold uppercase tracking-wider text-zinc-400">No Applied Effects</p>
                    <p className="text-[8px] text-zinc-600">Select effects from browser to apply</p>
                  </div>
                )}
              </div>
            )}
          </>
        ) : (
          <div className="h-full w-full flex flex-col items-center justify-center text-center select-none opacity-30 space-y-2">
            <HelpCircle size={32} className="text-zinc-600" />
            <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">No Selected Clip</p>
            <p className="text-[8px] text-zinc-600 max-w-[150px] mx-auto">Select a clip on the timeline tracks to configure properties</p>
          </div>
        )}
      </div>
    </div>
  );
};
