/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

/*
  Copyright (C) 2026 MYDCT
  Central Registry for Window Configurations
*/

import type { WindowType, WindowConfig } from "./types";

/**
 * WindowRegistry acts as a central configuration store for all window types.
 * It defines default flags, layouts, and behavioral traits for categories like
 * charts, news, settings, modals, and internal tools.
 * 
 * When a window is instantiated, it retrieves its base configuration from this 
 * registry to ensure visual and functional consistency.
 */
class WindowRegistry {
    /** Map of window types to their respective configuration objects. */
    private configs: Map<WindowType, WindowConfig> = new Map();

    constructor() {
        this.registerDefaults();
    }

    /**
     * populates the registry with predefined configurations.
     * Includes categories for:
     * - System: window, modal, dialog, settings, iframe
     * - Trading: chart, symbolpicker
     * - Communication: news, chatbox, assistant
     * - Content: journal, guide, whitepaper, etc.
     */
    private registerDefaults() {
        /**
         * GLOBAL BASE FLAGS
         * These serve as the absolute fallback for any property not explicitly 
         * defined in a specific window type.
         */
        const baseFlags = {
            isResizable: true,
            isDraggable: true,
            isTransparent: false,
            enableGlassmorphism: true,
            enableBurningBorders: true,
            showCachyIcon: true,
            allowZoom: false,
            allowFontSize: false,
            allowMaximize: true,
            allowMinimize: true,
            canMinimizeToPanel: true,
            showIcon: false,
            hasContextMenu: false,
            doubleClickAction: 'maximize' as 'maximize',
            maxInstances: 0,
            closeOnBlur: false,
        };

        const baseLayout = {
            width: 1000,
            height: 800,
            minWidth: 200,
            minHeight: 150,
            aspectRatio: null
        };

        // --- SYSTEM TYPES ---

        /** Standard generic window. */
        this.configs.set('window', {
            type: 'window',
            flags: { ...baseFlags },
            layout: { ...baseLayout }
        });

        /** Center-fixed modal for critical inputs or overlays. */
        this.configs.set('modal', {
            type: 'modal',
            flags: {
                ...baseFlags,
                isResizable: false,
                isDraggable: true,
                allowMaximize: false,
                allowMinimize: false,
                canMinimizeToPanel: false,
                centerByDefault: true
            },
            layout: {
                ...baseLayout,
                width: 800,
                height: 600
            }
        });

        /** Small center-fixed dialog for Alerts and Confirmations. */
        this.configs.set('dialog', {
            type: 'dialog',
            flags: {
                ...baseFlags,
                isResizable: false,
                isDraggable: true,
                allowMaximize: false,
                allowMinimize: false,
                canMinimizeToPanel: false,
                centerByDefault: true,
                isResponsive: true, // Maximizes automatically on mobile
                edgeToEdgeBreakpoint: 768
            },
            layout: {
                ...baseLayout,
                width: 450,
                height: 250
            }
        });

        // --- TRADING & DATA TYPES ---

        /** Full-featured financial chart window. */
        this.configs.set('chart', {
            type: 'chart',
            flags: {
                ...baseFlags,
                allowMinimize: true,
                allowZoom: false,
                allowMultipleInstances: true,
                allowMaximize: true,
                showIcon: true,
                hasContextMenu: true,
                autoScaling: true,
                showRightScale: true
            },
            layout: {
                ...baseLayout,
                width: 640,
                height: 480,
                aspectRatio: 1.6 // Maintain 16:10 ratio during resizing
            }
        });

        /** Asset selection tool. */
        this.configs.set('symbolpicker', {
            type: 'symbolpicker',
            flags: {
                ...baseFlags,
                isResizable: false,
                isDraggable: false,
                allowMaximize: false,
                centerByDefault: true,
                isResponsive: true,
                edgeToEdgeBreakpoint: 768
            },
            layout: {
                ...baseLayout,
                width: 900,
                height: 700
            }
        });

        // --- COMMUNICATION & UTILITY ---

        this.configs.set('news', {
            type: 'news',
            flags: {
                ...baseFlags,
                enableBurningBorders: false,
                showCachyIcon: false
            },
            layout: {
                ...baseLayout,
                width: 600,
                height: 500
            }
        });

        this.configs.set('chatbox', {
            type: 'chatbox',
            flags: {
                ...baseFlags,
                canMinimizeToPanel: true
            },
            layout: {
                ...baseLayout,
                width: 400,
                height: 500
            }
        });

        /** Settings pane with auto-close on blur. */
        this.configs.set('settings', {
            type: 'settings',
            flags: {
                ...baseFlags,
                isDraggable: true,
                allowMaximize: false,
                allowMinimize: false,
                centerByDefault: true,
                showIcon: false,
                isResizable: false as boolean,
                closeOnBlur: true
            },
            layout: {
                ...baseLayout,
                width: 900,
                height: 700
            }
        });

        // --- DOCUMENTATION & INFORMATION ---

        const markdownTypes: WindowType[] = ['journal', 'guide', 'changelog', 'privacy', 'whitepaper'];
        markdownTypes.forEach(t => {
            this.configs.set(t, {
                type: t,
                flags: {
                    ...baseFlags,
                    isResizable: true,
                    allowMaximize: true,
                    showMaximizeButton: false,
                    showMinimizeButton: false,
                    allowZoom: false,
                    allowFontSize: false,
                    centerByDefault: true,
                    showHeaderIndicators: t === 'journal',
                    allowFeedDuck: t !== 'journal'
                },
                layout: {
                    ...baseLayout,
                    width: 1000,
                    height: 800
                }
            });
        });

        /** Hybrid AI assistant / Side-chat window. */
        this.configs.set('assistant', {
            type: 'assistant',
            flags: {
                ...baseFlags,
                isResizable: true,
                isDraggable: true,
                allowMaximize: true,
                allowMinimize: true,
                canMinimizeToPanel: true
            },
            layout: {
                ...baseLayout,
                width: 450,
                height: 600
            }
        });
    }

    /**
     * Retrieves the configuration for a specific window type.
     * Falls back to 'window' if the type is unregistered.
     */
    getConfig(type: WindowType): WindowConfig {
        return this.configs.get(type) || this.configs.get('window')!;
    }
}

export const windowRegistry = new WindowRegistry();
