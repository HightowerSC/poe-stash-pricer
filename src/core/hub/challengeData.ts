// Bundled challenge list – used only when neither pathofexile.com nor poedb.tw can be reached.
// Source: poedb.tw/us/Covens_challenges (3.30 Covens of Umbra), short descriptions written by us.

export interface CatalogEntry {
  title: string;
  desc: string;
  /** Number of steps/amount needed ("Quantity" on poedb). */
  total: number;
}

export const BUNDLED_CHALLENGES: Record<string, CatalogEntry[]> = {
  Covens: [
    { title: "Beginner's Basics", total: 4, desc: 'Use Orbs of Transmutation, Augmentation, Alteration and Alchemy (Crafting Bench counts).' },
    { title: "Witch's Wishes", total: 2, desc: 'Kill a Unique monster empowered by a Fate and place a Viscera in the Wickerman.' },
    { title: "Peddler's Produce I", total: 4, desc: 'Vendor recipes: Life Flask, Mana Flask, basic ring and basic amulet.' },
    { title: 'Act Adversaries I', total: 5, desc: 'Defeat the bosses of Acts 1–5.' },
    { title: 'Gifted Gods', total: 8, desc: 'Defeat 8 Pantheon gods (or Map versions) while empowered by a Fate.' },
    { title: 'Equipped Effigy', total: 1, desc: 'Have a Viscera in every Wickerman slot.' },
    { title: 'Act Adversaries II', total: 5, desc: 'Defeat the bosses of Acts 6–10.' },
    { title: 'Atlas Additions', total: 5, desc: 'Complete 5 of 8 encounter types x30 (Strongboxes, Shrines, Essences, Rogue Exiles, …).' },
    { title: 'Atlas Authorities', total: 5, desc: 'Complete 5 of 10 league encounter types (x30–x100).' },
    { title: 'Foretold Foes', total: 50, desc: 'Defeat 50 Fate-empowered Unique bosses.' },
    { title: 'Intrepid Investigator', total: 100, desc: 'Complete all non-unique Maps on the Atlas.' },
    { title: 'Agonising Adversaries', total: 5, desc: 'Complete 5 of 8 endgame encounters.' },
    { title: 'Fundamental Foes', total: 5, desc: 'Complete 5 of 10 encounters, mostly at area level 81+.' },
    { title: 'Sigil Slayer', total: 400, desc: 'Kill Unique Map bosses in red Maps for 400 invoked Fate tiers.' },
    { title: 'Creative Currencies', total: 12, desc: 'Use 12 of 17 listed currency items.' },
    { title: 'Vital Voidstones', total: 1, desc: 'Socket 4 Voidstones into the Atlas.' },
    { title: 'Achieve Ascension', total: 5, desc: 'Use the Ascendancy Device in all 4 Labyrinths and gain a Bloodline Class.' },
    { title: 'Promised Profits', total: 10, desc: 'Earn 10 of 15 reward types from Fate-empowered bosses.' },
    { title: 'Dubious Divination', total: 2, desc: 'Open 100 Stacked Decks and turn in 50 Divination Card sets.' },
    { title: "Peddler's Produce II", total: 4, desc: 'Vendor recipes: Tier 16 Map, Unique item, influenced item, Exalted Orb.' },
    { title: 'Mysterious Mirages', total: 3, desc: 'Complete 3 of 6 Mirage encounters.' },
    { title: 'Vulgar Viscera', total: 8, desc: 'Place 8 of 17 listed Viscera on the Wickerman.' },
    { title: 'Unequaled Uniques', total: 15, desc: 'Complete 15 of 18 listed Unique Maps.' },
    { title: 'Tangled Threads', total: 1000, desc: 'Complete Maps with 1000 Threads applied in total.' },
    { title: 'Complicit Corruption', total: 3, desc: 'Complete 3 of 5 corruption tasks.' },
    { title: 'Brilliant Branding', total: 10, desc: 'Defeat Map bosses with 10 of 20 Tier 3 Fates on T16 Maps with 100%+ Atlas Drops.' },
    { title: 'Cross Contamination', total: 6, desc: 'Complete 6 of 10 league content encounters.' },
    { title: 'Legacied Lineage', total: 7, desc: 'Defeat 7 of 12 listed bosses or encounters.' },
    { title: 'Adjacent Anomalies', total: 30, desc: 'Complete 30 Atlas Anomalies.' },
    { title: 'Overpowering Omens', total: 12, desc: 'Defeat final bosses of 12 of 17 Rare Maps (T16, 100%+ Atlas Drops, Tier 3 Fate).' },
    { title: 'Atlas Adventure', total: 25000, desc: 'Reach 25,000% total Atlas Drops from completed Maps.' },
    { title: 'Otherworldly Obstructions', total: 2, desc: 'Complete 2 of 3 Eldritch encounter types (Searing Exarch / Eater of Worlds altars).' },
    { title: 'Amazingly Accomplished Atlas', total: 1, desc: 'Allocate all Atlas passive points.' },
    { title: 'Astounding Augury', total: 5, desc: 'Defeat 5 of 10 Pinnacle bosses with Grim Fates invoked.' },
    { title: "Zana's Zealotry", total: 300, desc: 'Reach 300 explicit modifiers from Originator influenced Maps.' },
    { title: 'Woven Wonders', total: 5, desc: 'Complete 5 of 10 Thread types x10 on T14+ Rare Maps.' },
    { title: 'Nightmarish Nests', total: 3, desc: 'Complete 3 of 5 Nightmare Map types x5.' },
    { title: 'Deceptive Darktongue Deals', total: 3, desc: 'Defeat The Coven Queen in 3 of 4 special ways.' },
    { title: 'Ultimate Undertaking', total: 3, desc: 'Defeat 3 of 10 Pinnacle bosses at area level 85 with Grim Fates.' },
    { title: 'Grand Goal Grind', total: 4, desc: 'Complete 4 of 6 big grinds (x50–x150 encounters, reach level 100).' },
  ],
};
