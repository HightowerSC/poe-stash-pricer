"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MIN_POLL_SECONDS = void 0;
exports.newProfile = newProfile;
exports.emptySettings = emptySettings;
exports.validateProfile = validateProfile;
exports.resolveLeague = resolveLeague;
exports.isDiscordWebhook = isDiscordWebhook;
exports.upgradeProfile = upgradeProfile;
exports.MIN_POLL_SECONDS = 120;
function newProfile(partial = {}) {
    return {
        id: partial.id ?? Math.random().toString(36).slice(2, 10),
        name: partial.name ?? 'Mój profil',
        realm: partial.realm ?? 'pc',
        accountName: partial.accountName ?? '',
        league: partial.league ?? 'auto',
        hardcore: partial.hardcore ?? false,
        watchedTab: partial.watchedTab ?? '',
        notifyMinChaos: partial.notifyMinChaos ?? 10,
        displayCurrency: partial.displayCurrency ?? 'chaos',
        pollSeconds: Math.max(exports.MIN_POLL_SECONDS, partial.pollSeconds ?? 180),
        discordWebhook: partial.discordWebhook ?? '',
        usePoeprices: partial.usePoeprices ?? false,
    };
}
function emptySettings() {
    return { activeProfileId: null, profiles: [] };
}
/** Returns a list of problems (in Polish, shown in the UI). Empty list = valid. */
function validateProfile(p) {
    const errors = [];
    if (!p.name.trim())
        errors.push('Podaj nazwę profilu.');
    if (!/^[^#\s]{3,}#\d{4}$/.test(p.accountName.trim())) {
        errors.push('Nazwa konta musi mieć numer, np. Exile#1234.');
    }
    if (!p.league.trim())
        errors.push('Wybierz ligę.');
    if (p.pollSeconds < exports.MIN_POLL_SECONDS) {
        errors.push(`Sprawdzanie nie częściej niż co ${exports.MIN_POLL_SECONDS} s (limity GGG).`);
    }
    if (p.discordWebhook && !isDiscordWebhook(p.discordWebhook)) {
        errors.push('Webhook Discord musi zaczynać się od https://discord.com/api/webhooks/');
    }
    if (p.notifyMinChaos < 0)
        errors.push('Próg powiadomień nie może być ujemny.');
    return errors;
}
/**
 * Turns the profile's league setting into a real league id.
 * "auto" picks the current challenge league (softcore or hardcore), so a new league needs no code change.
 */
function resolveLeague(setting, hardcore, leagues) {
    if (setting !== 'auto') {
        const match = leagues.find((l) => l.id.toLowerCase() === setting.toLowerCase());
        if (!match && leagues.length > 0) {
            throw new Error(`Liga "${setting}" nie istnieje. Dostępne: ${leagues.map((l) => l.id).join(', ')}`);
        }
        return match ? match.id : setting;
    }
    const current = leagues.find((l) => l.current && l.hardcore === hardcore);
    if (current)
        return current.id;
    return hardcore ? 'Hardcore' : 'Standard';
}
function isDiscordWebhook(url) {
    return /^https:\/\/(discord|discordapp)\.com\/api\/webhooks\/\d+\/[\w-]+$/.test(url.trim());
}
/** Fills in fields added in later versions, so old settings files keep working. */
function upgradeProfile(p) {
    return newProfile(p);
}
