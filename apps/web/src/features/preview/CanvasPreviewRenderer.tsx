import React, { useEffect, useRef } from 'react';
import { useUIStore } from '../../store/useUIStore';
import { useProjectStore } from '../../store/useProjectStore';
import { audioEngine } from '../../services/audio/AudioEngine';

interface CanvasPreviewRendererProps {
  aspectRatio: '16:9' | '9:16' | '1:1';
  showSafeArea: boolean;
}

export const CanvasPreviewRenderer: React.FC<CanvasPreviewRendererProps> = ({
  aspectRatio,
  showSafeArea,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const playheadTime = useUIStore((s) => s.playheadTime);
  const isPlaying = useUIStore((s) => s.isPlaying);
  const project = useProjectStore((s) => s.project);

  // Element caches for rendering frames
  const videoElements = useRef<Map<string, HTMLVideoElement>>(new Map());
  const imageElements = useRef<Map<string, HTMLImageElement>>(new Map());

  // Setup loop reference
  const rafRef = useRef<number | null>(null);

  // Sync active audio and video elements to AudioEngine
  useEffect(() => {
    const BUFFER_WINDOW = 5;
    const tracks = project.tracks || [];
    const clips = project.clips || [];

    // Filter audio & video clips inside the active preloading window
    const activeAudioClips = clips.filter(
      (c) => c.type === 'audio' && playheadTime >= c.offset - BUFFER_WINDOW && playheadTime <= c.offset + c.duration
    );

    const activeVideoClips = clips.filter(
      (c) => c.type === 'video' && playheadTime >= c.offset - BUFFER_WINDOW && playheadTime <= c.offset + c.duration
    );

    // Garbage collect video players outside of active preloading window to free up GPU layers
    videoElements.current.forEach((el, clipId) => {
      const clip = project.clips.find((c) => c.id === clipId);
      if (!clip || playheadTime < clip.offset - BUFFER_WINDOW || playheadTime > clip.offset + clip.duration) {
        el.pause();
        el.src = '';
        el.load();
        videoElements.current.delete(clipId);
        console.log(`♻️ [GC Cache] Garbage collected video player element for clip: ${clipId}`);
      }
    });

    // Sync audio files
    activeAudioClips.forEach((clip) => {
      // Audio engine matches actual timeline playing position
      const isAudible = playheadTime >= clip.offset && playheadTime <= clip.offset + clip.duration;
      audioEngine.syncAudioClip(
        clip.id,
        clip.source,
        clip.offset,
        clip.duration,
        clip.start,
        playheadTime,
        isPlaying && isAudible,
        clip.volume,
        clip.muted || tracks.find(t => t.id === clip.trackId)?.muted || false
      );
    });

    // Sync video audio nodes as well
    activeVideoClips.forEach((clip) => {
      // Seek hidden HTMLVideoElement
      let videoEl = videoElements.current.get(clip.id);
      if (!videoEl) {
        videoEl = document.createElement('video');
        videoEl.src = clip.source;
        videoEl.crossOrigin = 'anonymous';
        videoEl.playsInline = true;
        videoEl.muted = clip.muted || tracks.find(t => t.id === clip.trackId)?.muted || false;
        videoElements.current.set(clip.id, videoEl);
      }

      const isMuted = clip.muted || tracks.find(t => t.id === clip.trackId)?.muted || false;
      videoEl.muted = isMuted;
      videoEl.volume = clip.volume;

      const relativeTime = playheadTime - clip.offset;
      if (relativeTime >= 0 && relativeTime <= clip.duration) {
        const targetSec = relativeTime * clip.speed + clip.start;

        // Seek only on manual scrub (not playing) OR if drifting significantly (>0.5s) during active playback
        const maxDrift = isPlaying ? 0.5 : 0.05;
        if (Math.abs(videoEl.currentTime - targetSec) > maxDrift) {
          videoEl.currentTime = targetSec;
        }

        if (isPlaying && videoEl.paused) {
          videoEl.play().catch(() => { });
        } else if (!isPlaying && !videoEl.paused) {
          videoEl.pause();
        }
      } else {
        if (!videoEl.paused) videoEl.pause();
      }
    });

    // Pause all if isPlaying is false
    if (!isPlaying) {
      videoElements.current.forEach((el) => el.pause());
      audioEngine.pauseAll();
    }

    // Garbage collect unused clips from AudioEngine
    const activeIds = [...activeAudioClips.map((c) => c.id)];
    audioEngine.stopUnusedClips(activeIds);

  }, [playheadTime, isPlaying, project.clips, project.tracks]);

  // Canvas Compositing Loop
  const drawFrame = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Reset resolution
    const w = canvas.width;
    const h = canvas.height;

    // 1. Clear background
    ctx.fillStyle = '#09090b'; // zinc-950
    ctx.fillRect(0, 0, w, h);

    // 2. Sort tracks so top tracks render last (over base tracks)
    const sortedTracks = [...(project.tracks || [])].sort((a, b) => a.order - b.order);

    // 3. Composite visual layers
    sortedTracks.forEach((track) => {
      if (track.type !== 'video' || track.muted) return;

      const activeClips = (project.clips || []).filter(
        (c) =>
          c.trackId === track.id &&
          playheadTime >= c.offset &&
          playheadTime <= c.offset + c.duration &&
          (c.type === 'video' || c.type === 'image' || c.type === 'text')
      );

      activeClips.forEach((clip) => {
        ctx.save();

        const transform = clip.transform || { x: 0, y: 0, scaleX: 1.0, scaleY: 1.0, rotation: 0, opacity: 1.0 };
        ctx.globalAlpha = transform.opacity;

        // Apply visual transitions & transformations
        ctx.translate(w * (0.5 + transform.x / 100), h * (0.5 + transform.y / 100));
        ctx.rotate((transform.rotation * Math.PI) / 180);
        ctx.scale(transform.scaleX, transform.scaleY);

        // Compile CSS-style GPU filter effects
        let filterString = '';
        if (clip.effects && clip.effects.length > 0) {
          clip.effects.forEach((fx) => {
            if (!fx.enabled) return;
            if (fx.type === 'lut-teal' || fx.type === 'lut' || fx.type === 'teal') {
              filterString += ' contrast(1.2) hue-rotate(-10deg) saturate(1.3)';
            } else if (fx.type === 'lut-monochrome' || fx.type === 'monochrome' || fx.type === 'noir') {
              filterString += ' grayscale(100%) contrast(1.25)';
            } else if (fx.type === 'blur-gaussian' || fx.type === 'blur') {
              filterString += ` blur(${fx.properties.value ?? 5}px)`;
            } else if (fx.type === 'noise-vhs' || fx.type === 'noise') {
              filterString += ' sepia(20%) saturate(1.3) contrast(1.1)';
            }
          });
        }
        ctx.filter = filterString.trim() || 'none';

        if (clip.type === 'image') {
          let img = imageElements.current.get(clip.id);
          if (!img) {
            img = new Image();
            img.src = clip.source;
            img.crossOrigin = 'anonymous';
            imageElements.current.set(clip.id, img);
          }
          if (img.complete && img.width > 0 && img.height > 0) {
            // Draw scaling down to fit bounds
            const scale = Math.min(w / img.width, h / img.height);
            const drawW = img.width * scale;
            const drawH = img.height * scale;
            ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);
          }
        } else if (clip.type === 'video') {
          const video = videoElements.current.get(clip.id);
          if (video && video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0) {
            const scale = Math.min(w / video.videoWidth, h / video.videoHeight);
            const drawW = video.videoWidth * scale;
            const drawH = video.videoHeight * scale;
            ctx.drawImage(video, -drawW / 2, -drawH / 2, drawW, drawH);
          } else {
            // Loading placeholder if frame not seeked
            ctx.fillStyle = '#18181b';
            ctx.fillRect(-w / 4, -h / 4, w / 2, h / 2);
            ctx.fillStyle = '#a1a1aa';
            ctx.font = '10px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('Syncing frame...', 0, 0);
          }
        } else if (clip.type === 'text' && clip.textConfig) {
          const textCfg = clip.textConfig;
          ctx.fillStyle = textCfg.color;
          const boldStr = textCfg.bold ? 'bold ' : '';
          const italicStr = textCfg.italic ? 'italic ' : '';
          ctx.font = `${boldStr}${italicStr}${textCfg.fontSize}px ${textCfg.fontFamily}`;
          ctx.textAlign = textCfg.alignment;
          ctx.textBaseline = 'middle';

          // Draw text at the modified center
          ctx.fillText(textCfg.content, 0, 0);
        }

        // Reset filter
        ctx.filter = 'none';

        ctx.restore();
      });
    });

    // 4. Render Safe Area Bounds
    if (showSafeArea) {
      ctx.strokeStyle = 'rgba(234, 179, 8, 0.45)'; // Amber-500
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);

      // Action Safe (90%)
      ctx.strokeRect(w * 0.05, h * 0.05, w * 0.9, h * 0.9);

      // Title Safe (80%)
      ctx.strokeRect(w * 0.1, h * 0.1, w * 0.8, h * 0.8);
      ctx.setLineDash([]);
    }

    // Loop
    rafRef.current = requestAnimationFrame(drawFrame);
  };

  useEffect(() => {
    rafRef.current = requestAnimationFrame(drawFrame);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [project, playheadTime, showSafeArea]);

  // Adjust canvas resolution dynamically on ratio changes
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let targetW = 640;
    let targetH = 360;

    if (aspectRatio === '9:16') {
      targetW = 360;
      targetH = 640;
    } else if (aspectRatio === '1:1') {
      targetW = 500;
      targetH = 500;
    }

    canvas.width = targetW;
    canvas.height = targetH;
  }, [aspectRatio]);

  return (
    <canvas
      ref={canvasRef}
      className="max-w-full max-h-full block shadow-2xl rounded-lg border border-zinc-800"
      style={{
        aspectRatio: aspectRatio === '16:9' ? '16/9' : aspectRatio === '9:16' ? '9/16' : '1/1',
      }}
    />
  );
};
