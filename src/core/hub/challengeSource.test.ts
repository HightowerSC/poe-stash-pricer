import { describe, expect, it } from 'vitest';
import { baseLeague, fetchCatalog, htmlToLines, mergeCatalog, parsePoedbChallenges, parseProfileChallenges, type ChallengeCatalog } from './challengeSource';
import { challengeHints } from './challenges';

const PROFILE = `<html><head><title>x</title><script>var a = "1/2";</script></head><body>
<div class="profile-details"><h1>Challenges completed: 2 of 40</h1><label>Show Incomplete Challenges</label></div>
<div class="achievement-list">
 <div class="achievement clearfix"><h2>Beginner&#39;s Basics</h2><span class="completion-detail">4/4</span>
  <div class="detail"><span class="text">Complete each of the following tasks.</span>
  <ul class="split"><li class="finished">Use a Scroll of Wisdom</li><li class="finished">Equip a Magic Flask</li></ul></div></div>
 <div class="achievement clearfix incomplete"><h2>Peddler&rsquo;s Produce I <span class="completion-detail">3/4</span></h2>
  <div class="detail"><span class="text">Complete vendor recipes.</span>
  <ul><li>Armourer's Scrap</li><li>Defeat Rare Hiveborn Monsters (50/50)</li></ul></div></div>
 <div class="achievement"><h2>Act Adversaries I</h2><span>5/5</span></div>
 <div class="achievement incomplete"><h2>Quantity Quandary</h2><span>34,343/50,000</span><div>Find items.</div></div>
 <div class="achievement incomplete"><h2>Witch's Wishes</h2><span>0/2</span></div>
</div></body></html>`;

const POEDB = `<div><h5>Covens Challenge /40</h5>
<div><a href="/us/Beginners_Basics">Beginner's Basics</a></div><div>Quantity: 4</div><div>Use each of the following currency items.</div>
<ul><li>Orb of Transmutation</li><li>Orb of Augmentation</li></ul>
<div><a>Witch's Wishes</a></div><div>Quantity: 2</div><div>Complete encounters.</div>
<div><a>Act Adversaries I</a></div><div>Quantity: 5</div><div>Defeat bosses.</div>
<div><a>Foretold Foes</a></div><div>Quantity: 50</div><div>Defeat Fate bosses.</div>
<div><a>Vital Voidstones</a></div><div>Quantity: 1</div><div>Socket Voidstones.</div>
<h5>Covens Challenge Rewards /14</h5><div>Completed: 6</div><div>Quantity: 99</div><a>Some reward</a></div>`;

const res = (body: string, status = 200) => new Response(body, { status });

describe('challenge source', () => {
  it('turns html into text lines', () => {
    expect(htmlToLines('<p>a &amp; b</p><ul><li>x</li></ul><script>no</script>')).toEqual(['a & b', '• x']);
  });

  it('parses the official profile page with progress', () => {
    const list = parseProfileChallenges(PROFILE);
    expect(list.map((c) => c.title)).toEqual(["Beginner's Basics", 'Peddler’s Produce I', 'Act Adversaries I', 'Quantity Quandary', "Witch's Wishes"]);
    expect(list[0]).toMatchObject({ current: 4, total: 4, desc: 'Complete each of the following tasks.', steps: ['Use a Scroll of Wisdom', 'Equip a Magic Flask'] });
    expect(list[1]).toMatchObject({ current: 3, total: 4 });
    expect(list[1].steps).toContain('Defeat Rare Hiveborn Monsters (50/50)');
    expect(list[3]).toMatchObject({ current: 34343, total: 50000, desc: 'Find items.' });
  });

  it('parses poedb without the rewards section', () => {
    const list = parsePoedbChallenges(POEDB);
    expect(list.map((c) => c.title)).toEqual(["Beginner's Basics", "Witch's Wishes", 'Act Adversaries I', 'Foretold Foes', 'Vital Voidstones']);
    expect(list[0]).toMatchObject({ total: 4, current: 0, desc: 'Use each of the following currency items.', steps: ['Orb of Transmutation', 'Orb of Augmentation'] });
  });

  it('knows the base league', () => {
    expect(baseLeague('Covens')).toBe('Covens');
    expect(baseLeague('Hardcore Covens')).toBe('Covens');
    expect(baseLeague('HC SSF Covens')).toBe('Covens');
    expect(baseLeague('Standard')).toBeNull();
    expect(baseLeague('Hardcore')).toBeNull();
  });

  it('falls back official → poedb → bundled', async () => {
    const official = await fetchCatalog(async () => res(PROFILE), { league: 'Covens', account: 'Exile#1234', realm: 'pc', poesessid: 'x' });
    expect(official.source).toBe('official');

    const urls: string[] = [];
    const poedb = await fetchCatalog(async (u) => { urls.push(u); return u.includes('poedb') ? res(POEDB) : res('nope', 403); }, { league: 'Hardcore Covens', account: 'Exile#1234', realm: 'pc' });
    expect(poedb.source).toBe('poedb');
    expect(urls[0]).toContain('/view-profile/Exile-1234/challenges?league=Covens');
    expect(urls[1]).toBe('https://poedb.tw/us/Covens_challenges');
    expect(poedb.notes[0]).toMatch(/403/);

    const offline = await fetchCatalog(async () => { throw new Error('offline'); }, { league: 'Covens', account: '', realm: 'pc' });
    expect(offline.source).toBe('bundled');
    expect(offline.items.length).toBe(40);

    await expect(fetchCatalog(async () => res(''), { league: 'Standard', account: '', realm: 'pc' })).rejects.toThrow(/nie ma challenge/);
    await expect(fetchCatalog(async () => { throw new Error('x'); }, { league: 'Futureleague', account: '', realm: 'pc' })).rejects.toThrow(/Nie udało się/);
  });

  it('merges into the saved list keeping notes, order and manual entries', () => {
    const saved = [
      { id: 'a', title: 'My own goal', done: false, notes: '' },
      { id: 'b', title: 'witch’s wishes', done: true, notes: 'buy viscera' },
    ];
    const cat = (source: ChallengeCatalog['source']): ChallengeCatalog => ({
      league: 'Covens', source, fetchedAt: '', notes: [],
      items: [
        { title: "Beginner's Basics", desc: 'd', steps: [], current: 4, total: 4 },
        { title: "Witch's Wishes", desc: 'w', steps: [], current: 0, total: 2 },
      ],
    });
    const fromDb = mergeCatalog(saved, cat('poedb'));
    expect(fromDb.map((c) => c.title)).toEqual(['My own goal', "Witch's Wishes", "Beginner's Basics"]);
    expect(fromDb[1]).toMatchObject({ id: 'b', done: true, notes: 'buy viscera', desc: 'w' });
    expect(fromDb[2].done).toBe(false);

    const fromOfficial = mergeCatalog(fromDb, cat('official'));
    expect(fromOfficial[1].done).toBe(false);
    expect(fromOfficial[2]).toMatchObject({ done: true, current: 4 });
    expect(fromOfficial.length).toBe(3);
  });

  it('hints use the description too', () => {
    expect(challengeHints("Witch's Wishes", 'Place a Viscera in the Wickerman')[0]).toMatch(/Wickerman/);
  });
});
