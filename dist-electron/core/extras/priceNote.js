"use strict";
// In-game price note for a premium stash tab, e.g. "~b/o 50 chaos" or "~b/o 1.5 divine".
Object.defineProperty(exports, "__esModule", { value: true });
exports.priceNote = priceNote;
function priceNote(chaos, divineRate, kind = 'b/o') {
    if (chaos == null || chaos <= 0)
        return null;
    if (divineRate && chaos >= divineRate * 0.9) {
        // Round to 0.1 div below 10 div, whole divines above.
        const div = chaos / divineRate;
        const rounded = div >= 10 ? Math.round(div) : Math.round(div * 10) / 10;
        return `~${kind} ${rounded} divine`;
    }
    // Round chaos to "nice" steps so the note looks human: 1, 2..10, 15, 20, 25...
    const c = chaos < 10 ? Math.max(1, Math.round(chaos)) : chaos < 100 ? Math.round(chaos / 5) * 5 : Math.round(chaos / 10) * 10;
    return `~${kind} ${c} chaos`;
}
