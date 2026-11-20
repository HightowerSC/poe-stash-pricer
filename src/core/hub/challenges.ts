// PoE HUB – league challenges planner: the player's own list (pasted from the profile's challenge page
// or typed in), progress, order, and "what to prepare" hints matched by keywords.

export interface Challenge {
  id: string;
  title: string;
  done: boolean;
  notes: string;
}

/** One challenge per line; drops empty lines, counters like "12/40", headers and duplicates. */
export function parseChallenges(text: string, existing: Challenge[] = []): Challenge[] {
  const have = new Set(existing.map((c) => c.title.toLowerCase()));
  const out: Challenge[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const title = raw.replace(/^\s*(?:[-*•✓✔☐☑]|\d+[.)])\s*/, '').replace(/\s+\d+\s*\/\s*\d+\s*$/, '').trim();
    if (title.length < 3 || /^(challenges?|completed|in progress|reward|rewards)\b[: ]*$/i.test(title)) continue;
    if (have.has(title.toLowerCase())) continue;
    have.add(title.toLowerCase());
    out.push({ id: Math.random().toString(36).slice(2, 10), title, done: false, notes: '' });
  }
  return [...existing, ...out];
}

const HINTS: [RegExp, string][] = [
  [/\b(map|maps|atlas|tier 1[0-6]|t1[0-6])\b/i, 'Mapy: zrób zapas map i Scarabów, rozdaj punkty Atlasu pod tę aktywność, zanim zaczniesz.'],
  [/\b(shaper|elder|maven|sirus|uber|eater|exarch|cortex|synthesis|conqueror|boss|pinnacle)\b/i, 'Bossowie: zbierz fragmenty/inwitacje wcześniej (ceny w kategorii Fragmenty na poe.ninja – często taniej kupić niż farmić).'],
  [/\b(delirium|simulacrum)\b/i, 'Delirium: zbieraj Simulacrum Splintery (300 = Simulacrum) albo kup gotowe Simulacrum.'],
  [/\b(heist|contract|blueprint|rogue)\b/i, 'Heist: odłóż Contracty i Blueprinty, podnieś poziom Rogue’ów przed trudniejszymi zadaniami.'],
  [/\b(craft|crafting|essence|fossil|harvest|bench|recombinat|eldritch)\b/i, 'Crafting: przygotuj bazy i walutę; „Sprawdź crafty” w aplikacji pokaże koszt i zysk.'],
  [/\b(unique|uniques|divination|card|cards)\b/i, 'Unikaty/karty: sprawdź ceny na poe.ninja – brakujące często taniej kupić na trade.'],
  [/\b(lab|labyrinth|trial|ascendancy|enchant)\b/i, 'Labirynt: zbierz Offeringi do Uber Labu i miej postać z dobrą mobilnością.'],
  [/\b(sanctum|ultimatum|expedition|blight|metamorph|breach|legion|ritual|abyss|incursion|delve|betrayal|syndicate|bestiary|beast|essence|harbinger|strongbox|shrine|torment|beyond)\b/i, 'Mechanika ligi/Atlasu: ustaw drzewko Atlasu i Scaraby pod tę mechanikę, rób ją na jednym typie mapy.'],
  [/\b(level|reach|character|experience|xp)\b/i, 'Poziom: rób mapy o wysokim tierze z bonusem XP, unikaj śmierci (−10% XP); flaszki i odporności przed T16.'],
  [/\b(trade|sell|vendor|recipe|currency)\b/i, 'Waluta/handel: użyj widoku Kategorie i podpowiedzi „vendor recipe” w aplikacji.'],
  [/\b(kill|slay|defeat).*\b(\d{3,}|thousand)\b/i, 'Dużo zabójstw: wybierz szybki clear (Breach/Legion) i odpowiednie Scaraby.'],
];

/** "What to prepare" hints for a challenge title; generic, matched by keywords. */
export function challengeHints(title: string): string[] {
  return HINTS.filter(([re]) => re.test(title)).map(([, h]) => h).slice(0, 2);
}

export function progress(list: Challenge[]): { done: number; total: number } {
  return { done: list.filter((c) => c.done).length, total: list.length };
}
