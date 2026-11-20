// Settings backup: profiles plus the small per-user files (challenges, upgrade watch, farm log).
// Stash items and price history are not included – they are re-read from the game.

import type { AppSettings } from '../../shared/types';
import { upgradeProfile } from '../config';

export const BACKUP_FILE = /^(challenges-[\w-]+|upgrade-watch|farm)\.json$/;

export interface Backup {
  app: 'poe-stash-pricer';
  version: 1;
  createdAt: string;
  /** false = POESESSID and Discord webhooks were left out. */
  withSecrets: boolean;
  settings: AppSettings;
  files: Record<string, unknown>;
}

export function makeBackup(settings: AppSettings, files: Record<string, unknown>, withSecrets: boolean, now = new Date()): Backup {
  const profiles = settings.profiles.map((p) => (withSecrets ? p : { ...p, poesessid: '', discordWebhook: '' }));
  const kept = Object.fromEntries(Object.entries(files).filter(([k]) => BACKUP_FILE.test(k)));
  return { app: 'poe-stash-pricer', version: 1, createdAt: now.toISOString(), withSecrets, settings: { ...settings, profiles }, files: kept };
}

/**
 * Validates a backup and merges it with the current settings: profiles are replaced by id,
 * and a backup without secrets keeps the POESESSID / webhook already saved on this computer.
 */
export function restoreBackup(raw: unknown, current: AppSettings): { settings: AppSettings; files: Record<string, unknown> } {
  const b = raw as Partial<Backup> | null;
  if (!b || b.app !== 'poe-stash-pricer' || b.version !== 1 || !b.settings || !Array.isArray(b.settings.profiles)) {
    throw new Error('To nie jest plik kopii zapasowej PoE Stash Pricer.');
  }
  const byId = new Map(current.profiles.map((p) => [p.id, p]));
  const incoming = b.settings.profiles.map((p) => {
    const prof = upgradeProfile(p);
    const old = byId.get(prof.id);
    if (!b.withSecrets && old) return { ...prof, poesessid: old.poesessid, discordWebhook: old.discordWebhook, stashSource: old.poesessid ? old.stashSource : prof.stashSource };
    return prof;
  });
  const ids = new Set(incoming.map((p) => p.id));
  const profiles = [...current.profiles.filter((p) => !ids.has(p.id)), ...incoming];
  const active = b.settings.activeProfileId && profiles.some((p) => p.id === b.settings!.activeProfileId) ? b.settings.activeProfileId : current.activeProfileId ?? profiles[0]?.id ?? null;
  const files = Object.fromEntries(Object.entries(b.files ?? {}).filter(([k]) => BACKUP_FILE.test(k)));
  return { settings: { activeProfileId: active, profiles }, files };
}
