// Draws one stash tab with prices as a PNG picture (to save or paste on Discord).
// Icons come through our own server (/api/icon), so the canvas can be exported.

import type { TabLayout } from '../core/stashLayout';
import { tabTypeLabel } from '../core/stashLayout';
import { isBelowMin } from '../core/config';
import { formatPrice, displayName } from './format';

/** Icon address served by the local server (cached on disk, same origin → exportable). */
export function iconSrc(url: string): string {
  return url ? `/api/icon?u=${encodeURIComponent(url)}` : '';
}

const RARITY_COLOR = ['#c8c8c8', '#8888ff', '#ffff77', '#af6025', '#1ba29b', '#aa9e82', '#0ebaff', '#4ae63a', '#c8c8c8', '#82ad6a'];
const GOLD = '#e6c77a';

export interface ImageOptions {
  currency: 'chaos' | 'divine';
  divine: number | null;
  minValue: number;
  /** Text under the picture, e.g. "Stan z 20.11.2026, 19:40". */
  stamp: string;
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    if (!src) return resolve(null);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/** Number of tile columns for special tabs (currency, fragments…), which have no plain grid. */
export const TILE_COLUMNS = 12;

export async function renderTabImage(tab: TabLayout, o: ImageOptions): Promise<Blob> {
  const special = tab.grid === null;
  const cols = special ? TILE_COLUMNS : tab.grid!;
  const rows = special ? Math.max(1, Math.ceil(tab.items.length / TILE_COLUMNS)) : tab.grid!;
  const cell = special ? 56 : tab.grid === 24 ? 32 : 52;
  const pad = 16;
  const header = 58;
  const footer = 30;
  const width = pad * 2 + cols * cell;
  const height = header + rows * cell + footer + pad;
  const scale = 2;

  const canvas = document.createElement('canvas');
  canvas.width = width * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(scale, scale);

  // Background and header
  ctx.fillStyle = '#0d0b08';
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = tab.color ?? '#4a3e26';
  ctx.fillRect(0, 0, width, 4);
  ctx.fillStyle = GOLD;
  ctx.font = '600 20px Cinzel, Georgia, serif';
  ctx.textBaseline = 'middle';
  ctx.fillText(tab.tab, pad, 24, width / 2);
  ctx.textAlign = 'right';
  ctx.font = '600 16px system-ui, sans-serif';
  ctx.fillText(`Razem: ${formatPrice(tab.totalChaos, o.currency, o.divine)}`, width - pad, 24);
  ctx.fillStyle = '#8f8574';
  ctx.font = '12px system-ui, sans-serif';
  ctx.fillText(`${tab.items.length} przedmiotów · ${tabTypeLabel(tab.type, tab.grid)}`, width - pad, 44);
  ctx.textAlign = 'left';

  // Grid
  const top = header;
  ctx.fillStyle = '#14120d';
  ctx.fillRect(pad, top, cols * cell, rows * cell);
  ctx.strokeStyle = '#2a2519';
  ctx.lineWidth = 1;
  for (let i = 0; i <= cols; i++) { ctx.beginPath(); ctx.moveTo(pad + i * cell + 0.5, top); ctx.lineTo(pad + i * cell + 0.5, top + rows * cell); ctx.stroke(); }
  for (let i = 0; i <= rows; i++) { ctx.beginPath(); ctx.moveTo(pad, top + i * cell + 0.5); ctx.lineTo(pad + cols * cell, top + i * cell + 0.5); ctx.stroke(); }
  ctx.strokeStyle = '#4a3e26';
  ctx.lineWidth = 2;
  ctx.strokeRect(pad - 1, top - 1, cols * cell + 2, rows * cell + 2);

  const icons = await Promise.all(tab.items.map((p) => loadImage(iconSrc(p.item.icon))));
  const ordered = special ? specialOrder(tab) : tab.items.map((p, i) => ({ p, i }));
  ordered.forEach(({ p, i }, n) => {
    const l = p.location!;
    const [cx, cy, cw, ch] = special ? [n % TILE_COLUMNS, Math.floor(n / TILE_COLUMNS), 1, 1] : [l.x, l.y, l.w, l.h];
    const x = pad + cx * cell + 1;
    const y = top + cy * cell + 1;
    const w = cw * cell - 2;
    const h = ch * cell - 2;
    const below = isBelowMin(p.price.chaos, o.minValue);
    ctx.globalAlpha = below ? 0.4 : 1;
    const g = ctx.createRadialGradient(x + w / 2, y + h / 2, 2, x + w / 2, y + h / 2, Math.max(w, h) / 1.4);
    g.addColorStop(0, '#2b2617');
    g.addColorStop(1, '#120f0a');
    ctx.fillStyle = g;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = RARITY_COLOR[p.item.frameType] ?? '#555';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    const img = icons[i];
    if (img) {
      const k = Math.min((w * 0.92) / img.width, (h * 0.92) / img.height);
      ctx.drawImage(img, x + (w - img.width * k) / 2, y + (h - img.height * k) / 2, img.width * k, img.height * k);
    } else {
      ctx.fillStyle = RARITY_COLOR[p.item.frameType] ?? '#ccc';
      ctx.font = '9px system-ui, sans-serif';
      ctx.fillText(displayName(p.item).title.slice(0, 8), x + 3, y + h / 2, w - 6);
    }
    if (p.item.stackSize && p.item.stackSize > 1) {
      ctx.font = `600 ${cell >= 50 ? 11 : 9}px system-ui, sans-serif`;
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#000';
      ctx.strokeText(String(p.item.stackSize), x + 3, y + 8);
      ctx.fillStyle = '#fff';
      ctx.fillText(String(p.item.stackSize), x + 3, y + 8);
    }
    // Price tag
    const tag = `${p.price.specialMods?.length ? '★ ' : ''}${formatPrice(p.price.chaos, o.currency, o.divine)}${p.price.lowerBound && p.price.chaos != null ? '+' : ''}`;
    const fs = cell >= 50 ? 11 : 8;
    ctx.font = `700 ${fs}px system-ui, sans-serif`;
    const band = fs + 4;
    ctx.fillStyle = 'rgba(0,0,0,.82)';
    ctx.fillRect(x, y + h - band, w, band);
    ctx.fillStyle = below ? '#8f8574' : GOLD;
    ctx.textAlign = 'center';
    ctx.fillText(tag, x + w / 2, y + h - band / 2, w - 2);
    ctx.textAlign = 'left';
    ctx.globalAlpha = 1;
  });

  // Footer
  ctx.fillStyle = '#8f8574';
  ctx.font = '11px system-ui, sans-serif';
  ctx.fillText(`${o.stamp} · PoE Stash Pricer`, pad, height - pad - 4);

  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Nie udało się utworzyć obrazu'))), 'image/png'));
}

/** Special tabs: items in slot order (as the stash API numbers them). */
export function specialOrder(tab: TabLayout) {
  return tab.items.map((p, i) => ({ p, i })).sort((a, b) => a.p.location!.x - b.p.location!.x || a.p.location!.y - b.p.location!.y);
}

/** "skrzynia-Zakładka-2026-11-20-1940.png" */
export function imageFileName(tab: string, at: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const safe = tab.replace(/[^\p{L}\p{N}_-]+/gu, '_').slice(0, 40) || 'zakladka';
  return `skrzynia-${safe}-${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}-${pad(at.getHours())}${pad(at.getMinutes())}.png`;
}
