import React, { useState } from 'react';
import { Film, Command, Save, FolderOpen, RefreshCw, HelpCircle } from 'lucide-react';
import { useProjectStore } from '../../store/useProjectStore';
import { editorBus } from '../../core/events/EventBus';

interface MenuItem {
  label: string;
  shortcut?: string;
  icon?: React.ReactNode;
}

interface MenuBarProps {
  onGoHome?: () => void;
}

export const MenuBar: React.FC<MenuBarProps> = ({ onGoHome }) => {
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const projectName = useProjectStore((s) => s.project.name);

  const menus: Record<string, MenuItem[]> = {
    File: [
      { label: 'New Project', shortcut: 'Ctrl+N', icon: <Film size={12} /> },
      { label: 'Open Project...', shortcut: 'Ctrl+O', icon: <FolderOpen size={12} /> },
      { label: 'Save Project', shortcut: 'Ctrl+S', icon: <Save size={12} /> },
      { label: 'Separator' },
      { label: 'Import Media...', shortcut: 'Ctrl+I' },
      { label: 'Export Video', shortcut: 'Ctrl+E' },
      { label: 'Separator' },
      { label: 'Exit', shortcut: 'Alt+F4' },
    ],
    Edit: [
      { label: 'Undo', shortcut: 'Ctrl+Z' },
      { label: 'Redo', shortcut: 'Ctrl+Y' },
      { label: 'Separator' },
      { label: 'Cut', shortcut: 'Ctrl+X' },
      { label: 'Copy', shortcut: 'Ctrl+C' },
      { label: 'Paste', shortcut: 'Ctrl+V' },
      { label: 'Delete', shortcut: 'Del' },
    ],
    Sequence: [
      { label: 'Render Preview', shortcut: 'Enter', icon: <RefreshCw size={12} /> },
      { label: 'Split Clip', shortcut: 'S' },
      { label: 'Add Audio Track', shortcut: 'Ctrl+Alt+A' },
      { label: 'Add Video Track', shortcut: 'Ctrl+Alt+V' },
    ],
    AI: [
      { label: 'Generate Script-to-Video', shortcut: 'Ctrl+G' },
      { label: 'AI Voiceover Generation', shortcut: 'Ctrl+T' },
      { label: 'Auto Transcribe Track', shortcut: 'Ctrl+Shift+T' },
      { label: 'Smart Bg Removal', shortcut: 'Ctrl+Shift+B' },
    ],
    Help: [
      { label: 'Keyboard Shortcuts', shortcut: '?', icon: <HelpCircle size={12} /> },
      { label: 'Documentation' },
      { label: 'About Cinemiq Pro' },
    ]
  };

  const handleMenuClick = (menu: string) => {
    if (activeMenu === menu) {
      setActiveMenu(null);
    } else {
      setActiveMenu(menu);
    }
  };

  return (
    <div className="h-10 w-full bg-zinc-950 border-b border-zinc-900/60 flex items-center justify-between px-4 select-none relative z-50 text-[11px] text-zinc-300 font-medium">
      {/* Brand logo & Menus */}
      <div className="flex items-center gap-2">
        <button
          onClick={onGoHome}
          className="flex items-center gap-1.5 mr-6 hover:opacity-85 active:scale-95 transition-all text-left group"
          title="Return to Main Dashboard"
        >
          <div className="w-5 h-5 rounded-lg bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/20 group-hover:shadow-cyan-500/40 transition-all">
            <span className="text-white font-black text-[10px]">C</span>
          </div>
          <span className="font-extrabold tracking-wider text-white text-[12px] bg-gradient-to-r from-white via-zinc-200 to-zinc-400 bg-clip-text text-transparent">CINEMIQ</span>
          <span className="text-[8px] bg-zinc-800 text-cyan-400 font-extrabold px-1 py-0.2 rounded border border-zinc-700/50 scale-90">STUDIO</span>
        </button>

        <div className="flex items-center">
          {Object.keys(menus).map((menuName) => (
            <div key={menuName} className="relative">
              <button
                onClick={() => handleMenuClick(menuName)}
                onMouseEnter={() => activeMenu && setActiveMenu(menuName)}
                className={`px-3 py-1.5 rounded transition-colors ${activeMenu === menuName ? 'bg-zinc-800 text-white' : 'hover:bg-zinc-900 hover:text-white'
                  }`}
              >
                {menuName}
              </button>

              {activeMenu === menuName && (
                <>
                  {/* Backdrop overlay to close menu */}
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setActiveMenu(null)}
                  />

                  {/* Dropdown list */}
                  <div className="absolute top-[28px] left-0 w-52 bg-zinc-900/95 border border-zinc-800 backdrop-blur-xl rounded-lg shadow-2xl p-1 z-50 flex flex-col gap-0.5">
                    {menus[menuName as keyof typeof menus].map((item, idx) => {
                      if (item.label === 'Separator') {
                        return <div key={idx} className="h-[1px] bg-zinc-800/80 my-1 mx-1.5" />;
                      }
                      return (
                        <button
                          key={idx}
                          onClick={() => {
                            setActiveMenu(null);
                            if (item.label === 'Save Project') {
                              editorBus.emit('shortcut:triggered', { command: 'editor:save_project' });
                            } else if (item.label === 'New Project') {
                              editorBus.emit('shortcut:triggered', { command: 'editor:new_project' });
                            } else if (item.label === 'Export Video') {
                              editorBus.emit('shortcut:triggered', { command: 'editor:render' });
                            }
                          }}
                          className="w-full flex items-center justify-between px-2.5 py-1.5 text-left rounded-md hover:bg-gradient-to-r hover:from-cyan-500/20 hover:to-blue-600/20 hover:text-white group transition-all text-zinc-300"
                        >
                          <div className="flex items-center gap-2">
                            {item.icon && <span className="text-zinc-500 group-hover:text-cyan-400">{item.icon}</span>}
                            <span className={item.icon ? '' : 'pl-5'}>{item.label}</span>
                          </div>
                          {item.shortcut && (
                            <span className="text-[9px] text-zinc-500 group-hover:text-zinc-400 flex items-center gap-0.5">
                              <Command size={8} /> {item.shortcut}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Project Status */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-zinc-900/50 border border-zinc-800/40 text-zinc-400">
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          <span>{projectName}</span>
        </div>
      </div>
    </div>
  );
};
