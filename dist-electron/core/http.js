"use strict";
// Small HTTP helper: one User-Agent for every request, a concurrency cap and 429 handling.
Object.defineProperty(exports, "__esModule", { value: true });
exports.sleep = exports.Limiter = exports.APP_VERSION = void 0;
exports.userAgent = userAgent;
exports.fetchWithRetry = fetchWithRetry;
exports.APP_VERSION = '0.1.0';
function userAgent(contact) {
    return `poe-stash-pricer/${exports.APP_VERSION} (contact: ${contact || 'github.com/poe-stash-pricer'})`;
}
class Limiter {
    max;
    active = 0;
    queue = [];
    constructor(max) {
        this.max = max;
    }
    async run(fn) {
        if (this.active >= this.max) {
            await new Promise((resolve) => this.queue.push(resolve));
        }
        this.active++;
        try {
            return await fn();
        }
        finally {
            this.active--;
            this.queue.shift()?.();
        }
    }
}
exports.Limiter = Limiter;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
exports.sleep = sleep;
/** Retries a 429 at most `retries` times, waiting as long as Retry-After says. */
async function fetchWithRetry(fetchFn, url, init, retries = 2) {
    for (let attempt = 0;; attempt++) {
        const res = await fetchFn(url, init);
        if (res.status !== 429 || attempt >= retries)
            return res;
        const wait = Number(res.headers.get('retry-after') ?? '10');
        await (0, exports.sleep)(Math.min(Math.max(wait, 1), 120) * 1000);
    }
}
