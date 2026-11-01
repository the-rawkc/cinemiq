import React, { useState } from 'react';
import {
    ArrowLeft,
    Sparkles,
    Search,
    Film,
    Music,
    Image as ImageIcon,
    FolderPlus,
    Play,
    Pause,
    Layers
} from 'lucide-react';
import { useProjectStore } from '../../store/useProjectStore';
import { API_URL } from '../../config';

interface AIGeneratorStudioPageProps {
    onClose: () => void;
    onLoadProject: (project: any) => void;
}

export const AIGeneratorStudioPage: React.FC<AIGeneratorStudioPageProps> = ({
    onClose,
    onLoadProject
}) => {
    const [prompt, setPrompt] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [activeTab, setActiveTab] = useState<'all' | 'storyboard' | 'gifs' | 'audio'>('all');

    // Results states
    const [generatedProject, setGeneratedProject] = useState<any>(null);
    const [giphyResults, setGiphyResults] = useState<any[]>([]);
    const [freesoundResults, setFreesoundResults] = useState<any[]>([]);

    // Audio playback state
    const [playingAudioId, setPlayingAudioId] = useState<string | null>(null);
    const audioRef = React.useRef<HTMLAudioElement | null>(null);

    const handleSearchAndGenerate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!prompt.trim()) return;

        setIsLoading(true);
        setGeneratedProject(null);
        setGiphyResults([]);
        setFreesoundResults([]);

        try {
            // 1. Trigger AI Timeline/Storyboard generation in parallel with API searches
            const timelinePromise = fetch(`${API_URL}/api/ai/prompt-timeline`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ prompt }),
            }).then(r => r.json());

            const giphyPromise = fetch(`${API_URL}/api/ai/giphy-search?query=${encodeURIComponent(prompt)}`)
                .then(r => r.json())
                .catch(() => []);

            const freesoundPromise = fetch(`${API_URL}/api/ai/freesound-search?query=${encodeURIComponent(prompt)}`)
                .then(r => r.json())
                .catch(() => []);

            const [projectData, giphyData, freesoundData] = await Promise.all([
                timelinePromise,
                giphyPromise,
                freesoundPromise
            ]);

            if (projectData && projectData.clips) {
                setGeneratedProject(projectData);
            }
            setGiphyResults(Array.isArray(giphyData) ? giphyData : []);
            setFreesoundResults(Array.isArray(freesoundData) ? freesoundData : []);

        } catch (error) {
            console.error('AI Generation Failed:', error);
            alert('AI Generator API encountered an error. Please try a different query.');
        } finally {
            setIsLoading(false);
        }
    };

    const handlePlayAudio = (id: string, url: string) => {
        if (playingAudioId === id) {
            audioRef.current?.pause();
            setPlayingAudioId(null);
        } else {
            if (audioRef.current) {
                audioRef.current.pause();
            }
            const audio = new Audio(url);
            audioRef.current = audio;
            audio.play().catch(() => { });
            setPlayingAudioId(id);
            audio.onended = () => {
                setPlayingAudioId(null);
            };
        }
    };

    const handleInsertClipToCurrentProject = (clip: any) => {
        // Import store to add clip
        const store = useProjectStore.getState();
        const clipId = Math.random().toString(36).substring(2, 9);
        store.addClip({
            ...clip,
            id: clipId,
            offset: 2,
        });
        alert(`Successfully added "${clip.name}" to the library/editor workspace!`);
    };

    const handleLoadFullTimeline = () => {
        if (!generatedProject) return;
        onLoadProject(generatedProject);
        onClose();
    };

    return (
        <div className="fixed inset-0 w-full h-screen bg-[#070709] bg-radial-gradient z-50 overflow-y-auto overflow-x-hidden flex flex-col text-zinc-100 font-sans custom-scrollbar">

            {/* 1. Header Bar */}
            <header className="min-h-16 border-b border-zinc-900 bg-zinc-950/80 backdrop-blur-md sticky top-0 z-40 flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 sm:px-6 gap-3">
                <div className="flex items-center gap-3">
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-zinc-900 rounded-lg text-zinc-400 hover:text-white transition-all flex items-center justify-center border border-zinc-900"
                    >
                        <ArrowLeft size={14} />
                    </button>
                    <div className="w-[1px] h-6 bg-zinc-800" />
                    <div className="flex items-center gap-2">
                        <div className="p-1 bg-cyan-500/10 border border-cyan-500/30 rounded-lg">
                            <Sparkles size={14} className="text-cyan-400" />
                        </div>
                        <div>
                            <h1 className="text-[11px] font-black uppercase tracking-wider text-zinc-100">Cinemiq Generative Studio</h1>
                            <p className="text-[9px] text-zinc-500 font-bold uppercase tracking-wider">Dedicated Prompt & Search Dashboard</p>
                        </div>
                    </div>
                </div>

                {generatedProject && (
                    <button
                        onClick={handleLoadFullTimeline}
                        className="w-full sm:w-auto justify-center px-4 py-2 text-[10px] font-extrabold uppercase rounded-lg bg-gradient-to-r from-cyan-400 to-blue-500 hover:from-cyan-500 hover:to-blue-600 shadow-lg shadow-cyan-500/20 text-white flex items-center gap-2 transform active:scale-95 transition-all"
                    >
                        <Layers size={12} />
                        <span>Load Entire Storyboard into Timeline</span>
                    </button>
                )}
            </header>

            {/* 2. Search / Prompt Zone */}
            <section className="max-w-4xl w-full mx-auto px-6 py-8 flex flex-col gap-6 flex-shrink-0">
                <div className="text-center max-w-xl mx-auto flex flex-col gap-2">
                    <h2 className="text-lg font-black uppercase tracking-wider text-zinc-200">What are you creating today?</h2>
                    <p className="text-[10px] text-zinc-500 leading-normal">
                        Input a prompt description. We will query Giphy, Freesound, and the local Stable Diffusion/Flux service to gather and orchestrate matching media templates!
                    </p>
                </div>

                <form onSubmit={handleSearchAndGenerate} className="flex flex-col sm:flex-row gap-2 bg-zinc-950 border border-zinc-850 p-1.5 rounded-xl shadow-2xl shadow-cyan-500/5 focus-within:border-cyan-500/50 transition-all">
                    <div className="flex-1 flex items-center gap-2.5 px-3 min-w-0 py-2 sm:py-0">
                        <Search size={14} className="text-zinc-500" />
                        <input
                            type="text"
                            placeholder="Describe your scene (e.g. Ocean waves crashing, synth ambient soundtrack, deep cinematic narration...)"
                            value={prompt}
                            onChange={(e) => setPrompt(e.target.value)}
                            className="bg-transparent border-none text-[11px] text-zinc-200 outline-none w-full placeholder-zinc-700"
                            disabled={isLoading}
                        />
                    </div>
                    <button
                        type="submit"
                        disabled={isLoading || !prompt.trim()}
                        className="px-5 py-2.5 rounded-lg bg-gradient-to-tr from-cyan-500 to-blue-600 text-white text-[10px] font-black uppercase tracking-wider hover:opacity-95 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
                    >
                        <Sparkles size={12} />
                        <span>{isLoading ? 'Searching...' : 'Search & Generate'}</span>
                    </button>
                </form>
            </section>

            {/* 3. Loading animation */}
            {isLoading && (
                <div className="flex-1 flex flex-col items-center justify-center p-8 gap-4">
                    <div className="relative w-12 h-12 flex items-center justify-center">
                        <div className="absolute inset-0 rounded-full border-2 border-zinc-800" />
                        <div className="absolute inset-0 rounded-full border-2 border-t-cyan-500 border-r-blue-500 animate-spin" />
                        <Sparkles size={16} className="text-cyan-400 animate-pulse" />
                    </div>
                    <div className="text-center flex flex-col gap-1">
                        <span className="text-[11px] font-bold text-zinc-300">Orchestrating Multimedia assets...</span>
                        <span className="text-[9px] text-zinc-650 uppercase font-black">Querying Freesound • Giphy API • Pollinations Flux</span>
                    </div>
                </div>
            )}

            {/* 4. Results Space */}
            {!isLoading && (generatedProject || giphyResults.length > 0 || freesoundResults.length > 0) && (
                <main className="flex-1 max-w-6xl w-full mx-auto px-6 pb-12 flex flex-col gap-6">

                    {/* Sub Navigation Tabs */}
                    <div className="flex border-b border-zinc-900 gap-1 pb-px flex-shrink-0 overflow-x-auto scrollbar-none flex-nowrap">
                        {[
                            { id: 'all', label: 'All Results', count: (generatedProject?.clips.length || 0) + giphyResults.length + freesoundResults.length },
                            { id: 'storyboard', label: 'AI Storyboard Slides', count: generatedProject?.clips.length || 0 },
                            { id: 'gifs', label: 'Giphy Visual Assets', count: giphyResults.length },
                            { id: 'audio', label: 'Freesound SFX', count: freesoundResults.length }
                        ].map(tab => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id as any)}
                                className={`px-4 py-2 border-b-2 text-[10px] font-extrabold uppercase transition-all flex items-center gap-2 ${activeTab === tab.id
                                    ? 'border-cyan-500 text-white bg-cyan-500/5'
                                    : 'border-transparent text-zinc-500 hover:text-zinc-300'
                                    }`}
                            >
                                <span>{tab.label}</span>
                                <span className="px-1.5 py-0.5 rounded-full bg-zinc-900 border border-zinc-850 text-[8px] text-zinc-400 font-bold font-mono">
                                    {tab.count}
                                </span>
                            </button>
                        ))}
                    </div>

                    {/* Tab Content */}
                    <div className="flex-1">

                        {/* TAB: STORYBOARD (Visual AI generation clips) */}
                        {(activeTab === 'all' || activeTab === 'storyboard') && generatedProject && (
                            <section className="mb-8">
                                <div className="flex items-center gap-2 mb-4">
                                    <Film size={12} className="text-cyan-400" />
                                    <h3 className="text-[10px] font-black uppercase tracking-wider text-zinc-300">Generated Storyboard Frames (Video Timeline)</h3>
                                </div>

                                <div className="grid grid-cols-1 xs:grid-cols-2 md:grid-cols-4 gap-4">
                                    {generatedProject.clips.filter((c: any) => c.type === 'video' || c.type === 'image').map((clip: any) => (
                                        <div
                                            key={clip.id}
                                            className="group bg-zinc-900 border border-zinc-850 rounded-xl overflow-hidden shadow-xl hover:border-cyan-500/30 transition-all flex flex-col"
                                        >
                                            <div className="aspect-video w-full bg-zinc-950 relative overflow-hidden">
                                                <img
                                                    src={clip.source.startsWith('http') ? clip.source : `${API_URL}${clip.source}`}
                                                    alt={clip.name}
                                                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                                />
                                                <div className="absolute top-1.5 left-1.5 px-1 py-0.5 rounded bg-cyan-950/80 border border-cyan-500/30 text-[8px] font-black uppercase text-cyan-400">
                                                    AI Rendered
                                                </div>
                                                <div className="absolute bottom-1.5 right-1.5 px-1 rounded bg-black/70 text-[8px] text-zinc-400 font-mono">
                                                    {clip.duration.toFixed(1)}s
                                                </div>

                                                {/* Plus Add Hover Button */}
                                                <div className="absolute inset-0 bg-black/70 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                                    <button
                                                        onClick={() => handleInsertClipToCurrentProject(clip)}
                                                        className="px-3 py-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-white font-bold text-[9px] uppercase flex items-center gap-1 shadow-lg shadow-cyan-500/40 transform active:scale-95 transition-all"
                                                    >
                                                        <FolderPlus size={11} />
                                                        <span>Add to Library</span>
                                                    </button>
                                                </div>
                                            </div>
                                            <div className="p-3">
                                                <h4 className="text-[10px] font-bold text-zinc-200 truncate">{clip.name}</h4>
                                                <p className="text-[8px] text-zinc-500 uppercase mt-0.5">Asset Type: {clip.type}</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </section>
                        )}

                        {/* TAB: GIPHY SEARCH */}
                        {(activeTab === 'all' || activeTab === 'gifs') && giphyResults.length > 0 && (
                            <section className="mb-8">
                                <div className="flex items-center gap-2 mb-4">
                                    <ImageIcon size={12} className="text-violet-400" />
                                    <h3 className="text-[10px] font-black uppercase tracking-wider text-zinc-300">Giphy Elements ({giphyResults.length})</h3>
                                </div>

                                <div className="grid grid-cols-2 xs:grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
                                    {giphyResults.map((gif: any) => (
                                        <div
                                            key={gif.id}
                                            className="group bg-zinc-900 border border-zinc-850 rounded-xl overflow-hidden shadow-xl hover:border-violet-500/30 transition-all flex flex-col"
                                        >
                                            <div className="aspect-square w-full bg-zinc-950 relative overflow-hidden">
                                                <img
                                                    src={gif.preview || gif.url}
                                                    alt={gif.title}
                                                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                                />
                                                <div className="absolute top-1.5 left-1.5 px-1 py-0.5 rounded bg-violet-950/80 border border-violet-500/20 text-[8px] font-black uppercase text-violet-400">
                                                    GIF
                                                </div>

                                                {/* Plus Add Hover Button */}
                                                <div className="absolute inset-0 bg-black/70 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                                    <button
                                                        onClick={() => handleInsertClipToCurrentProject({
                                                            type: 'image',
                                                            name: gif.title || 'Giphy Animated Element',
                                                            source: gif.url,
                                                            duration: 4,
                                                            volume: 1.0,
                                                            speed: 1.0,
                                                            muted: false,
                                                            effects: [],
                                                            transform: { x: 0, y: 0, scaleX: 1.0, scaleY: 1.0, rotation: 0, opacity: 1.0 }
                                                        })}
                                                        className="px-3 py-1.5 rounded-lg bg-violet-500 hover:bg-violet-400 text-white font-bold text-[9px] uppercase flex items-center gap-1 shadow-lg shadow-violet-500/40 transform active:scale-95 transition-all"
                                                    >
                                                        <FolderPlus size={11} />
                                                        <span>Add to Library</span>
                                                    </button>
                                                </div>
                                            </div>
                                            <div className="p-2.5">
                                                <h4 className="text-[9px] font-extrabold text-zinc-300 truncate">{gif.title || 'GIF Loop'}</h4>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </section>
                        )}

                        {/* TAB: AUDIO / FREESOUND */}
                        {(activeTab === 'all' || activeTab === 'audio') && freesoundResults.length > 0 && (
                            <section className="mb-0">
                                <div className="flex items-center gap-2 mb-4">
                                    <Music size={12} className="text-amber-400" />
                                    <h3 className="text-[10px] font-black uppercase tracking-wider text-zinc-300">Freesound SFX Assets ({freesoundResults.length})</h3>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                                    {freesoundResults.map((sound: any) => (
                                        <div
                                            key={sound.id}
                                            className="flex items-center justify-between p-3.5 bg-zinc-900 border border-zinc-850 rounded-xl hover:border-amber-500/30 transition-all group"
                                        >
                                            <div className="flex items-center gap-3.5 min-w-0 flex-1">
                                                <button
                                                    onClick={() => handlePlayAudio(sound.id, sound.previews?.['preview-hq-mp3'] || sound.previews?.['preview-lq-mp3'])}
                                                    className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 transition-all border ${playingAudioId === sound.id
                                                        ? 'bg-amber-500 border-amber-400 text-black animate-pulse shadow-md shadow-amber-500/20'
                                                        : 'bg-zinc-950 border-zinc-800 text-amber-500 group-hover:border-amber-500/30'
                                                        }`}
                                                >
                                                    {playingAudioId === sound.id ? <Pause size={13} fill="currentColor" /> : <Play size={13} fill="currentColor" className="ml-0.5" />}
                                                </button>
                                                <div className="min-w-0 flex-1">
                                                    <p className="text-[10px] font-bold text-zinc-200 truncate pr-4">{sound.name}</p>
                                                    <span className="text-[8px] text-zinc-500 font-semibold uppercase tracking-wider">{sound.username || 'Anonymous'} • Freesound Asset</span>
                                                </div>
                                            </div>

                                            <button
                                                onClick={() => handleInsertClipToCurrentProject({
                                                    type: 'audio',
                                                    name: sound.name,
                                                    source: sound.previews?.['preview-hq-mp3'] || sound.previews?.['preview-lq-mp3'],
                                                    duration: 8,
                                                    volume: 0.8,
                                                    speed: 1.0,
                                                    muted: false,
                                                    effects: []
                                                })}
                                                className="px-3 py-1.5 bg-zinc-950 hover:bg-amber-500/10 border border-zinc-800 hover:border-amber-500/30 text-[9px] font-bold uppercase text-zinc-400 hover:text-amber-400 rounded-lg transition-all flex items-center gap-1 flex-shrink-0"
                                            >
                                                <FolderPlus size={10} />
                                                <span>Add</span>
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </section>
                        )}

                    </div>

                </main>
            )
            }

            {/* 5. Placeholder Empty State */}
            {
                !isLoading && !generatedProject && giphyResults.length === 0 && freesoundResults.length === 0 && (
                    <div className="flex-grow flex flex-col items-center justify-center p-8 gap-3">
                        <div className="w-10 h-10 rounded-xl bg-zinc-900 border border-zinc-850 text-zinc-500 flex items-center justify-center">
                            <Sparkles size={15} />
                        </div>
                        <div className="text-center max-w-xs flex flex-col">
                            <span className="text-[10px] font-bold text-zinc-400">Your AI Assets await</span>
                            <span className="text-[8px] text-zinc-600 mt-1 uppercase tracking-wider font-extrabold">Enter a prompt above to compile storyboard tracks and search internet soundscapes.</span>
                        </div>
                    </div>
                )
            }

        </div>
    );
};
