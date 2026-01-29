export interface WindowPosition {
    x: number;
    y: number;
}

export interface WindowSize {
    width: number;
    height: number;
}

export interface WindowOptions {
    id?: string;
    title: string;
    width?: number;
    height?: number;
    x?: number;
    y?: number;
    minWidth?: number;
    minHeight?: number;
}
