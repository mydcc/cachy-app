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

/**
 * WindowFlags define the behavioral and visual capabilities of a window.
 * These flags are used by WindowBase and WindowFrame to determine how a window
 * interacts with the user and the environment.
 */
export interface WindowFlags {
    /** Whether the window can be resized by the user via handles. */
    isResizable?: boolean;
    /** Whether the window can be dragged by its header. */
    isDraggable?: boolean;
    /** If true, the window frame and content can have transparency. */
    isTransparent?: boolean;
    /** Enables the blurred-glass background effect. */
    enableGlassmorphism?: boolean;
    /** Enables glowing/pulsing border effects (Burn effect). */
    enableBurningBorders?: boolean;
    /** Legacy flag for Cachy icon visibility. */
    showCachyIcon?: boolean;
    /** Whether the user can zoom the content via header buttons. */
    allowZoom?: boolean;
    /** Whether the font size can be adjusted via header buttons. */
    allowFontSize?: boolean;
    /** Enables the maximize button and double-click to maximize behavior. */
    allowMaximize?: boolean;
    /** Enables the minimize button. */
    allowMinimize?: boolean;
    /** Whether the window can minimize into a docking bar (usually top bar). */
    canMinimizeToPanel?: boolean;

    /** Definies the action when clicking the title text in the header. */
    headerAction?: 'toggle-mode' | 'none';
    /** List of standard action buttons to show in the header. */
    headerButtons?: ('zoom' | 'export' | 'delete' | 'custom')[];
    /** Which side of the screen the window should pin to when dragged to an edge. */
    pinSide?: 'left' | 'right' | 'top' | 'bottom' | 'none';
    /** Behavior when double-clicking the title bar. */
    doubleClickBehavior?: 'maximize' | 'pin';
    /** If true, position and state are saved to local storage. */
    persistent?: boolean;
    /** If true, the window centers itself on first opening if no coordinates are provided. */
    centerByDefault?: boolean;
    /** If false, only one window of this type/id can exist. */
    allowMultipleInstances?: boolean;
    /** Whether to show custom snippets/indicators in the header. */
    showHeaderIndicators?: boolean;
    /** Shows the profit/duck emoji button in the header. */
    allowFeedDuck?: boolean;
    /** Explicitly show/hide the maximize button. */
    showMaximizeButton?: boolean;
    /** Explicitly show/hide the minimize button. */
    showMinimizeButton?: boolean;
    /** Enables responsive resizing behavior. */
    isResponsive?: boolean;
    /** Screen width at which the window should switch to full-screen/edge-to-edge. */
    edgeToEdgeBreakpoint?: number;

    /** Whether to show the app icon in the header. */
    showIcon?: boolean;
    /** Whether a right-click on the header opens a settings/context menu. */
    hasContextMenu?: boolean;
    /** Action triggered on double click. */
    doubleClickAction?: 'maximize' | 'edgeToEdge';
    /** Maximum number of instances allowed globally for this type. */
    maxInstances?: number;
    /** If true, clicking outside the window closes it. */
    closeOnBlur?: boolean;
    /** Automatically scales content to fit window size. */
    autoScaling?: boolean;
    /** Shows a trading-style right price scale (specific to charts). */
    showRightScale?: boolean;
}

/**
 * Definition for a single action in a window's right-click context menu.
 */
export interface ContextMenuAction {
    /** The text label displayed in the menu. */
    label: string;
    /** Optional emoji or icon string. */
    icon?: string;
    /** The function to execute when the action is clicked. */
    action: () => void;
    /** Whether the action is currently active/selected. */
    active?: boolean;
    /** If true, the action is highlighted as dangerous (e.g. Red for Delete). */
    danger?: boolean;
}

/**
 * Defines the initial or current spatial state of a window.
 */
export interface WindowLayout {
    /** Horizontal position in pixels. */
    x?: number;
    /** Vertical position in pixels. */
    y?: number;
    /** Current width in pixels. */
    width?: number;
    /** Current height in pixels. */
    height?: number;
    /** Minimum allowed width during resize. */
    minWidth?: number;
    /** Minimum allowed height during resize. */
    minHeight?: number;
    /** Fixed aspect ratio (width / height) the window must maintain. */
    aspectRatio?: number | null;
}

/**
 * Full configuration for a window type, used by the WindowRegistry.
 */
export interface WindowConfig {
    /** Primary classification of the window. */
    type: WindowType;
    /** Set of behavioral and visual flags. */
    flags: WindowFlags;
    /** Default spatial layout. */
    layout: WindowLayout;
    /** The title displayed if none is provided via options. */
    defaultTitle?: string;
    /** Default opacity (0.0 - 1.0). */
    opacity?: number;
}

/**
 * Legacy interface for grouping visual settings.
 */
export interface WindowVisuals {
    glass?: boolean;
    burn?: boolean;
    opacity?: number;
}

/**
 * Arguments passed to a window constructor to customize an instance.
 */
export interface WindowOptions {
    /** Unique identifier. If none provided, one will be generated based on title. */
    id?: string;
    /** Custom title for this instance. */
    title?: string;
    /** Ticker symbol for financial windows. */
    symbol?: string;
    /** Initial width. */
    width?: number;
    /** Initial height. */
    height?: number;
    /** Initial X position. */
    x?: number;
    /** Initial Y position. */
    y?: number;
    /** Initial opacity. */
    opacity?: number;
    /** Visual settings override. */
    visuals?: WindowVisuals;
    /** Whether to close the window when focus is lost. */
    closeOnBlur?: boolean;
    /** The type of window, used to lookup defaults in registry. */
    windowType?: WindowType;
}

/**
 * All available window types supported by the system.
 */
export type WindowType =
    | 'window'
    | 'modal'
    | 'iframe'
    | 'chart'
    | 'news'
    | 'settings'
    | 'chatbox'
    | 'chatpanel'
    | 'symbolpicker'
    | 'journal'
    | 'guide'
    | 'changelog'
    | 'privacy'
    | 'whitepaper'
    | 'assistant'
    | 'channel'
    | 'dialog';
