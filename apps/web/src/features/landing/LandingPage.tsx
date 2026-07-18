import React from 'react';
import { Sparkles, Sliders, Tv } from 'lucide-react';

interface LandingPageProps {
    onSelectOption: (option: 'ai-generation' | 'edit-videos' | 'photos-to-video') => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({ onSelectOption }) => {
    return (
        <div className="min-h-screen w-screen bg-[#050508] bg-radial-gradient text-zinc-100 font-sans flex flex-col items-center justify-center p-6 relative overflow-hidden select-none">

            {/* Decorative neon blobs in the background */}
            <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-blue-500/10 rounded-full blur-[120px] pointer-events-none" />
            <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-purple-500/10 rounded-full blur-[120px] pointer-events-none" />
            <div className="absolute top-[40%] left-[60%] w-[30%] h-[30%] bg-amber-500/5 rounded-full blur-[125px] pointer-events-none" />

            {/* Main Container */}
            <div className="max-w-5xl w-full flex flex-col gap-12 z-10 items-center text-center">

                {/* Logo / Header */}
                <div className="flex flex-col gap-4 animate-in fade-in slide-in-from-top-4 duration-700">
                    <div className="inline-flex items-center gap-2 self-center px-3 py-1 rounded-full bg-zinc-900/80 border border-zinc-800 backdrop-blur-md text-[10px] font-black uppercase tracking-wider text-cyan-400">
                        <Sparkles size={11} className="animate-pulse" />
                        <span>Generative Video Suite</span>
                    </div>

                    <div className="flex flex-col gap-2.5">
                        <h1 className="text-4xl md:text-5xl font-black tracking-tight uppercase">
                            <span className="bg-gradient-to-r from-white via-zinc-200 to-zinc-400 bg-clip-text text-transparent">CINEMIQ </span>
                            <span className="bg-gradient-to-r from-cyan-400 via-blue-500 to-indigo-500 bg-clip-text text-transparent">STUDIO</span>
                        </h1>
                        <p className="max-w-xl self-center text-zinc-400 text-[11px] md:text-[12px] leading-relaxed uppercase tracking-wider font-semibold">
                            The ultimate workspace for AI generation, manual multitrack timeline orchestration, and automated photo slideshow compilations.
                        </p>
                    </div>
                </div>

                {/* Dashboard 3 Option Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full max-w-4xl px-4 animate-in fade-in zoom-in-95 delay-100 duration-700">

                    {/* Card 1: AI Generated Videos */}
                    <div
                        onClick={() => onSelectOption('ai-generation')}
                        className="group bg-zinc-950/40 border border-zinc-850 hover:border-cyan-500/50 backdrop-blur-md p-6 rounded-2xl flex flex-col justify-between items-center text-center gap-6 cursor-pointer hover:shadow-2xl hover:shadow-cyan-500/5 transform hover:-translate-y-1.5 transition-all duration-300"
                    >
                        <div className="flex flex-col items-center gap-4">
                            {/* Icon Container with glowing ring */}
                            <div className="w-14 h-14 rounded-2xl bg-cyan-950/30 border border-cyan-500/30 flex items-center justify-center group-hover:bg-cyan-500/10 group-hover:border-cyan-400 transition-all duration-300 relative">
                                <div className="absolute inset-0 rounded-2xl bg-cyan-500/20 blur-md opacity-0 group-hover:opacity-100 transition-opacity" />
                                <Sparkles size={24} className="text-cyan-400" />
                            </div>

                            <div className="flex flex-col gap-1.5">
                                <h3 className="text-sm font-black uppercase tracking-wider text-zinc-200 group-hover:text-cyan-400 transition-colors">AI Generator</h3>
                                <p className="text-[10px] text-zinc-500 leading-normal font-medium">
                                    Query Stable Diffusion, Giphy and Freesound to automatically orchestrate custom storyboard layouts and SFX.
                                </p>
                            </div>
                        </div>

                        <button className="w-full py-2.5 rounded-xl bg-cyan-500/5 group-hover:bg-cyan-500 border border-cyan-500/20 group-hover:border-cyan-400 text-[10px] font-black uppercase tracking-wider text-cyan-400 group-hover:text-white transition-all shadow-md group-hover:shadow-cyan-500/20">
                            Enter AI Studio
                        </button>
                    </div>

                    {/* Card 2: Edit Videos (Timeline Workspace) */}
                    <div
                        onClick={() => onSelectOption('edit-videos')}
                        className="group bg-zinc-950/40 border border-zinc-850 hover:border-purple-500/50 backdrop-blur-md p-6 rounded-2xl flex flex-col justify-between items-center text-center gap-6 cursor-pointer hover:shadow-2xl hover:shadow-purple-500/5 transform hover:-translate-y-1.5 transition-all duration-300"
                    >
                        <div className="flex flex-col items-center gap-4">
                            {/* Icon Container with glowing ring */}
                            <div className="w-14 h-14 rounded-2xl bg-purple-950/30 border border-purple-500/30 flex items-center justify-center group-hover:bg-purple-500/10 group-hover:border-purple-400 transition-all duration-300 relative">
                                <div className="absolute inset-0 rounded-2xl bg-purple-500/20 blur-md opacity-0 group-hover:opacity-100 transition-opacity" />
                                <Sliders size={22} className="text-purple-400" />
                            </div>

                            <div className="flex flex-col gap-1.5">
                                <h3 className="text-sm font-black uppercase tracking-wider text-zinc-200 group-hover:text-purple-400 transition-colors">Timeline Editor</h3>
                                <p className="text-[10px] text-zinc-500 leading-normal font-medium">
                                    Full multi-track timeline control. Insert custom clips, adjust speeds, crop geometry, mix multi-track audio features.
                                </p>
                            </div>
                        </div>

                        <button className="w-full py-2.5 rounded-xl bg-purple-500/5 group-hover:bg-purple-500 border border-purple-500/20 group-hover:border-purple-400 text-[10px] font-black uppercase tracking-wider text-purple-400 group-hover:text-white transition-all shadow-md group-hover:shadow-purple-500/20">
                            Launch Editor
                        </button>
                    </div>

                    {/* Card 3: Photos to Video */}
                    <div
                        onClick={() => onSelectOption('photos-to-video')}
                        className="group bg-zinc-950/40 border border-zinc-850 hover:border-amber-500/50 backdrop-blur-md p-6 rounded-2xl flex flex-col justify-between items-center text-center gap-6 cursor-pointer hover:shadow-2xl hover:shadow-amber-500/5 transform hover:-translate-y-1.5 transition-all duration-300"
                    >
                        <div className="flex flex-col items-center gap-4">
                            {/* Icon Container with glowing ring */}
                            <div className="w-14 h-14 rounded-2xl bg-amber-950/30 border border-amber-500/30 flex items-center justify-center group-hover:bg-amber-500/10 group-hover:border-amber-400 transition-all duration-300 relative">
                                <div className="absolute inset-0 rounded-2xl bg-amber-500/20 blur-md opacity-0 group-hover:opacity-100 transition-opacity" />
                                <Tv size={22} className="text-amber-400" />
                            </div>

                            <div className="flex flex-col gap-1.5">
                                <h3 className="text-sm font-black uppercase tracking-wider text-zinc-200 group-hover:text-amber-400 transition-colors">Slideshow Creator</h3>
                                <p className="text-[10px] text-zinc-500 leading-normal font-medium">
                                    Compile high-quality photo slideshows with customizable slide intervals, overlay titles, and background soundtracks.
                                </p>
                            </div>
                        </div>

                        <button className="w-full py-2.5 rounded-xl bg-amber-500/5 group-hover:bg-amber-500 border border-amber-500/20 group-hover:border-amber-400 text-[10px] font-black uppercase tracking-wider text-amber-400 group-hover:text-white transition-all shadow-md group-hover:shadow-amber-500/20">
                            Compile Slideshow
                        </button>
                    </div>

                </div>

                {/* Footer info */}
                <div className="text-[9px] uppercase tracking-wider text-zinc-650 font-black flex gap-6 mt-4 animate-in fade-in duration-1000">
                    <span>Supported Formats: MP4 • WebM • MP3 • PNG • JPEG</span>
                    <span>&bull;</span>
                    <span>Engine: fluent-ffmpeg backend</span>
                </div>

            </div>
        </div>
    );
};
