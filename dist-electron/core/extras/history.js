"use strict";
// Price history per kind of item, value of the watched tab over time, and the current session summary.
Object.defineProperty(exports, "__esModule", { value: true });
exports.historyKey = historyKey;
exports.emptyHistory = emptyHistory;
exports.recordPrice = recordPrice;
exports.recordValue = recordValue;
exports.trend = trend;
exports.sessionSummary = sessionSummary;
const classify_1 = require("../pricing/classify");
const MAX_POINTS = 200;
/** Items of the same "kind" share a history: uniques/currency/gems by name, rares by their own id. */
function historyKey(p) {
    const kind = (0, classify_1.classify)(p.item);
    if (['currency', 'card', 'gem', 'map', 'unique', 'clusterJewel'].includes(kind)) {
        return `${kind}:${p.item.name || p.item.typeLine}`;
    }
    return `item:${p.item.id}`;
}
function emptyHistory() {
    return { prices: {}, value: [] };
}
function recordPrice(store, p, at = new Date().toISOString()) {
    if (p.price.chaos == null)
        return store.prices[historyKey(p)] ?? [];
    const unit = p.price.chaos / (p.item.stackSize ?? 1);
    const k = historyKey(p);
    const list = store.prices[k] ?? [];
    list.push({ t: at, chaos: Math.round(unit * 100) / 100 });
    store.prices[k] = list.slice(-MAX_POINTS);
    return store.prices[k];
}
function recordValue(store, items, at = new Date().toISOString()) {
    const total = items.reduce((s, i) => s + (i.price.chaos ?? 0), 0);
    store.value.push({ t: at, chaos: Math.round(total) });
    store.value = store.value.slice(-MAX_POINTS * 5);
}
/** Percent change between the first and last point, or null with fewer than two points. */
function trend(points) {
    if (!points || points.length < 2)
        return null;
    const first = points[0].chaos;
    const last = points[points.length - 1].chaos;
    if (first <= 0)
        return null;
    return Math.round(((last - first) / first) * 1000) / 10;
}
function sessionSummary(items, startedAt, now = Date.now()) {
    const since = Date.parse(startedAt);
    const session = items.filter((i) => Date.parse(i.firstSeen) >= since);
    const totalChaos = session.reduce((s, i) => s + (i.price.chaos ?? 0), 0);
    const hours = Math.max((now - since) / 3_600_000, 1 / 60);
    const best = session.reduce((b, i) => ((i.price.chaos ?? 0) > (b?.price.chaos ?? 0) ? i : b), null);
    return {
        startedAt,
        itemCount: session.length,
        totalChaos: Math.round(totalChaos),
        chaosPerHour: Math.round(totalChaos / hours),
        best: best && best.price.chaos ? { name: best.item.name || best.item.typeLine, chaos: best.price.chaos } : null,
    };
}
