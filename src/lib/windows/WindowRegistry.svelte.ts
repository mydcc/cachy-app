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
     * Populates the registry from the single default-config record below.
     */
    private registerDefaults() {
        const configs = WindowRegistry.buildDefaultConfigs();
        for (const [type, config] of Object.entries(configs)) {
            this.configs.set(type as WindowType, config);
        }
    }

    /**
     * The single source of truth for every window type's default configuration.
     *
     * Typed as `Record<WindowType, WindowConfig>` on purpose (BUG-0434): this
     * file is compiled by `svelte-check`, whereas `tsconfig.json` excludes
     * `*.test.ts`. A member added to the `WindowType` union without an entry
     * here is a missing-key compile error that fails `npm run check`. The old
     * guard lived in `WindowRegistry.test.ts`, which the compiler never read --
     * `alertpanel` slipped through with a green check.
     *
     * Includes categories for:
     * - System: window, modal, dialog, settings, iframe
     * - Trading: chart, symbolpicker
     * - Communication: news, chatbox, assistant
     * - Content: journal, guide, whitepaper, etc.
     */
    private static buildDefaultConfigs(): Record<WindowType, WindowConfig> {
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
            doubleClickAction: 'maximize' as const,
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

        /**
         * Reader class (BUG-0411): documents open large and stay put -- no
         * resize handle. isResponsive maximizes them automatically below
         * 768px, like the market dashboard. Built per type so each of
         * guide/changelog/privacy/whitepaper gets its own object.
         */
        const readerConfig = (type: WindowType): WindowConfig => ({
            type,
            flags: {
                ...baseFlags,
                isResizable: false,
                allowMaximize: true,
                showMaximizeButton: false,
                showMinimizeButton: false,
                allowZoom: false,
                allowFontSize: true,
                centerByDefault: true,
                showHeaderIndicators: false,
                allowFeedDuck: true,
                isResponsive: true,
                edgeToEdgeBreakpoint: 768
            },
            layout: {
                ...baseLayout,
                width: 1000,
                height: 800
            }
        });

        return {
            // --- SYSTEM TYPES ---

            /** Standard generic window. */
            window: {
                type: 'window',
                flags: { ...baseFlags },
                layout: { ...baseLayout }
            },

            /**
             * Center-fixed modal for critical inputs or overlays. Backing type
             * for the ModalFrame adapter (FEAT-0044) -- Academy, Market
             * Dashboard and TpSlEdit are all `modal` windows that legitimately
             * coexist, hence allowMultipleInstances: true (each gets its own
             * generated id rather than sharing the type-based singleton id).
             */
            modal: {
                type: 'modal',
                flags: {
                    ...baseFlags,
                    isResizable: false,
                    isDraggable: true,
                    allowMaximize: false,
                    allowMinimize: false,
                    canMinimizeToPanel: false,
                    centerByDefault: true,
                    allowMultipleInstances: true,
                    isResponsive: true, // Maximizes automatically on mobile
                    edgeToEdgeBreakpoint: 768,
                    showBackdrop: true,
                    closeOnBlur: true // Click-outside and Escape both close it
                },
                layout: {
                    ...baseLayout,
                    width: 800,
                    height: 600
                }
            },

            /**
             * FEAT-0389 -- the Super-Alert side panel.
             *
             * A side panel is a floating surface, so ADR-0006 requires it to be a
             * WindowBase under WindowManager rather than its own fixed overlay.
             * Two flags carry the whole point of the redesign: `showBackdrop:
             * false` and `closeOnBlur: false`, so the chart stays visible *and*
             * clickable beside the panel. The alert modal covered the chart the
             * trader was reading while deciding where to put the alarm; a panel
             * that dimmed or closed on the next chart click would keep that cost
             * under a new name.
             *
             * Singleton (`allowMultipleInstances` unset, `maxInstances: 1`): the
             * panel holds one draft rule, and a second instance would edit the
             * same document from two places.
             */
            alertpanel: {
                type: 'alertpanel',
                flags: {
                    ...baseFlags,
                    isResizable: true,
                    isDraggable: true,
                    allowMaximize: false,
                    allowMinimize: true,
                    canMinimizeToPanel: true,
                    centerByDefault: false,
                    maxInstances: 1,
                    showBackdrop: false,
                    closeOnBlur: false,
                    isResponsive: true, // Edge-to-edge on mobile, where docking has no room
                    edgeToEdgeBreakpoint: 768
                },
                layout: {
                    ...baseLayout,
                    width: 420,
                    height: 720,
                    minWidth: 340,
                    minHeight: 420
                }
            },

            /** Small center-fixed dialog for Alerts and Confirmations. */
            dialog: {
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
            },

            /**
             * Generic external-URL embed. Had no registry entry before
             * FEAT-0050's "every WindowType has a config" test caught the gap
             * (it silently fell back to 'window' via getConfig()) --
             * allowMultipleInstances since several embedded URLs can legitimately
             * coexist, the same reasoning as 'channel' below.
             */
            iframe: {
                type: 'iframe',
                flags: {
                    ...baseFlags,
                    allowMultipleInstances: true
                },
                layout: { ...baseLayout }
            },

            // --- TRADING & DATA TYPES ---

            /** Full-featured financial chart window. */
            chart: {
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
                    showRightScale: true,
                    headerAction: 'toggle-mode'
                },
                layout: {
                    ...baseLayout,
                    width: 640,
                    height: 480,
                    aspectRatio: 1.6 // Maintain 16:10 ratio during resizing
                }
            },

            /** Asset selection tool. */
            symbolpicker: {
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
            },

            // --- COMMUNICATION & UTILITY ---

            news: {
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
            },

            chatbox: {
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
            },

            /** Settings pane with auto-close on blur. */
            settings: {
                type: 'settings',
                flags: {
                    ...baseFlags,
                    isDraggable: true,
                    allowMaximize: true,
                    allowMinimize: false,
                    centerByDefault: true,
                    showIcon: false,
                    isResizable: false,
                    closeOnBlur: true,
                    isResponsive: true,
                    edgeToEdgeBreakpoint: 768,
                    persistent: false
                },
                layout: {
                    ...baseLayout,
                    width: 1000,
                    height: 800
                }
            },

            // --- DOCUMENTATION & INFORMATION ---

            guide: readerConfig('guide'),
            changelog: readerConfig('changelog'),
            privacy: readerConfig('privacy'),
            whitepaper: readerConfig('whitepaper'),

            // Journal Window overrides
            journal: {
                type: 'journal',
                flags: {
                    ...baseFlags,
                    isResizable: true,
                    allowMaximize: true,
                    showMaximizeButton: true,
                    showMinimizeButton: true,
                    allowMinimize: true,
                    allowZoom: false,
                    allowFontSize: false, // We set this false per instructions
                    centerByDefault: true,
                    showHeaderIndicators: true,
                    allowFeedDuck: false,
                    canMinimizeToPanel: false // Minimize to LeftControlPanel instead of top dock
                },
                layout: {
                    ...baseLayout,
                    width: 1000,
                    height: 800
                }
            },

            /**
             * Trading Academy: a real window rather than a `modal` (FEAT-0045)
             * -- the whole point is that it can be minimised to the dock while
             * checking a chart and come back with the same tab/size/position,
             * none of which a `modal`-type window supports (not minimisable,
             * not persisted). Default layout approximates a large reading
             * surface (80vw capped at 1320px, 3:2) at a common desktop
             * resolution; unlike a CSS preset it's a starting point, not a
             * constraint -- no `aspectRatio` lock, since this is content
             * browsing, not chart rendering.
             */
            academy: {
                type: 'academy',
                flags: {
                    ...baseFlags,
                    allowMaximize: true,
                    allowMinimize: true,
                    canMinimizeToPanel: true,
                    centerByDefault: true,
                    isResponsive: true,
                    edgeToEdgeBreakpoint: 768
                },
                layout: {
                    ...baseLayout,
                    width: 1200,
                    height: 800,
                    minWidth: 480,
                    minHeight: 400
                }
            },

            /** Hybrid AI assistant / Side-chat window. */
            assistant: {
                type: 'assistant',
                flags: {
                    ...baseFlags,
                    isResizable: true,
                    isDraggable: true,
                    allowMaximize: true,
                    allowMinimize: true,
                    canMinimizeToPanel: true,
                    headerAction: 'toggle-mode',
                    headerButtons: ['export', 'delete'],
                    pinSide: 'left',
                    doubleClickBehavior: 'pin',
                    allowFontSize: true,
                    allowZoom: false
                },
                layout: {
                    ...baseLayout,
                    width: 450,
                    height: 600
                }
            },

            /** Specialized Media/Channel Window (e.g. Galaxy Chat) */
            channel: {
                type: 'channel', // Requires type update in types.ts if STRICT (but mostly likely string union)
                flags: {
                    ...baseFlags,
                    allowMultipleInstances: true
                },
                layout: {
                    ...baseLayout,
                    x: 20,
                    y: 60,
                    width: 640,
                    height: 360,
                    aspectRatio: 16 / 9
                }
            }
        };
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
