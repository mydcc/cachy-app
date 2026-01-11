<script lang="ts">
    import { onMount, onDestroy } from 'svelte';
    import { settingsStore } from '../../stores/settingsStore';
    import { uiStore } from '../../stores/uiStore';
    import { _ } from '../../locales/i18n';
    import { browser } from '$app/environment';

    // --- Cheat Code Logic ---
    const CODE_UNLOCK = 'VIPENTE2026';
    const CODE_LOCK = 'VIPDEEPDIVE';
    const CODE_SPACE = 'VIPSPACE2026';
    const CODE_VIP_STATUS = 'VIP2026';
    const CODE_ADMIN_STATUS = 'ADMIN';

    // Placeholders from original code
    const CODE_BONUS = 'VIPBONUS2026';
    const CODE_STREAK = 'VIPSTREAK2026';

    const MAX_CODE_LENGTH = Math.max(
        CODE_UNLOCK.length,
        CODE_LOCK.length,
        CODE_SPACE.length,
        CODE_VIP_STATUS.length,
        CODE_ADMIN_STATUS.length,
        CODE_BONUS.length,
        CODE_STREAK.length
    );

    let inputBuffer: string[] = [];
    let showOverlay = false;
    let overlayTitle = '';
    let overlayMessage = '';

    function handleKeydown(event: KeyboardEvent) {
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

            // VIP STATUS: VIP2026
            if (bufferStr.endsWith(CODE_VIP_STATUS)) {
                activateVipStatus();
            }
            // ADMIN STATUS: ADMIN
            else if (bufferStr.endsWith(CODE_ADMIN_STATUS)) {
                activateAdminStatus();
            }
            // VIPENTE2026: Pro Active + VIP Theme Active => Unlock Charts
            else if (bufferStr.endsWith(CODE_UNLOCK)) {
                // Must be Pro (or higher) and VIP Theme
                // Note: isPro is true if accountTier is not free
                if ($settingsStore.isPro && $uiStore.currentTheme === 'VIP') {
                    unlockDeepDive();
                }
            }
            // VIPDEEPDIVE: Lock Charts
            else if (bufferStr.endsWith(CODE_LOCK)) {
                lockDeepDive();
            }
            // VIPSPACE2026: Pro Active + VIP Theme Active => Space Dialog + Link
            else if (bufferStr.endsWith(CODE_SPACE)) {
                 if ($settingsStore.isPro && $uiStore.currentTheme === 'VIP') {
                    activateVipSpace();
                }
            }
        }
    }

    function showFeedback(title: string, message: string) {
        overlayTitle = title;
        overlayMessage = message;
        showOverlay = true;
        inputBuffer = []; // Reset buffer

        setTimeout(() => {
            showOverlay = false;
        }, 3000);
    }

    function activateVipStatus() {
        if ($settingsStore.accountTier === 'vip') return;
        $settingsStore.accountTier = 'vip';
        // isPro sync is handled in store subscription, but let's be safe visually
        $settingsStore.isPro = true;
        showFeedback('🦆 VIP Status', 'Welcome to the inner circle.');
    }

    function activateAdminStatus() {
        if ($settingsStore.accountTier === 'admin') return;
        $settingsStore.accountTier = 'admin';
        $settingsStore.isPro = true;
        showFeedback('🛠️ Admin Mode', 'Power unlimited.');
    }

    function unlockDeepDive() {
        if ($settingsStore.isDeepDiveUnlocked) return;
        $settingsStore.isDeepDiveUnlocked = true;
        showFeedback('🦆 Deep Dive', $_('journal.messages.unlocked') || 'Deep Dive Unlocked!');
    }

    function lockDeepDive() {
        if (!$settingsStore.isDeepDiveUnlocked) return;
        $settingsStore.isDeepDiveUnlocked = false;
        showFeedback('🦆 Deep Dive', $_('journal.messages.deactivated') || 'Deep Dive Locked.');
    }

    function activateVipSpace() {
        showFeedback('🚀 VIP Space', $_('journal.messages.vipSpaceUnlocked') || 'Launching...');
        setTimeout(() => {
            if (browser) {
                window.open('https://metaverse.bitunix.cyou', '_blank');
            }
        }, 1000);
    }

    onMount(() => {
        if (browser) {
            window.addEventListener('keydown', handleKeydown);
        }
    });

    onDestroy(() => {
        if (browser) {
            window.removeEventListener('keydown', handleKeydown);
        }
    });
</script>

{#if showOverlay}
<div class="fixed inset-0 z-[100] flex items-center justify-center pointer-events-none">
    <div class="bg-black/90 text-white px-10 py-6 rounded-xl shadow-2xl backdrop-blur-md transform transition-all animate-fade-in-out text-center border border-[var(--accent-color)]">
        <div class="text-2xl font-bold text-[var(--accent-color)] mb-2">{overlayTitle}</div>
        <div class="text-xl text-gray-200">{overlayMessage}</div>
    </div>
</div>
{/if}
