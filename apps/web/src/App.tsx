import { useEffect, useState } from 'react';
import { MenuBar } from './components/layout/MenuBar';
import { Toolbar } from './components/layout/Toolbar';
import { StatusBar } from './components/layout/StatusBar';
import { ResizableContainer } from './components/ui/ResizableContainer';
import { MediaBrowser } from './features/media/MediaBrowser';
import { PreviewMonitor } from './features/preview/PreviewMonitor';
import { InspectorPanel } from './features/inspector/InspectorPanel';
import { TimelinePanel } from './features/timeline/TimelinePanel';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { AIGeneratorStudioPage } from './features/ai/AIGeneratorStudioPage';
import { LandingPage } from './features/landing/LandingPage';
import { PhotosToVideoPage } from './features/slideshow/PhotosToVideoPage';
import { useUIStore } from './store/useUIStore';
import { useProjectStore } from './store/useProjectStore';
import { editorBus } from './core/events/EventBus';
import { API_URL } from './config';

import './App.css';

function App() {
  const { isPlaying, setIsPlaying, playheadTime, setPlayheadTime, selectedClipId, setSelectedClipId } = useUIStore();
  const { project, removeClip, updateClip, undo, redo, setProject, addClip } = useProjectStore();

  const [renderStatus, setRenderStatus] = useState<'idle' | 'rendering' | 'completed' | 'failed'>('idle');
  const [renderProgress, setRenderProgress] = useState(0);
  const [renderOutputUrl, setRenderOutputUrl] = useState<string | null>(null);

  const [currentView, setCurrentView] = useState<'landing' | 'edit-videos' | 'ai-generation' | 'photos-to-video'>('landing');
  const [saveAlertMessage, setSaveAlertMessage] = useState<string | null>(null);

  const triggerRenderJob = async () => {
    setRenderStatus('rendering');
    setRenderProgress(0);
    setRenderOutputUrl(null);

    try {
      const response = await fetch(`${API_URL}/api/editor/render`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project }),
      });
      const data = await response.json();

      if (data.jobId) {
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
      console.error('Render trigger failed:', err);
      setRenderStatus('failed');
    }
  };

  // Register professional keyboard shortcuts
  useKeyboardShortcuts();

  // Listen to shortcuts emitted via EventBus
  useEffect(() => {
    const handleShortcut = (payload: { command: string }) => {
      console.log(`Shortcut Triggered: ${payload.command}`);

      switch (payload.command) {
        case 'playback:toggle':
          setIsPlaying(!isPlaying);
          break;

        case 'clip:delete_shortcut':
          if (selectedClipId) {
            removeClip(selectedClipId);
            setSelectedClipId(null);
          }
          break;

        case 'clip:split_shortcut':
          // Split clip operation
          if (selectedClipId) {
            const clip = project.clips.find(c => c.id === selectedClipId);
            if (clip && playheadTime > clip.offset && playheadTime < clip.offset + clip.duration) {
              const splitOffset = playheadTime - clip.offset;

              // Shrink original
              updateClip(selectedClipId, {
                duration: splitOffset
              });

              // Add split copy
              const newClip = {
                ...clip,
                id: Math.random().toString(36).substring(2, 9),
                offset: playheadTime,
                duration: clip.duration - splitOffset,
                start: clip.start + splitOffset,
                name: `${clip.name} (Split)`
              };
              addClip(newClip);
              setSelectedClipId(newClip.id);
            }
          }
          break;

        case 'playhead:prev_frame':
          setPlayheadTime(Math.max(0, playheadTime - 1 / 30));
          break;

        case 'playhead:next_frame':
          setPlayheadTime(playheadTime + 1 / 30);
          break;

        case 'ai:open_studio':
          setCurrentView('ai-generation');
          break;

        case 'editor:render':
          triggerRenderJob();
          break;

        case 'history:undo':
          undo();
          break;

        case 'history:redo':
          redo();
          break;

        case 'editor:save_project':
          localStorage.setItem('cinemiq-autosave-project', JSON.stringify(project));
          setSaveAlertMessage(`Project "${project.name}" saved successfully.`);
          setTimeout(() => setSaveAlertMessage(null), 3000);
          break;

        case 'editor:new_project':
          setProject({
            id: `project-${Math.random().toString(36).substring(2, 9)}`,
            name: 'Untitled Masterpiece',
            resolution: { width: 1920, height: 1080 },
            fps: 30,
            tracks: [
              { id: 'v2', type: 'video', name: 'Video 2 (Overlay)', muted: false, locked: false, order: 2 },
              { id: 'v1', type: 'video', name: 'Video 1 (Base)', muted: false, locked: false, order: 1 },
              { id: 'a1', type: 'audio', name: 'Audio 1', muted: false, locked: false, order: 3 },
            ],
            clips: [],
          });
          setSaveAlertMessage(`Created new empty project.`);
          setTimeout(() => setSaveAlertMessage(null), 3000);
          break;

        default:
          break;
      }
    };

    const unsubscribe = editorBus.on('shortcut:triggered', handleShortcut);
    return () => unsubscribe();
  }, [isPlaying, selectedClipId, playheadTime, project, removeClip, setIsPlaying, setSelectedClipId, setPlayheadTime, updateClip, undo, redo, setProject]);

  // Autosave Project configuration to Local Storage (1s debounce)
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      localStorage.setItem('cinemiq-autosave-project', JSON.stringify(project));
      console.log('💾 [Autosave] Saved project snapshot.');
    }, 1000);
    return () => clearTimeout(timeoutId);
  }, [project]);

  // Load Autosave on initial load
  useEffect(() => {
    const saved = localStorage.getItem('cinemiq-autosave-project');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed && parsed.clips && parsed.tracks) {
          setProject(parsed);
          console.log('💾 [Recovery] Loaded project from browser cache.');
        } else {
          console.log('⚠️ [Recovery] Dismissed malformed project backup.');
          localStorage.removeItem('cinemiq-autosave-project');
        }
      } catch (err) {
        console.error('Failed to recover autosave', err);
      }
    }
  }, [setProject]);

  if (currentView === 'landing') {
    return <LandingPage onSelectOption={(opt) => setCurrentView(opt)} />;
  }

  if (currentView === 'ai-generation') {
    return (
      <AIGeneratorStudioPage
        onClose={() => setCurrentView('landing')}
        onLoadProject={(proj) => {
          setProject(proj);
          setCurrentView('edit-videos');
        }}
      />
    );
  }

  if (currentView === 'photos-to-video') {
    return (
      <PhotosToVideoPage
        onClose={() => setCurrentView('landing')}
        onLoadProject={(proj) => {
          setProject(proj);
          setCurrentView('edit-videos');
        }}
      />
    );
  }

  return (
    <div className="h-screen w-screen flex flex-col bg-zinc-950 text-zinc-100 overflow-hidden font-sans select-none antialiased">
      {/* 1. Main Top Application Menu */}
      <MenuBar onGoHome={() => setCurrentView('landing')} />

      {/* 2. Desktop Toolbar */}
      <Toolbar />

      {/* 3. Resizable Panels Grid Workspace */}
      <div className="flex-1 overflow-hidden relative">
        <ResizableContainer
          direction="vertical"
          initialSize={60} // Upper workspace height percentage
          minSize={30}
          maxSize={80}
          firstPanel={
            <ResizableContainer
              direction="horizontal"
              initialSize={30} // Left sidebar (Media explorer) width percentage
              minSize={20}
              maxSize={50}
              firstPanel={<MediaBrowser />}
              secondPanel={
                <ResizableContainer
                  direction="horizontal"
                  initialSize={60} // Canvas Preview vs Inspector right width
                  minSize={40}
                  maxSize={80}
                  firstPanel={<PreviewMonitor />}
                  secondPanel={<InspectorPanel />}
                />
              }
            />
          }
          secondPanel={<TimelinePanel />}
        />
      </div>

      {/* 4. Bottom status indicators */}
      <StatusBar />

      {/* 5. Asynchronous Rendering Overlay */}
      {renderStatus !== 'idle' && (
        <div className="fixed bottom-12 right-6 bg-zinc-900/90 border border-zinc-800 backdrop-blur-md p-4 rounded-xl shadow-2xl z-50 flex flex-col gap-2.5 w-64 select-none animate-in fade-in slide-in-from-bottom-4">
          <div className="flex justify-between items-center text-[10px] uppercase font-black tracking-wider">
            <span className={renderStatus === 'rendering' ? 'text-cyan-400 animate-pulse' : renderStatus === 'completed' ? 'text-emerald-400' : 'text-rose-400'}>
              {renderStatus === 'rendering' ? 'Rendering Video' : renderStatus === 'completed' ? 'Render Complete' : 'Render Failed'}
            </span>
            <button
              onClick={() => setRenderStatus('idle')}
              className="text-zinc-500 hover:text-white transition-colors"
            >
              Close
            </button>
          </div>

          <div className="w-full bg-zinc-950 h-1.5 rounded-full overflow-hidden">
            <div
              style={{ width: `${renderProgress}%` }}
              className="bg-cyan-500 h-full transition-all duration-300 shadow-neon"
            />
          </div>

          <div className="flex justify-between items-center text-[9px] text-zinc-500 font-bold">
            <span>Progress: {renderProgress}%</span>
            {renderStatus === 'completed' && renderOutputUrl && (
              <a
                href={renderOutputUrl}
                target="_blank"
                rel="noreferrer"
                className="text-cyan-405 hover:text-white transition-colors font-black uppercase"
              >
                Download MP4
              </a>
            )}
          </div>
        </div>
      )}
      {/* 6. Save toast notification */}
      {saveAlertMessage && (
        <div className="fixed bottom-12 left-6 bg-zinc-900 border border-emerald-500/30 backdrop-blur-md p-4 rounded-xl shadow-2xl z-50 flex items-center gap-3 select-none animate-in fade-in slide-in-from-bottom-4">
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-[10px] text-zinc-300 font-extrabold uppercase tracking-wider">{saveAlertMessage}</span>
        </div>
      )}
    </div>
  );
}

export default App;
