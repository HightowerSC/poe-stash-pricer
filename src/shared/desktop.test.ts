import { describe, expect, it } from 'vitest';
import { DEFAULT_SHORTCUTS, applyShortcut, checkAccelerator, codeToKey, findConflicts, formatAccelerator, keyEventToAccelerator, mergeShortcuts, normalizeAccelerator } from './shortcuts';
import { compareVersions, describeUpdateError, failedInstallError, formatBytes, releaseNotesToText } from './updates';

const key = (code: string, mods: Partial<{ ctrlKey: boolean; altKey: boolean; shiftKey: boolean; metaKey: boolean }> = {}) =>
  ({ code, ctrlKey: false, altKey: false, shiftKey: false, metaKey: false, ...mods });

describe('shortcuts', () => {
  it('turns key presses into accelerators using the physical key', () => {
    expect(keyEventToAccelerator(key('KeyP', { ctrlKey: true, altKey: true }))).toBe('CommandOrControl+Alt+P');
    expect(keyEventToAccelerator(key('ArrowRight', { ctrlKey: true, altKey: true }))).toBe('CommandOrControl+Alt+Right');
    expect(keyEventToAccelerator(key('F7'))).toBe('F7');
    expect(keyEventToAccelerator(key('Numpad3', { shiftKey: true, altKey: true }))).toBe('Alt+Shift+num3');
    expect(keyEventToAccelerator(key('ControlLeft', { ctrlKey: true }))).toBeNull();
    expect(codeToKey('Digit5')).toBe('5');
  });

  it('normalizes and formats', () => {
    expect(normalizeAccelerator('alt+ctrl+p')).toBe('CommandOrControl+Alt+P');
    expect(normalizeAccelerator('Shift+CmdOrCtrl+F2')).toBe('CommandOrControl+Shift+F2');
    expect(formatAccelerator('CommandOrControl+Alt+Left')).toBe('Ctrl+Alt+←');
    expect(formatAccelerator('')).toBe('wyłączony');
  });

  it('rejects combinations that would break the game or typing', () => {
    expect(checkAccelerator('P').error).toBeTruthy();
    expect(checkAccelerator('Shift+P').error).toBeTruthy();
    expect(checkAccelerator('CommandOrControl+C').error).toBeTruthy();
    expect(checkAccelerator('Alt+F4').error).toBeTruthy();
    expect(checkAccelerator('CommandOrControl+Alt').error).toBeTruthy();
    expect(checkAccelerator('CommandOrControl+Alt+P')).toEqual({});
    expect(checkAccelerator('F9').error).toBeUndefined();
  });

  it('warns about Polish AltGr letters', () => {
    expect(checkAccelerator('CommandOrControl+Alt+S').warning).toMatch(/polska litera/);
    expect(checkAccelerator('CommandOrControl+Alt+Shift+S').warning).toBeUndefined();
  });

  it('detects conflicts and refuses a taken combination', () => {
    expect(findConflicts({ overlay: 'Ctrl+Alt+P', calibrate: 'CommandOrControl+Alt+P', priceNow: '' })).toEqual({ overlay: ['calibrate'], calibrate: ['overlay'] });
    const r = applyShortcut(DEFAULT_SHORTCUTS, 'calibrate', 'Ctrl+Alt+P');
    expect(r.error).toMatch(/już przypisany/);
    expect(r.map).toBe(DEFAULT_SHORTCUTS);
    const ok = applyShortcut(DEFAULT_SHORTCUTS, 'overlay', 'Ctrl+Shift+F1');
    expect(ok.map.overlay).toBe('CommandOrControl+Shift+F1');
    expect(applyShortcut(DEFAULT_SHORTCUTS, 'overlay', '').map.overlay).toBe('');
  });

  it('merges saved settings with defaults and drops broken entries', () => {
    const m = mergeShortcuts({ overlay: 'ctrl+alt+o', calibrate: 'P', nextTab: 'Ctrl+Alt+O', junk: 'x' });
    expect(m.overlay).toBe('CommandOrControl+Alt+O');
    expect(m.calibrate).toBe(DEFAULT_SHORTCUTS.calibrate);
    expect(m.nextTab).toBe(''); // duplicate of overlay
    expect(m.showApp).toBe('');
    expect(mergeShortcuts(null)).toEqual(DEFAULT_SHORTCUTS);
  });
});

describe('updates', () => {
  it('turns GitHub release notes into text', () => {
    expect(releaseNotesToText('<h2>Nowe</h2><ul><li>Skróty</li><li>Aktualizacje &amp; więcej</li></ul>')).toBe('Nowe\n\n• Skróty\n• Aktualizacje & więcej');
    expect(releaseNotesToText([{ version: '1.0.0', note: '<p>A</p>' }])).toBe('Wersja 1.0.0\nA');
    expect(releaseNotesToText(null)).toBe('');
    expect(releaseNotesToText('## Zmiany\n- jeden\n- dwa')).toBe('Zmiany\n• jeden\n• dwa');
  });

  it('compares versions', () => {
    expect(compareVersions('0.10.0', '0.9.3')).toBeGreaterThan(0);
    expect(compareVersions('v1.2.3', '1.2.3')).toBe(0);
    expect(compareVersions('1.0.0', '1.0.1')).toBeLessThan(0);
  });

  it('explains errors in plain words', () => {
    expect(describeUpdateError('net::ERR_INTERNET_DISCONNECTED', 'linux').title).toMatch(/internetem/);
    expect(describeUpdateError('getaddrinfo ENOTFOUND github.com', 'win32').manual).toBe(false);
    expect(describeUpdateError('HttpError: 404 Cannot find latest.yml', 'win32').title).toMatch(/przygotowuje/);
    expect(describeUpdateError('sha512 checksum mismatch', 'linux').title).toMatch(/uszkodzony/);
    expect(describeUpdateError('EACCES: permission denied, rename', 'linux').hint).toMatch(/AppImage/);
    expect(describeUpdateError('spawn UNKNOWN', 'win32').title).toMatch(/Windows zablokował/);
    expect(describeUpdateError('something odd', 'win32', 'download').title).toBe('Nie udało się pobrać aktualizacji');
    expect(failedInstallError('win32', '1.0.0').detail).toMatch(/Smart App Control/);
  });

  it('formats sizes', () => {
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB');
    expect(formatBytes(2048)).toBe('2 KB');
  });
});
