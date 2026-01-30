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

export type WindowType = 'window' | 'modal' | 'iframe';
