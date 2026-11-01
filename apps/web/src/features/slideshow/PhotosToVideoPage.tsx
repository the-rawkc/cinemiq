import React, { useState, useEffect, useRef } from 'react';
import {
    ArrowLeft,
    Image as ImageIcon,
    Trash2,
    Play,
    Pause,
    Music,
    Tv,
    Plus,
    Sliders,
    ChevronUp,
    ChevronDown,
    Video,
    Download
} from 'lucide-react';
import { API_URL } from '../../config';

const PRESET_IMAGES = [
    { id: 'preset-1', name: 'Golden Beach Coastline', url: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=800&q=80' },
    { id: 'preset-2', name: 'Scenic Mountain Peaks', url: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=800&q=80' },
    { id: 'preset-3', name: 'Cyberpunk Neon Street', url: 'https://images.unsplash.com/photo-1511447333015-45b65e60f6d5?auto=format&fit=crop&w=800&q=80' },
    { id: 'preset-4', name: 'Deep Cosmic Nebula', url: 'https://images.unsplash.com/photo-1506318137071-a8e063b4bec0?auto=format&fit=crop&w=800&q=80' }
];

const PRESET_AUDIOS = [
    { name: 'None', source: '' },
    { name: 'Ambient Synth Beat', source: `${API_URL}/uploads/music1.mp3` },
    { name: 'Cinematic Orchestral', source: `${API_URL}/uploads/music2.mp3` }
];

interface SlideImage {
    id: string;
    name: string;
    url: string;
    file?: File;
}

interface PhotosToVideoPageProps {
    onClose: () => void;
    onLoadProject: (project: any) => void;
}

export const PhotosToVideoPage: React.FC<PhotosToVideoPageProps> = ({ onClose, onLoadProject }) => {

    // State for slides
    const [slides, setSlides] = useState<SlideImage[]>([
        { id: '1', name: 'Beach Sunset', url: PRESET_IMAGES[0].url },
        { id: '2', name: 'Alpine Ridge', url: PRESET_IMAGES[1].url },
        { id: '3', name: 'Neon City Night', url: PRESET_IMAGES[2].url },
    ]);

    const [customAudio, setCustomAudio] = useState<{ name: string; source: string } | null>(null);
    const [isUploading, setIsUploading] = useState(false);
    const audioFileInputRef = useRef<HTMLInputElement | null>(null);

    // Slideshow config
    const [slideDuration, setSlideDuration] = useState<number>(3); // seconds per slide
    const [transitionEffect, setTransitionEffect] = useState<'none' | 'fade'>('fade');
    const [audioSource, setAudioSource] = useState<string>(`${API_URL}/uploads/music1.mp3`);
    const [titleText, setTitleText] = useState<string>('My Cinematic Slideshow');
    const [titleColor, setTitleColor] = useState<string>('#3b82f6');
    const [titleFontSize, setTitleFontSize] = useState<number>(48);

    // Playback / Preview state
    const [isPlayingPreview, setIsPlayingPreview] = useState(false);
    const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
    const [previewTimerProgress, setPreviewTimerProgress] = useState(0);

    // Rendering State
    const [renderStatus, setRenderStatus] = useState<'idle' | 'rendering' | 'completed' | 'failed'>('idle');
    const [renderProgress, setRenderProgress] = useState(0);
    const [renderOutputUrl, setRenderOutputUrl] = useState<string | null>(null);

    // Audio preview reference
    const audioPreviewRef = useRef<HTMLAudioElement | null>(null);
    const timerRef = useRef<any>(null);
    const fileInputRef = useRef<HTMLInputElement | null>(null);

    // Reset/loop preview when index or playing state shifts
    useEffect(() => {
        if (timerRef.current) clearInterval(timerRef.current);

        if (!isPlayingPreview || slides.length === 0) {
            setPreviewTimerProgress(0);
            return;
        }

        const intervalTime = 50; // update progress every 50ms
        const totalMs = slideDuration * 1000;
        let elapsedMs = 0;

        timerRef.current = setInterval(() => {
            elapsedMs += intervalTime;
            const progress = (elapsedMs / totalMs) * 100;

            if (progress >= 100) {
                setPreviewTimerProgress(0);
                elapsedMs = 0;
                setCurrentSlideIndex((prevIndex) => (prevIndex + 1) % slides.length);
            } else {
                setPreviewTimerProgress(progress);
            }
        }, intervalTime);

        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
        };
    }, [isPlayingPreview, currentSlideIndex, slideDuration, slides.length]);

    // Manage preview audio playback
    useEffect(() => {
        if (isPlayingPreview && audioSource) {
            if (audioPreviewRef.current) {
                audioPreviewRef.current.pause();
            }
            audioPreviewRef.current = new Audio(audioSource);
            audioPreviewRef.current.loop = true;
            audioPreviewRef.current.volume = 0.5;
            audioPreviewRef.current.play().catch(() => { });
        } else {
            if (audioPreviewRef.current) {
                audioPreviewRef.current.pause();
                audioPreviewRef.current = null;
            }
        }

        return () => {
            if (audioPreviewRef.current) {
                audioPreviewRef.current.pause();
            }
        };
    }, [isPlayingPreview, audioSource]);

    const handleTogglePreviewPlay = () => {
        setIsPlayingPreview(!isPlayingPreview);
        if (!isPlayingPreview && slides.length > 0) {
            setCurrentSlideIndex(0);
            setPreviewTimerProgress(0);
        }
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const filesList = e.target.files;
        if (!filesList || filesList.length === 0) return;

        setIsUploading(true);
        const uploadedSlides: SlideImage[] = [];

        try {
            for (const file of Array.from(filesList)) {
                const formData = new FormData();
                formData.append('file', file);

                const res = await fetch(`${API_URL}/api/editor/upload`, {
                    method: 'POST',
                    body: formData,
                });

                if (!res.ok) throw new Error('Upload failed');

                const data = await res.json();
                const serverUrl = `${API_URL}${data.url}`;

                uploadedSlides.push({
                    id: Math.random().toString(36).substring(2, 9),
                    name: file.name.substring(0, 25),
                    url: serverUrl,
                });
            }

            setSlides((prev) => [...prev, ...uploadedSlides]);
        } catch (err) {
            console.error(err);
            alert('Failed to upload one or more images to the server.');
        } finally {
            setIsUploading(false);
            if (e.target) {
                e.target.value = '';
            }
        }
    };

    const handleAudioUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const filesList = e.target.files;
        if (!filesList || filesList.length === 0) return;

        setIsUploading(true);
        const file = filesList[0];

        try {
            const formData = new FormData();
            formData.append('file', file);

            const res = await fetch(`${API_URL}/api/editor/upload`, {
                method: 'POST',
                body: formData,
            });

            if (!res.ok) throw new Error('Audio upload failed');

            const data = await res.json();
            const serverUrl = `${API_URL}${data.url}`;

            const uploadedAudio = {
                name: `Local: ${file.name.substring(0, 20)}`,
                source: serverUrl
            };

            setCustomAudio(uploadedAudio);
            setAudioSource(serverUrl);
        } catch (err) {
            console.error(err);
            alert('Failed to upload audio file to the server.');
        } finally {
            setIsUploading(false);
            if (e.target) {
                e.target.value = '';
            }
        }
    };

    const handleAddPreset = (preset: typeof PRESET_IMAGES[0]) => {
        setSlides([
            ...slides,
            {
                id: Math.random().toString(36).substring(2, 9),
                name: preset.name,
                url: preset.url
            }
        ]);
    };

    const handleDeleteSlide = (id: string) => {
        const nextSlides = slides.filter(s => s.id !== id);
        setSlides(nextSlides);
        if (currentSlideIndex >= nextSlides.length) {
            setCurrentSlideIndex(0);
        }
    };

    const moveSlide = (index: number, direction: 'up' | 'down') => {
        if (direction === 'up' && index === 0) return;
        if (direction === 'down' && index === slides.length - 1) return;

        const targetIndex = direction === 'up' ? index - 1 : index + 1;
        const items = [...slides];
        const temp = items[index];
        items[index] = items[targetIndex];
        items[targetIndex] = temp;

        setSlides(items);
    };

    const createSlideshowProject = () => {
        const totalLength = slides.length * slideDuration;
        const projectClips: any[] = [];
        const transitionDuration = transitionEffect === 'fade' ? 0.5 : 0;

        // 1. Create photo slides as images in timeline
        slides.forEach((slide, idx) => {
            const isLast = idx === slides.length - 1;
            const clipDuration = slideDuration + (!isLast ? transitionDuration : 0);

            const clipEffects = [];
            if (idx > 0 && transitionEffect === 'fade') {
                clipEffects.push({
                    type: 'fade',
                    duration: transitionDuration
                });
            }

            projectClips.push({
                id: `slide-clip-${idx}`,
                type: 'image',
                name: slide.name,
                trackId: 'v1',
                offset: idx * slideDuration,
                duration: clipDuration,
                source: slide.url,
                start: 0,
                volume: 0,
                speed: 1.0,
                muted: true,
                transform: { x: 0, y: 0, scaleX: 1.0, scaleY: 1.0, rotation: 0, opacity: 1.0 },
                effects: clipEffects
            });
        });

        // 2. Add title overlay at the start (duration = 4s or duration of first slide)
        if (titleText.trim()) {
            projectClips.push({
                id: `slide-text-overlay`,
                type: 'text',
                name: 'Opening Title',
                trackId: 'v2',
                offset: 0,
                duration: Math.min(totalLength, 4),
                source: '',
                start: 0,
                volume: 0,
                speed: 1.0,
                muted: true,
                textConfig: {
                    content: titleText,
                    fontSize: titleFontSize,
                    color: titleColor,
                    fontFamily: 'Outfit',
                    bold: true,
                    italic: false,
                    alignment: 'center',
                    x: 50,
                    y: 50
                },
                effects: []
            });
        }

        // 3. Add background audio track
        if (audioSource) {
            projectClips.push({
                id: `slide-audio-track`,
                type: 'audio',
                name: PRESET_AUDIOS.find(a => a.source === audioSource)?.name || customAudio?.name || 'Background Soundtrack',
                trackId: 'a1',
                offset: 0,
                duration: totalLength,
                source: audioSource,
                start: 0,
                volume: 0.8,
                speed: 1.0,
                muted: false,
                effects: []
            });
        }

        return {
            id: `slideshow-${Math.random().toString(36).substring(2, 9)}`,
            name: titleText.trim() || 'Photos Slideshow',
            resolution: { width: 1280, height: 720 },
            fps: 30,
            tracks: [
                { id: 'v2', type: 'video', name: 'Text Overlays', muted: false, locked: false, order: 2 },
                { id: 'v1', type: 'video', name: 'Photo Timeline', muted: false, locked: false, order: 1 },
                { id: 'a1', type: 'audio', name: 'Background Audio', muted: false, locked: false, order: 3 }
            ],
            clips: projectClips
        };
    };

    const handleLoadInEditor = () => {
        if (slides.length === 0) {
            alert('Please add at least one photo first!');
            return;
        }
        const project = createSlideshowProject();
        onLoadProject(project);
    };

    const handleCompileAndRender = async () => {
        if (slides.length === 0) {
            alert('Please add at least one photo first!');
            return;
        }

        setRenderStatus('rendering');
        setRenderProgress(0);
        setRenderOutputUrl(null);

        const projectData = createSlideshowProject();

        try {
            // 1. Post request to the render endpoint
            const response = await fetch(`${API_URL}/api/editor/render`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ project: projectData }),
            });
            const data = await response.json();

            if (data.jobId) {
                // Poll for completion
                const intervalId = setInterval(async () => {
                    try {
                        const statusResponse = await fetch(`${API_URL}/api/editor/render/status/${data.jobId}`);
                        const statusData = await statusResponse.json();

                        if (statusData.status === 'done') {
                            setRenderStatus('completed');
                            setRenderProgress(100);
                            setRenderOutputUrl(`${API_URL}${statusData.outputPath}`);
                            clearInterval(intervalId);
                        } else if (statusData.status === 'failed') {
                            setRenderStatus('failed');
                            clearInterval(intervalId);
                        } else {
                            setRenderProgress(statusData.progress);
                        }
                    } catch (err) {
                        console.error('Polling error:', err);
                        setRenderStatus('failed');
                        clearInterval(intervalId);
                    }
                }, 1500);
            } else {
                setRenderStatus('failed');
            }
        } catch (err) {
            console.error('Render request failed:', err);
            setRenderStatus('failed');
        }
    };

    return (
        <div className="fixed inset-0 w-full h-screen bg-[#070709] bg-radial-gradient z-50 overflow-y-auto overflow-x-hidden flex flex-col text-zinc-100 font-sans custom-scrollbar">

            {/* Header bar */}
            <header className="min-h-16 border-b border-zinc-900 bg-zinc-950/80 backdrop-blur-md sticky top-0 z-40 flex flex-col md:flex-row items-start md:items-center justify-between p-4 md:px-6 gap-3">
                <div className="flex items-center gap-3">
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-zinc-900 rounded-lg text-zinc-400 hover:text-white transition-all flex items-center justify-center border border-zinc-900"
                    >
                        <ArrowLeft size={14} />
                    </button>
                    <div className="w-[1px] h-6 bg-zinc-800" />
                    <div className="flex items-center gap-2">
                        <div className="p-1 bg-amber-500/10 border border-amber-500/30 rounded-lg">
                            <Tv size={14} className="text-amber-400" />
                        </div>
                        <div>
                            <h1 className="text-[11px] font-black uppercase tracking-wider text-zinc-100">Photos &rarr; Video Studio</h1>
                            <p className="text-[9px] text-zinc-500 font-bold uppercase tracking-wider">Cinematic Slideshow Generator</p>
                        </div>
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto">
                    <button
                        onClick={handleLoadInEditor}
                        className="flex-1 md:flex-none justify-center px-3.5 py-2 border border-zinc-800 hover:border-zinc-700 bg-zinc-950 text-zinc-300 hover:text-white text-[10px] font-extrabold uppercase rounded-lg transition-all flex items-center gap-2"
                    >
                        <Sliders size={12} className="text-cyan-400" />
                        <span>Open in Timeline Editor</span>
                    </button>

                    <button
                        onClick={handleCompileAndRender}
                        className="flex-1 md:flex-none justify-center px-4 py-2 text-[10px] font-extrabold uppercase rounded-lg bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 shadow-lg shadow-amber-500/20 text-white flex items-center gap-2 transform active:scale-95 transition-all"
                    >
                        <Video size={12} />
                        <span>Compile & Render Video</span>
                    </button>
                </div>
            </header>

            {/* Main Studio Area */}
            <div className="flex-1 max-w-7xl w-full mx-auto px-6 py-6 grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">

                {/* Left Control Column (Settings and Slides List) */}
                <div className="lg:col-span-7 flex flex-col gap-6">

                    {/* Section: Slide Settings */}
                    <div className="bg-zinc-900/60 border border-zinc-850 p-5 rounded-xl flex flex-col gap-4 shadow-xl backdrop-blur-sm">
                        <h3 className="text-[10px] font-black uppercase tracking-wider text-zinc-300 flex items-center gap-1.5">
                            <Sliders size={12} className="text-amber-400" />
                            <span>Slideshow Parameters</span>
                        </h3>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            {/* Duration Slider */}
                            <div className="flex flex-col gap-2">
                                <div className="flex justify-between text-[9px] uppercase tracking-wider font-extrabold text-zinc-500">
                                    <span>Slide Duration</span>
                                    <span className="text-zinc-350">{slideDuration}s</span>
                                </div>
                                <input
                                    type="range"
                                    min={1}
                                    max={10}
                                    value={slideDuration}
                                    onChange={(e) => setSlideDuration(Number(e.target.value))}
                                    className="w-full accent-amber-500 h-1 bg-zinc-950 rounded-lg appearance-none cursor-pointer"
                                />
                            </div>

                            {/* Transition Dropdown */}
                            <div className="flex flex-col gap-1.5">
                                <span className="text-[9px] uppercase tracking-wider font-extrabold text-zinc-500">Transition Style</span>
                                <select
                                    value={transitionEffect}
                                    onChange={(e: any) => setTransitionEffect(e.target.value)}
                                    className="bg-zinc-950 border border-zinc-800 rounded-lg p-2 text-[10px] font-bold text-zinc-200 focus:border-amber-500/50 outline-none transition-all"
                                >
                                    <option value="none">Instant (Cut)</option>
                                    <option value="fade">Smooth Dissolve (Fade)</option>
                                </select>
                            </div>

                            {/* Background Music Preset */}
                            <div className="flex flex-col gap-1.5">
                                <div className="flex justify-between items-center">
                                    <span className="text-[9px] uppercase tracking-wider font-extrabold text-zinc-500">Background Soundtrack</span>
                                    <button
                                        onClick={() => audioFileInputRef.current?.click()}
                                        className="text-[8px] uppercase tracking-wider font-extrabold text-amber-400 hover:text-amber-300 transition-colors flex items-center gap-1 font-bold"
                                    >
                                        <Plus size={10} />
                                        <span>Upload Audio</span>
                                    </button>
                                    <input
                                        type="file"
                                        ref={audioFileInputRef}
                                        onChange={handleAudioUpload}
                                        accept="audio/*"
                                        className="hidden"
                                    />
                                </div>
                                <div className="flex items-center gap-2 bg-zinc-950 border border-zinc-800 rounded-lg p-1">
                                    <Music size={12} className="text-zinc-500 ml-2" />
                                    <select
                                        value={audioSource}
                                        onChange={(e) => setAudioSource(e.target.value)}
                                        className="bg-transparent border-none text-[10px] font-bold text-zinc-250 w-full outline-none p-1.5"
                                    >
                                        {PRESET_AUDIOS.map((aud, i) => (
                                            <option key={i} value={aud.source} className="bg-zinc-900">{aud.name}</option>
                                        ))}
                                        {customAudio && (
                                            <option value={customAudio.source} className="bg-zinc-900">{customAudio.name}</option>
                                        )}
                                    </select>
                                </div>
                            </div>

                            {/* Title Text Input */}
                            <div className="flex flex-col gap-1.5">
                                <span className="text-[9px] uppercase tracking-wider font-extrabold text-zinc-500">Title Overlay Text</span>
                                <input
                                    type="text"
                                    value={titleText}
                                    onChange={(e) => setTitleText(e.target.value)}
                                    placeholder="Enter title text overlay..."
                                    className="bg-zinc-950 border border-zinc-850 rounded-lg p-2 text-[10px] font-bold text-zinc-200 outline-none focus:border-cyan-500/50"
                                />
                            </div>
                        </div>

                        {/* Sub-menu title customization options */}
                        {titleText.trim() && (
                            <div className="flex justify-between items-center bg-zinc-950/50 border border-zinc-850 p-2.5 rounded-lg text-[9px] text-zinc-500 font-bold uppercase gap-4">
                                <div className="flex items-center gap-1.5">
                                    <span>Size:</span>
                                    <input
                                        type="number"
                                        min={12}
                                        max={120}
                                        value={titleFontSize}
                                        onChange={(e) => setTitleFontSize(Number(e.target.value))}
                                        className="w-12 bg-zinc-900 hover:bg-zinc-800 max-h-5 rounded border border-zinc-800 text-zinc-350 font-mono text-center outline-none"
                                    />
                                    <span>px</span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                    <span>Color:</span>
                                    <div className="flex gap-1.5">
                                        {['#3b82f6', '#f43f5e', '#10b981', '#f59e0b', '#ffffff'].map(c => (
                                            <button
                                                key={c}
                                                onClick={() => setTitleColor(c)}
                                                className={`w-3.5 h-3.5 rounded-full border ${titleColor === c ? 'border-white scale-110' : 'border-transparent'}`}
                                                style={{ backgroundColor: c }}
                                            />
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Section: Photos Playlist Manager */}
                    <div className="bg-zinc-900/60 border border-zinc-850 p-5 rounded-xl flex flex-col gap-4 shadow-xl backdrop-blur-sm">
                        <div className="flex justify-between items-center">
                            <h3 className="text-[10px] font-black uppercase tracking-wider text-zinc-300 flex items-center gap-1.5">
                                <ImageIcon size={12} className="text-amber-400" />
                                <span>Photos Playlist ({slides.length})</span>
                            </h3>

                            <div className="flex gap-2">
                                <button
                                    onClick={() => fileInputRef.current?.click()}
                                    className="px-2.5 py-1.5 bg-zinc-950 hover:bg-zinc-900 border border-zinc-850 rounded-lg text-[9px] font-extrabold uppercase tracking-wide text-zinc-400 hover:text-white transition-all flex items-center gap-1"
                                >
                                    <Plus size={10} />
                                    <span>Upload Files</span>
                                </button>
                                <input
                                    type="file"
                                    ref={fileInputRef}
                                    onChange={handleFileUpload}
                                    multiple
                                    accept="image/*"
                                    className="hidden"
                                />
                            </div>
                        </div>

                        {/* Custom file uploader fallback & playlist item lists */}
                        {slides.length === 0 ? (
                            <div className="border border-dashed border-zinc-800 rounded-xl p-8 flex flex-col items-center justify-center text-center gap-3">
                                <div className="p-3.5 bg-zinc-950 border border-zinc-850 text-zinc-650 rounded-lg">
                                    <ImageIcon size={22} />
                                </div>
                                <div className="max-w-xs flex flex-col">
                                    <span className="text-[10px] font-extrabold uppercase tracking-wide text-zinc-500">No slides loaded yet</span>
                                    <span className="text-[8px] text-zinc-600 mt-0.5">Upload photos from your machine or add preset images below.</span>
                                </div>
                            </div>
                        ) : (
                            <div className="flex flex-col gap-2 max-h-96 overflow-y-auto pr-1">
                                {slides.map((slide, idx) => (
                                    <div
                                        key={slide.id}
                                        className="flex items-center justify-between p-2.5 bg-zinc-950 border border-zinc-850 rounded-lg group hover:border-zinc-800 transition-all"
                                    >
                                        <div className="flex items-center gap-3.5 min-w-0">
                                            <div className="w-10 aspect-video rounded bg-zinc-900 border border-zinc-800 overflow-hidden relative flex-shrink-0">
                                                <img src={slide.url} alt="" className="w-full h-full object-cover" />
                                                <div className="absolute inset-0 bg-black/40 flex items-center justify-center text-[9px] font-mono text-white font-extrabold">
                                                    #{idx + 1}
                                                </div>
                                            </div>
                                            <div className="min-w-0">
                                                <p className="text-[10px] font-extrabold text-zinc-350 truncate">{slide.name}</p>
                                                <p className="text-[8px] text-zinc-600 font-bold uppercase mt-0.5">Offset: {(idx * slideDuration).toFixed(0)}s</p>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-1.5 opacity-60 group-hover:opacity-100 transition-opacity">
                                            <button
                                                onClick={() => moveSlide(idx, 'up')}
                                                disabled={idx === 0}
                                                className="p-1 hover:bg-zinc-900 rounded text-zinc-500 hover:text-white transition-all disabled:opacity-20 flex items-center justify-center"
                                            >
                                                <ChevronUp size={11} />
                                            </button>
                                            <button
                                                onClick={() => moveSlide(idx, 'down')}
                                                disabled={idx === slides.length - 1}
                                                className="p-1 hover:bg-zinc-900 rounded text-zinc-500 hover:text-white transition-all disabled:opacity-20 flex items-center justify-center"
                                            >
                                                <ChevronDown size={11} />
                                            </button>
                                            <div className="w-[1px] h-3.5 bg-zinc-800 mx-0.5" />
                                            <button
                                                onClick={() => handleDeleteSlide(slide.id)}
                                                className="p-1 hover:bg-zinc-900 hover:text-rose-500 rounded text-zinc-500 transition-all flex items-center justify-center"
                                            >
                                                <Trash2 size={11} />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Presets suggestions strip */}
                        <div className="border-t border-zinc-850 pt-4 mt-2">
                            <span className="text-[9px] uppercase tracking-wider font-extrabold text-zinc-500 block mb-2.5">Quick Starter Preset Photos</span>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                                {PRESET_IMAGES.map((preset) => (
                                    <button
                                        key={preset.id}
                                        onClick={() => handleAddPreset(preset)}
                                        className="flex flex-col bg-zinc-950 hover:bg-zinc-900 border border-zinc-850 hover:border-zinc-800 rounded-lg p-1.5 transition-all text-left gap-1.5"
                                    >
                                        <div className="aspect-video w-full rounded bg-zinc-900 overflow-hidden">
                                            <img src={preset.url} alt="" className="w-full h-full object-cover" />
                                        </div>
                                        <span className="text-[8px] font-bold text-zinc-400 truncate w-full px-0.5">{preset.name}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Right Preview & Compilation Column */}
                <div className="lg:col-span-5 flex flex-col gap-6 order-first lg:order-none lg:sticky lg:top-20">

                    {/* Section: Live Preview Presentation Screen */}
                    <div className="bg-zinc-900/60 border border-zinc-850 p-5 rounded-xl flex flex-col gap-4 shadow-xl backdrop-blur-sm">
                        <div className="flex justify-between items-center">
                            <h3 className="text-[10px] font-black uppercase tracking-wider text-zinc-300 flex items-center gap-1.5">
                                <Play size={12} className="text-amber-400 font-bold" />
                                <span>Interact Live Preview</span>
                            </h3>

                            {slides.length > 0 && isPlayingPreview && (
                                <div className="flex items-center gap-2">
                                    <div className="w-[100px] bg-zinc-950 h-1.5 rounded-full overflow-hidden">
                                        <div
                                            className="bg-amber-400 h-full transition-all duration-75"
                                            style={{ width: `${previewTimerProgress}%` }}
                                        />
                                    </div>
                                    <span className="text-[8px] font-mono text-zinc-500 font-bold">Slide {currentSlideIndex + 1}/{slides.length}</span>
                                </div>
                            )}
                        </div>

                        {/* Virtual Screen Monitor */}
                        <div className="aspect-video w-full rounded-xl bg-zinc-950 border border-zinc-800 shadow-2xl relative overflow-hidden flex items-center justify-center group">
                            {slides.length === 0 ? (
                                <div className="flex flex-col items-center text-zinc-650 gap-2">
                                    <Tv size={26} className="text-zinc-700 animate-pulse" />
                                    <span className="text-[9px] font-extrabold uppercase tracking-wide">Screen Standby</span>
                                </div>
                            ) : (
                                <>
                                    {/* Photo slides switcher */}
                                    <div className="relative w-full h-full">
                                        {slides.map((slide, idx) => (
                                            <div
                                                key={slide.id}
                                                className={`absolute inset-0 ${transitionEffect === 'fade'
                                                    ? 'transition-opacity duration-500 ease-in-out'
                                                    : ''
                                                    } ${idx === currentSlideIndex ? 'opacity-100 z-10' : 'opacity-0 z-0'}`}
                                            >
                                                <img
                                                    src={slide.url}
                                                    alt=""
                                                    className="w-full h-full object-cover"
                                                />
                                            </div>
                                        ))}
                                    </div>

                                    {/* Title Overlay */}
                                    {titleText.trim() && (currentSlideIndex === 0 || !isPlayingPreview) && (
                                        <div className="absolute inset-0 flex items-center justify-center p-6 text-center select-none pointer-events-none z-20">
                                            <h2
                                                className="font-black drop-shadow-xl tracking-tight transition-all duration-300 animate-in fade-in zoom-in-95 duration-500"
                                                style={{ fontSize: `${titleFontSize / 2}px`, color: titleColor }}
                                            >
                                                {titleText}
                                            </h2>
                                        </div>
                                    )}

                                    {/* Playhead playback helper overlay */}
                                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center z-30 pointer-events-none">
                                        <button
                                            onClick={handleTogglePreviewPlay}
                                            className="w-12 h-12 rounded-full bg-amber-500 hover:bg-amber-400 text-white flex items-center justify-center shadow-2xl shadow-amber-500/20 transform hover:scale-105 active:scale-95 transition-all pointer-events-auto"
                                        >
                                            {isPlayingPreview ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" className="ml-1" />}
                                        </button>
                                    </div>
                                </>
                            )}
                        </div>

                        {/* Quick Play Trigger Bar */}
                        {slides.length > 0 && (
                            <div className="flex justify-between items-center bg-zinc-950 p-2.5 rounded-lg border border-zinc-850/50">
                                <button
                                    onClick={handleTogglePreviewPlay}
                                    className="flex items-center gap-1.5 py-1 px-3 bg-zinc-900 hover:bg-zinc-850 border border-zinc-850 hover:border-zinc-800 rounded font-black text-[9px] uppercase tracking-wide text-zinc-300 hover:text-white transition-all"
                                >
                                    {isPlayingPreview ? <Pause size={10} /> : <Play size={10} />}
                                    <span>{isPlayingPreview ? 'Pause Preview' : 'Play Preview'}</span>
                                </button>

                                <div className="flex gap-2">
                                    {slides.map((_, i) => (
                                        <button
                                            key={i}
                                            onClick={() => {
                                                setCurrentSlideIndex(i);
                                                setPreviewTimerProgress(0);
                                            }}
                                            className={`w-2 h-2 rounded-full transition-all ${currentSlideIndex === i ? 'bg-amber-400 scale-125' : 'bg-zinc-800 hover:bg-zinc-600'
                                                }`}
                                        />
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Section: Compilation & Rendering Status Output */}
                    {renderStatus !== 'idle' && (
                        <div className="bg-zinc-900/60 border border-zinc-850 p-5 rounded-xl flex flex-col gap-3.5 shadow-xl backdrop-blur-sm animate-in fade-in slide-in-from-bottom-[8px] duration-300">
                            <div className="flex justify-between items-center text-[10px] uppercase font-black tracking-wider">
                                <span className={
                                    renderStatus === 'rendering' ? 'text-amber-400 animate-pulse' :
                                        renderStatus === 'completed' ? 'text-emerald-400' : 'text-rose-450'
                                }>
                                    {renderStatus === 'rendering' ? 'Compiling Video Slideshow' :
                                        renderStatus === 'completed' ? 'Compile Succeeded' : 'Compile Failed'}
                                </span>

                                <button
                                    onClick={() => setRenderStatus('idle')}
                                    className="text-zinc-650 hover:text-zinc-400 transition-colors"
                                >
                                    Dismiss
                                </button>
                            </div>

                            <div className="w-full bg-zinc-950 h-2 rounded-full overflow-hidden border border-zinc-900">
                                <div
                                    style={{ width: `${renderProgress}%` }}
                                    className="bg-amber-500 h-full transition-all duration-300 shadow-neon"
                                />
                            </div>

                            <div className="flex justify-between items-center text-[9px] font-extrabold uppercase text-zinc-500">
                                <span>Rendering Progress: {renderProgress}%</span>
                                {renderStatus === 'completed' && renderOutputUrl && (
                                    <div className="flex gap-3">
                                        <a
                                            href={renderOutputUrl}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="text-amber-400 hover:text-white transition-colors flex items-center gap-1 font-black"
                                        >
                                            <Download size={10} />
                                            <span>Download MP4</span>
                                        </a>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                </div>
            </div>

            {isUploading && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex flex-col items-center justify-center gap-3 animate-in fade-in duration-200">
                    <div className="w-10 h-10 border-4 border-amber-500 border-t-transparent rounded-full animate-spin" />
                    <span className="text-[10px] font-black uppercase tracking-wider text-amber-400 font-bold">Uploading media to server...</span>
                </div>
            )}
        </div>
    );
};
