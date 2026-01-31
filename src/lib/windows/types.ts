export interface WindowFlags {
    isResizable?: boolean;
    isDraggable?: boolean;
    isTransparent?: boolean;
    enableGlassmorphism?: boolean;
    enableBurningBorders?: boolean;
    showCachyIcon?: boolean;
    allowZoom?: boolean;
    allowFontSize?: boolean;
    allowMaximize?: boolean;
    allowMinimize?: boolean;
    canMinimizeToPanel?: boolean;
    // New interactive flags
    headerAction?: 'toggle-mode' | 'none';
    headerButtons?: ('zoom' | 'export' | 'delete' | 'custom')[];
    pinSide?: 'left' | 'right' | 'top' | 'bottom' | 'none';
    doubleClickBehavior?: 'maximize' | 'pin';
    persistent?: boolean;
    centerByDefault?: boolean;
    allowMultipleInstances?: boolean;
}

export interface WindowLayout {
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    minWidth?: number;
    minHeight?: number;
    aspectRatio?: number | null;
}

export interface WindowConfig {
    type: WindowType;
    flags: WindowFlags;
    layout: WindowLayout;
    defaultTitle?: string;
    opacity?: number;
}

export interface WindowVisuals {
    glass?: boolean;
    burn?: boolean;
    opacity?: number;
}

export interface WindowOptions {
    id?: string;
    title?: string;
    width?: number;
    height?: number;
    x?: number;
    y?: number;
    opacity?: number;
    visuals?: WindowVisuals;
    closeOnBlur?: boolean;
    windowType?: WindowType;
}

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
    | 'assistant';
