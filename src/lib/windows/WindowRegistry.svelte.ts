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

class WindowRegistry {
    private configs: Map<WindowType, WindowConfig> = new Map();

    constructor() {
        this.registerDefaults();
    }

    private registerDefaults() {
        // Base Default for a standard window
        const baseFlags = {
            isResizable: true,
            isDraggable: true,
            isTransparent: false,
            enableGlassmorphism: true,
            enableBurningBorders: true,
            showCachyIcon: true,
            allowZoom: false,
            allowFontSize: false,
            allowMaximize: false,
            allowMinimize: false,
            canMinimizeToPanel: false,
        };

        const baseLayout = {
            width: 1000,
            height: 800,
            minWidth: 200,
            minHeight: 150,
            aspectRatio: null
        };

        // Standard Window
        this.configs.set('window', {
            type: 'window',
            flags: { ...baseFlags },
            layout: { ...baseLayout }
        });

        // Modal (usually non-resizable, fixed center)
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

        // Symbol Picker
        this.configs.set('symbolpicker', {
            type: 'symbolpicker',
            flags: {
                ...baseFlags,
                isResizable: false,
                isDraggable: false,
                allowMaximize: false,
                centerByDefault: true
            },
            layout: {
                ...baseLayout,
                width: 800,
                height: 600
            }
        });

        // Chart Window
        this.configs.set('chart', {
            type: 'chart',
            flags: {
                ...baseFlags,
                allowMinimize: true,
                allowZoom: false,
                allowMultipleInstances: true
            },
            layout: {
                ...baseLayout,
                width: 640,
                height: 480,
                aspectRatio: 1.6
            }
        });

        // News Window
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

        // Chat Box
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

        // Chat Panel (pinned/specific)
        this.configs.set('chatpanel', {
            type: 'chatpanel',
            flags: {
                ...baseFlags,
                isDraggable: false,
                isResizable: true,
                allowMaximize: false
            },
            layout: {
                ...baseLayout,
                width: 350,
                height: 800
            }
        });

        // Iframe Window
        this.configs.set('iframe', {
            type: 'iframe',
            flags: {
                ...baseFlags,
                showCachyIcon: true
            },
            layout: {
                ...baseLayout,
                width: 900,
                height: 600
            }
        });

        // Settings
        this.configs.set('settings', {
            type: 'settings',
            flags: {
                ...baseFlags,
                isResizable: true,
                isDraggable: true,
                allowMaximize: false,
                allowMinimize: false,
                centerByDefault: true
            },
            layout: {
                ...baseLayout,
                width: 900,
                height: 700
            }
        });

        // Markdown Info Windows (Journal, Guide, etc)
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

        // Assistant Window (AI, Notes, Chat)
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

    getConfig(type: WindowType): WindowConfig {
        return this.configs.get(type) || this.configs.get('window')!;
    }
}

export const windowRegistry = new WindowRegistry();
