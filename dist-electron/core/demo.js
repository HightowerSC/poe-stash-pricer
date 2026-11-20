"use strict";
// Demo state shared by Electron's demo mode and the browser preview.
Object.defineProperty(exports, "__esModule", { value: true });
exports.demoHistory = demoHistory;
exports.demoItems = demoItems;
exports.demoValue = demoValue;
const sampleItems_1 = require("./sampleItems");
const advice_1 = require("./extras/advice");
function demoHistory(chaos, points = 12, seed = 0) {
    if (!chaos)
        return [];
    const now = Date.now();
    const slope = [0.25, -0.15, 0.05, 0.4, -0.3, 0.1, 0][seed % 7];
    return Array.from({ length: points }, (_, i) => ({
        t: new Date(now - (points - i) * 3_600_000).toISOString(),
        chaos: Math.round(chaos * (1 + slope * ((i + 1) / points - 1) + 0.04 * Math.sin(i * 1.7 + seed)) * 100) / 100,
    }));
}
function demoItems() {
    return (0, sampleItems_1.sampleItems)().map((p, i) => ({ ...p, advice: (0, advice_1.advise)(p.item, p.price, { sellMinChaos: 5 }), history: demoHistory(p.price.chaos, 12, i) }));
}
function demoValue(items) {
    return demoHistory(items.reduce((s, i) => s + (i.price.chaos ?? 0), 0), 24);
}
