import { get } from 'svelte/store';
import { browser } from '$app/environment';
import { settingsStore } from '../stores/settingsStore';
import { uiStore } from '../stores/uiStore';
import { _ } from '../locales/i18n';

// --- Cheat Code Logic ---
const CODE_UNLOCK = 'VIPENTE2026';
const CODE_LOCK = 'VIPDEEPDIVE';
const CODE_SPACE = 'VIPSPACE2026';
const CODE_BONUS = 'VIPBONUS2026';
const CODE_STREAK = 'VIPSTREAK2026';
const CODE_VIP = 'VIP2026';
const CODE_ADMIN = 'ADMIN';

const MAX_CODE_LENGTH = Math.max(
    CODE_UNLOCK.length,
    CODE_LOCK.length,
    CODE_SPACE.length,
    CODE_BONUS.length,
    CODE_STREAK.length,
    CODE_VIP.length,
    CODE_ADMIN.length
);

let inputBuffer: string[] = [];

function getMessage(key: string, defaultText: string) {
    const $t = get(_);
    return $t(key) || defaultText;
}

function handleKeydown(event: KeyboardEvent) {
    if (!browser) return;

    // Ignore if user is typing in an input field
    const target = event.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;

    const key = event.key.toUpperCase();
    if (key.length === 1) {
        inputBuffer.push(key);
        if (inputBuffer.length > MAX_CODE_LENGTH) {
            inputBuffer.shift();
        }

        const bufferStr = inputBuffer.join('');
        const settings = get(settingsStore);
        const currentTheme = get(uiStore).currentTheme;

        // Helper: Check tier levels
        const isProOrHigher = ['pro', 'vip', 'admin'].includes(settings.accountTier);
        const isVipOrHigher = ['vip', 'admin'].includes(settings.accountTier);

        // --- NEW CODES ---

        // VIP2026: Upgrade to VIP
        if (bufferStr.endsWith(CODE_VIP)) {
            settingsStore.update(s => ({ ...s, accountTier: 'vip' }));
            uiStore.showOverlay('VIP Mode Activated! 🦆', 3000);
            inputBuffer = [];
        }

        // ADMIN: Upgrade to Admin
        else if (bufferStr.endsWith(CODE_ADMIN)) {
            settingsStore.update(s => ({ ...s, accountTier: 'admin' }));
            uiStore.showOverlay('Admin Mode Activated! 🛠️', 3000);
            inputBuffer = [];
        }

        // --- EXISTING CODES (Migrated) ---

        // VIPENTE2026: Pro Active + VIP Theme Active => Unlock Charts
        else if (bufferStr.endsWith(CODE_UNLOCK)) {
            if (isProOrHigher && currentTheme === 'VIP') {
                unlockDeepDive();
            }
        }
        // VIPDEEPDIVE: Lock Charts (Always works if matched)
        else if (bufferStr.endsWith(CODE_LOCK)) {
            lockDeepDive();
        }
        // VIPSPACE2026: Pro Active + VIP Theme Active => Space Dialog + Link
        else if (bufferStr.endsWith(CODE_SPACE)) {
             if (isProOrHigher && currentTheme === 'VIP') {
                activateVipSpace();
            }
        }
        // Placeholders
        else if (bufferStr.endsWith(CODE_BONUS)) {
            inputBuffer = [];
        }
        else if (bufferStr.endsWith(CODE_STREAK)) {
             inputBuffer = [];
        }
    }
}

function unlockDeepDive() {
    const settings = get(settingsStore);
    if (settings.isDeepDiveUnlocked) return;

    settingsStore.update(s => ({ ...s, isDeepDiveUnlocked: true }));
    uiStore.showOverlay(getMessage('journal.messages.unlocked', 'Deep Dive Unlocked!'), 2000);
    inputBuffer = [];
}

function lockDeepDive() {
    const settings = get(settingsStore);
    if (!settings.isDeepDiveUnlocked) return;

    settingsStore.update(s => ({ ...s, isDeepDiveUnlocked: false }));
    uiStore.showOverlay(getMessage('journal.messages.deactivated', 'Deep Dive Locked'), 2000);
    inputBuffer = [];
}

function activateVipSpace() {
    uiStore.showOverlay(getMessage('journal.messages.vipSpaceUnlocked', 'Accessing VIP Space...'), 2000);
    inputBuffer = [];
    setTimeout(() => {
        if (browser) {
            window.open('https://metaverse.bitunix.cyou', '_blank');
        }
    }, 2000);
}

export function initCheatCodes() {
    if (browser) {
        window.addEventListener('keydown', handleKeydown);
        return () => window.removeEventListener('keydown', handleKeydown);
    }
    return () => {};
}
