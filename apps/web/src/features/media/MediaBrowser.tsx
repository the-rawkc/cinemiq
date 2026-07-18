import React, { useState } from 'react';
import {
  FolderOpen,
  Music,
  Sparkles,
  Search,
  Upload,
  Plus
} from 'lucide-react';
import { useUIStore } from '../../store/useUIStore';
import { useProjectStore } from '../../store/useProjectStore';
import { API_URL } from '../../config';

export const MediaBrowser: React.FC = () => {
  const { activeExplorerTab, setActiveExplorerTab, selectedClipId } = useUIStore();
  const [searchQuery, setSearchQuery] = useState('');
  const { addClip, project, updateClip } = useProjectStore();

  const tabs = [
    { id: 'media', label: 'Media', icon: <FolderOpen size={13} /> },
    { id: 'audio', label: 'Audio SFX', icon: <Music size={13} /> },
    { id: 'effects', label: 'Effects', icon: <Sparkles size={13} /> },
  ] as const;

  // Mock initial assets with valid local fallback sources
  const mockLocalAssets = [
    { id: 'asset-1', name: 'Scenic Forest.mp4', type: 'video', duration: '5s', thumb: 'https://images.unsplash.com/photo-1473448912268-2022ce9509d8?w=200&auto=format&fit=crop&q=60', source: `${API_URL}/uploads/default_fallback.mp4` },
    { id: 'asset-2', name: 'Urban Night.mp4', type: 'video', duration: '8s', thumb: 'https://images.unsplash.com/photo-1519501025264-65ba15a82390?w=200&auto=format&fit=crop&q=60', source: `${API_URL}/uploads/default_fallback.mp4` },
    { id: 'asset-3', name: 'Ambient Track.mp3', type: 'audio', duration: '14s', thumb: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=200&auto=format&fit=crop&q=60', source: `${API_URL}/uploads/music1.mp3` },
    { id: 'asset-4', name: 'Vibrant Sunset.jpg', type: 'image', duration: '3s', thumb: 'https://images.unsplash.com/photo-1472214222555-d404758b1c42?w=200&auto=format&fit=crop&q=60', source: 'https://images.unsplash.com/photo-1472214222555-d404758b1c42?w=200&auto=format&fit=crop&q=60' },
  ];

  // Extract generated visual assets (video/image)
  const generatedMediaAssets = (project.clips || [])
    .filter(c => c.type === 'video' || c.type === 'image')
    .map(c => ({
      id: `ai-media-${c.id}`,
      name: c.name.replace(' (Split)', ''),
      type: c.type,
      duration: `${Math.round(c.duration)}s`,
      thumb: c.type === 'image' || c.source.includes('unsplash') || c.source.includes('freepik') || c.source.includes('ai-image')
        ? (c.source.startsWith('http') ? c.source : `${API_URL}${c.source}`)
        : 'https://images.unsplash.com/photo-1536440136628-849c177e76a1?w=200&auto=format&fit=crop&q=60',
      source: c.source
    }));

  const uniqueGeneratedMedia = generatedMediaAssets.filter((item, index, self) =>
    self.findIndex(t => t.source === item.source) === index
  );

  const nonDuplicateGenerated = uniqueGeneratedMedia.filter(
    gen => !mockLocalAssets.some(mock => mock.source === gen.source)
  );

  const combinedMediaAssets = [...mockLocalAssets, ...nonDuplicateGenerated].filter(asset =>
    asset.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Extract generated audio assets (ambient soundtrack, synthesized voiceover)
  const generatedAudioAssets = (project.clips || [])
    .filter(c => c.type === 'audio')
    .map(c => ({
      id: `ai-audio-${c.id}`,
      name: c.name,
      duration: `${Math.round(c.duration)}s`,
      genre: c.name.toLowerCase().includes('voiceover') ? 'AI Speech' : 'AI Music',
      source: c.source
    }));

  const uniqueGeneratedAudio = generatedAudioAssets.filter((item, index, self) =>
    self.findIndex(t => t.source === item.source) === index
  );

  const mockAudioAssets = [
    { id: 'aud-1', name: 'Synthwave Rise.wav', duration: '4s', genre: 'Sci-Fi SFX', source: `${API_URL}/uploads/music1.mp3` },
    { id: 'aud-2', name: 'Cyberpunk Hit.mp3', duration: '2.5s', genre: 'Cinematic SFX', source: `${API_URL}/uploads/music2.mp3` },
    { id: 'aud-3', name: 'Lo-Fi Chill Background.mp3', duration: '2m 14s', genre: 'Ambient Beat', source: `${API_URL}/uploads/music1.mp3` },
  ];

  const combinedAudioAssets = [...mockAudioAssets, ...uniqueGeneratedAudio].filter(asset =>
    asset.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleAddAssetToTimeline = (asset: { id: string; name: string; type: string; thumb: string; source: string; duration: string }) => {
    addClip({
      id: Math.random().toString(36).substring(2, 9),
      type: asset.type as any,
      name: asset.name,
      trackId: asset.type === 'audio' ? 'a1' : 'v1',
      offset: 2,
      duration: asset.type === 'video' ? 5 : asset.type === 'audio' ? 10 : 3,
      source: asset.source,
      start: 0,
      volume: 1.0,
      speed: 1.0,
      muted: false,
      transform: asset.type !== 'audio' ? { x: 0, y: 0, scaleX: 1.0, scaleY: 1.0, rotation: 0, opacity: 1.0 } : undefined,
      effects: [],
    });
  };

  return (
    <div className="h-full w-full bg-zinc-950 flex flex-col overflow-hidden text-zinc-300 font-medium">
      {/* Category Tabs */}
      <div className="flex border-b border-zinc-900 bg-zinc-950/60 p-1 flex-shrink-0">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveExplorerTab(tab.id as any)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[10px] uppercase font-bold transition-all ${activeExplorerTab === tab.id
              ? 'bg-zinc-900 text-white shadow-inner border border-zinc-800'
              : 'text-zinc-500 hover:text-zinc-300'
              }`}
          >
            {tab.icon}
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Search Input */}
      <div className="p-3 border-b border-zinc-900/60 bg-zinc-950/40 flex items-center gap-2 flex-shrink-0">
        <div className="flex-1 bg-zinc-900 border border-zinc-800 rounded-lg flex items-center px-2 py-1.5 gap-1.5 focus-within:border-cyan-500/50 transition-colors">
          <Search size={12} className="text-zinc-500" />
          <input
            type="text"
            placeholder="Search media library..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="bg-transparent border-none text-[10px] outline-none text-zinc-200 w-full placeholder-zinc-600"
          />
        </div>

        {activeExplorerTab === 'media' && (
          <button className="p-1.5 bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 hover:border-cyan-500/50 rounded-lg text-cyan-400 hover:text-white transition-all flex items-center justify-center">
            <Upload size={12} />
          </button>
        )}
      </div>

      {/* Grid Container */}
      <div className="flex-grow overflow-y-auto custom-scrollbar p-3">
        {activeExplorerTab === 'media' && (
          <div className="grid grid-cols-2 gap-2.5">
            {combinedMediaAssets.map((asset) => (
              <div
                key={asset.id}
                className="group relative bg-zinc-900 border border-zinc-800/80 rounded-xl overflow-hidden cursor-pointer hover:border-cyan-500/30 transition-all flex flex-col"
              >
                {/* Visual Thumbnail */}
                <div className="aspect-video w-full bg-zinc-950 relative overflow-hidden">
                  <img src={asset.thumb} alt={asset.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                  <div className="absolute bottom-1 right-1 px-1 py-0.2 bg-black/75 backdrop-blur-sm rounded text-[8px] text-zinc-400 font-mono">
                    {asset.duration}
                  </div>

                  {/* AI Badge indicator */}
                  {asset.id.startsWith('ai-media-') && (
                    <div className="absolute top-1 left-1 px-1 text-[8px] font-black uppercase text-cyan-400 bg-cyan-950/80 border border-cyan-500/30 rounded">
                      AI
                    </div>
                  )}

                  {/* Layer overlay play action */}
                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleAddAssetToTimeline(asset);
                      }}
                      className="w-7 h-7 bg-cyan-500 hover:bg-cyan-400 rounded-full flex items-center justify-center text-white shadow-lg shadow-cyan-500/30 transform scale-90 group-hover:scale-100 transition-all"
                    >
                      <Plus size={14} />
                    </button>
                  </div>
                </div>

                {/* Details */}
                <div className="p-2 flex flex-col justify-center min-w-0">
                  <span className="text-[10px] font-bold text-zinc-300 truncate">{asset.name}</span>
                  <span className="text-[8px] text-zinc-500 uppercase font-black tracking-widest mt-0.5">{asset.type}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {activeExplorerTab === 'audio' && (
          <div className="space-y-2">
            {combinedAudioAssets.map((sound) => (
              <div
                key={sound.id}
                className="flex items-center justify-between p-2.5 bg-zinc-900 border border-zinc-800 rounded-xl hover:border-cyan-500/20 transition-all cursor-pointer group"
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <div className="w-8 h-8 rounded-lg bg-zinc-950 flex items-center justify-center text-cyan-400 border border-zinc-800/80 flex-shrink-0">
                    <Music size={13} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <p className="text-[10px] font-bold text-zinc-300 truncate">{sound.name}</p>
                      {sound.id.startsWith('ai-audio-') && (
                        <span className="px-0.5 text-[7px] font-black uppercase text-violet-400 bg-violet-950/80 border border-violet-500/20 rounded flex-shrink-0">
                          AI
                        </span>
                      )}
                    </div>
                    <span className="text-[8px] text-zinc-500 font-semibold">{sound.genre} • {sound.duration}</span>
                  </div>
                </div>

                <button
                  onClick={() => addClip({
                    id: Math.random().toString(36).substring(2, 9),
                    type: 'audio',
                    name: sound.name,
                    trackId: 'a1',
                    offset: 2,
                    duration: sound.name.toLowerCase().includes('beat') || sound.name.toLowerCase().includes('background') ? 15 : 4,
                    source: sound.source,
                    start: 0,
                    volume: 0.8,
                    speed: 1.0,
                    muted: false,
                    effects: []
                  })}
                  className="p-1.5 bg-zinc-950 hover:bg-cyan-500/10 border border-zinc-800 hover:border-cyan-500/30 text-zinc-400 hover:text-cyan-400 rounded-lg transition-all flex-shrink-0"
                >
                  <Plus size={10} />
                </button>
              </div>
            ))}
          </div>
        )}

        {activeExplorerTab === 'effects' && (
          <div className="grid grid-cols-2 gap-2">
            {[
              { id: 'fx-lut-teal', name: 'Teal & Orange', category: 'LUT Color' },
              { id: 'fx-lut-monochrome', name: 'Noir Monochrome', category: 'LUT Color' },
              { id: 'fx-blur-gaussian', name: 'Gaussian Blur', category: 'Visual Effect' },
              { id: 'fx-noise-vhs', name: 'VHS Static', category: 'Visual Effect' },
            ].map((fx) => (
              <div
                key={fx.id}
                className="p-3 bg-zinc-900 border border-zinc-800 rounded-xl hover:border-cyan-500/30 hover:bg-zinc-900/60 transition-all cursor-pointer flex flex-col justify-between group"
              >
                <div>
                  <div className="w-6 h-6 rounded bg-gradient-to-tr from-violet-500/20 to-cyan-500/20 text-violet-400 flex items-center justify-center mb-2 border border-violet-500/20">
                    <Sparkles size={11} />
                  </div>
                  <h4 className="text-[10px] font-bold text-zinc-300">{fx.name}</h4>
                  <span className="text-[8px] text-zinc-500 font-semibold uppercase tracking-wider">{fx.category}</span>
                </div>
                <button
                  onClick={() => {
                    if (!selectedClipId) {
                      alert('Please select a clip on the timeline first.');
                      return;
                    }
                    const clip = project.clips.find(c => c.id === selectedClipId);
                    if (clip) {
                      const effectType = fx.id.replace('fx-', '');
                      const hasFx = clip.effects.some(e => e.type === effectType);
                      if (!hasFx) {
                        const newFx = {
                          id: Math.random().toString(36).substring(2, 9),
                          type: effectType,
                          enabled: true,
                          properties: { value: fx.id.includes('lut') ? 1.0 : fx.id.includes('blur') ? 5 : 1.2 }
                        };
                        updateClip(selectedClipId, {
                          effects: [...clip.effects, newFx]
                        });
                      } else {
                        alert('Effect is already applied to this clip!');
                      }
                    }
                  }}
                  className="mt-2.5 w-full py-1 text-[8px] font-bold uppercase rounded border border-zinc-800 hover:border-cyan-500/30 hover:bg-cyan-500/10 text-zinc-500 hover:text-cyan-400 transition-all text-center"
                >
                  Apply to Selected
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
