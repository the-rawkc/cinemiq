import React, { useState, useRef, useEffect } from 'react';

interface ResizableContainerProps {
  direction: 'horizontal' | 'vertical';
  initialSize: number; // percentage (e.g. 30)
  minSize?: number;     // percentage (e.g. 15)
  maxSize?: number;     // percentage (e.g. 80)
  firstPanel: React.ReactNode;
  secondPanel: React.ReactNode;
  className?: string;
  onResize?: (size: number) => void;
}

export const ResizableContainer: React.FC<ResizableContainerProps> = ({
  direction,
  initialSize,
  minSize = 10,
  maxSize = 90,
  firstPanel,
  secondPanel,
  className = '',
  onResize,
}) => {
  const [size, setSize] = useState(initialSize);
  const containerRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);

  const startDrag = (e: React.MouseEvent) => {
    e.preventDefault();
    isDragging.current = true;
    document.body.style.cursor = direction === 'horizontal' ? 'col-resize' : 'row-resize';
    document.body.style.userSelect = 'none';
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.current || !containerRef.current) return;

      const containerRect = containerRef.current.getBoundingClientRect();
      let newSize = 0;

      if (direction === 'horizontal') {
        const deltaX = e.clientX - containerRect.left;
        newSize = (deltaX / containerRect.width) * 100;
      } else {
        const deltaY = e.clientY - containerRect.top;
        newSize = (deltaY / containerRect.height) * 100;
      }

      newSize = Math.max(minSize, Math.min(maxSize, newSize));
      setSize(newSize);
      if (onResize) onResize(newSize);
    };

    const handleMouseUp = () => {
      if (isDragging.current) {
        isDragging.current = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [direction, minSize, maxSize, onResize]);

  const firstPanelStyle: React.CSSProperties = direction === 'horizontal' 
    ? { width: `${size}%`, height: '100%' }
    : { height: `${size}%`, width: '100%' };

  const secondPanelStyle: React.CSSProperties = direction === 'horizontal'
    ? { width: `${100 - size}%`, height: '100%' }
    : { height: `${100 - size}%`, width: '100%' };

  return (
    <div
      ref={containerRef}
      className={`flex h-full w-full overflow-hidden ${
        direction === 'horizontal' ? 'flex-row' : 'flex-col'
      } ${className}`}
    >
      {/* First Panel */}
      <div style={firstPanelStyle} className="overflow-hidden flex-shrink-0">
        {firstPanel}
      </div>

      {/* Resize Handle */}
      <div
        onMouseDown={startDrag}
        className={`relative z-50 flex items-center justify-center flex-shrink-0 transition-colors cursor-pointer group ${
          direction === 'horizontal'
            ? 'w-1.5 h-full border-l border-r border-zinc-800/40 hover:bg-cyan-500/20 active:bg-cyan-500/40'
            : 'h-1.5 w-full border-t border-b border-zinc-800/40 hover:bg-cyan-500/20 active:bg-cyan-500/40'
        }`}
      >
        {/* Neon hover glow line */}
        <div
          className={`absolute opacity-0 group-hover:opacity-100 group-active:opacity-100 bg-cyan-500 transition-opacity blur-[1px] ${
            direction === 'horizontal' ? 'w-[2px] h-full' : 'h-[2px] w-full'
          }`}
        />
        <div
          className={`absolute opacity-0 group-hover:opacity-100 group-active:opacity-100 bg-cyan-400 transition-opacity ${
            direction === 'horizontal' ? 'w-[1px] h-1/6' : 'h-[1px] w-1/6'
          }`}
        />
      </div>

      {/* Second Panel */}
      <div style={secondPanelStyle} className="overflow-hidden flex-shrink-0">
        {secondPanel}
      </div>
    </div>
  );
};
