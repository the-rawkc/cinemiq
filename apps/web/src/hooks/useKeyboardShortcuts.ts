import { useEffect } from 'react';
import { editorBus } from '../core/events/EventBus';

export interface ShortcutBinding {
  key: string;            // Key code (e.g. ' ', 'Delete', 'z')
  ctrlKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
  command: string;        // Trigger name in EditorEventMap or custom command
  description: string;
}

export const defaultShortcuts: ShortcutBinding[] = [
  { key: ' ', command: 'playback:toggle', description: 'Play / Pause Video' },
  { key: 's', command: 'clip:split_shortcut', description: 'Split Clip at Playhead' },
  { key: 's', ctrlKey: true, command: 'editor:save_project', description: 'Save Project' },
  { key: 'Delete', command: 'clip:delete_shortcut', description: 'Delete Selected Clip' },
  { key: 'Backspace', command: 'clip:delete_shortcut', description: 'Delete Selected Clip' },
  { key: 'z', ctrlKey: true, command: 'history:undo', description: 'Undo Action' },
  { key: 'y', ctrlKey: true, command: 'history:redo', description: 'Redo Action' },
  { key: 'z', ctrlKey: true, shiftKey: true, command: 'history:undo', description: 'Redo Action Alternative' },
  { key: 'ArrowLeft', command: 'playhead:prev_frame', description: 'Move Playhead back 1 Frame' },
  { key: 'ArrowRight', command: 'playhead:next_frame', description: 'Move Playhead forward 1 Frame' },
];

export function useKeyboardShortcuts(bindings: ShortcutBinding[] = defaultShortcuts) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore shortcut inputs if we are in input fields, textareas
      const activeEl = document.activeElement;
      if (
        activeEl &&
        (activeEl.tagName === 'INPUT' ||
          activeEl.tagName === 'TEXTAREA' ||
          activeEl.getAttribute('contenteditable') === 'true')
      ) {
        return;
      }

      for (const binding of bindings) {
        const keyMatch = e.key.toLowerCase() === binding.key.toLowerCase();
        const ctrlMatch = !!binding.ctrlKey === (e.ctrlKey || e.metaKey);
        const shiftMatch = !!binding.shiftKey === e.shiftKey;
        const altMatch = !!binding.altKey === e.altKey;

        if (keyMatch && ctrlMatch && shiftMatch && altMatch) {
          e.preventDefault();
          editorBus.emit('shortcut:triggered', { command: binding.command });
          break;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [bindings]);
}
