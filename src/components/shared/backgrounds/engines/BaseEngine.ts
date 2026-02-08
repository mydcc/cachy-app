import * as THREE from 'three';

export interface BaseEngineSettings {
    [key: string]: any;
}

export interface EngineContext {
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    renderer: THREE.WebGLRenderer;
    settings: any; // Generic settings for flexibility
    colorUp?: THREE.Color;
    colorDown?: THREE.Color;
    currentAtmosphere?: THREE.Color;
}

export abstract class BaseEngine {
    protected container: THREE.Group;
    public context: EngineContext;
    protected isInitialized: boolean = false;

    constructor(context: EngineContext) {
        this.context = context;
        this.container = new THREE.Group();
        this.context.scene.add(this.container);
    }

    abstract init(): void;
    abstract update(time: number, delta: number): void;
    
    // Optional methods for interactivity
    public onTrade?(trade: { type: 'buy' | 'sell', price: number, amount: number }): void;
    public onMouseMove?(x: number, y: number): void;
    public updateThemeColors?(colorUp: THREE.Color, colorDown: THREE.Color, atmosphere: THREE.Color): void;

    public setVisible(visible: boolean) {
        this.container.visible = visible;
    }

    public dispose() {
        this.context.scene.remove(this.container);
        this.reset();
    }

    public reset() {
        // Remove all children from container to clear geometry
        while(this.container.children.length > 0){ 
            this.container.remove(this.container.children[0]); 
        }
    }

    public updateSettings(settings: any) {
        this.context.settings = settings;
    }

    protected shouldReinit(newSettings: any): boolean {
        return (
            newSettings.gridWidth !== this.context.settings.gridWidth ||
            newSettings.gridLength !== this.context.settings.gridLength ||
            newSettings.spread !== this.context.settings.spread ||
            newSettings.size !== this.context.settings.size
        );
    }
}
