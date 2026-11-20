"use strict";
// Polls the trade site for items in the user's public tabs and prices the ones not seen before.
Object.defineProperty(exports, "__esModule", { value: true });
exports.StashWatcher = void 0;
class StashWatcher {
    profile;
    league;
    trade;
    engine;
    events;
    seen = new Set();
    timer = null;
    firstRun = true;
    constructor(profile, league, trade, engine, events, seenIds = []) {
        this.profile = profile;
        this.league = league;
        this.trade = trade;
        this.engine = engine;
        this.events = events;
        seenIds.forEach((id) => this.seen.add(id));
        this.firstRun = seenIds.length === 0;
    }
    start() {
        void this.tick();
    }
    stop() {
        if (this.timer)
            clearTimeout(this.timer);
        this.timer = null;
    }
    get seenIds() {
        return [...this.seen];
    }
    async tick() {
        try {
            this.events.onStatus('Sprawdzam publiczne zakładki…');
            await this.engine.refreshPrices();
            const search = await this.trade.searchAccountItems(this.league, this.profile.accountName, this.profile.realm);
            const fresh = search.result.filter((id) => !this.seen.has(id)).slice(0, 40);
            const listings = fresh.length ? await this.trade.fetch(fresh, search.id) : [];
            const priced = [];
            for (const l of listings) {
                this.seen.add(l.id);
                if (this.profile.watchedTab && l.listing?.stash?.name !== this.profile.watchedTab)
                    continue;
                // On the very first run we only remember what is already there, so old items are not reported as new.
                if (this.firstRun)
                    continue;
                priced.push({ item: l.item, price: await this.engine.price(l.item), firstSeen: new Date().toISOString() });
            }
            this.firstRun = false;
            if (priced.length)
                this.events.onItems(priced);
            this.events.onStatus(`Ostatnie sprawdzenie: ${new Date().toLocaleTimeString()} · nowych: ${priced.length}`);
        }
        catch (e) {
            this.events.onError(e instanceof Error ? e.message : String(e));
        }
        finally {
            this.timer = setTimeout(() => void this.tick(), this.profile.pollSeconds * 1000);
        }
    }
}
exports.StashWatcher = StashWatcher;
