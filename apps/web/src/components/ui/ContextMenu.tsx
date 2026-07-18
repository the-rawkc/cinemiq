import React, { useEffect, useRef } from 'react';

export interface ContextMenuItem {
  label: string;
  icon?: React.ReactNode;
  action: () => void;
  separator?: boolean;
}

interface ContextMenuProps {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}

export const ContextMenu: React.FC<ContextMenuProps> = ({ x, y, items, onClose }) => {
  const menuRef = useRef<HTMLDivElement>(null);

  // Close context menu if clicked outside
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    window.addEventListener('mousedown', handleOutsideClick);
    return () => window.removeEventListener('mousedown', handleOutsideClick);
  }, [onClose]);

  // Adjust menu placement if it exceeds screen bounds
  const adjustCoords = {
    top: `${Math.min(y, window.innerHeight - 250)}px`,
    left: `${Math.min(x, window.innerWidth - 200)}px`
  };

  return (
    <div
      ref={menuRef}
      style={{
        position: 'fixed',
        top: adjustCoords.top,
        left: adjustCoords.left,
      }}
      className="z-50 min-w-[170px] bg-zinc-950/90 border border-zinc-800/80 backdrop-blur-md p-1.5 rounded-xl shadow-2xl flex flex-col gap-0.5 select-none animate-in fade-in zoom-in-95 duration-100"
    >
      {items.map((item, idx) => (
        <React.Fragment key={idx}>
          {item.separator ? (
            <div className="h-[1px] bg-zinc-900 my-1" />
          ) : (
            <button
              onClick={() => {
                item.action();
                onClose();
              }}
              className="w-full flex items-center justify-between text-left px-3 py-1.5 rounded-lg text-[10px] font-medium text-zinc-400 hover:text-zinc-100 hover:bg-zinc-850 hover:border-cyan-500/20 hover:border transition-all active:scale-98"
            >
              <span>{item.label}</span>
              {item.icon && <span className="opacity-60">{item.icon}</span>}
            </button>
          )}
        </React.Fragment>
      ))}
    </div>
  );
};
export default ContextMenu;
