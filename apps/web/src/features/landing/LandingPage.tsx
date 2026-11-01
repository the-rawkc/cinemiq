import React from 'react';
import { Sparkles, Sliders, Tv } from 'lucide-react';

const YoutubeIcon: React.FC<{ size?: number; className?: string }> = ({ size = 20, className = '' }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className}>
        <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
    </svg>
);

interface LandingPageProps {
    onSelectOption: (option: 'ai-generation' | 'edit-videos' | 'photos-to-video' | 'youtube-shorts') => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({ onSelectOption }) => {
    return (
        <div className="min-h-screen w-full bg-[#050508] bg-radial-gradient text-zinc-100 font-sans flex flex-col items-center justify-start md:justify-center py-8 px-4 sm:px-6 md:py-12 relative overflow-x-hidden select-none">

            {/* Decorative neon blobs in the background */}
            <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-blue-500/10 rounded-full blur-[120px] pointer-events-none" />
            <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-purple-500/10 rounded-full blur-[120px] pointer-events-none" />
            <div className="absolute top-[40%] left-[60%] w-[30%] h-[30%] bg-rose-500/5 rounded-full blur-[125px] pointer-events-none" />

            {/* Main Container */}
            <div className="max-w-6xl w-full flex flex-col gap-8 md:gap-10 z-10 items-center text-center my-auto">

                {/* Logo / Header */}
                <div className="flex flex-col gap-3 sm:gap-4 animate-in fade-in slide-in-from-top-4 duration-700">
                    <div className="inline-flex items-center gap-2 self-center px-3 py-1 rounded-full bg-zinc-900/80 border border-zinc-800 backdrop-blur-md text-[10px] font-black uppercase tracking-wider text-cyan-400">
                        <Sparkles size={11} className="animate-pulse" />
                        <span>Generative Video Suite</span>
                    </div>

                    <div className="flex flex-col gap-2">
                        <h1 className="text-3xl sm:text-4xl md:text-5xl font-black tracking-tight uppercase">
                            <span className="bg-gradient-to-r from-white via-zinc-200 to-zinc-400 bg-clip-text text-transparent">CINEMIQ </span>
                            <span className="bg-gradient-to-r from-cyan-400 via-blue-500 to-indigo-500 bg-clip-text text-transparent">STUDIO</span>
                        </h1>
                        <p className="max-w-xl self-center text-zinc-400 text-[11px] sm:text-[12px] leading-relaxed uppercase tracking-wider font-semibold px-2">
                            AI generation, multi-track timeline orchestration, slideshow creator, and YouTube shorts clipper.
                        </p>
                    </div>
                </div>

                {/* Dashboard 4 Option Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5 w-full max-w-6xl px-1 sm:px-4 animate-in fade-in zoom-in-95 delay-100 duration-700">

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

                    {/* Card 4: YouTube Shorts AI (The 4th Module) */}
                    <div
                        onClick={() => onSelectOption('youtube-shorts')}
                        className="group bg-zinc-950/40 border border-zinc-850 hover:border-rose-500/50 backdrop-blur-md p-6 rounded-2xl flex flex-col justify-between items-center text-center gap-6 cursor-pointer hover:shadow-2xl hover:shadow-rose-500/10 transform hover:-translate-y-1.5 transition-all duration-300"
                    >
                        <div className="flex flex-col items-center gap-4">
                            {/* Icon Container with glowing ring */}
                            <div className="w-14 h-14 rounded-2xl bg-rose-950/30 border border-rose-500/30 flex items-center justify-center group-hover:bg-rose-500/10 group-hover:border-rose-400 transition-all duration-300 relative">
                                <div className="absolute inset-0 rounded-2xl bg-rose-500/20 blur-md opacity-0 group-hover:opacity-100 transition-opacity" />
                                <YoutubeIcon size={24} className="text-rose-400" />
                            </div>

                            <div className="flex flex-col gap-1.5">
                                <h3 className="text-sm font-black uppercase tracking-wider text-zinc-200 group-hover:text-rose-400 transition-colors">Shorts AI Clipper</h3>
                                <p className="text-[10px] text-zinc-500 leading-normal font-medium">
                                    Download YouTube videos, auto-detect viral hooks with AI, format 9:16 vertical shorts, and export or edit in timeline.
                                </p>
                            </div>
                        </div>

                        <button className="w-full py-2.5 rounded-xl bg-rose-500/10 group-hover:bg-rose-500 border border-rose-500/30 group-hover:border-rose-400 text-[10px] font-black uppercase tracking-wider text-rose-400 group-hover:text-white transition-all shadow-md group-hover:shadow-rose-500/25">
                            Launch Shorts Maker
                        </button>
                    </div>

                </div>

                {/* Footer info */}
                <div className="text-[9px] uppercase tracking-wider text-zinc-500 font-bold flex flex-wrap items-center justify-center gap-2 sm:gap-6 mt-2 pb-4 animate-in fade-in duration-1000 text-center">
                    <span>Supported Formats: YouTube • MP4 • WebM • MP3 • PNG • JPEG</span>
                    <span className="hidden sm:inline">&bull;</span>
                    <span>Engines: yt-dlp • OpenAI • fluent-ffmpeg</span>
                </div>

            </div>
        </div>
    );
};
