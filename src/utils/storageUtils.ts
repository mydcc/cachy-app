/**
 * LocalStorage Utility Functions
 * Provides safe storage operations with quota checking
 */

export const storageUtils = {
    /**
     * Checks available LocalStorage space
     * @returns Object with used bytes, available bytes, and percentage
     */
    checkQuota(): { used: number; available: number; percentage: number } {
        let used = 0;

        // Calculate current usage
        for (let key in localStorage) {
            if (localStorage.hasOwnProperty(key)) {
                const value = localStorage[key];
                used += value.length + key.length;
            }
        }

        // Most browsers: ~5-10MB, we assume 5MB conservative estimate
        const ESTIMATED_QUOTA = 5 * 1024 * 1024; // 5MB in bytes
        const available = ESTIMATED_QUOTA - used;
        const percentage = (used / ESTIMATED_QUOTA) * 100;

        return { used, available, percentage };
    },

    /**
     * Safely stores data in LocalStorage with quota validation
     * @param key - Storage key
     * @param value - String value to store
     * @throws Error if quota would be exceeded
     */
    safeSetItem(key: string, value: string): void {
        const dataSize = value.length + key.length;
        const quota = this.checkQuota();

        // Warning at >80% usage
        if (quota.percentage > 80) {
            console.warn(
                `LocalStorage ist zu ${quota.percentage.toFixed(1)}% voll (${(quota.used / 1024).toFixed(0)}KB von ${((quota.used + quota.available) / 1024).toFixed(0)}KB)`
            );
        }

        // Error at >95% or if new data doesn't fit
        if (quota.percentage > 95 || dataSize > quota.available) {
            throw new Error(
                `LocalStorage Quota überschritten. ` +
                `Verwendet: ${(quota.used / 1024).toFixed(0)}KB / ${((quota.used + quota.available) / 1024).toFixed(0)}KB. ` +
                `Bitte löschen Sie alte Trades oder exportieren Sie Ihr Journal.`
            );
        }

        try {
            localStorage.setItem(key, value);
        } catch (e) {
            // QuotaExceededError or other storage errors
            if (e instanceof Error && e.name === 'QuotaExceededError') {
                throw new Error(
                    'LocalStorage ist voll. Bitte exportieren Sie Ihr Journal als CSV und löschen Sie alte Einträge.'
                );
            }
            throw new Error('Fehler beim Speichern. Der lokale Speicher ist möglicherweise blockiert.');
        }
    },

    /**
     * Gets formatted quota information for display
     * @returns Human-readable quota status string
     */
    getQuotaStatus(): string {
        const quota = this.checkQuota();
        return `LocalStorage: ${(quota.used / 1024).toFixed(0)}KB / ${((quota.used + quota.available) / 1024).toFixed(0)}KB (${quota.percentage.toFixed(1)}%)`;
    }
};
