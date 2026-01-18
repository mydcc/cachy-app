/*
 * Copyright (C) 2026 MYDCT
 *
 * WebSocket State Machine
 * Manages the lifecycle of a WebSocket connection deterministically.
 */

import { writable, type Writable } from "svelte/store";

export enum WsState {
    DISCONNECTED = "DISCONNECTED",
    CONNECTING = "CONNECTING",
    CONNECTED = "CONNECTED", // Open but not authenticated
    AUTHENTICATING = "AUTHENTICATING",
    AUTHENTICATED = "AUTHENTICATED", // Fully operational
    RECONNECTING = "RECONNECTING",
    ERROR = "ERROR",
}

export enum WsEvent {
    START = "START",
    OPEN = "OPEN",
    LOGIN_REQ = "LOGIN_REQ",
    LOGIN_OK = "LOGIN_OK",
    LOGIN_FAIL = "LOGIN_FAIL",
    ERROR = "ERROR",
    CLOSE = "CLOSE",
    STOP = "STOP",
    RETRY = "RETRY",
}

type TransitionMap = {
    [key in WsState]?: {
        [key in WsEvent]?: WsState;
    };
};

export class WSStateMachine {
    private _state: Writable<WsState>;
    private transitions: TransitionMap;
    private onStateChange?: (newState: WsState, oldState: WsState) => void;

    constructor() {
        this._state = writable(WsState.DISCONNECTED);

        // Define the valid transitions
        this.transitions = {
            [WsState.DISCONNECTED]: {
                [WsEvent.START]: WsState.CONNECTING,
            },
            [WsState.CONNECTING]: {
                [WsEvent.OPEN]: WsState.CONNECTED,
                [WsEvent.ERROR]: WsState.RECONNECTING, // Fail to connect -> Retry
                [WsEvent.CLOSE]: WsState.RECONNECTING,
                [WsEvent.STOP]: WsState.DISCONNECTED,
            },
            [WsState.CONNECTED]: {
                [WsEvent.LOGIN_REQ]: WsState.AUTHENTICATING,
                [WsEvent.ERROR]: WsState.RECONNECTING,
                [WsEvent.CLOSE]: WsState.RECONNECTING,
                [WsEvent.STOP]: WsState.DISCONNECTED,
            },
            [WsState.AUTHENTICATING]: {
                [WsEvent.LOGIN_OK]: WsState.AUTHENTICATED,
                [WsEvent.LOGIN_FAIL]: WsState.CONNECTED, // Fallback to public only or retry?
                [WsEvent.ERROR]: WsState.RECONNECTING,
                [WsEvent.CLOSE]: WsState.RECONNECTING,
                [WsEvent.STOP]: WsState.DISCONNECTED,
            },
            [WsState.AUTHENTICATED]: {
                [WsEvent.ERROR]: WsState.RECONNECTING,
                [WsEvent.CLOSE]: WsState.RECONNECTING,
                [WsEvent.STOP]: WsState.DISCONNECTED,
                // If we lose auth but keep connection? Rare.
            },
            [WsState.RECONNECTING]: {
                [WsEvent.RETRY]: WsState.CONNECTING,
                [WsEvent.STOP]: WsState.DISCONNECTED,
            },
            [WsState.ERROR]: {
                [WsEvent.START]: WsState.CONNECTING, // Manual restart
                [WsEvent.RETRY]: WsState.CONNECTING,
            }
        };
    }

    get stateStore() {
        return this._state;
    }

    get currentState(): WsState {
        let current: WsState = WsState.DISCONNECTED;
        const unsub = this._state.subscribe(s => current = s);
        unsub();
        return current;
    }

    public setCallback(cb: (newState: WsState, oldState: WsState) => void) {
        this.onStateChange = cb;
    }

    public transition(event: WsEvent) {
        const fromState = this.currentState;
        const allowed = this.transitions[fromState];
        const toState = allowed ? allowed[event] : undefined;

        if (toState) {
            console.log(`[WS-FSM] Transition: ${fromState} -> ${toState} (Event: ${event})`);
            this._state.set(toState);
            if (this.onStateChange) {
                this.onStateChange(toState, fromState);
            }
        } else {
            console.warn(`[WS-FSM] Invalid Transition: ${fromState} -> ??? (Event: ${event})`);
        }
        return toState;
    }

    public reset() {
        this._state.set(WsState.DISCONNECTED);
    }
}
