import React, { useState, useEffect, useRef } from 'react';
import {
  ArrowLeft,
  Scissors,
  Sparkles,
  Play,
  Pause,
  Download,
  Flame,
  CheckCircle2,
  Clock,
  Sliders,
  Upload,
  RefreshCw,
  Copy,
  Check,
  Tv,
  Smartphone,
  Volume2,
  VolumeX,
  Repeat,
  FastForward,
  Rewind,
  Archive,
  Zap,
  Maximize2,
  FolderDown,
  FolderOpen
} from 'lucide-react';
import { API_URL } from '../../config';

const YoutubeIcon: React.FC<{ size?: number; className?: string }> = ({ size = 20, className = '' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
  </svg>
);

interface VideoInfo {
  id: string;
  title: string;
  duration: number;
  thumbnail: string;
  channel: string;
  description: string;
  webpage_url: string;
  view_count?: number;
}

interface ViralClip {
  id: string;
  title: string;
  startTime: number;
  endTime: number;
  duration: number;
  viralityScore: number;
  reason: string;
  hook: string;
  suggestedHeadline: string;
  tags: string[];
}

interface ShortsJob {
  id: string;
  status: 'pending' | 'downloading' | 'analyzing' | 'done' | 'failed';
  progress: number;
  stage: string;
  videoInfo?: VideoInfo;
  videoUrl?: string;
  clips?: ViralClip[];
  error?: string;
}

interface YouTubeShortsPageProps {
  onClose: () => void;
  onLoadProject: (project: any) => void;
}

const DEMO_PRESETS = [
  {
    name: 'Me at the zoo (Classic 19s)',
    url: 'https://www.youtube.com/watch?v=jNQXAC9IVRw',
  },
  {
    name: 'Steve Jobs 2005 Stanford Speech',
    url: 'https://www.youtube.com/watch?v=UF8uR6Z6KLc',
  },
  {
    name: 'TED Talk: Master Procrastinator',
    url: 'https://www.youtube.com/watch?v=arj7oStGLkU',
  },
];

export const YouTubeShortsPage: React.FC<YouTubeShortsPageProps> = ({
  onClose,
  onLoadProject,
}) => {
  const [activeTab, setActiveTab] = useState<'youtube' | 'upload'>('youtube');
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [clipCount, setClipCount] = useState<number>(4);
  const [targetDuration, setTargetDuration] = useState<'auto' | '15-30' | '30-60'>('auto');

  // Job & Processing State
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [job, setJob] = useState<ShortsJob | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Selected Clip & Customizations
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [aspectRatio, setAspectRatio] = useState<'9:16-blur' | '9:16-crop' | '16:9-fit' | 'original'>('9:16-blur');
  const [customHeadlines, setCustomHeadlines] = useState<Record<string, string>>({});
  const [clipTrims, setClipTrims] = useState<Record<string, { start: number; end: number }>>({});
  const [copiedTag, setCopiedTag] = useState(false);
  const [mobileViewTab, setMobileViewTab] = useState<'clips' | 'preview'>('clips');

  // Rendering State
  const [isRendering, setIsRendering] = useState(false);
  const [renderProgressMsg, setRenderProgressMsg] = useState('');
  const [renderedDownloadUrl, setRenderedDownloadUrl] = useState<string | null>(null);

  // Batch Export All State (Single click download all)
  const [isBatchRendering, setIsBatchRendering] = useState(false);
  const [batchProgressMsg, setBatchProgressMsg] = useState('');
  const [batchDownloadUrl, setBatchDownloadUrl] = useState<string | null>(null);
  const [renderingClipId, setRenderingClipId] = useState<string | null>(null);

  // Direct Folder Export State (No ZIP - Saves directly to directory)
  const [targetResolution, setTargetResolution] = useState<'720p' | '1080p'>('720p');
  const [isFolderExporting, setIsFolderExporting] = useState(false);
  const [folderProgressMsg, setFolderProgressMsg] = useState('');
  const [exportedFolderPath, setExportedFolderPath] = useState<string | null>(null);
  const [exportedClips, setExportedClips] = useState<Array<{ title: string; filename: string; url: string; duration: number }>>([]);

  // Video Preview & Player Controls State
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentPlayTime, setCurrentPlayTime] = useState(0);
  const [volume, setVolume] = useState<number>(1);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);
  const [isLooping, setIsLooping] = useState<boolean>(true);

  // Active clip helper
  const clips = job?.clips || [];
  const activeClip = clips.find((c) => c.id === selectedClipId) || clips[0] || null;

  // Active clip current start & end (with local trims applied)
  const currentStart = activeClip
    ? clipTrims[activeClip.id]?.start ?? activeClip.startTime
    : 0;
  const currentEnd = activeClip
    ? clipTrims[activeClip.id]?.end ?? activeClip.endTime
    : 30;
  const currentHeadline = activeClip
    ? customHeadlines[activeClip.id] ?? activeClip.suggestedHeadline
    : '';

  const clipDuration = Math.max(0.1, currentEnd - currentStart);
  const currentProgressSec = Math.max(0, Math.min(clipDuration, currentPlayTime - currentStart));

  // Select first clip when clips arrive
  useEffect(() => {
    if (clips.length > 0 && !selectedClipId) {
      setSelectedClipId(clips[0].id);
    }
  }, [clips, selectedClipId]);

  // Sync Video Playback for active clip
  useEffect(() => {
    if (!videoRef.current || !activeClip) return;
    const v = videoRef.current;

    v.currentTime = currentStart;
    setCurrentPlayTime(currentStart);
    v.volume = isMuted ? 0 : volume;
    v.playbackRate = playbackSpeed;

    const handleTimeUpdate = () => {
      setCurrentPlayTime(v.currentTime);
      if (v.currentTime >= currentEnd) {
        if (isLooping) {
          v.currentTime = currentStart;
          v.play().catch(() => {});
        } else {
          v.pause();
          setIsPlaying(false);
          v.currentTime = currentStart;
        }
      }
    };

    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);

    v.addEventListener('timeupdate', handleTimeUpdate);
    v.addEventListener('play', handlePlay);
    v.addEventListener('pause', handlePause);

    return () => {
      v.removeEventListener('timeupdate', handleTimeUpdate);
      v.removeEventListener('play', handlePlay);
      v.removeEventListener('pause', handlePause);
    };
  }, [selectedClipId, currentStart, currentEnd, isLooping]);

  // Poll Job Status if active
  useEffect(() => {
    if (!activeJobId || !isAnalyzing) return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`${API_URL}/api/shorts/status/${activeJobId}`);
        const contentType = res.headers.get('content-type') || '';
        if (!res.ok || !contentType.includes('application/json')) return;
        const data = await res.json();

        if (data.success && data.job) {
          setJob(data.job);
          if (data.job.status === 'done') {
            setIsAnalyzing(false);
            clearInterval(interval);
          } else if (data.job.status === 'failed') {
            setIsAnalyzing(false);
            setErrorMessage(data.job.error || 'Analysis failed. Please try a different video.');
            clearInterval(interval);
          }
        }
      } catch (err: any) {
        console.error('Job polling error:', err);
      }
    }, 1500);

    return () => clearInterval(interval);
  }, [activeJobId, isAnalyzing]);

  // Trigger YouTube Analysis
  const handleAnalyzeYouTube = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!youtubeUrl.trim()) {
      setErrorMessage('Please enter a valid YouTube URL');
      return;
    }

    setErrorMessage(null);
    setIsAnalyzing(true);
    setRenderedDownloadUrl(null);
    setJob(null);

    try {
      const res = await fetch(`${API_URL}/api/shorts/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: youtubeUrl.trim(),
          clipCount,
          targetDuration,
        }),
      });

      const contentType = res.headers.get('content-type') || '';
      if (!res.ok) {
        let errorMsg = `Backend returned status ${res.status}`;
        if (contentType.includes('application/json')) {
          const errData = await res.json().catch(() => null);
          if (errData?.error) errorMsg = errData.error;
        } else {
          errorMsg = `Backend API at ${API_URL} returned status ${res.status}. If deployed on Render, please allow the latest backend deployment to finish building.`;
        }
        throw new Error(errorMsg);
      }

      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error || 'Failed to start video processing');
      }

      setActiveJobId(data.jobId);
    } catch (err: any) {
      console.error('Analyze error:', err);
      setIsAnalyzing(false);
      setErrorMessage(err.message || 'Failed to connect to backend service.');
    }
  };

  // Handle Local File Upload
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setErrorMessage(null);
    setIsAnalyzing(true);
    setRenderedDownloadUrl(null);
    setJob(null);

    const formData = new FormData();
    formData.append('video', file);

    try {
      const res = await fetch(`${API_URL}/api/shorts/upload-local`, {
        method: 'POST',
        body: formData,
      });

      const contentType = res.headers.get('content-type') || '';
      if (!res.ok) {
        let errorMsg = `Upload returned status ${res.status}`;
        if (contentType.includes('application/json')) {
          const errData = await res.json().catch(() => null);
          if (errData?.error) errorMsg = errData.error;
        } else {
          errorMsg = `Backend API at ${API_URL} returned status ${res.status}.`;
        }
        throw new Error(errorMsg);
      }

      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error || 'Failed to upload video');
      }

      setJob({
        id: data.jobId,
        status: 'done',
        progress: 100,
        stage: 'Analysis complete!',
        videoInfo: {
          id: data.jobId,
          title: file.name,
          duration: 60,
          thumbnail: '',
          channel: 'Local Upload',
          description: '',
          webpage_url: data.videoUrl,
        },
        videoUrl: data.videoUrl,
        clips: data.clips,
      });
      setIsAnalyzing(false);
    } catch (err: any) {
      console.error('Upload error:', err);
      setIsAnalyzing(false);
      setErrorMessage(err.message || 'Upload processing failed.');
    }
  };

  // Toggle Video Play/Pause
  const togglePlay = () => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
      setIsPlaying(false);
    } else {
      videoRef.current.play();
      setIsPlaying(true);
    }
  };

  // Helper to trigger fast direct file download in browser
  const triggerBrowserDownload = (url: string, filename?: string) => {
    const a = document.createElement('a');
    a.href = url;
    if (filename) a.download = filename;
    a.target = '_blank';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  // Video Playing Control Handlers
  const handleSeek = (newSec: number) => {
    if (!videoRef.current) return;
    const target = currentStart + Math.max(0, Math.min(clipDuration, newSec));
    videoRef.current.currentTime = target;
    setCurrentPlayTime(target);
  };

  const handleSkip = (seconds: number) => {
    if (!videoRef.current) return;
    const target = Math.max(currentStart, Math.min(currentEnd, videoRef.current.currentTime + seconds));
    videoRef.current.currentTime = target;
    setCurrentPlayTime(target);
  };

  const handleToggleSpeed = () => {
    const speeds = [0.75, 1, 1.25, 1.5, 2];
    const nextIdx = (speeds.indexOf(playbackSpeed) + 1) % speeds.length;
    const nextSpeed = speeds[nextIdx];
    setPlaybackSpeed(nextSpeed);
    if (videoRef.current) {
      videoRef.current.playbackRate = nextSpeed;
    }
  };

  const handleToggleMute = () => {
    if (!videoRef.current) return;
    const next = !isMuted;
    videoRef.current.muted = next;
    setIsMuted(next);
  };

  const handleVolumeChange = (newVol: number) => {
    if (!videoRef.current) return;
    videoRef.current.volume = newVol;
    setVolume(newVol);
    if (newVol > 0 && isMuted) {
      videoRef.current.muted = false;
      setIsMuted(false);
    }
  };

  const handleFullscreen = () => {
    if (!videoRef.current) return;
    if (videoRef.current.requestFullscreen) {
      videoRef.current.requestFullscreen();
    }
  };

  // Download Single Clip directly from list card in 1 click
  const handleDownloadSingleClip = async (clip: ViralClip) => {
    if (!job?.videoUrl) return;

    setRenderingClipId(clip.id);
    try {
      const trim = clipTrims[clip.id];
      const startTime = trim?.start ?? clip.startTime;
      const endTime = trim?.end ?? clip.endTime;
      const headlineText = customHeadlines[clip.id] ?? clip.suggestedHeadline ?? '';

      const res = await fetch(`${API_URL}/api/shorts/render-clip`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceVideoUrl: job.videoUrl,
          startTime,
          endTime,
          aspectRatio,
          headlineText,
          targetResolution,
        }),
      });

      const contentType = res.headers.get('content-type') || '';
      if (!res.ok) {
        let errorMsg = `Download failed (${res.status})`;
        if (contentType.includes('application/json')) {
          const errData = await res.json().catch(() => null);
          if (errData?.error) errorMsg = errData.error;
        }
        throw new Error(errorMsg);
      }

      const data = await res.json();
      if (!data.success || !data.clipUrl) {
        throw new Error(data.error || 'Rendering clip failed');
      }

      const fullUrl = `${API_URL}${data.clipUrl}`;
      setRenderedDownloadUrl(fullUrl);
      setSelectedClipId(clip.id);
      const safeTitle = (clip.title || 'short').replace(/[^a-zA-Z0-9_\-]/g, '_');
      triggerBrowserDownload(fullUrl, `${safeTitle}.mp4`);
    } catch (err: any) {
      console.error('Single download error:', err);
      setErrorMessage(err.message || 'Failed to download clip.');
    } finally {
      setRenderingClipId(null);
    }
  };

  // Single Click to Download ALL Clips at once in a ZIP bundle
  const handleDownloadAllZip = async () => {
    if (!job?.id || clips.length === 0) return;

    setIsBatchRendering(true);
    setBatchProgressMsg(`Fast rendering and packaging all ${clips.length} clips into ZIP...`);
    setBatchDownloadUrl(null);
    setErrorMessage(null);

    try {
      const res = await fetch(`${API_URL}/api/shorts/download-all-zip`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobId: job.id,
          aspectRatio,
          targetResolution,
          customHeadlines,
          clipTrims,
        }),
      });

      const contentType = res.headers.get('content-type') || '';
      if (!res.ok) {
        let errorMsg = `Batch export returned status ${res.status}`;
        if (contentType.includes('application/json')) {
          const errData = await res.json().catch(() => null);
          if (errData?.error) errorMsg = errData.error;
        } else {
          errorMsg = `Backend API returned status ${res.status}.`;
        }
        throw new Error(errorMsg);
      }

      const data = await res.json();
      if (!data.success || !data.zipUrl) {
        throw new Error(data.error || 'Failed to generate ZIP bundle');
      }

      const fullZipUrl = `${API_URL}${data.zipUrl}`;
      setBatchDownloadUrl(fullZipUrl);
      setBatchProgressMsg(`Complete! All ${data.totalClips} shorts packaged in ZIP.`);
      triggerBrowserDownload(fullZipUrl, data.zipFilename || `cinemiq-shorts-${job.id}.zip`);
    } catch (err: any) {
      console.error('Batch export error:', err);
      setErrorMessage(err.message || 'Failed to download all clips at once.');
    } finally {
      setIsBatchRendering(false);
    }
  };

  // Render & Download the Short via FFmpeg
  const handleRenderShort = async () => {
    if (!activeClip || !job?.videoUrl) return;

    setIsRendering(true);
    setRenderProgressMsg('FFmpeg is rendering vertical 9:16 short with headline...');
    setRenderedDownloadUrl(null);

    try {
      const res = await fetch(`${API_URL}/api/shorts/render-clip`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceVideoUrl: job.videoUrl,
          startTime: currentStart,
          endTime: currentEnd,
          aspectRatio,
          headlineText: currentHeadline,
          targetResolution,
        }),
      });

      const contentType = res.headers.get('content-type') || '';
      if (!res.ok) {
        let errorMsg = `Rendering returned status ${res.status}`;
        if (contentType.includes('application/json')) {
          const errData = await res.json().catch(() => null);
          if (errData?.error) errorMsg = errData.error;
        } else {
          errorMsg = `Backend API at ${API_URL} returned status ${res.status}.`;
        }
        throw new Error(errorMsg);
      }

      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error || 'Rendering clip failed');
      }

      const fullUrl = `${API_URL}${data.clipUrl}`;
      setRenderedDownloadUrl(fullUrl);
      const safeTitle = (activeClip.title || 'short').replace(/[^a-zA-Z0-9_\-]/g, '_');
      triggerBrowserDownload(fullUrl, `${safeTitle}.mp4`);
    } catch (err: any) {
      console.error('Render error:', err);
      setErrorMessage(err.message || 'Failed to render short.');
    } finally {
      setIsRendering(false);
    }
  };

  // 1-Click Save Directly to a Folder on User's Computer (Zero ZIP)
  const handleSaveDirectlyToFolder = async () => {
    if (!job?.id || clips.length === 0) return;

    setIsFolderExporting(true);
    setFolderProgressMsg('Preparing folder export and rendering clips...');
    setErrorMessage(null);

    try {
      // Check if browser supports showDirectoryPicker (Chrome, Edge, Brave, Opera)
      let dirHandle: any = null;
      const hasDirectoryPicker = typeof (window as any).showDirectoryPicker === 'function';
      if (hasDirectoryPicker) {
        try {
          dirHandle = await (window as any).showDirectoryPicker({
            mode: 'readwrite',
            startIn: 'downloads',
          });
        } catch (pickErr: any) {
          if (pickErr.name === 'AbortError') {
            setIsFolderExporting(false);
            return; // user cancelled picker
          }
          console.warn('Directory picker fallback:', pickErr);
        }
      }

      setFolderProgressMsg('Rendering all shorts in ultrafast mode...');
      const res = await fetch(`${API_URL}/api/shorts/export-folder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobId: job.id,
          aspectRatio,
          targetResolution,
          customHeadlines,
          clipTrims,
        }),
      });

      const contentType = res.headers.get('content-type') || '';
      if (!res.ok) {
        let errorMsg = `Folder export failed (${res.status})`;
        if (contentType.includes('application/json')) {
          const errData = await res.json().catch(() => null);
          if (errData?.error) errorMsg = errData.error;
        }
        throw new Error(errorMsg);
      }

      const data = await res.json();
      if (!data.success || !Array.isArray(data.clips)) {
        throw new Error(data.error || 'Failed to export folder');
      }

      setExportedFolderPath(data.folderPath);
      setExportedClips(data.clips);

      if (dirHandle) {
        // Stream each MP4 file directly into the user's picked directory
        for (let i = 0; i < data.clips.length; i++) {
          const item = data.clips[i];
          setFolderProgressMsg(`Saving "${item.filename}" (${i + 1}/${data.clips.length}) directly into folder...`);
          const fileRes = await fetch(`${API_URL}${item.url}`);
          const fileBlob = await fileRes.blob();
          const fileHandle = await dirHandle.getFileHandle(item.filename, { create: true });
          const writable = await fileHandle.createWritable();
          await writable.write(fileBlob);
          await writable.close();
        }
        setFolderProgressMsg(`✅ All ${data.clips.length} shorts saved directly into your folder!`);
      } else {
        // Fallback for browsers without File System Access API: trigger direct loose file downloads
        setFolderProgressMsg(`Downloading ${data.clips.length} loose MP4 files directly to your downloads...`);
        for (let i = 0; i < data.clips.length; i++) {
          const item = data.clips[i];
          triggerBrowserDownload(`${API_URL}${item.url}`, item.filename);
          await new Promise((r) => setTimeout(r, 350));
        }
        setFolderProgressMsg(`✅ All ${data.clips.length} loose shorts downloaded directly!`);
      }
    } catch (err: any) {
      console.error('Folder export error:', err);
      setErrorMessage(err.message || 'Failed to save to folder.');
    } finally {
      setIsFolderExporting(false);
    }
  };

  // Open the local directory directly in Windows File Explorer / OS file manager
  const handleOpenServerFolder = async () => {
    try {
      const res = await fetch(`${API_URL}/api/shorts/open-folder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobId: job?.id,
          folderPath: exportedFolderPath,
        }),
      });
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error || 'Could not open folder on server');
      }
    } catch (err: any) {
      console.error('Open folder error:', err);
      setErrorMessage('Could not open folder directly. Files are stored at: ' + (exportedFolderPath || 'uploads/shorts/'));
    }
  };

  // Load into Cinemiq Multitrack Timeline Editor
  const handleSendToTimeline = () => {
    if (!activeClip || !job?.videoUrl) return;

    const videoFullUrl = `${API_URL}${job.videoUrl}`;
    const duration = Math.max(1, currentEnd - currentStart);

    const project = {
      id: `shorts-${Date.now()}`,
      name: `${activeClip.title.substring(0, 24)} (Short)`,
      resolution: { width: 1080, height: 1920 }, // 9:16 vertical resolution
      fps: 30,
      tracks: [
        { id: 'v2', type: 'video', name: 'Overlay / Title Track', muted: false, locked: false, order: 2 },
        { id: 'v1', type: 'video', name: 'Short Video Track', muted: false, locked: false, order: 1 },
        { id: 'a1', type: 'audio', name: 'Audio Track', muted: false, locked: false, order: 3 },
      ],
      clips: [
        {
          id: `clip-${Date.now()}-1`,
          trackId: 'v1',
          name: activeClip.title,
          type: 'video',
          source: videoFullUrl,
          start: currentStart,
          end: currentEnd,
          offset: 0,
          duration: duration,
        },
        ...(currentHeadline
          ? [
              {
                id: `clip-text-${Date.now()}`,
                trackId: 'v2',
                name: 'Headline',
                type: 'text',
                source: '',
                start: 0,
                end: duration,
                offset: 0,
                duration: duration,
                textConfig: {
                  content: currentHeadline,
                  fontSize: 36,
                  color: '#ffffff',
                },
              },
            ]
          : []),
      ],
    };

    onLoadProject(project);
  };

  // Copy hashtags helper
  const handleCopyTags = (tags: string[]) => {
    navigator.clipboard.writeText(tags.join(' '));
    setCopiedTag(true);
    setTimeout(() => setCopiedTag(false), 2000);
  };

  // Helper formatting for seconds to mm:ss
  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <div className="min-h-screen w-full bg-[#07070b] text-zinc-100 font-sans flex flex-col select-none overflow-x-hidden">
      {/* 1. Header Navigation Bar */}
      <header className="h-14 border-b border-zinc-800/80 bg-zinc-950/80 backdrop-blur-md px-3 sm:px-6 flex items-center justify-between z-20 sticky top-0">
        <div className="flex items-center gap-2 sm:gap-4">
          <button
            onClick={onClose}
            className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-300 hover:text-white hover:border-zinc-700 text-xs font-semibold transition-all active:scale-95 shrink-0"
          >
            <ArrowLeft size={14} />
            <span className="hidden sm:inline">Dashboard</span>
            <span className="sm:hidden">Back</span>
          </button>

          <div className="h-4 w-[1px] bg-zinc-800 shrink-0" />

          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-rose-500/20 border border-rose-500/40 flex items-center justify-center text-rose-400">
              <YoutubeIcon size={16} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-sm font-black uppercase tracking-wider text-white">
                  YouTube Shorts AI
                </h1>
                <span className="text-[9px] bg-rose-500/20 text-rose-300 border border-rose-500/30 px-1.5 py-0.5 rounded font-black tracking-widest">
                  MODULE 4
                </span>
              </div>
              <p className="text-[10px] text-zinc-400 font-medium hidden sm:block">
                Auto-download YouTube videos, extract high-retention highlights, and format 9:16 Shorts
              </p>
            </div>
          </div>
        </div>

        {/* System Capabilities indicator */}
        <div className="flex items-center gap-3">
          <div className="hidden md:flex items-center gap-2 text-[10px] font-bold text-zinc-400 bg-zinc-900/60 px-3 py-1 rounded-full border border-zinc-800">
            <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>yt-dlp Engine Active</span>
            <span className="text-zinc-600">•</span>
            <span>FFmpeg 9:16 Processor</span>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-3 sm:p-5 md:p-6 flex flex-col gap-5 sm:gap-6">
        {/* Error Banner */}
        {errorMessage && (
          <div className="p-3.5 rounded-xl bg-red-950/40 border border-red-500/40 text-red-300 text-xs flex items-center justify-between animate-in fade-in">
            <span>{errorMessage}</span>
            <button
              onClick={() => setErrorMessage(null)}
              className="text-red-400 hover:text-white font-bold ml-4"
            >
              ✕
            </button>
          </div>
        )}

        {/* 2. Video Input Card (Top Area) */}
        <section className="bg-zinc-950/70 border border-zinc-850 rounded-2xl p-4 sm:p-5 md:p-6 backdrop-blur-md shadow-2xl relative overflow-hidden">
          {/* Subtle background glow */}
          <div className="absolute top-0 right-0 w-80 h-80 bg-rose-500/5 rounded-full blur-3xl pointer-events-none" />

          <div className="flex flex-col gap-4 relative z-10">
            {/* Input Tabs: YouTube URL vs Local Upload */}
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center p-1 bg-zinc-900/90 rounded-xl border border-zinc-800">
                <button
                  onClick={() => setActiveTab('youtube')}
                  className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    activeTab === 'youtube'
                      ? 'bg-rose-500 text-white shadow-lg shadow-rose-500/20'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  <YoutubeIcon size={14} />
                  <span>YouTube URL</span>
                </button>
                <button
                  onClick={() => setActiveTab('upload')}
                  className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    activeTab === 'upload'
                      ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/20'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  <Upload size={14} />
                  <span>Upload Video</span>
                </button>
              </div>

              {/* Sample Demos */}
              {activeTab === 'youtube' && (
                <div className="flex items-center gap-1.5 text-[11px] text-zinc-400">
                  <span className="font-semibold text-zinc-500">Quick Test:</span>
                  {DEMO_PRESETS.map((demo, idx) => (
                    <button
                      key={idx}
                      onClick={() => setYoutubeUrl(demo.url)}
                      className="px-2 py-0.5 rounded bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 text-zinc-300 text-[10px] transition-all"
                    >
                      {demo.name}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Tab 1: YouTube URL Input & Options */}
            {activeTab === 'youtube' ? (
              <form onSubmit={handleAnalyzeYouTube} className="flex flex-col gap-4">
                <div className="flex flex-col md:flex-row gap-3">
                  <div className="relative flex-1">
                    <input
                      type="text"
                      placeholder="Paste YouTube video link (e.g. https://www.youtube.com/watch?v=...)"
                      value={youtubeUrl}
                      onChange={(e) => setYoutubeUrl(e.target.value)}
                      disabled={isAnalyzing}
                      className="w-full bg-zinc-900/90 border border-zinc-800 rounded-xl px-4 py-3 text-xs md:text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-rose-500/70 focus:ring-1 focus:ring-rose-500/50 transition-all pl-10"
                    />
                    <YoutubeIcon
                      size={18}
                      className="absolute left-3.5 top-3.5 text-zinc-500"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isAnalyzing || !youtubeUrl.trim()}
                    className="px-6 py-3 rounded-xl bg-gradient-to-r from-rose-500 to-red-600 hover:from-rose-400 hover:to-red-500 disabled:opacity-50 text-white text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg shadow-rose-500/20 active:scale-95 transition-all"
                  >
                    {isAnalyzing ? (
                      <>
                        <RefreshCw size={14} className="animate-spin" />
                        <span>Processing...</span>
                      </>
                    ) : (
                      <>
                        <Scissors size={15} />
                        <span>Analyze & Generate Shorts</span>
                      </>
                    )}
                  </button>
                </div>

                {/* Additional Generation Settings */}
                <div className="flex items-center flex-wrap gap-4 text-xs pt-1 text-zinc-400">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-zinc-400 text-[11px] uppercase tracking-wider">
                      Clip Count:
                    </span>
                    <div className="flex items-center gap-1 flex-wrap">
                      {[3, 6, 10, 15, 20].map((num) => (
                        <button
                          key={num}
                          type="button"
                          onClick={() => setClipCount(num)}
                          className={`px-2.5 py-1 rounded text-[11px] font-bold border transition-all ${
                            clipCount === num
                              ? 'bg-rose-500/20 text-rose-400 border-rose-500/50 shadow-sm shadow-rose-500/20'
                              : 'bg-zinc-900 border-zinc-800 hover:bg-zinc-850 text-zinc-400'
                          }`}
                        >
                          {num}
                        </button>
                      ))}
                      <div className="flex items-center gap-1 ml-1">
                        <input
                          type="number"
                          min="1"
                          max="25"
                          value={clipCount}
                          onChange={(e) =>
                            setClipCount(
                              Math.max(1, Math.min(25, parseInt(e.target.value, 10) || 1))
                            )
                          }
                          className="w-12 bg-zinc-900 border border-zinc-800 rounded px-1.5 py-1 text-[11px] text-center font-mono text-white focus:outline-none focus:border-rose-500"
                        />
                        <span className="text-[10px] text-zinc-500 font-semibold">Clips</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-zinc-400 text-[11px] uppercase tracking-wider">
                      Target Length:
                    </span>
                    <div className="flex gap-1">
                      {[
                        { id: 'auto', label: 'Auto (15-60s)' },
                        { id: '15-30', label: 'Snappy (15-30s)' },
                        { id: '30-60', label: 'In-Depth (30-60s)' },
                      ].map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => setTargetDuration(item.id as any)}
                          className={`px-2.5 py-1 rounded text-[11px] font-bold border transition-all ${
                            targetDuration === item.id
                              ? 'bg-rose-500/20 text-rose-400 border-rose-500/50'
                              : 'bg-zinc-900 border-zinc-800 hover:bg-zinc-850 text-zinc-400'
                          }`}
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </form>
            ) : (
              /* Tab 2: Local Video Upload */
              <div className="border-2 border-dashed border-zinc-800 hover:border-purple-500/50 rounded-2xl p-8 flex flex-col items-center justify-center gap-3 bg-zinc-900/30 transition-all text-center">
                <div className="w-12 h-12 rounded-2xl bg-purple-500/10 border border-purple-500/30 flex items-center justify-center text-purple-400">
                  <Upload size={22} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-zinc-200">
                    Upload an MP4 or WebM video file
                  </h3>
                  <p className="text-[11px] text-zinc-500 mt-1">
                    AI will automatically extract high-retention highlights and prepare vertical shorts
                  </p>
                </div>
                <label className="cursor-pointer px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold transition-all shadow-lg shadow-purple-600/20 active:scale-95">
                  <span>Browse Video File</span>
                  <input
                    type="file"
                    accept="video/mp4,video/webm"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                </label>
              </div>
            )}

            {/* Active Analysis Progress Bar */}
            {isAnalyzing && (
              <div className="mt-2 p-4 rounded-xl bg-zinc-900/90 border border-rose-500/30 flex flex-col gap-2.5 animate-in fade-in">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2 text-rose-400 font-bold">
                    <Sparkles size={14} className="animate-spin" />
                    <span>{job?.stage || 'Downloading and analyzing video...'}</span>
                  </div>
                  <span className="font-mono text-zinc-400">{job?.progress || 15}%</span>
                </div>
                <div className="w-full h-2 rounded-full bg-zinc-800 overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-rose-500 to-amber-500 transition-all duration-300 rounded-full"
                    style={{ width: `${Math.max(10, job?.progress || 15)}%` }}
                  />
                </div>
                <p className="text-[10px] text-zinc-500">
                  Powered by yt-dlp stream extractor, subtitle parsing, and AI hook detection.
                </p>
              </div>
            )}
          </div>
        </section>

        {/* 3. Results Section: Detected Clips & Interactive Preview Player */}
        {job?.status === 'done' && clips.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 md:gap-6 items-start">
            {/* Mobile View Toggle Tabs (Clips List vs 9:16 Phone Preview) */}
            <div className="flex lg:hidden items-center p-1 bg-zinc-900/90 rounded-xl border border-zinc-800 w-full col-span-1">
              <button
                type="button"
                onClick={() => setMobileViewTab('clips')}
                className={`flex-1 py-2 text-center text-xs font-bold rounded-lg transition-all ${
                  mobileViewTab === 'clips'
                    ? 'bg-rose-500 text-white shadow-md'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                Clips Feed ({clips.length})
              </button>
              <button
                type="button"
                onClick={() => setMobileViewTab('preview')}
                className={`flex-1 py-2 text-center text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                  mobileViewTab === 'preview'
                    ? 'bg-rose-500 text-white shadow-md'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                <Smartphone size={13} />
                <span>9:16 Phone Preview</span>
              </button>
            </div>

            {/* Left 7 Columns: Video Overview & Detected Clips List */}
            <div className={`flex-col gap-4 ${mobileViewTab === 'preview' ? 'hidden lg:flex lg:col-span-7' : 'flex lg:col-span-7'}`}>
              {/* Video Info Header Card */}
              {job.videoInfo && (
                <div className="p-4 rounded-xl bg-zinc-950/50 border border-zinc-850 flex items-center gap-4">
                  {job.videoInfo.thumbnail ? (
                    <img
                      src={job.videoInfo.thumbnail}
                      alt={job.videoInfo.title}
                      className="w-24 h-16 object-cover rounded-lg border border-zinc-800"
                    />
                  ) : (
                    <div className="w-24 h-16 bg-zinc-900 rounded-lg flex items-center justify-center text-zinc-600">
                      <Tv size={20} />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-850 text-zinc-400 font-bold uppercase">
                        {job.videoInfo.channel}
                      </span>
                      <span className="text-[10px] text-zinc-500">
                        {formatTime(job.videoInfo.duration)} total duration
                      </span>
                    </div>
                    <h2 className="text-xs md:text-sm font-bold text-zinc-200 truncate mt-1">
                      {job.videoInfo.title}
                    </h2>
                    <p className="text-[10px] text-emerald-400 font-medium mt-0.5 flex items-center gap-1">
                      <CheckCircle2 size={11} />
                      <span>
                        {clips.length} viral shorts extracted across timeline
                        {job.videoInfo.duration > 1800 ? ' • Long-Form Video Optimized' : ''}
                      </span>
                    </p>
                  </div>
                </div>
              )}

              {/* Batch Export All Clips Hero Banner with Direct Folder & ZIP */}
              <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-blue-950/70 via-zinc-900 to-indigo-950/70 border border-blue-500/40 flex flex-col gap-3.5 shadow-xl shadow-blue-950/40">
                <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-blue-500/20 border border-blue-500/40 flex items-center justify-center text-blue-400 shrink-0">
                      <FolderDown size={22} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-xs font-black uppercase tracking-wider text-blue-300">
                          Export All {clips.length} Shorts
                        </h3>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30 font-bold">
                          Direct Folder or ZIP
                        </span>
                      </div>
                      <p className="text-[10px] text-zinc-400 mt-0.5">
                        Save all clips directly into a folder on your computer without extracting ZIP, or download as an archive.
                      </p>
                    </div>
                  </div>

                  {/* Speed & Resolution Switcher */}
                  <div className="flex items-center gap-1.5 p-1 rounded-xl bg-zinc-950/80 border border-zinc-800 shrink-0 text-[11px]">
                    <span className="text-zinc-500 font-bold px-2 text-[10px] uppercase">Quality:</span>
                    <button
                      type="button"
                      onClick={() => setTargetResolution('720p')}
                      className={`px-2.5 py-1 rounded-lg font-bold transition-all ${
                        targetResolution === '720p'
                          ? 'bg-blue-600 text-white shadow-sm'
                          : 'text-zinc-400 hover:text-white'
                      }`}
                      title="Renders in ~2s per clip (Native 9:16 HD - 3MB/clip)"
                    >
                      ⚡ Fast 720p HD (3x Speed)
                    </button>
                    <button
                      type="button"
                      onClick={() => setTargetResolution('1080p')}
                      className={`px-2.5 py-1 rounded-lg font-bold transition-all ${
                        targetResolution === '1080p'
                          ? 'bg-blue-600 text-white shadow-sm'
                          : 'text-zinc-400 hover:text-white'
                      }`}
                      title="Full HD (1080x1920)"
                    >
                      1080p FHD
                    </button>
                  </div>
                </div>

                {/* Primary Export Action Buttons */}
                <div className="flex items-center flex-wrap gap-2.5 pt-1">
                  {/* Option 1: Direct Folder Save (No ZIP) */}
                  <button
                    type="button"
                    onClick={handleSaveDirectlyToFolder}
                    disabled={isFolderExporting}
                    className="flex-1 sm:flex-none px-5 py-2.5 rounded-xl bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-400 hover:to-indigo-500 disabled:opacity-50 text-white font-black uppercase text-xs tracking-wider flex items-center justify-center gap-2 shadow-lg shadow-blue-500/25 active:scale-95 transition-all cursor-pointer"
                  >
                    {isFolderExporting ? (
                      <>
                        <RefreshCw size={14} className="animate-spin text-white" />
                        <span>{folderProgressMsg || 'Saving directly into folder...'}</span>
                      </>
                    ) : (
                      <>
                        <FolderDown size={15} />
                        <span>📁 Save All ({clips.length}) Directly to Folder (No ZIP)</span>
                      </>
                    )}
                  </button>

                  {/* Option 2: Download All as Single ZIP */}
                  <button
                    type="button"
                    onClick={handleDownloadAllZip}
                    disabled={isBatchRendering}
                    className="flex-1 sm:flex-none px-4 py-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-750 hover:border-zinc-700 disabled:opacity-50 text-zinc-300 hover:text-white font-bold text-xs tracking-wider flex items-center justify-center gap-2 active:scale-95 transition-all cursor-pointer"
                  >
                    {isBatchRendering ? (
                      <>
                        <RefreshCw size={14} className="animate-spin text-zinc-400" />
                        <span>{batchProgressMsg || 'Packaging ZIP...'}</span>
                      </>
                    ) : (
                      <>
                        <Archive size={14} className="text-emerald-400" />
                        <span>Download as ZIP Archive</span>
                      </>
                    )}
                  </button>

                  {/* Option 3: Open Output Folder in Windows File Explorer */}
                  {exportedFolderPath && (
                    <button
                      type="button"
                      onClick={handleOpenServerFolder}
                      className="px-4 py-2.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/50 text-emerald-300 font-bold text-xs flex items-center gap-2 active:scale-95 transition-all cursor-pointer"
                      title="Open folder directly in Windows Explorer"
                    >
                      <FolderOpen size={14} />
                      <span>Open in File Explorer 📂</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Folder Export Success Alert */}
              {exportedClips.length > 0 && (
                <div className="p-3.5 rounded-xl bg-blue-950/50 border border-blue-500/50 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs animate-in fade-in">
                  <div className="flex items-center gap-2 text-blue-300 font-bold truncate">
                    <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
                    <span className="truncate">
                      {folderProgressMsg || `All ${exportedClips.length} clips exported to folder successfully!`}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={handleOpenServerFolder}
                      className="px-3 py-1.5 rounded-lg bg-blue-500 hover:bg-blue-400 text-white font-bold text-[10px] tracking-wider transition-all"
                    >
                      Show Folder on Computer
                    </button>
                  </div>
                </div>
              )}

              {/* Ready ZIP Download Alert */}
              {batchDownloadUrl && (
                <div className="p-3.5 rounded-xl bg-emerald-950/50 border border-emerald-500/50 flex items-center justify-between gap-3 text-xs animate-in fade-in">
                  <div className="flex items-center gap-2 text-emerald-400 font-bold truncate">
                    <CheckCircle2 size={16} />
                    <span>{batchProgressMsg || 'ZIP Archive Ready!'}</span>
                  </div>
                  <a
                    href={batchDownloadUrl}
                    download={`cinemiq-shorts-${job.id}.zip`}
                    target="_blank"
                    rel="noreferrer"
                    className="px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black font-black uppercase text-[10px] tracking-wider transition-all"
                  >
                    Download ZIP Again
                  </a>
                </div>
              )}

              {/* Clips List */}
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-black uppercase tracking-wider text-zinc-400">
                    AI Highlight Clips ({clips.length})
                  </h3>
                  <span className="text-[10px] text-zinc-500">
                    Ranked by predicted audience retention
                  </span>
                </div>

                {/* Quick jump navigator for 10-20 clips */}
                {clips.length > 6 && (
                  <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-[10px]">
                    <span className="text-zinc-500 font-bold shrink-0">Jump to:</span>
                    {clips.map((c, idx) => (
                      <button
                        key={c.id}
                        onClick={() => setSelectedClipId(c.id)}
                        className={`px-2 py-0.5 rounded font-mono font-bold shrink-0 transition-all ${
                          (selectedClipId === c.id || (!selectedClipId && idx === 0))
                            ? 'bg-rose-500 text-white shadow-sm'
                            : 'bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white'
                        }`}
                      >
                        #{idx + 1}
                      </button>
                    ))}
                  </div>
                )}

                {clips.map((clip, index) => {
                  const isSelected = activeClip?.id === clip.id;
                  const trim = clipTrims[clip.id];
                  const clipStart = trim?.start ?? clip.startTime;
                  const clipEnd = trim?.end ?? clip.endTime;
                  const duration = Math.round((clipEnd - clipStart) * 10) / 10;

                  return (
                    <div
                      key={clip.id}
                      onClick={() => setSelectedClipId(clip.id)}
                      className={`p-4 rounded-xl border transition-all cursor-pointer flex flex-col gap-3 ${
                        isSelected
                          ? 'bg-zinc-900/90 border-rose-500/60 shadow-xl shadow-rose-500/5 ring-1 ring-rose-500/30'
                          : 'bg-zinc-950/40 border-zinc-850 hover:border-zinc-750 hover:bg-zinc-900/40'
                      }`}
                    >
                      {/* Top Row: Title + Virality Badge + 1-Click Download */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-2.5 min-w-0">
                          <span className="w-5 h-5 rounded-md bg-zinc-850 text-zinc-400 flex items-center justify-center text-[10px] font-black shrink-0 mt-0.5">
                            #{index + 1}
                          </span>
                          <div className="min-w-0">
                            <h4 className="text-xs font-bold text-zinc-100 truncate">
                              {clip.title}
                            </h4>
                            <p className="text-[11px] text-zinc-400 italic mt-0.5 truncate">
                              Hook: {clip.hook}
                            </p>
                          </div>
                        </div>

                        {/* Quick 1-click download button & Virality score */}
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDownloadSingleClip(clip);
                            }}
                            disabled={renderingClipId === clip.id}
                            className="flex items-center gap-1 px-2 py-1 rounded-lg bg-zinc-900 hover:bg-rose-500/20 border border-zinc-800 hover:border-rose-500/50 text-zinc-300 hover:text-rose-300 text-[10px] font-bold transition-all shrink-0 cursor-pointer"
                            title="1-Click Save Short (MP4)"
                          >
                            {renderingClipId === clip.id ? (
                              <>
                                <RefreshCw size={11} className="animate-spin text-rose-400" />
                                <span>Saving...</span>
                              </>
                            ) : (
                              <>
                                <Download size={11} className="text-rose-400" />
                                <span>Save Short</span>
                              </>
                            )}
                          </button>

                          <div className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-gradient-to-r from-amber-500/20 to-rose-500/20 border border-amber-500/40 text-amber-400 text-[10px] font-black shrink-0">
                            <Flame size={12} className="text-rose-400" />
                            <span>{clip.viralityScore}%</span>
                          </div>
                        </div>
                      </div>

                      {/* Reason & Timestamp meta */}
                      <div className="flex items-center justify-between text-[10px] text-zinc-500 pt-1 border-t border-zinc-850/60">
                        <span className="text-zinc-400">{clip.reason}</span>
                        <div className="flex items-center gap-1 font-mono text-zinc-400">
                          <Clock size={11} />
                          <span>
                            {formatTime(clipStart)} - {formatTime(clipEnd)} ({duration}s)
                          </span>
                        </div>
                      </div>

                      {/* If Selected: Show Fine-tuning controls inside card */}
                      {isSelected && (
                        <div
                          onClick={(e) => e.stopPropagation()}
                          className="pt-3 border-t border-zinc-800 flex flex-col gap-3"
                        >
                          {/* Headline Overlay Text Editor */}
                          <div className="flex flex-col gap-1">
                            <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">
                              Headline Banner Overlay:
                            </label>
                            <input
                              type="text"
                              value={currentHeadline}
                              onChange={(e) =>
                                setCustomHeadlines({
                                  ...customHeadlines,
                                  [clip.id]: e.target.value,
                                })
                              }
                              placeholder="e.g. WAIT FOR WHAT HAPPENS NEXT 😱"
                              className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-rose-500/60"
                            />
                          </div>

                          {/* Trimming Adjusters */}
                          <div className="grid grid-cols-2 gap-3 text-xs">
                            <div className="flex flex-col gap-1">
                              <span className="text-[10px] text-zinc-500">
                                Start Second:
                              </span>
                              <input
                                type="number"
                                step="0.5"
                                min="0"
                                max={clipEnd - 5}
                                value={clipStart}
                                onChange={(e) =>
                                  setClipTrims({
                                    ...clipTrims,
                                    [clip.id]: {
                                      start: parseFloat(e.target.value) || 0,
                                      end: clipEnd,
                                    },
                                  })
                                }
                                className="bg-zinc-950 border border-zinc-800 rounded-lg px-2.5 py-1 text-zinc-200 font-mono text-xs focus:outline-none"
                              />
                            </div>

                            <div className="flex flex-col gap-1">
                              <span className="text-[10px] text-zinc-500">
                                End Second:
                              </span>
                              <input
                                type="number"
                                step="0.5"
                                min={clipStart + 5}
                                value={clipEnd}
                                onChange={(e) =>
                                  setClipTrims({
                                    ...clipTrims,
                                    [clip.id]: {
                                      start: clipStart,
                                      end: parseFloat(e.target.value) || clipStart + 15,
                                    },
                                  })
                                }
                                className="bg-zinc-950 border border-zinc-800 rounded-lg px-2.5 py-1 text-zinc-200 font-mono text-xs focus:outline-none"
                              />
                            </div>
                          </div>

                          {/* Quick Tag Copy */}
                          {clip.tags && clip.tags.length > 0 && (
                            <div className="flex items-center justify-between text-[10px] text-zinc-500 pt-1">
                              <span className="truncate max-w-[80%]">
                                {clip.tags.join(' ')}
                              </span>
                              <button
                                onClick={() => handleCopyTags(clip.tags)}
                                className="flex items-center gap-1 text-zinc-400 hover:text-white transition-colors"
                              >
                                {copiedTag ? <Check size={11} /> : <Copy size={11} />}
                                <span>{copiedTag ? 'Copied' : 'Copy'}</span>
                              </button>
                            </div>
                          )}

                          {/* Mobile jump to preview button */}
                          <button
                            type="button"
                            onClick={() => setMobileViewTab('preview')}
                            className="lg:hidden w-full py-2 rounded-lg bg-rose-500/15 border border-rose-500/30 hover:bg-rose-500/25 text-rose-400 font-bold text-xs flex items-center justify-center gap-1.5 transition-all mt-1"
                          >
                            <Smartphone size={14} />
                            <span>Preview & Export Clip #{index + 1} 📱</span>
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Right 5 Columns: Realistic 9:16 Phone Preview & Actions */}
            <div className={`flex-col gap-4 sticky top-16 lg:top-20 ${mobileViewTab === 'clips' ? 'hidden lg:flex lg:col-span-5' : 'flex lg:col-span-5'}`}>
              <div className="bg-zinc-950/80 border border-zinc-850 rounded-2xl p-4 sm:p-5 flex flex-col items-center gap-4 sm:gap-5 backdrop-blur-md max-h-none lg:max-h-[calc(100vh-6rem)] overflow-y-auto custom-scrollbar">
                <div className="w-full flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <button
                      type="button"
                      onClick={() => setMobileViewTab('clips')}
                      className="lg:hidden p-1 rounded-md bg-zinc-900 border border-zinc-800 text-zinc-300 hover:text-white shrink-0"
                      title="Back to Clips List"
                    >
                      <ArrowLeft size={13} />
                    </button>
                    <Smartphone size={16} className="text-rose-400 shrink-0" />
                    <span className="text-xs font-bold text-zinc-300 truncate">
                      {activeClip ? activeClip.title.substring(0, 22) : '9:16 Live Preview'}
                    </span>
                  </div>

                  {/* Framing style toggle */}
                  <select
                    value={aspectRatio}
                    onChange={(e) => setAspectRatio(e.target.value as any)}
                    className="bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1 text-[11px] text-zinc-300 focus:outline-none cursor-pointer shrink-0 max-w-[140px] sm:max-w-none"
                  >
                    <option value="9:16-blur">9:16 Blurred (Opus)</option>
                    <option value="9:16-crop">9:16 Center Crop</option>
                    <option value="16:9-fit">Letterbox (Fit)</option>
                    <option value="original">Original</option>
                  </select>
                </div>

                {/* Simulated Smartphone Shell */}
                <div className="relative w-[240px] h-[426px] bg-black rounded-[36px] p-2.5 shadow-2xl border-4 border-zinc-800 ring-1 ring-zinc-700/50 overflow-hidden flex flex-col items-center justify-center">
                  {/* Camera notch */}
                  <div className="absolute top-2 w-20 h-4 bg-zinc-900 rounded-full z-30" />

                  {/* Screen viewport */}
                  <div className="relative w-full h-full rounded-[26px] overflow-hidden bg-black flex items-center justify-center">
                    {job.videoUrl ? (
                      <>
                        {/* Background for 9:16 blurred mode */}
                        {aspectRatio === '9:16-blur' && (
                          <video
                            src={`${API_URL}${job.videoUrl}`}
                            className="absolute inset-0 w-full h-full object-cover blur-md opacity-60 scale-125"
                            muted
                            loop
                            playsInline
                          />
                        )}

                        {/* Foreground Video */}
                        <video
                          ref={videoRef}
                          src={`${API_URL}${job.videoUrl}`}
                          className={`relative z-10 ${
                            aspectRatio === '9:16-crop'
                              ? 'w-full h-full object-cover'
                              : aspectRatio === 'original'
                              ? 'w-full object-contain'
                              : 'w-full object-contain max-h-full'
                          }`}
                          playsInline
                        />

                        {/* Simulated Top Headline Banner */}
                        {currentHeadline && (
                          <div className="absolute top-8 left-3 right-3 z-20 pointer-events-none">
                            <div className="bg-black/75 backdrop-blur-sm border border-white/10 rounded-lg px-2.5 py-1.5 text-center shadow-lg">
                              <span className="text-[10px] font-black tracking-wide text-white uppercase drop-shadow">
                                {currentHeadline}
                              </span>
                            </div>
                          </div>
                        )}

                        {/* Floating Play/Pause overlay */}
                        <button
                          onClick={togglePlay}
                          className="absolute inset-0 z-10 flex items-center justify-center bg-black/20 hover:bg-black/35 transition-all opacity-0 hover:opacity-100"
                        >
                          <div className="w-12 h-12 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center text-white shadow-xl">
                            {isPlaying ? <Pause size={20} /> : <Play size={20} className="ml-0.5" />}
                          </div>
                        </button>

                        {/* In-Phone Floating Mini Player HUD */}
                        <div className="absolute bottom-2.5 left-2.5 right-2.5 z-20 bg-black/70 backdrop-blur-md rounded-xl p-2 flex items-center justify-between border border-white/10 text-white shadow-xl">
                          <button
                            type="button"
                            onClick={togglePlay}
                            className="w-7 h-7 rounded-lg bg-rose-500 hover:bg-rose-400 flex items-center justify-center transition-all shrink-0 cursor-pointer"
                            title={isPlaying ? 'Pause' : 'Play'}
                          >
                            {isPlaying ? <Pause size={12} /> : <Play size={12} className="ml-0.5" />}
                          </button>

                          <div className="flex-1 mx-2">
                            <div className="flex justify-between text-[9px] font-mono text-zinc-300">
                              <span>{formatTime(currentProgressSec)}</span>
                              <span>{formatTime(clipDuration)}</span>
                            </div>
                            <div
                              onClick={(e) => {
                                const rect = e.currentTarget.getBoundingClientRect();
                                const pct = (e.clientX - rect.left) / rect.width;
                                handleSeek(pct * clipDuration);
                              }}
                              className="w-full bg-zinc-800 h-1.5 rounded-full cursor-pointer relative overflow-hidden mt-0.5"
                            >
                              <div
                                className="h-full bg-gradient-to-r from-rose-500 to-amber-500 rounded-full"
                                style={{ width: `${(currentProgressSec / clipDuration) * 100}%` }}
                              />
                            </div>
                          </div>

                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={handleToggleMute}
                              className="p-1 text-zinc-300 hover:text-white transition-colors cursor-pointer"
                              title={isMuted ? 'Unmute' : 'Mute'}
                            >
                              {isMuted || volume === 0 ? <VolumeX size={13} /> : <Volume2 size={13} />}
                            </button>
                            <button
                              type="button"
                              onClick={handleFullscreen}
                              className="p-1 text-zinc-300 hover:text-white transition-colors cursor-pointer"
                              title="Fullscreen"
                            >
                              <Maximize2 size={13} />
                            </button>
                          </div>
                        </div>
                      </>
                    ) : (
                      <div className="text-zinc-600 text-xs text-center p-4">
                        Video source unavailable
                      </div>
                    )}
                  </div>
                </div>

                {/* Enhanced Interactive Scrubber Bar */}
                <div className="w-full flex flex-col gap-1 px-1">
                  <div className="flex items-center justify-between text-[11px] font-mono text-zinc-400">
                    <span className="text-rose-400 font-bold">{formatTime(currentProgressSec)}</span>
                    <span className="text-zinc-500 text-[10px]">Timeline: {formatTime(currentStart)} - {formatTime(currentEnd)}</span>
                    <span className="text-zinc-300 font-bold">{formatTime(clipDuration)}</span>
                  </div>

                  <div className="relative flex items-center group">
                    <input
                      type="range"
                      min="0"
                      max={clipDuration}
                      step="0.1"
                      value={currentProgressSec}
                      onChange={(e) => handleSeek(parseFloat(e.target.value))}
                      className="w-full h-2 rounded-lg bg-zinc-800 accent-rose-500 cursor-pointer transition-all"
                    />
                  </div>
                </div>

                {/* Comprehensive Video Transport Controls Dock */}
                <div className="w-full p-2.5 rounded-xl bg-zinc-900/90 border border-zinc-800 flex items-center justify-between gap-2 shadow-inner">
                  {/* Left: Rewind, Play/Pause, Fast-forward */}
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleSkip(-5)}
                      className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-750 text-zinc-300 hover:text-white transition-all text-xs cursor-pointer active:scale-95"
                      title="Rewind 5s"
                    >
                      <Rewind size={14} />
                    </button>

                    <button
                      type="button"
                      onClick={togglePlay}
                      className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-rose-500 to-red-600 hover:from-rose-400 hover:to-red-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-md shadow-rose-500/20 active:scale-95 transition-all cursor-pointer"
                    >
                      {isPlaying ? <Pause size={13} /> : <Play size={13} className="ml-0.5" />}
                      <span>{isPlaying ? 'Pause' : 'Play'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleSkip(5)}
                      className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-750 text-zinc-300 hover:text-white transition-all text-xs cursor-pointer active:scale-95"
                      title="Fast forward 5s"
                    >
                      <FastForward size={14} />
                    </button>
                  </div>

                  {/* Center: Playback Speed & Loop Toggle */}
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={handleToggleSpeed}
                      className="px-2 py-1 rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white text-[10px] font-mono font-bold transition-all cursor-pointer"
                      title="Playback Speed"
                    >
                      {playbackSpeed}x
                    </button>

                    <button
                      type="button"
                      onClick={() => setIsLooping(!isLooping)}
                      className={`p-1.5 rounded-md border transition-all cursor-pointer ${
                        isLooping
                          ? 'bg-rose-500/20 border-rose-500/50 text-rose-400'
                          : 'bg-zinc-800 border-zinc-750 text-zinc-500'
                      }`}
                      title={isLooping ? 'Auto-looping ON' : 'Auto-looping OFF'}
                    >
                      <Repeat size={13} />
                    </button>
                  </div>

                  {/* Right: Volume slider */}
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={handleToggleMute}
                      className="text-zinc-400 hover:text-white transition-colors cursor-pointer"
                      title={isMuted ? 'Unmute' : 'Mute'}
                    >
                      {isMuted || volume === 0 ? <VolumeX size={14} /> : <Volume2 size={14} />}
                    </button>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.05"
                      value={isMuted ? 0 : volume}
                      onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
                      className="w-14 h-1.5 rounded-lg bg-zinc-800 accent-rose-500 cursor-pointer"
                      title={`Volume: ${Math.round((isMuted ? 0 : volume) * 100)}%`}
                    />
                  </div>
                </div>

                {/* Primary Action Buttons */}
                <div className="w-full flex flex-col gap-2.5">
                  {/* Option 1: Direct Folder Save (No ZIP) */}
                  <button
                    type="button"
                    onClick={handleSaveDirectlyToFolder}
                    disabled={isFolderExporting}
                    className="w-full py-3 rounded-xl bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-400 hover:to-indigo-500 disabled:opacity-50 text-white text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg shadow-blue-500/25 active:scale-95 transition-all cursor-pointer"
                  >
                    {isFolderExporting ? (
                      <>
                        <RefreshCw size={14} className="animate-spin text-white" />
                        <span>{folderProgressMsg || 'Saving directly into folder...'}</span>
                      </>
                    ) : (
                      <>
                        <FolderDown size={15} />
                        <span>📁 Save All ({clips.length}) Directly to Folder (No ZIP)</span>
                      </>
                    )}
                  </button>

                  {/* Single Short Fast Render & Download */}
                  <button
                    type="button"
                    onClick={handleRenderShort}
                    disabled={isRendering}
                    className="w-full py-2.5 rounded-xl bg-gradient-to-r from-rose-500 to-red-600 hover:from-rose-400 hover:to-red-500 disabled:opacity-50 text-white text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg shadow-rose-500/25 active:scale-95 transition-all cursor-pointer"
                  >
                    {isRendering ? (
                      <>
                        <RefreshCw size={14} className="animate-spin" />
                        <span>{renderProgressMsg || 'Rendering 9:16 Short...'}</span>
                      </>
                    ) : (
                      <>
                        <Zap size={15} />
                        <span>⚡ Fast Download This Short (MP4)</span>
                      </>
                    )}
                  </button>

                  {/* 1-Click Download ALL Clips in a ZIP bundle */}
                  <button
                    type="button"
                    onClick={handleDownloadAllZip}
                    disabled={isBatchRendering}
                    className="w-full py-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-750 hover:border-zinc-700 disabled:opacity-50 text-zinc-300 hover:text-white text-xs font-bold tracking-wider flex items-center justify-center gap-2 active:scale-95 transition-all cursor-pointer"
                  >
                    {isBatchRendering ? (
                      <>
                        <RefreshCw size={14} className="animate-spin" />
                        <span>{batchProgressMsg || 'Packaging all clips into ZIP...'}</span>
                      </>
                    ) : (
                      <>
                        <Archive size={14} className="text-emerald-400" />
                        <span>Download as ZIP Archive</span>
                      </>
                    )}
                  </button>

                  {exportedFolderPath && (
                    <button
                      type="button"
                      onClick={handleOpenServerFolder}
                      className="w-full py-2 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-300 hover:text-white text-xs font-bold flex items-center justify-center gap-2 active:scale-95 transition-all cursor-pointer"
                    >
                      <FolderOpen size={14} />
                      <span>Open Folder in File Explorer 📂</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={handleSendToTimeline}
                    className="w-full py-2 rounded-xl bg-purple-600/20 hover:bg-purple-600/30 border border-purple-500/40 text-purple-300 hover:text-white text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 active:scale-95 transition-all cursor-pointer"
                  >
                    <Sliders size={13} />
                    <span>Open in Timeline Editor</span>
                  </button>
                </div>

                {/* Batch ZIP Ready Alert */}
                {batchDownloadUrl && (
                  <div className="w-full p-3 rounded-xl bg-emerald-950/40 border border-emerald-500/40 flex items-center justify-between gap-3 text-xs animate-in fade-in">
                    <div className="flex items-center gap-2 text-emerald-400 font-bold truncate">
                      <Archive size={16} />
                      <span className="truncate">All Shorts ZIP Ready!</span>
                    </div>
                    <a
                      href={batchDownloadUrl}
                      download={`cinemiq-shorts-${job.id}.zip`}
                      target="_blank"
                      rel="noreferrer"
                      className="px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black font-black uppercase text-[10px] tracking-wider transition-all shrink-0"
                    >
                      Save ZIP
                    </a>
                  </div>
                )}

                {/* Single Render Success / Download Link */}
                {renderedDownloadUrl && (
                  <div className="w-full p-3 rounded-xl bg-rose-950/40 border border-rose-500/40 flex items-center justify-between gap-3 text-xs animate-in fade-in">
                    <div className="flex items-center gap-2 text-rose-300 font-bold truncate">
                      <CheckCircle2 size={16} className="text-emerald-400" />
                      <span className="truncate">Short MP4 Ready!</span>
                    </div>
                    <a
                      href={renderedDownloadUrl}
                      download="cinemiq-short.mp4"
                      target="_blank"
                      rel="noreferrer"
                      className="px-3 py-1.5 rounded-lg bg-rose-500 hover:bg-rose-400 text-white font-black uppercase text-[10px] tracking-wider transition-all shrink-0"
                    >
                      Save MP4
                    </a>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};
