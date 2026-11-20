// PoE HUB – build help from the Postać tab data: main skill links, gem levels and quality,
// utility skills (movement, guard, auras) and flask setup. Generic checks that fit most builds.

import type { CharacterView, PoeItem } from '../../shared/types';
import { linkCount } from '../pricing/ninjaMatch';

export interface BuildTip {
  severity: 'high' | 'medium' | 'low';
  area: 'Linki' | 'Gemy' | 'Skille' | 'Flaszki';
  text: string;
}

const MOVEMENT = /^(Flame Dash|Leap Slam|Shield Charge|Whirling Blades|Dash|Frostblink|Blink Arrow|Lightning Warp|Bodyswap|Withering Step|Smoke Mine|Charged Dash|Flicker Strike|Phase Run|Sigil of Power|Consecrated Path|Frost Blades|Vaal Haste|Cyclone)$/i;
const GUARD = /^(Steelskin|Molten Shell|Vaal Molten Shell|Immortal Call|Bone Armour)$/i;
const AURA = /^(Determination|Grace|Discipline|Hatred|Wrath|Anger|Zealotry|Pride|Malevolence|Haste|Precision|Clarity|Vitality|Purity of .+|Defiance Banner|Dread Banner|War Banner|Herald of .+|Skitterbots|Arctic Armour|Petrified Blood|Vaal Grace|Vaal Discipline)$/i;
const MAIN_SLOTS = ['BodyArmour', 'Weapon', 'Offhand', 'Helm', 'Gloves', 'Boots'];

const gemName = (g: PoeItem) => g.typeLine || g.baseType || g.name;
const isSupport = (g: PoeItem) => /Support$/.test(gemName(g));

function gemProp(g: PoeItem, name: string): number | null {
  const raw = g.properties?.find((p) => p.name === name)?.values?.[0]?.[0];
  if (!raw) return null;
  const n = parseInt(raw.replace(/[^\d-]/g, ''), 10);
  return Number.isFinite(n) ? n : null;
}

/** Max level of a gem: 20 for most, 5 for Awakened, 3–4 for Enlighten/Empower/Enhance. */
export function gemMaxLevel(name: string): number {
  if (/^Awakened /.test(name)) return 5;
  if (/^(Enlighten|Enhance) Support$/.test(name)) return 3;
  if (/^Empower Support$/.test(name)) return 4;
  return 20;
}

export function buildAdvice(view: CharacterView): BuildTip[] {
  const tips: BuildTip[] = [];
  const lvl = view.summary.level;
  const geared = view.items.filter((e) => MAIN_SLOTS.includes(e.slot));
  const allGems = view.items.flatMap((e) => e.gems);
  const names = allGems.map(gemName);

  // Main skill = the item with the most gems (usually the body armour).
  const main = [...geared].sort((a, b) => b.gems.length - a.gems.length)[0];
  if (main && main.gems.length && main.item.sockets?.length) {
    const links = linkCount(main.item);
    const skill = main.gems.find((g) => !isSupport(g));
    const label = skill ? gemName(skill) : 'główny skill';
    if (links < 5 && lvl >= 68) {
      tips.push({ severity: 'high', area: 'Linki', text: `${label} jest w ${links}-linku. 5-link to zwykle +30–50% obrażeń: kup przedmiot 5L albo użyj Orb of Fusing / Jeweller's na bazie z 5 gniazdami.` });
    } else if (links === 5 && lvl >= 85) {
      tips.push({ severity: 'medium', area: 'Linki', text: `${label} jest w 5-linku. 6-link (Orb of Fusing, Tainted Fusing albo gotowa zbroja 6L) to kolejny duży skok obrażeń.` });
    }
  }

  // Supports in items without links do nothing.
  for (const e of geared) {
    if (e.item.sockets?.length && e.gems.some(isSupport) && e.gems.length > 1 && linkCount(e.item) < 2) {
      tips.push({ severity: 'medium', area: 'Gemy', text: `${e.slot}: gniazda nie są połączone, więc support gemy (${e.gems.filter(isSupport).map(gemName).join(', ')}) nic nie dają. Użyj Orb of Fusing.` });
    }
  }

  // Gem levels and quality.
  if (lvl >= 70) {
    const low = allGems.filter((g) => { const l = gemProp(g, 'Level'); return l != null && l < gemMaxLevel(gemName(g)) - (gemMaxLevel(gemName(g)) === 20 ? 2 : 0); });
    if (low.length) tips.push({ severity: 'low', area: 'Gemy', text: `Gemy z niskim poziomem: ${low.slice(0, 5).map((g) => `${gemName(g)} (${gemProp(g, 'Level')})`).join(', ')}${low.length > 5 ? '…' : ''}. Gem 20/20 kupiony na trade często kosztuje kilka chaosów.` });
    const noQ = allGems.filter((g) => gemProp(g, 'Level') != null && !gemProp(g, 'Quality'));
    if (noQ.length >= 3) tips.push({ severity: 'low', area: 'Gemy', text: `${noQ.length} gemów bez jakości (np. ${noQ.slice(0, 3).map(gemName).join(', ')}). Gemcutter's Prism na głównym skillu daje odczuwalny bonus.` });
  }

  // Utility skills.
  if (allGems.length >= 4) {
    if (!names.some((n) => MOVEMENT.test(n))) tips.push({ severity: 'medium', area: 'Skille', text: 'Brak skilla ruchu (np. Flame Dash, Leap Slam, Frostblink, Shield Charge) – mapy idą dużo szybciej.' });
    if (lvl >= 60 && !names.some((n) => GUARD.test(n))) tips.push({ severity: 'low', area: 'Skille', text: 'Brak guard skilla (Steelskin, Molten Shell, Immortal Call) – tania dodatkowa obrona.' });
    if (lvl >= 50 && !names.some((n) => AURA.test(n))) tips.push({ severity: 'medium', area: 'Skille', text: 'Brak aur i heraldów – większość buildów ma co najmniej jedną (np. Determination, Grace, Hatred, Wrath).' });
  }

  // Flasks.
  const flasks = view.items.filter((e) => e.slot === 'Flask').map((e) => e.item);
  if (lvl >= 30) {
    const flaskText = flasks.map((f) => [f.typeLine, ...(f.explicitMods ?? []), ...(f.implicitMods ?? [])].join('\n')).join('\n');
    if (flasks.length < 5) tips.push({ severity: 'medium', area: 'Flaszki', text: `Masz ${flasks.length}/5 flaszek – każdy pusty slot to darmowa obrona albo szybkość.` });
    if (!/Bleed/i.test(flaskText)) tips.push({ severity: 'medium', area: 'Flaszki', text: 'Żadna flaszka nie usuwa krwawienia (mod „of Staunching” albo „Immunity to Bleeding”). Corrupted Blood potrafi zabić.' });
    if (!/Freez|Chill/i.test(flaskText)) tips.push({ severity: 'medium', area: 'Flaszki', text: 'Żadna flaszka nie chroni przed zamrożeniem (mod „of Heat”). Zamrożenie w mapach to częsta śmierć.' });
    if (flasks.length && !/Quicksilver|Silver Flask|Movement Speed/i.test(flaskText)) tips.push({ severity: 'low', area: 'Flaszki', text: 'Brak Quicksilver Flask – +40% szybkości ruchu za darmo.' });
  }

  const order = { high: 0, medium: 1, low: 2 };
  return tips.sort((a, b) => order[a.severity] - order[b.severity]);
}
