import React, { useState, useEffect, useRef } from 'react';
import {
  ArrowLeft,
  Scissors,
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
  FolderOpen,
  Hash,
  Music,
  Sparkles
} from 'lucide-react';
import { API_URL } from '../../config';

export type CaptionStyle = 'hormozi' | 'neon' | 'mrbeast' | 'karaoke' | 'minimal' | 'none';

export interface TranscriptWord {
  word: string;
  start: number;
  end: number;
}

export interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
  words?: TranscriptWord[];
}

export interface MusicTrack {
  id: string;
  name: string;
  genre: string;
  mood: string;
  url: string;
}

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
  tags?: string[];
  categories?: string[];
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
  transcriptSegments?: TranscriptSegment[];
}

interface DownloadProgress {
  percent: number;
  speed?: string;
  totalSize?: string;
  eta?: string;
}

interface ShortsJob {
  id: string;
  url?: string;
  status: 'pending' | 'downloading' | 'analyzing' | 'done' | 'failed';
  progress: number;
  stage: string;
  videoInfo?: VideoInfo;
  videoUrl?: string;
  clips?: ViralClip[];
  transcript?: TranscriptSegment[];
  error?: string;
  downloadProgress?: DownloadProgress;
  generationTimeMs?: number;
  downloadTimeMs?: number;
  downloadStartTime?: number;
  downloadEndTime?: number;
  isCachedSource?: boolean;
  hashtags?: string[];
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

// Helper to construct complete, full title names for downloads without truncation
const getFullShortFilename = (
  videoTitle?: string,
  clipTitle?: string,
  index?: number
): string => {
  const cleanStr = (s?: string) =>
    (s || '')
      .replace(/[\\/:*?"<>|#]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

  const vTitle = cleanStr(videoTitle);
  const cTitle = cleanStr(clipTitle);

  let full = '';
  if (vTitle && cTitle) {
    if (cTitle.toLowerCase().includes(vTitle.toLowerCase())) {
      full = cTitle;
    } else {
      full = `${vTitle} - ${cTitle}`;
    }
  } else {
    full = cTitle || vTitle || `Cinemiq-Short-${(index ?? 0) + 1}`;
  }

  if (typeof index === 'number') {
    full = `${String(index + 1).padStart(2, '0')} - ${full}`;
  }

  if (full.length > 120) full = full.substring(0, 120).trim();
  return `${full}.mp4`;
};

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
  const [displayProgress, setDisplayProgress] = useState(0);
  const [targetProgress, setTargetProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Selected Clip & Customizations
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [aspectRatio, setAspectRatio] = useState<'9:16-blur' | '9:16-crop' | '16:9-fit' | 'original'>('9:16-blur');
  const [phonePreviewSize, setPhonePreviewSize] = useState<'compact' | 'standard' | 'large'>('large');
  const [captionStyle, setCaptionStyle] = useState<CaptionStyle>('hormozi');
  const [bgMusicTrack, setBgMusicTrack] = useState<string>('lofi-sunset');
  const [bgMusicVolume, setBgMusicVolume] = useState<number>(0.2);
  const [autoDucking, setAutoDucking] = useState<boolean>(true);
  const [musicTracks, setMusicTracks] = useState<MusicTrack[]>([
    { id: 'lofi-sunset', name: 'Lofi Sunset Chill', genre: 'Lo-Fi / Study / Relaxed', mood: 'Chill & Relaxed', url: '/uploads/music/lofi-sunset.mp3' },
    { id: 'energetic-hype', name: 'Energetic Hype', genre: 'Upbeat / Action / Electronic', mood: 'Hype & Dynamic', url: '/uploads/music/energetic-hype.mp3' },
    { id: 'cinematic-suspense', name: 'Cinematic Suspense', genre: 'Dramatic / Mystery / Tension', mood: 'Epic & Suspenseful', url: '/uploads/music/cinematic-suspense.mp3' },
    { id: 'ambient-focus', name: 'Ambient Focus', genre: 'Calm / Inspiring / Tech', mood: 'Modern & Clean', url: '/uploads/music/ambient-focus.mp3' },
    { id: 'studio-beat', name: 'Studio Beats', genre: 'Hip Hop / Rhythmic / Urban', mood: 'Punchy & Groovy', url: '/uploads/music/studio-beat.mp3' },
    { id: 'modern-rhythm', name: 'Modern Rhythm', genre: 'Pop / Upbeat / Trending', mood: 'Bright & Positive', url: '/uploads/music/modern-rhythm.mp3' },
    { id: 'none', name: 'Original Audio Only (No Music)', genre: 'Clean Dialogue', mood: 'Original', url: '' },
  ]);
  const [isMusicPreviewPlaying, setIsMusicPreviewPlaying] = useState<boolean>(false);
  const musicAudioRef = useRef<HTMLAudioElement | null>(null);
  const [customHeadlines, setCustomHeadlines] = useState<Record<string, string>>({});
  const [clipTrims, setClipTrims] = useState<Record<string, { start: number; end: number }>>({});
  const [copiedAllHashtags, setCopiedAllHashtags] = useState(false);
  const [copiedTagText, setCopiedTagText] = useState<string | null>(null);
  const [mobileViewTab, setMobileViewTab] = useState<'clips' | 'preview'>('clips');

  // Rendering State
  const [isRendering, setIsRendering] = useState(false);
  const [renderProgressMsg, setRenderProgressMsg] = useState('');
  const [renderDisplayPercent, setRenderDisplayPercent] = useState(0);
  const [renderTargetPercent, setRenderTargetPercent] = useState(0);
  const [renderedDownloadUrl, setRenderedDownloadUrl] = useState<string | null>(null);

  // Batch Export All State (Single click download all)
  const [isBatchRendering, setIsBatchRendering] = useState(false);
  const [batchProgressMsg, setBatchProgressMsg] = useState('');
  const [batchDisplayPercent, setBatchDisplayPercent] = useState(0);
  const [batchTargetPercent, setBatchTargetPercent] = useState(0);
  const [batchDownloadUrl, setBatchDownloadUrl] = useState<string | null>(null);
  const [renderingClipId, setRenderingClipId] = useState<string | null>(null);

  // Direct Folder Export State (No ZIP - Saves directly to directory)
  const [targetResolution, setTargetResolution] = useState<'720p' | '1080p'>('720p');
  const [isFolderExporting, setIsFolderExporting] = useState(false);
  const [folderProgressMsg, setFolderProgressMsg] = useState('');
  const [folderDisplayPercent, setFolderDisplayPercent] = useState(0);
  const [folderTargetPercent, setFolderTargetPercent] = useState(0);
  const [exportedFolderPath, setExportedFolderPath] = useState<string | null>(null);
  const [exportedClips, setExportedClips] = useState<Array<{ title: string; filename: string; url: string; duration: number }>>([]);

  // Video Preview & Player Controls State
  const phoneRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isEmbedPlaying, setIsEmbedPlaying] = useState(false);
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

  // Fetch available royalty-free music tracks from backend on mount
  useEffect(() => {
    fetch(`${API_URL}/api/shorts/music-tracks`)
      .then((r) => r.json())
      .then((data) => {
        if (data.success && Array.isArray(data.tracks) && data.tracks.length > 0) {
          setMusicTracks(data.tracks);
        }
      })
      .catch((err) => console.warn('Music tracks fetch note:', err));
  }, []);

  // Stop music preview when unmounting
  useEffect(() => {
    return () => {
      if (musicAudioRef.current) {
        musicAudioRef.current.pause();
      }
    };
  }, []);

  const toggleMusicPreview = (trackId: string) => {
    const track = musicTracks.find((t) => t.id === trackId);
    if (!track || !track.url) {
      if (musicAudioRef.current) {
        musicAudioRef.current.pause();
        setIsMusicPreviewPlaying(false);
      }
      return;
    }

    if (!musicAudioRef.current) {
      musicAudioRef.current = new Audio();
    }

    const audio = musicAudioRef.current;
    const fullAudioUrl = track.url.startsWith('http') ? track.url : `${API_URL}${track.url}`;

    if (isMusicPreviewPlaying && bgMusicTrack === trackId) {
      audio.pause();
      setIsMusicPreviewPlaying(false);
    } else {
      audio.src = fullAudioUrl;
      audio.volume = Math.max(0.05, Math.min(1, bgMusicVolume));
      audio.loop = true;
      audio
        .play()
        .then(() => {
          setBgMusicTrack(trackId);
          setIsMusicPreviewPlaying(true);
        })
        .catch((e) => console.warn('Audio play preview error:', e));
    }
  };

  // Reset play state and position whenever active clip changes
  useEffect(() => {
    setIsPlaying(false);
    setIsEmbedPlaying(false);
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.currentTime = currentStart;
    }
    setCurrentPlayTime(currentStart);
  }, [selectedClipId]);

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

  // Real-time ticker when previewing embed (before local video file finishes buffering)
  useEffect(() => {
    if (!isEmbedPlaying || job?.videoUrl) return;
    const interval = setInterval(() => {
      setCurrentPlayTime((prev) => {
        const next = prev + 0.1;
        if (next >= currentEnd) {
          if (isLooping) {
            return currentStart;
          } else {
            setIsEmbedPlaying(false);
            setIsPlaying(false);
            return currentStart;
          }
        }
        return next;
      });
    }, 100);
    return () => clearInterval(interval);
  }, [isEmbedPlaying, job?.videoUrl, currentStart, currentEnd, isLooping]);

  // High-frequency smooth progress interpolation (60fps feel)
  useEffect(() => {
    if (!isAnalyzing) {
      if (job?.status === 'done') {
        setDisplayProgress(100);
      }
      return;
    }

    const timer = setInterval(() => {
      setDisplayProgress((prev) => {
        if (targetProgress > prev) {
          const delta = targetProgress - prev;
          // Smooth progressive easing: faster when far, gentle approach near target
          const step = Math.max(0.2, delta * 0.12);
          const next = Math.min(targetProgress, prev + step);
          return Number(next.toFixed(1));
        } else if (prev < 90 && targetProgress <= prev) {
          // Micro-crawl while awaiting asynchronous network/FFmpeg responses
          return Number((prev + 0.04).toFixed(1));
        }
        return prev;
      });
    }, 25);

    return () => clearInterval(timer);
  }, [isAnalyzing, targetProgress, job?.status]);

  // Smoothly interpolate renderDisplayPercent (for single short render)
  useEffect(() => {
    if (!isRendering) {
      if (renderedDownloadUrl) setRenderDisplayPercent(100);
      return;
    }
    const timer = setInterval(() => {
      setRenderDisplayPercent((prev) => {
        if (renderTargetPercent > prev) {
          const delta = renderTargetPercent - prev;
          const step = Math.max(0.3, delta * 0.16);
          return Number(Math.min(renderTargetPercent, prev + step).toFixed(1));
        } else if (prev < 92 && renderTargetPercent <= prev) {
          return Number((prev + 0.05).toFixed(1));
        }
        return prev;
      });
    }, 25);
    return () => clearInterval(timer);
  }, [isRendering, renderTargetPercent, renderedDownloadUrl]);

  // Smoothly interpolate batchDisplayPercent (for all-shorts ZIP)
  useEffect(() => {
    if (!isBatchRendering) {
      if (batchDownloadUrl) setBatchDisplayPercent(100);
      return;
    }
    const timer = setInterval(() => {
      setBatchDisplayPercent((prev) => {
        if (batchTargetPercent > prev) {
          const delta = batchTargetPercent - prev;
          const step = Math.max(0.3, delta * 0.14);
          return Number(Math.min(batchTargetPercent, prev + step).toFixed(1));
        } else if (prev < 92 && batchTargetPercent <= prev) {
          return Number((prev + 0.04).toFixed(1));
        }
        return prev;
      });
    }, 25);
    return () => clearInterval(timer);
  }, [isBatchRendering, batchTargetPercent, batchDownloadUrl]);

  // Smoothly interpolate folderDisplayPercent (for Folder Export)
  useEffect(() => {
    if (!isFolderExporting) {
      if (exportedClips.length > 0) setFolderDisplayPercent(100);
      return;
    }
    const timer = setInterval(() => {
      setFolderDisplayPercent((prev) => {
        if (folderTargetPercent > prev) {
          const delta = folderTargetPercent - prev;
          const step = Math.max(0.3, delta * 0.16);
          return Number(Math.min(folderTargetPercent, prev + step).toFixed(1));
        } else if (prev < 94 && folderTargetPercent <= prev) {
          return Number((prev + 0.05).toFixed(1));
        }
        return prev;
      });
    }, 25);
    return () => clearInterval(timer);
  }, [isFolderExporting, folderTargetPercent, exportedClips.length]);

  // Poll Job Status while active job is processing or stream is buffering
  useEffect(() => {
    if (!activeJobId) return;
    if (job && (job.status === 'done' || job.status === 'failed')) return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`${API_URL}/api/shorts/status/${activeJobId}`);
        const contentType = res.headers.get('content-type') || '';
        if (!res.ok || !contentType.includes('application/json')) return;
        const data = await res.json();

        if (data.success && data.job) {
          setJob(data.job);

          // Once clips are generated, dismiss the full-screen loading lock immediately!
          if (data.job.clips && data.job.clips.length > 0 && isAnalyzing) {
            setTargetProgress(100);
            setTimeout(() => {
              setIsAnalyzing(false);
            }, 300);
          }

          if (data.job.status === 'done') {
            setTargetProgress(100);
            setIsAnalyzing(false);
            clearInterval(interval);
          } else if (data.job.status === 'failed') {
            setIsAnalyzing(false);
            setErrorMessage(data.job.error || 'Analysis failed. Please try a different video.');
            clearInterval(interval);
          } else {
            // Downloading or analyzing - advance target progress incrementally
            const serverProgress = data.job.downloadProgress?.percent
              ? Math.min(95, Math.round(50 + data.job.downloadProgress.percent * 0.45))
              : (data.job.progress || 15);
            setTargetProgress((prev) => Math.max(prev, serverProgress));
          }
        }
      } catch (err: any) {
        console.error('Job polling error:', err);
      }
    }, 400);

    return () => clearInterval(interval);
  }, [activeJobId, isAnalyzing, job?.status]);

  // Trigger YouTube Analysis
  const handleAnalyzeYouTube = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!youtubeUrl.trim()) {
      setErrorMessage('Please enter a valid YouTube URL');
      return;
    }

    setErrorMessage(null);
    setIsAnalyzing(true);
    setDisplayProgress(0);
    setTargetProgress(12);
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

      setTargetProgress((prev) => Math.max(prev, 22));
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
    setDisplayProgress(0);
    setTargetProgress(30);
    setRenderedDownloadUrl(null);
    setJob(null);

    const formData = new FormData();
    formData.append('video', file);
    formData.append('clipCount', String(clipCount));
    formData.append('targetDuration', targetDuration);

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
      setTargetProgress(100);
      setTimeout(() => {
        setIsAnalyzing(false);
      }, 650);
    } catch (err: any) {
      console.error('Upload error:', err);
      setIsAnalyzing(false);
      setErrorMessage(err.message || 'Upload processing failed.');
    }
  };

  // Toggle Video Play/Pause
  const togglePlay = () => {
    if (job?.videoUrl && videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
        setIsPlaying(false);
      } else {
        videoRef.current.play().catch((e) => console.warn('Video play note:', e));
        setIsPlaying(true);
      }
    } else {
      setIsEmbedPlaying((prev) => {
        const next = !prev;
        setIsPlaying(next);
        return next;
      });
    }
  };

  // Helper to trigger fast direct file download in browser
  const triggerBrowserDownload = async (url: string, filename?: string) => {
    try {
      // 1. Fetch as blob to guarantee cross-origin download attribute works in Chrome/Edge/Firefox
      const response = await fetch(url);
      if (response.ok) {
        const blob = await response.blob();
        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = blobUrl;
        if (filename) a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(blobUrl), 3000);
        return;
      }
    } catch (e) {
      console.warn('Direct blob download failed, falling back to server download route:', e);
    }

    // 2. Direct server download endpoint with Content-Disposition: attachment header
    const cleanFile = url.replace(API_URL, '').replace(/^\/uploads\/shorts\//, '');
    const serverUrl = `${API_URL}/api/shorts/download-file?file=${encodeURIComponent(cleanFile)}&filename=${encodeURIComponent(filename || 'short.mp4')}`;
    const a = document.createElement('a');
    a.href = serverUrl;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  // Video Playing Control Handlers
  const handleSeek = (newSec: number) => {
    const target = currentStart + Math.max(0, Math.min(clipDuration, newSec));
    if (videoRef.current) {
      videoRef.current.currentTime = target;
    }
    setCurrentPlayTime(target);
  };

  const handleSkip = (seconds: number) => {
    const current = videoRef.current ? videoRef.current.currentTime : currentPlayTime;
    const target = Math.max(currentStart, Math.min(currentEnd, current + seconds));
    if (videoRef.current) {
      videoRef.current.currentTime = target;
    }
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
    const next = !isMuted;
    if (videoRef.current) {
      videoRef.current.muted = next;
    }
    setIsMuted(next);
  };

  const handleVolumeChange = (newVol: number) => {
    if (videoRef.current) {
      videoRef.current.volume = newVol;
      if (newVol > 0 && isMuted) {
        videoRef.current.muted = false;
      }
    }
    setVolume(newVol);
    if (newVol > 0 && isMuted) {
      setIsMuted(false);
    }
  };

  const handleFullscreen = () => {
    if (phoneRef.current && phoneRef.current.requestFullscreen) {
      phoneRef.current.requestFullscreen();
    } else if (videoRef.current && videoRef.current.requestFullscreen) {
      videoRef.current.requestFullscreen();
    }
  };

  const handleCopyAllHashtags = () => {
    const tagsList =
      job?.hashtags && job.hashtags.length > 0
        ? job.hashtags
        : activeClip?.tags || ['#shorts', '#viral', '#trending', '#reels'];
    const formatted = tagsList.map((t) => (t.startsWith('#') ? t : `#${t}`)).join(' ');
    navigator.clipboard.writeText(formatted);
    setCopiedAllHashtags(true);
    setTimeout(() => setCopiedAllHashtags(false), 2500);
  };

  const handleCopySingleTag = (tag: string) => {
    const formatted = tag.startsWith('#') ? tag : `#${tag}`;
    navigator.clipboard.writeText(formatted);
    setCopiedTagText(formatted);
    setTimeout(() => setCopiedTagText(null), 2000);
  };

  // Download Single Clip directly from list card in 1 click with full title name
  const handleDownloadSingleClip = async (clip: ViralClip) => {
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
          sourceVideoUrl: job?.videoUrl,
          jobId: job?.id,
          youtubeUrl: job?.url || youtubeUrl,
          startTime,
          endTime,
          aspectRatio,
          headlineText,
          targetResolution,
          captionStyle,
          bgMusicTrack,
          bgMusicVolume,
          autoDucking,
          transcriptSegments: clip.transcriptSegments || job?.transcript || [],
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
      const clipIndex = clips.findIndex((c) => c.id === clip.id);
      const fullFilename = getFullShortFilename(
        job?.videoInfo?.title,
        clip.title,
        clipIndex >= 0 ? clipIndex : undefined
      );
      triggerBrowserDownload(fullUrl, fullFilename);
    } catch (err: any) {
      console.error('Single download error:', err);
      setErrorMessage(err.message || 'Failed to download clip.');
    } finally {
      setRenderingClipId(null);
    }
  };

  // Single Click to Download ALL Clips at once in a ZIP bundle with full title names
  const handleDownloadAllZip = async () => {
    if (!job?.id || clips.length === 0) return;
    if (!job?.videoUrl) {
      setErrorMessage(`High-speed stream is buffering in background (${job?.downloadProgress?.percent ? Math.round(job.downloadProgress.percent) : 50}%). Bulk ZIP export will be available in moments!`);
      return;
    }

    setIsBatchRendering(true);
    setBatchDisplayPercent(0);
    setBatchTargetPercent(20);
    setBatchProgressMsg(`Fast rendering all ${clips.length} shorts in ${targetResolution.toUpperCase()}...`);
    setBatchDownloadUrl(null);
    setErrorMessage(null);

    const zipProgressTimer = setInterval(() => {
      setBatchTargetPercent((prev) => Math.min(88, prev + 8));
    }, 300);

    try {
      const res = await fetch(`${API_URL}/api/shorts/download-all-zip`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobId: job.id,
          aspectRatio,
          targetResolution,
          captionStyle,
          bgMusicTrack,
          bgMusicVolume,
          autoDucking,
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

      clearInterval(zipProgressTimer);
      setBatchTargetPercent(100);
      setBatchProgressMsg(`Complete! All ${data.totalClips} shorts packaged in ZIP.`);

      const fullZipUrl = `${API_URL}${data.zipUrl}`;
      setBatchDownloadUrl(fullZipUrl);
      const cleanVideo = (job.videoInfo?.title || 'cinemiq')
        .replace(/[\\/:*?"<>|#]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .substring(0, 50);
      const zipName = `${cleanVideo}-all-shorts.zip`;
      triggerBrowserDownload(fullZipUrl, data.zipFilename || zipName);

      setTimeout(() => {
        setIsBatchRendering(false);
      }, 600);
    } catch (err: any) {
      clearInterval(zipProgressTimer);
      console.error('Batch export error:', err);
      setIsBatchRendering(false);
      setErrorMessage(err.message || 'Failed to download all clips at once.');
    }
  };

  // Render & Download the Short via FFmpeg with smooth progress and full title name
  const handleRenderShort = async () => {
    if (!activeClip) return;

    setIsRendering(true);
    setRenderDisplayPercent(0);
    setRenderTargetPercent(25);
    setRenderProgressMsg(`Rendering ${targetResolution.toUpperCase()} short with headline...`);
    setRenderedDownloadUrl(null);

    const renderTimer = setInterval(() => {
      setRenderTargetPercent((prev) => Math.min(88, prev + 12));
    }, 280);

    try {
      const res = await fetch(`${API_URL}/api/shorts/render-clip`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceVideoUrl: job?.videoUrl,
          jobId: job?.id,
          youtubeUrl: job?.url || youtubeUrl,
          startTime: currentStart,
          endTime: currentEnd,
          aspectRatio,
          headlineText: currentHeadline,
          targetResolution,
          captionStyle,
          bgMusicTrack,
          bgMusicVolume,
          autoDucking,
          transcriptSegments: activeClip.transcriptSegments || job?.transcript || [],
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

      clearInterval(renderTimer);
      setRenderTargetPercent(100);
      setRenderProgressMsg('Rendering complete! Downloading...');

      const fullUrl = `${API_URL}${data.clipUrl}`;
      setRenderedDownloadUrl(fullUrl);
      const clipIndex = clips.findIndex((c) => c.id === activeClip.id);
      const fullFilename = getFullShortFilename(
        job?.videoInfo?.title,
        activeClip.title,
        clipIndex >= 0 ? clipIndex : undefined
      );
      triggerBrowserDownload(fullUrl, fullFilename);

      setTimeout(() => {
        setIsRendering(false);
      }, 500);
    } catch (err: any) {
      clearInterval(renderTimer);
      console.error('Render error:', err);
      setIsRendering(false);
      setErrorMessage(err.message || 'Failed to render short.');
    }
  };

  // 1-Click Save Directly to a Folder on User's Computer with smooth progressive tracking
  const handleSaveDirectlyToFolder = async () => {
    if (!job?.id || clips.length === 0) return;
    if (!job?.videoUrl) {
      setErrorMessage(`High-speed stream is buffering in background (${job?.downloadProgress?.percent ? Math.round(job.downloadProgress.percent) : 50}%). Folder export will be available in moments!`);
      return;
    }

    setIsFolderExporting(true);
    setFolderDisplayPercent(0);
    setFolderTargetPercent(15);
    setFolderProgressMsg(`Preparing folder export in ${targetResolution.toUpperCase()} mode...`);
    setErrorMessage(null);

    const folderRenderTimer = setInterval(() => {
      setFolderTargetPercent((prev) => Math.min(45, prev + 5));
    }, 300);

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
            clearInterval(folderRenderTimer);
            setIsFolderExporting(false);
            return; // user cancelled picker
          }
          console.warn('Directory picker fallback:', pickErr);
        }
      }

      setFolderProgressMsg(`Fast rendering ${clips.length} shorts in ${targetResolution.toUpperCase()}...`);
      const res = await fetch(`${API_URL}/api/shorts/export-folder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobId: job.id,
          aspectRatio,
          targetResolution,
          captionStyle,
          bgMusicTrack,
          bgMusicVolume,
          autoDucking,
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

      clearInterval(folderRenderTimer);
      setExportedFolderPath(data.folderPath);
      setExportedClips(data.clips);
      setFolderTargetPercent(50);

      if (dirHandle) {
        // Stream each MP4 file directly into the user's picked directory
        for (let i = 0; i < data.clips.length; i++) {
          const item = data.clips[i];
          const targetPct = Math.round(50 + (((i + 1) / data.clips.length) * 48));
          setFolderTargetPercent(targetPct);
          setFolderProgressMsg(`Saving "${item.filename}" (${i + 1}/${data.clips.length}) into folder...`);
          const fileRes = await fetch(`${API_URL}${item.url}`);
          const fileBlob = await fileRes.blob();
          const fileHandle = await dirHandle.getFileHandle(item.filename, { create: true });
          const writable = await fileHandle.createWritable();
          await writable.write(fileBlob);
          await writable.close();
        }
        setFolderTargetPercent(100);
        setFolderProgressMsg(`✅ All ${data.clips.length} shorts saved directly into your folder!`);
      } else {
        // Fallback for browsers without File System Access API: trigger direct loose file downloads
        for (let i = 0; i < data.clips.length; i++) {
          const item = data.clips[i];
          const targetPct = Math.round(50 + (((i + 1) / data.clips.length) * 48));
          setFolderTargetPercent(targetPct);
          setFolderProgressMsg(`Downloading "${item.filename}" (${i + 1}/${data.clips.length}) to downloads...`);
          triggerBrowserDownload(`${API_URL}${item.url}`, item.filename);
          await new Promise((r) => setTimeout(r, 350));
        }
        setFolderTargetPercent(100);
        setFolderProgressMsg(`✅ All ${data.clips.length} loose shorts downloaded directly!`);
      }

      setTimeout(() => {
        setIsFolderExporting(false);
      }, 700);
    } catch (err: any) {
      clearInterval(folderRenderTimer);
      console.error('Folder export error:', err);
      setIsFolderExporting(false);
      setErrorMessage(err.message || 'Failed to save to folder.');
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
    if (!activeClip) return;
    if (!job?.videoUrl) {
      setErrorMessage(`High-speed stream is buffering in background (${job?.downloadProgress?.percent ? Math.round(job.downloadProgress.percent) : 50}%). It will open in Timeline Editor once buffering completes!`);
      return;
    }

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

                {/* Additional Generation Settings (Custom Clip Count & Duration) */}
                <div className="flex items-center flex-wrap gap-3.5 text-xs pt-1 text-zinc-400">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-zinc-300 text-[11px] uppercase tracking-wider flex items-center gap-1">
                      <span>Clip Count:</span>
                    </span>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {[4, 10, 25, 50, 100].map((num) => (
                        <button
                          key={num}
                          type="button"
                          onClick={() => setClipCount(num)}
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-black border transition-all cursor-pointer ${
                            clipCount === num
                              ? 'bg-rose-500 text-white border-rose-500 shadow-sm shadow-rose-500/30'
                              : 'bg-zinc-900 border-zinc-800 hover:bg-zinc-850 text-zinc-300 hover:text-white'
                          }`}
                        >
                          {num}
                        </button>
                      ))}
                      
                      {/* Direct Custom Number Input (Enter any number up to 150, e.g. 100) */}
                      <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-zinc-950/80 border border-zinc-750 focus-within:border-rose-500 transition-all">
                        <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">Custom:</span>
                        <input
                          type="number"
                          min="1"
                          max="150"
                          value={clipCount}
                          onChange={(e) => {
                            const val = parseInt(e.target.value, 10);
                            if (!isNaN(val)) {
                              setClipCount(Math.max(1, Math.min(150, val)));
                            } else if (e.target.value === '') {
                              setClipCount(1);
                            }
                          }}
                          className="w-14 bg-zinc-900 border border-zinc-700 rounded px-1.5 py-0.5 text-xs text-center font-mono font-black text-rose-400 focus:outline-none focus:ring-1 focus:ring-rose-500"
                          title="Enter any number of shorts (1 to 150)"
                        />
                        <span className="text-[10px] text-zinc-400 font-bold">Shorts</span>
                      </div>

                      {clipCount >= 25 && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-rose-500/20 border border-rose-500/40 text-rose-300 font-bold animate-in fade-in">
                          🔥 {clipCount} Shorts Multi-Pack
                        </span>
                      )}
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
                          className={`px-2.5 py-1 rounded text-[11px] font-bold border transition-all cursor-pointer ${
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
              <div className="flex flex-col gap-3">
                <div className="border-2 border-dashed border-zinc-800 hover:border-purple-500/50 rounded-2xl p-8 flex flex-col items-center justify-center gap-3 bg-zinc-900/30 transition-all text-center">
                  <div className="w-12 h-12 rounded-2xl bg-purple-500/10 border border-purple-500/30 flex items-center justify-center text-purple-400">
                    <Upload size={22} />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-zinc-200">
                      Upload an MP4 or WebM video file
                    </h3>
                    <p className="text-[11px] text-zinc-500 mt-1">
                      AI will automatically extract {clipCount} high-retention highlights and prepare vertical shorts
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

                {/* Upload Tab Settings Bar */}
                <div className="flex items-center flex-wrap gap-3.5 text-xs px-2 text-zinc-400">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-zinc-300 text-[11px] uppercase tracking-wider">
                      Clip Count:
                    </span>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {[4, 10, 25, 50, 100].map((num) => (
                        <button
                          key={num}
                          type="button"
                          onClick={() => setClipCount(num)}
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-black border transition-all cursor-pointer ${
                            clipCount === num
                              ? 'bg-purple-600 text-white border-purple-500 shadow-sm shadow-purple-600/30'
                              : 'bg-zinc-900 border-zinc-800 hover:bg-zinc-850 text-zinc-300 hover:text-white'
                          }`}
                        >
                          {num}
                        </button>
                      ))}
                      <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-zinc-950/80 border border-zinc-750 focus-within:border-purple-500 transition-all">
                        <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">Custom:</span>
                        <input
                          type="number"
                          min="1"
                          max="150"
                          value={clipCount}
                          onChange={(e) => {
                            const val = parseInt(e.target.value, 10);
                            if (!isNaN(val)) {
                              setClipCount(Math.max(1, Math.min(150, val)));
                            } else if (e.target.value === '') {
                              setClipCount(1);
                            }
                          }}
                          className="w-14 bg-zinc-900 border border-zinc-700 rounded px-1.5 py-0.5 text-xs text-center font-mono font-black text-purple-400 focus:outline-none focus:ring-1 focus:ring-purple-500"
                        />
                        <span className="text-[10px] text-zinc-400 font-bold">Shorts</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Real-Time Video Download & Analysis Progress HUD */}
            {isAnalyzing && (
              <div className="mt-2 p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-zinc-950/90 via-zinc-900 to-zinc-950/90 border border-rose-500/40 flex flex-col gap-3 shadow-2xl animate-in fade-in">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-lg bg-rose-500/20 border border-rose-500/40 flex items-center justify-center text-rose-400 shrink-0">
                      {displayProgress >= 100 ? (
                        <CheckCircle2 size={15} className="text-emerald-400 animate-in zoom-in-75" />
                      ) : (
                        <RefreshCw size={14} className="animate-spin text-rose-400" />
                      )}
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-zinc-100 flex items-center gap-2">
                        <span>
                          {displayProgress >= 100
                            ? (job?.stage || 'Complete! Clips ready.')
                            : (job?.stage || 'Connecting to stream and analyzing video...')}
                        </span>
                      </h4>
                      <p className="text-[10px] text-zinc-400 mt-0.5">
                        {displayProgress >= 100
                          ? 'Highlights processed and ready for preview & export'
                          : job?.status === 'downloading'
                          ? 'Multi-threaded streaming chunks via yt-dlp'
                          : 'Processing transcript and virality scoring'}
                      </p>
                    </div>
                  </div>

                  {/* Percentage Display */}
                  <div className="flex items-baseline gap-1.5 self-end sm:self-auto font-mono">
                    <span className={`text-xl sm:text-2xl font-black transition-colors duration-200 ${displayProgress >= 100 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {Math.round(displayProgress)}%
                    </span>
                    <span className="text-[10px] text-zinc-500 uppercase font-sans font-bold">
                      {displayProgress >= 100 ? 'Ready' : (job?.status === 'downloading' ? 'Downloaded' : 'Total Progress')}
                    </span>
                  </div>
                </div>

                {/* Animated Progress Track */}
                <div className="w-full h-2 rounded-full bg-zinc-850 overflow-hidden relative p-[1px]">
                  <div
                    className="h-full bg-gradient-to-r from-rose-500 via-amber-400 to-emerald-400 transition-all duration-200 ease-out rounded-full relative"
                    style={{
                      width: `${Math.min(100, Math.max(1, displayProgress))}%`,
                    }}
                  >
                    <div className="absolute inset-0 bg-white/20 animate-pulse rounded-full" />
                  </div>
                </div>

                {/* Live Download Speed & Metrics Badges (If Available) */}
                <div className="flex items-center flex-wrap gap-2 text-[10px] text-zinc-400 pt-0.5">
                  {job?.downloadProgress?.speed && (
                    <span className="px-2 py-0.5 rounded-md bg-zinc-850 border border-zinc-750 font-mono text-amber-300 font-semibold flex items-center gap-1">
                      <Zap size={11} className="text-amber-400" />
                      <span>Speed: {job.downloadProgress.speed}</span>
                    </span>
                  )}
                  {job?.downloadProgress?.totalSize && (
                    <span className="px-2 py-0.5 rounded-md bg-zinc-850 border border-zinc-750 font-mono text-zinc-300 flex items-center gap-1">
                      <span>Size: {job.downloadProgress.totalSize}</span>
                    </span>
                  )}
                  {job?.downloadProgress?.eta && (
                    <span className="px-2 py-0.5 rounded-md bg-zinc-850 border border-zinc-750 font-mono text-emerald-300 flex items-center gap-1">
                      <Clock size={11} className="text-emerald-400" />
                      <span>ETA: {job.downloadProgress.eta}</span>
                    </span>
                  )}
                  <span className="text-zinc-500 ml-auto text-[10px]">
                    Step: {displayProgress >= 100 ? 'complete' : (job?.status || 'processing')} • 6x Multi-fragment acceleration active
                  </span>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* 3. Results Section: Detected Clips & Interactive Preview Player */}
        {job && clips.length > 0 && (
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
                <div className="p-3 rounded-xl bg-zinc-950/60 border border-zinc-850 flex items-center gap-3">
                  {job.videoInfo.thumbnail ? (
                    <img
                      src={job.videoInfo.thumbnail}
                      alt={job.videoInfo.title}
                      className="w-20 h-13.5 object-cover rounded-lg border border-zinc-800 shrink-0"
                    />
                  ) : (
                    <div className="w-20 h-13.5 bg-zinc-900 rounded-lg flex items-center justify-center text-zinc-600 shrink-0">
                      <Tv size={18} />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[9.5px] px-1.5 py-0.2 rounded bg-zinc-850 text-zinc-400 font-bold uppercase">
                        {job.videoInfo.channel}
                      </span>
                      <span className="text-[9.5px] text-zinc-500">
                        {formatTime(job.videoInfo.duration)} total duration
                      </span>
                    </div>
                    <h2 className="text-xs md:text-[13px] font-bold text-zinc-200 truncate mt-0.5">
                      {job.videoInfo.title}
                    </h2>
                    <p className="text-[9.5px] text-emerald-400 font-medium mt-0.5 flex items-center gap-1">
                      <CheckCircle2 size={10} />
                      <span>
                        {clips.length} viral shorts extracted across timeline
                        {job.videoInfo.duration > 1800 ? ' • Long-Form Video Optimized' : ''}
                      </span>
                    </p>
                  </div>
                </div>
              )}

              {/* Timing & Telemetry Performance HUD */}
              <div className="p-2.5 px-3 rounded-xl bg-zinc-950/70 border border-zinc-800 flex flex-wrap items-center justify-between gap-2.5 text-xs">
                <div className="flex items-center gap-3.5 flex-wrap">
                  {/* AI Generation Timing */}
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-5 rounded-md bg-amber-500/20 text-amber-400 flex items-center justify-center">
                      <Zap size={11} />
                    </div>
                    <div>
                      <div className="text-[9px] text-zinc-400 font-bold uppercase tracking-wider">AI Generation Time</div>
                      <div className="font-mono font-black text-amber-300 text-[11px]">
                        {job.generationTimeMs ? `${(job.generationTimeMs / 1000).toFixed(1)}s` : '1.8s'}
                        <span className="text-[9.5px] text-zinc-500 font-normal ml-1">({clips.length} viral clips)</span>
                      </div>
                    </div>
                  </div>

                  <div className="h-5 w-px bg-zinc-800 hidden sm:block" />

                  {/* Video Download / Stream Timing */}
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-5 rounded-md bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                      <Clock size={11} />
                    </div>
                    <div>
                      <div className="text-[9px] text-zinc-400 font-bold uppercase tracking-wider">Stream & Download Time</div>
                      <div className="font-mono font-black text-emerald-400 text-[11px]">
                        {job.isCachedSource || job.downloadTimeMs === 0 ? (
                          <span className="text-emerald-300 flex items-center gap-1">
                            <span>⚡ 0.0s</span>
                            <span className="text-[9px] px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 font-bold">Instant Local Cache</span>
                          </span>
                        ) : job.status === 'downloading' ? (
                          <span className="text-rose-400 animate-pulse flex items-center gap-1">
                            <span>{job.downloadProgress?.percent ? `${Math.round(job.downloadProgress.percent)}%` : 'Streaming'}</span>
                            {job.downloadProgress?.speed && <span className="text-[9px] text-zinc-400">({job.downloadProgress.speed})</span>}
                            {job.downloadProgress?.eta && <span className="text-[9px] text-zinc-500">ETA {job.downloadProgress.eta}</span>}
                          </span>
                        ) : job.downloadTimeMs ? (
                          <span className="text-emerald-300">
                            {(job.downloadTimeMs / 1000).toFixed(1)}s
                            <span className="text-[9.5px] text-zinc-500 font-normal ml-1">completed</span>
                          </span>
                        ) : (
                          <span className="text-emerald-300">Ready</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border ${
                    job.status === 'downloading'
                      ? 'bg-rose-500/20 text-rose-300 border-rose-500/40 animate-pulse'
                      : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                  }`}>
                    {job.status === 'downloading' ? 'Streaming video in background...' : 'Ready for Export & Preview'}
                  </span>
                </div>
              </div>

              {/* Viral Upload Hashtags & Description Kit */}
              {((job.hashtags && job.hashtags.length > 0) || (activeClip?.tags && activeClip.tags.length > 0)) && (
                <div className="p-3 rounded-xl bg-gradient-to-r from-zinc-950 via-zinc-900 to-zinc-950 border border-rose-500/25 flex flex-col gap-2 shadow-md shadow-rose-950/15">
                  <div className="flex items-center justify-between gap-2.5 flex-wrap">
                    <div className="flex items-center gap-2">
                      <div className="w-5 h-5 rounded-md bg-rose-500/20 text-rose-400 flex items-center justify-center shrink-0">
                        <Hash size={12} />
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[11px] font-black uppercase tracking-wider text-rose-300">
                            Viral Shorts & Reels Hashtags
                          </span>
                          <span className="text-[9px] px-1.5 py-0.2 rounded bg-rose-500/20 text-rose-400 font-bold border border-rose-500/30">
                            SEO Optimized
                          </span>
                        </div>
                        <p className="text-[9.5px] text-zinc-400">
                          Use these trending tags when uploading any of your shorts to YouTube, Instagram Reels, or TikTok.
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={handleCopyAllHashtags}
                      className="px-2.5 py-1 rounded-lg bg-gradient-to-r from-rose-600 to-pink-600 hover:from-rose-500 hover:to-pink-500 active:scale-95 text-white font-bold text-[10.5px] flex items-center gap-1.5 transition-all cursor-pointer shadow-sm shadow-rose-600/30 shrink-0"
                    >
                      {copiedAllHashtags ? (
                        <>
                          <Check size={11} className="text-white" />
                          <span>Copied All Hashtags!</span>
                        </>
                      ) : (
                        <>
                          <Copy size={11} />
                          <span>Copy All Hashtags (1-Click)</span>
                        </>
                      )}
                    </button>
                  </div>

                  {/* Hashtag Chips Grid */}
                  <div className="flex flex-wrap items-center gap-1 pt-0.5 max-h-20 overflow-y-auto">
                    {(job.hashtags && job.hashtags.length > 0 ? job.hashtags : (activeClip?.tags || [])).map((tag, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => handleCopySingleTag(tag)}
                        className={`px-2 py-0.5 rounded-md text-[10px] font-mono transition-all cursor-pointer border ${
                          copiedTagText === (tag.startsWith('#') ? tag : `#${tag}`)
                            ? 'bg-rose-500 text-white border-rose-400'
                            : 'bg-zinc-900/90 hover:bg-zinc-800 border-zinc-800 hover:border-rose-500/50 text-zinc-300 hover:text-white'
                        }`}
                        title="Click to copy single hashtag"
                      >
                        {tag.startsWith('#') ? tag : `#${tag}`}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Batch Export All Clips Hero Banner with Direct Folder & ZIP */}
              <div className="p-3 sm:p-3.5 rounded-xl bg-gradient-to-r from-blue-950/60 via-zinc-900 to-indigo-950/60 border border-blue-500/35 flex flex-col gap-2.5 shadow-lg shadow-blue-950/30">
                <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-2.5">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-blue-500/20 border border-blue-500/40 flex items-center justify-center text-blue-400 shrink-0">
                      <FolderDown size={18} />
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <h3 className="text-[11px] font-black uppercase tracking-wider text-blue-300">
                          Export All {clips.length} Shorts
                        </h3>
                        <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30 font-bold">
                          Direct Folder or ZIP
                        </span>
                      </div>
                      <p className="text-[9.5px] text-zinc-400 mt-0.5">
                        Save all clips directly into a folder on your computer without extracting ZIP, or download archive.
                      </p>
                    </div>
                  </div>

                  {/* Speed & Resolution Switcher */}
                  <div className="flex items-center gap-1 p-0.5 rounded-lg bg-zinc-950/80 border border-zinc-800 shrink-0 text-[10px]">
                    <span className="text-zinc-500 font-bold px-1.5 text-[9px] uppercase">Quality:</span>
                    <button
                      type="button"
                      onClick={() => setTargetResolution('720p')}
                      className={`px-2 py-0.5 rounded-md font-bold transition-all ${
                        targetResolution === '720p'
                          ? 'bg-blue-600 text-white shadow-sm'
                          : 'text-zinc-400 hover:text-white'
                      }`}
                      title="Renders in ~2s per clip (Native 9:16 HD - 3MB/clip)"
                    >
                      ⚡ Fast 720p HD
                    </button>
                    <button
                      type="button"
                      onClick={() => setTargetResolution('1080p')}
                      className={`px-2 py-0.5 rounded-md font-bold transition-all ${
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
                <div className="flex items-center flex-wrap gap-2 pt-0.5">
                  {/* Option 1: Direct Folder Save (No ZIP) */}
                  <button
                    type="button"
                    onClick={handleSaveDirectlyToFolder}
                    disabled={isFolderExporting}
                    className="flex-1 sm:flex-none px-4 py-2 rounded-lg bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-400 hover:to-indigo-500 disabled:opacity-50 text-white font-black uppercase text-[11px] tracking-wider flex items-center justify-center gap-1.5 shadow-md shadow-blue-500/25 active:scale-95 transition-all cursor-pointer"
                  >
                    {isFolderExporting ? (
                      <>
                        <RefreshCw size={13} className="animate-spin text-white" />
                        <span>{folderProgressMsg || 'Saving directly into folder...'}</span>
                      </>
                    ) : (
                      <>
                        <FolderDown size={14} />
                        <span>📁 Save All ({clips.length}) Directly to Folder (No ZIP)</span>
                      </>
                    )}
                  </button>

                  {/* Option 2: Download All as Single ZIP */}
                  <button
                    type="button"
                    onClick={handleDownloadAllZip}
                    disabled={isBatchRendering}
                    className="flex-1 sm:flex-none px-3.5 py-2 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-750 hover:border-zinc-700 disabled:opacity-50 text-zinc-300 hover:text-white font-bold text-[11px] tracking-wider flex items-center justify-center gap-1.5 active:scale-95 transition-all cursor-pointer"
                  >
                    {isBatchRendering ? (
                      <>
                        <RefreshCw size={13} className="animate-spin text-zinc-400" />
                        <span>{batchProgressMsg || 'Packaging ZIP...'}</span>
                      </>
                    ) : (
                      <>
                        <Archive size={13} className="text-emerald-400" />
                        <span>Download as ZIP Archive</span>
                      </>
                    )}
                  </button>

                  {/* Option 3: Open Output Folder in Windows File Explorer */}
                  {exportedFolderPath && (
                    <button
                      type="button"
                      onClick={handleOpenServerFolder}
                      className="px-3.5 py-2 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/50 text-emerald-300 font-bold text-[11px] flex items-center gap-1.5 active:scale-95 transition-all cursor-pointer"
                      title="Open folder directly in Windows Explorer"
                    >
                      <FolderOpen size={13} />
                      <span>Open in File Explorer 📂</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Folder Export Active Progress Alert */}
              {isFolderExporting && (
                <div className="p-3 rounded-xl bg-blue-950/60 border border-blue-500/40 flex flex-col gap-2 text-xs animate-in fade-in">
                  <div className="flex items-center justify-between font-bold">
                    <div className="flex items-center gap-2 text-blue-300 text-[11px]">
                      <RefreshCw size={13} className="animate-spin text-blue-400" />
                      <span>{folderProgressMsg || 'Exporting shorts directly to folder...'}</span>
                    </div>
                    <span className="font-mono text-blue-400 text-xs font-black">{Math.round(folderDisplayPercent)}%</span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-zinc-900 overflow-hidden p-[1px]">
                    <div
                      className="h-full bg-gradient-to-r from-blue-500 via-indigo-400 to-emerald-400 transition-all duration-150 ease-out rounded-full"
                      style={{ width: `${Math.min(100, Math.max(2, folderDisplayPercent))}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Batch ZIP Active Progress Alert */}
              {isBatchRendering && (
                <div className="p-3 rounded-xl bg-emerald-950/60 border border-emerald-500/40 flex flex-col gap-2 text-xs animate-in fade-in">
                  <div className="flex items-center justify-between font-bold">
                    <div className="flex items-center gap-2 text-emerald-300 text-[11px]">
                      <RefreshCw size={13} className="animate-spin text-emerald-400" />
                      <span>{batchProgressMsg || 'Packaging all shorts into ZIP...'}</span>
                    </div>
                    <span className="font-mono text-emerald-400 text-xs font-black">{Math.round(batchDisplayPercent)}%</span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-zinc-900 overflow-hidden p-[1px]">
                    <div
                      className="h-full bg-gradient-to-r from-emerald-500 via-teal-400 to-cyan-400 transition-all duration-150 ease-out rounded-full"
                      style={{ width: `${Math.min(100, Math.max(2, batchDisplayPercent))}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Folder Export Success Alert */}
              {exportedClips.length > 0 && (
                <div className="p-3 rounded-xl bg-blue-950/50 border border-blue-500/50 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5 text-xs animate-in fade-in">
                  <div className="flex items-center gap-2 text-blue-300 font-bold truncate">
                    <CheckCircle2 size={15} className="text-emerald-400 shrink-0" />
                    <span className="truncate text-[11px]">
                      {folderProgressMsg || `All ${exportedClips.length} clips exported to folder successfully!`}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={handleOpenServerFolder}
                      className="px-2.5 py-1 rounded-lg bg-blue-500 hover:bg-blue-400 text-white font-bold text-[10px] tracking-wider transition-all cursor-pointer"
                    >
                      Show Folder on Computer
                    </button>
                  </div>
                </div>
              )}

              {/* Ready ZIP Download Alert */}
              {batchDownloadUrl && (
                <div className="p-3 rounded-xl bg-emerald-950/50 border border-emerald-500/50 flex items-center justify-between gap-2.5 text-xs animate-in fade-in">
                  <div className="flex items-center gap-2 text-emerald-400 font-bold truncate">
                    <CheckCircle2 size={15} />
                    <span className="text-[11px]">{batchProgressMsg || 'ZIP Archive Ready!'}</span>
                  </div>
                  <a
                    href={batchDownloadUrl}
                    download={`cinemiq-shorts-${job.id}.zip`}
                    target="_blank"
                    rel="noreferrer"
                    className="px-2.5 py-1 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black font-black uppercase text-[10px] tracking-wider transition-all"
                  >
                    Download ZIP Again
                  </a>
                </div>
              )}

              {/* Clips List */}
              <div className="flex flex-col gap-2.5">
                <div className="flex items-center justify-between">
                  <h3 className="text-[11px] font-black uppercase tracking-wider text-zinc-400">
                    AI Highlight Clips ({clips.length})
                  </h3>
                  <span className="text-[9.5px] text-zinc-500">
                    Ranked by predicted audience retention
                  </span>
                </div>

                {/* Quick jump navigator for 10-20 clips */}
                {clips.length > 6 && (
                  <div className="flex items-center gap-1 overflow-x-auto pb-0.5 text-[9.5px]">
                    <span className="text-zinc-500 font-bold shrink-0">Jump to:</span>
                    {clips.map((c, idx) => (
                      <button
                        key={c.id}
                        onClick={() => setSelectedClipId(c.id)}
                        className={`px-1.5 py-0.5 rounded font-mono font-bold shrink-0 transition-all ${
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
                      className={`p-3 rounded-xl border transition-all cursor-pointer flex flex-col gap-2 ${
                        isSelected
                          ? 'bg-zinc-900/90 border-rose-500/60 shadow-lg shadow-rose-500/5 ring-1 ring-rose-500/30'
                          : 'bg-zinc-950/40 border-zinc-850 hover:border-zinc-750 hover:bg-zinc-900/40'
                      }`}
                    >
                      {/* Top Row: Title + Virality Badge + 1-Click Download */}
                      <div className="flex items-start justify-between gap-2.5">
                        <div className="flex items-start gap-2 min-w-0">
                          <span className="w-4.5 h-4.5 rounded bg-zinc-850 text-zinc-400 flex items-center justify-center text-[9px] font-black shrink-0 mt-0.5">
                            #{index + 1}
                          </span>
                          <div className="min-w-0">
                            <h4 className="text-[11.5px] font-bold text-zinc-100 truncate">
                              {clip.title}
                            </h4>
                            <p className="text-[10px] text-zinc-400 italic mt-0.5 truncate">
                              Hook: {clip.hook}
                            </p>
                          </div>
                        </div>

                        {/* Quick 1-click download button & Virality score */}
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDownloadSingleClip(clip);
                            }}
                            disabled={renderingClipId === clip.id}
                            className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-zinc-900 hover:bg-rose-500/20 border border-zinc-800 hover:border-rose-500/50 text-zinc-300 hover:text-rose-300 text-[9.5px] font-bold transition-all shrink-0 cursor-pointer"
                            title="1-Click Save Short (MP4)"
                          >
                            {renderingClipId === clip.id ? (
                              <>
                                <RefreshCw size={10} className="animate-spin text-rose-400" />
                                <span>Saving...</span>
                              </>
                            ) : (
                              <>
                                <Download size={10} className="text-rose-400" />
                                <span>Save Short</span>
                              </>
                            )}
                          </button>

                          <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-gradient-to-r from-amber-500/20 to-rose-500/20 border border-amber-500/40 text-amber-400 text-[9.5px] font-black shrink-0">
                            <Flame size={10} className="text-rose-400" />
                            <span>{clip.viralityScore}%</span>
                          </div>
                        </div>
                      </div>

                      {/* Reason & Timestamp meta */}
                      <div className="flex items-center justify-between text-[9px] text-zinc-500 pt-1 border-t border-zinc-850/60">
                        <span className="text-zinc-400 truncate max-w-[65%]">{clip.reason}</span>
                        <div className="flex items-center gap-1 font-mono text-zinc-400 shrink-0">
                          <Clock size={10} />
                          <span>
                            {formatTime(clipStart)} - {formatTime(clipEnd)} ({duration}s)
                          </span>
                        </div>
                      </div>

                      {/* If Selected: Show Fine-tuning controls inside card */}
                      {isSelected && (
                        <div
                          onClick={(e) => e.stopPropagation()}
                          className="pt-2 border-t border-zinc-800 flex flex-col gap-2"
                        >
                          {/* Headline Overlay Text Editor */}
                          <div className="flex flex-col gap-0.5">
                            <label className="text-[9px] font-bold text-zinc-400 uppercase tracking-wider">
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
                              className="w-full bg-zinc-950 border border-zinc-800 rounded-md px-2.5 py-1 text-[11px] text-white placeholder-zinc-600 focus:outline-none focus:border-rose-500/60"
                            />
                          </div>

                          {/* Trimming Adjusters */}
                          <div className="grid grid-cols-2 gap-2 text-xs">
                            <div className="flex flex-col gap-0.5">
                              <span className="text-[9px] text-zinc-500">
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
                                className="bg-zinc-950 border border-zinc-800 rounded-md px-2 py-0.5 text-zinc-200 font-mono text-[11px] focus:outline-none"
                              />
                            </div>

                            <div className="flex flex-col gap-0.5">
                              <span className="text-[9px] text-zinc-500">
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
                                className="bg-zinc-950 border border-zinc-800 rounded-md px-2 py-0.5 text-zinc-200 font-mono text-[11px] focus:outline-none"
                              />
                            </div>
                          </div>

                          {/* Quick Tag Copy */}
                          {clip.tags && clip.tags.length > 0 && (
                            <div className="flex items-center justify-between text-[9px] text-zinc-500 pt-0.5">
                              <span className="truncate max-w-[80%] font-mono">
                                {clip.tags.join(' ')}
                              </span>
                              <button
                                onClick={() => handleCopySingleTag(clip.tags.join(' '))}
                                className="flex items-center gap-1 text-zinc-400 hover:text-white transition-colors cursor-pointer"
                              >
                                {copiedTagText === clip.tags.join(' ') ? <Check size={10} /> : <Copy size={10} />}
                                <span>{copiedTagText === clip.tags.join(' ') ? 'Copied' : 'Copy'}</span>
                              </button>
                            </div>
                          )}

                          {/* Mobile jump to preview button */}
                          <button
                            type="button"
                            onClick={() => setMobileViewTab('preview')}
                            className="lg:hidden w-full py-1.5 rounded-lg bg-rose-500/15 border border-rose-500/30 hover:bg-rose-500/25 text-rose-400 font-bold text-[11px] flex items-center justify-center gap-1.5 transition-all mt-0.5"
                          >
                            <Smartphone size={12} />
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

                  <div className="flex items-center gap-2">
                    {/* Phone Size Switcher */}
                    <div className="flex items-center p-0.5 rounded-lg bg-zinc-900 border border-zinc-800 text-[10px]">
                      <button
                        type="button"
                        onClick={() => setPhonePreviewSize('compact')}
                        className={`px-2 py-0.5 rounded font-bold transition-all ${
                          phonePreviewSize === 'compact'
                            ? 'bg-zinc-700 text-white'
                            : 'text-zinc-400 hover:text-white'
                        }`}
                        title="Compact View (260px)"
                      >
                        S
                      </button>
                      <button
                        type="button"
                        onClick={() => setPhonePreviewSize('standard')}
                        className={`px-2 py-0.5 rounded font-bold transition-all ${
                          phonePreviewSize === 'standard'
                            ? 'bg-zinc-700 text-white'
                            : 'text-zinc-400 hover:text-white'
                        }`}
                        title="Standard View (310px)"
                      >
                        M
                      </button>
                      <button
                        type="button"
                        onClick={() => setPhonePreviewSize('large')}
                        className={`px-2 py-0.5 rounded font-bold transition-all ${
                          phonePreviewSize === 'large'
                            ? 'bg-rose-600 text-white shadow-sm'
                            : 'text-zinc-400 hover:text-white'
                        }`}
                        title="Large 9:16 Cinema View (360px)"
                      >
                        L (Reel)
                      </button>
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
                </div>

                {/* Simulated Smartphone Shell */}
                <div
                  ref={phoneRef}
                  className={`relative ${
                    phonePreviewSize === 'compact'
                      ? 'w-[230px] h-[408px]'
                      : phonePreviewSize === 'standard'
                      ? 'w-[270px] h-[480px]'
                      : 'w-[300px] sm:w-[325px] h-[533px] sm:h-[578px]'
                  } bg-black rounded-[36px] p-2 sm:p-2.5 shadow-2xl border-4 border-zinc-800 ring-1 ring-zinc-700/50 overflow-hidden flex flex-col items-center justify-center transition-all duration-200 group/phone`}
                >
                  {/* Camera notch */}
                  <div className="absolute top-2 w-16 h-3 bg-zinc-900 rounded-full z-30 pointer-events-none" />

                  {/* Screen viewport */}
                  <div className="relative w-full h-full rounded-[26px] overflow-hidden bg-black flex items-center justify-center">
                    {/* Media Layer */}
                    {job.videoUrl ? (
                      <>
                        {/* Background for 9:16 blurred mode */}
                        {aspectRatio === '9:16-blur' && (
                          <video
                            src={`${API_URL}${job.videoUrl}`}
                            className="absolute inset-0 w-full h-full object-cover blur-md opacity-60 scale-125 select-none pointer-events-none"
                            muted
                            loop
                            playsInline
                          />
                        )}

                        {/* Foreground Video */}
                        <video
                          ref={videoRef}
                          src={`${API_URL}${job.videoUrl}`}
                          poster={job?.videoInfo?.thumbnail}
                          preload="auto"
                          className={`relative z-10 ${
                            aspectRatio === '9:16-crop'
                              ? 'w-full h-full object-cover'
                              : aspectRatio === 'original'
                              ? 'w-full object-contain'
                              : 'w-full object-contain max-h-full'
                          }`}
                          playsInline
                        />
                      </>
                    ) : isEmbedPlaying && job?.videoInfo?.id && job.videoInfo.id !== 'unknown' ? (
                      <iframe
                        key={`yt-preview-${activeClip?.id || 'main'}-${Math.floor(currentStart)}`}
                        src={`https://www.youtube.com/embed/${job.videoInfo.id}?start=${Math.floor(currentStart)}&end=${Math.ceil(currentEnd)}&autoplay=1&controls=1&rel=0&modestbranding=1`}
                        title={activeClip?.title || 'YouTube Short Preview'}
                        className="relative z-10 w-full h-full object-cover pointer-events-auto"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                      />
                    ) : job?.videoInfo?.id && job.videoInfo.id !== 'unknown' ? (
                      <div className="relative w-full h-full flex items-center justify-center bg-black overflow-hidden select-none">
                        {/* Ambient blurred backdrop */}
                        <img
                          src={job?.videoInfo?.thumbnail || `https://i.ytimg.com/vi/${job?.videoInfo?.id}/hqdefault.jpg`}
                          alt=""
                          className="absolute inset-0 w-full h-full object-cover blur-xl opacity-60 scale-125 select-none pointer-events-none"
                          onError={(e) => { e.currentTarget.style.display = 'none'; }}
                        />
                        {/* Crisp foreground poster */}
                        <img
                          src={job?.videoInfo?.thumbnail || `https://i.ytimg.com/vi/${job?.videoInfo?.id}/hqdefault.jpg`}
                          alt={activeClip?.title || 'Preview thumbnail'}
                          className={`relative z-10 ${
                            aspectRatio === '9:16-crop'
                              ? 'w-full h-full object-cover'
                              : 'w-full object-contain max-h-full'
                          }`}
                        />
                      </div>
                    ) : (
                      <div className="absolute inset-0 flex flex-col items-center justify-center p-4 bg-zinc-950 text-center gap-2.5">
                        <RefreshCw size={24} className="animate-spin text-rose-400" />
                        <span className="text-xs font-bold text-zinc-100">
                          {job?.stage || 'Connecting video stream...'}
                        </span>
                        <span className="text-[10px] text-zinc-400">
                          {Math.round(displayProgress)}%
                          {job?.downloadProgress?.speed ? ` • ${job.downloadProgress.speed}` : ''}
                        </span>
                        <div className="w-36 h-1.5 rounded-full bg-zinc-800 overflow-hidden mt-1">
                          <div
                            className="h-full bg-gradient-to-r from-rose-500 via-amber-400 to-emerald-400 transition-all duration-200 ease-out rounded-full"
                            style={{ width: `${Math.min(100, Math.max(1, displayProgress))}%` }}
                          />
                        </div>
                      </div>
                    )}

                    {/* Stream sync overlay badge at top right when buffering local MP4 */}
                    {!job.videoUrl && job?.videoInfo?.id && (
                      <div className="absolute top-2.5 right-2.5 z-25 pointer-events-none bg-black/75 backdrop-blur-md rounded-full px-2.5 py-1 border border-zinc-700/60 flex items-center gap-1.5 text-[9px] shadow-lg">
                        <RefreshCw size={10} className="animate-spin text-rose-400" />
                        <span className="text-zinc-200 font-mono font-medium">
                          {job?.downloadProgress?.percent ? `Buffering HD ${Math.round(job.downloadProgress.percent)}%` : 'Stream ready'}
                        </span>
                      </div>
                    )}

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

                    {/* Real-Time Kinetic Motion Graphics Lyric/Dialogue Subtitle Overlay */}
                    {captionStyle !== 'none' && (() => {
                      const currentSegs = activeClip?.transcriptSegments || job?.transcript || [];
                      const activeSeg = currentSegs.find(
                        (s) => currentPlayTime >= s.start - 0.05 && currentPlayTime <= s.end + 0.35
                      );
                      if (!activeSeg) return null;

                      const words =
                        activeSeg.words && activeSeg.words.length > 0
                          ? activeSeg.words
                          : activeSeg.text.split(/\s+/).map((w, idx, arr) => ({
                              word: w,
                              start: activeSeg.start + (idx * (activeSeg.end - activeSeg.start)) / arr.length,
                              end: activeSeg.start + ((idx + 1) * (activeSeg.end - activeSeg.start)) / arr.length,
                            }));

                      const activeWordIdx = words.findIndex(
                        (w) => currentPlayTime >= w.start && currentPlayTime <= w.end
                      );

                      return (
                        <div className="absolute bottom-16 left-3 right-3 z-20 pointer-events-none flex justify-center text-center">
                          <div
                            className={`px-2.5 py-1.5 rounded-xl max-w-[95%] transition-all ${
                              captionStyle === 'minimal'
                                ? 'bg-black/60 backdrop-blur-sm border border-white/10'
                                : 'drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)]'
                            }`}
                          >
                            <div className="flex flex-wrap items-center justify-center gap-x-1.5 gap-y-1 font-black uppercase tracking-wide">
                              {words.map((w, wIdx) => {
                                const isWordActive =
                                  wIdx === activeWordIdx || (activeWordIdx === -1 && wIdx === 0);
                                return (
                                  <span
                                    key={wIdx}
                                    className={`transition-all duration-100 inline-block ${
                                      isWordActive
                                        ? captionStyle === 'neon'
                                          ? 'text-[#00F5FF] scale-125 font-black drop-shadow-[0_0_12px_#00F5FF]'
                                          : captionStyle === 'mrbeast'
                                          ? 'text-[#39FF14] scale-125 font-black drop-shadow-[0_0_10px_#39FF14]'
                                          : captionStyle === 'karaoke'
                                          ? 'text-[#FFE81F] scale-115 font-black'
                                          : captionStyle === 'minimal'
                                          ? 'text-white scale-105 font-bold'
                                          : 'text-[#FFE81F] scale-125 font-black drop-shadow-[0_0_10px_#FFE81F]'
                                        : 'text-white/80 text-[10.5px] sm:text-xs'
                                    } ${isWordActive ? 'text-xs sm:text-sm' : ''}`}
                                    style={{
                                      textShadow: isWordActive
                                        ? '2px 2px 0 #000, -2px -2px 0 #000, 2px -2px 0 #000, -2px 2px 0 #000'
                                        : '1px 1px 0 #000, -1px -1px 0 #000',
                                    }}
                                  >
                                    {w.word}
                                  </span>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      );
                    })()}

                    {/* Floating Central Play / Pause Button - Prominently visible when paused */}
                    {!isPlaying && !isEmbedPlaying ? (
                      <button
                        type="button"
                        onClick={togglePlay}
                        className="absolute inset-0 z-25 flex items-center justify-center bg-black/25 hover:bg-black/40 transition-all cursor-pointer group/centerplay"
                        title="Click to Play Short"
                      >
                        <div className="w-16 h-16 rounded-full bg-gradient-to-tr from-rose-600 via-rose-500 to-red-500 text-white flex items-center justify-center shadow-2xl shadow-rose-600/50 ring-4 ring-white/30 group-hover/centerplay:scale-110 active:scale-95 transition-transform duration-200">
                          <Play size={28} className="ml-1 fill-white text-white" />
                        </div>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={togglePlay}
                        className="absolute inset-0 z-25 flex items-center justify-center bg-black/20 opacity-0 hover:opacity-100 transition-opacity cursor-pointer group/centerpause"
                        title="Click to Pause Short"
                      >
                        <div className="w-14 h-14 rounded-full bg-black/60 backdrop-blur-md text-white flex items-center justify-center shadow-xl ring-2 ring-white/20 hover:scale-105 active:scale-95 transition-transform">
                          <Pause size={24} className="fill-white text-white" />
                        </div>
                      </button>
                    )}

                    {/* In-Phone Floating Mini Player HUD - ALWAYS visible inside phone viewport */}
                    <div className="absolute bottom-2.5 left-2.5 right-2.5 z-30 bg-black/75 backdrop-blur-md rounded-xl p-2 flex items-center justify-between border border-white/10 text-white shadow-xl">
                      <button
                        type="button"
                        onClick={togglePlay}
                        className="w-7 h-7 rounded-lg bg-gradient-to-r from-rose-500 to-red-500 hover:from-rose-400 hover:to-red-400 text-white flex items-center justify-center transition-all shrink-0 cursor-pointer shadow-md active:scale-95"
                        title={isPlaying || isEmbedPlaying ? 'Pause' : 'Play'}
                      >
                        {isPlaying || isEmbedPlaying ? <Pause size={12} className="fill-white" /> : <Play size={12} className="ml-0.5 fill-white" />}
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
                            style={{ width: `${Math.min(100, Math.max(0, (currentProgressSec / clipDuration) * 100))}%` }}
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
                      {isPlaying || isEmbedPlaying ? <Pause size={13} /> : <Play size={13} className="ml-0.5" />}
                      <span>{isPlaying || isEmbedPlaying ? 'Pause' : 'Play'}</span>
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

                {/* Motion Graphical Texts / Kinetic Lyric Captions Style Selector */}
                <div className="w-full p-3 rounded-xl bg-zinc-900/90 border border-zinc-800 flex flex-col gap-2 shadow-inner">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <Sparkles size={13} className="text-amber-400" />
                      <span className="text-[11px] font-black uppercase tracking-wider text-zinc-200">
                        Kinetic Motion Graphics Lyrics & Captions
                      </span>
                    </div>
                    <span className="text-[9.5px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 font-bold border border-amber-500/30">
                      Word-by-Word
                    </span>
                  </div>

                  <div className="grid grid-cols-3 sm:grid-cols-6 gap-1 text-[10px]">
                    {[
                      { id: 'hormozi', label: 'Hormozi', desc: 'Yellow Pop', color: 'from-amber-500/20 to-yellow-500/10 border-amber-500/50 text-amber-300' },
                      { id: 'neon', label: 'Neon Cyber', desc: 'Cyan Glow', color: 'from-cyan-500/20 to-blue-500/10 border-cyan-500/50 text-cyan-300' },
                      { id: 'mrbeast', label: 'MrBeast', desc: 'Lime Burst', color: 'from-lime-500/20 to-emerald-500/10 border-lime-500/50 text-lime-300' },
                      { id: 'karaoke', label: 'Karaoke', desc: 'Fill Flow', color: 'from-purple-500/20 to-pink-500/10 border-purple-500/50 text-purple-300' },
                      { id: 'minimal', label: 'Minimal', desc: 'Clean White', color: 'from-zinc-800 to-zinc-900 border-zinc-700 text-zinc-200' },
                      { id: 'none', label: 'Off', desc: 'No Captions', color: 'from-zinc-900 to-zinc-950 border-zinc-800 text-zinc-500' },
                    ].map((style) => (
                      <button
                        key={style.id}
                        type="button"
                        onClick={() => setCaptionStyle(style.id as CaptionStyle)}
                        className={`p-1.5 rounded-lg border flex flex-col items-center justify-center text-center transition-all cursor-pointer ${
                          captionStyle === style.id
                            ? `bg-gradient-to-b ${style.color} shadow-sm font-black ring-1 ring-white/20`
                            : 'bg-zinc-950/80 border-zinc-850 hover:bg-zinc-900 text-zinc-400 font-semibold'
                        }`}
                      >
                        <span className="truncate w-full font-bold">{style.label}</span>
                        <span className="text-[8.5px] opacity-75">{style.desc}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Copyright-Free Background Music Selector with Auto-Ducking */}
                <div className="w-full p-3 rounded-xl bg-gradient-to-r from-zinc-900 via-zinc-950 to-zinc-900 border border-zinc-800 flex flex-col gap-2.5 shadow-inner">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <Music size={13} className="text-rose-400" />
                      <span className="text-[11px] font-black uppercase tracking-wider text-zinc-200">
                        Copyright-Free Background Music
                      </span>
                    </div>
                    <span className="text-[9.5px] px-1.5 py-0.2 rounded bg-rose-500/20 text-rose-300 font-bold border border-rose-500/30">
                      Royalty Free
                    </span>
                  </div>

                  {/* Track Selection & Play Preview */}
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <select
                        value={bgMusicTrack}
                        onChange={(e) => {
                          const val = e.target.value;
                          setBgMusicTrack(val);
                          if (isMusicPreviewPlaying && musicAudioRef.current) {
                            const track = musicTracks.find((t) => t.id === val);
                            if (track?.url) {
                              musicAudioRef.current.src = track.url.startsWith('http') ? track.url : `${API_URL}${track.url}`;
                              musicAudioRef.current.play().catch(() => {});
                            } else {
                              musicAudioRef.current.pause();
                              setIsMusicPreviewPlaying(false);
                            }
                          }
                        }}
                        className="w-full bg-zinc-950 border border-zinc-750 hover:border-zinc-700 rounded-lg px-2.5 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-rose-500 cursor-pointer"
                      >
                        {musicTracks.map((track) => (
                          <option key={track.id} value={track.id}>
                            {track.name} ({track.genre})
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Preview Play/Stop Button */}
                    {bgMusicTrack !== 'none' && (
                      <button
                        type="button"
                        onClick={() => toggleMusicPreview(bgMusicTrack)}
                        className={`px-2.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                          isMusicPreviewPlaying
                            ? 'bg-rose-500 text-white shadow-md shadow-rose-500/30 animate-pulse'
                            : 'bg-zinc-800 hover:bg-zinc-750 text-zinc-300 hover:text-white border border-zinc-700'
                        }`}
                        title="Listen to music preview"
                      >
                        {isMusicPreviewPlaying ? (
                          <>
                            <Pause size={12} />
                            <span>Stop</span>
                          </>
                        ) : (
                          <>
                            <Play size={12} />
                            <span>Preview</span>
                          </>
                        )}
                      </button>
                    )}
                  </div>

                  {/* Volume Slider and Auto-Ducking Switch */}
                  {bgMusicTrack !== 'none' && (
                    <div className="flex items-center justify-between gap-3 pt-1 border-t border-zinc-850/80 text-[10.5px]">
                      {/* Music Volume Slider */}
                      <div className="flex items-center gap-1.5">
                        <span className="text-zinc-400 font-semibold">Volume:</span>
                        <input
                          type="range"
                          min="0.05"
                          max="0.8"
                          step="0.05"
                          value={bgMusicVolume}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value);
                            setBgMusicVolume(val);
                            if (musicAudioRef.current) {
                              musicAudioRef.current.volume = val;
                            }
                          }}
                          className="w-16 h-1.5 rounded-lg bg-zinc-800 accent-rose-500 cursor-pointer"
                          title={`Music Volume: ${Math.round(bgMusicVolume * 100)}%`}
                        />
                        <span className="font-mono text-zinc-300 font-bold w-7 text-right">
                          {Math.round(bgMusicVolume * 100)}%
                        </span>
                      </div>

                      {/* Auto-Ducking Speech Priority Toggle */}
                      <label className="flex items-center gap-1.5 cursor-pointer text-zinc-300 select-none">
                        <input
                          type="checkbox"
                          checked={autoDucking}
                          onChange={(e) => setAutoDucking(e.target.checked)}
                          className="w-3.5 h-3.5 rounded bg-zinc-900 border-zinc-700 accent-rose-500 cursor-pointer"
                        />
                        <span className="font-bold text-zinc-300 hover:text-white transition-colors" title="Automatically lowers background music during voice speech so speech remains 100% crisp and clear">
                          Auto-Duck Dialogue 🎙️
                        </span>
                      </label>
                    </div>
                  )}
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

                  {/* Single Render Smooth Progress Track */}
                  {isRendering && (
                    <div className="w-full p-2.5 rounded-xl bg-rose-950/40 border border-rose-500/30 flex flex-col gap-1.5 animate-in fade-in">
                      <div className="flex items-center justify-between text-[11px] font-bold">
                        <span className="text-rose-300 flex items-center gap-1.5">
                          <RefreshCw size={12} className="animate-spin text-rose-400" />
                          <span>{renderProgressMsg || 'Rendering short...'}</span>
                        </span>
                        <span className="font-mono text-rose-400 font-black">{Math.round(renderDisplayPercent)}%</span>
                      </div>
                      <div className="w-full h-1.5 rounded-full bg-zinc-900 overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-rose-500 to-amber-400 transition-all duration-150 ease-out rounded-full"
                          style={{ width: `${Math.min(100, Math.max(2, renderDisplayPercent))}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {/* 1-Click Download ALL Clips in a ZIP bundle */}
                  <button
                    type="button"
                    onClick={handleDownloadAllZip}
                    disabled={isBatchRendering}
                    className="w-full py-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-750 hover:border-zinc-700 disabled:opacity-50 text-zinc-300 hover:text-white text-xs font-bold tracking-wider flex items-center justify-center gap-2 active:scale-95 transition-all cursor-pointer"
                  >
                    {isBatchRendering ? (
                      <>
                        <RefreshCw size={14} className="animate-spin text-emerald-400" />
                        <span>{batchProgressMsg || 'Packaging all clips into ZIP...'}</span>
                      </>
                    ) : (
                      <>
                        <Archive size={14} className="text-emerald-400" />
                        <span>Download as ZIP Archive</span>
                      </>
                    )}
                  </button>

                  {/* Batch ZIP Smooth Progress Track */}
                  {isBatchRendering && (
                    <div className="w-full p-2.5 rounded-xl bg-emerald-950/40 border border-emerald-500/30 flex flex-col gap-1.5 animate-in fade-in">
                      <div className="flex items-center justify-between text-[11px] font-bold">
                        <span className="text-emerald-300 flex items-center gap-1.5">
                          <RefreshCw size={12} className="animate-spin text-emerald-400" />
                          <span>{batchProgressMsg || 'Packaging ZIP...'}</span>
                        </span>
                        <span className="font-mono text-emerald-400 font-black">{Math.round(batchDisplayPercent)}%</span>
                      </div>
                      <div className="w-full h-1.5 rounded-full bg-zinc-900 overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-150 ease-out rounded-full"
                          style={{ width: `${Math.min(100, Math.max(2, batchDisplayPercent))}%` }}
                        />
                      </div>
                    </div>
                  )}

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
                      download={`${(job?.videoInfo?.title || 'cinemiq').replace(/[\\/:*?"<>|#]/g, ' ').trim()}-shorts.zip`}
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
                      download={getFullShortFilename(job?.videoInfo?.title, activeClip?.title)}
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
