// Bridge to the desktop app (Electron main process), exposed by desktop/main-preload.cjs as window.desktop.
// Missing in a normal browser and on the phone preview – screens that need it hide themselves then.

import type { ShortcutAction, ShortcutState } from './shortcuts';
import type { UpdateState } from './updates';

export interface DesktopApi {
  version: string;
  platform: string;
  getShortcuts(): Promise<ShortcutState>;
  /** Sets one shortcut ('' = off). Resolves with the new state, or an error/warning text. */
  setShortcut(action: ShortcutAction, accelerator: string): Promise<{ state: ShortcutState; error?: string; warning?: string }>;
  resetShortcuts(): Promise<ShortcutState>;
  /** Turns global shortcuts off while the user presses a new combination (so the old one doesn't fire). */
  pauseShortcuts(paused: boolean): Promise<void>;
  setClipWatch(on: boolean): Promise<ShortcutState>;
  onShortcuts(cb: (s: ShortcutState) => void): () => void;

  getUpdate(): Promise<UpdateState>;
  checkUpdate(): Promise<UpdateState>;
  downloadUpdate(): Promise<UpdateState>;
  installUpdate(): Promise<void>;
  setAutoDownload(on: boolean): Promise<UpdateState>;
  dismissUpdated(): Promise<UpdateState>;
  openReleases(): Promise<void>;
  onUpdate(cb: (s: UpdateState) => void): () => void;
  /** Tray menu asked to show the shortcut/update settings. */
  onOpenSettings(cb: () => void): () => void;
}

declare global {
  interface Window { desktop?: DesktopApi }
}
