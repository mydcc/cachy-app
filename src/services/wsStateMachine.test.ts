import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WSStateMachine, WsState, WsEvent } from './wsStateMachine';
import { get } from 'svelte/store';

describe('WSStateMachine', () => {
    let fsm: WSStateMachine;

    beforeEach(() => {
        fsm = new WSStateMachine();
    });

    it('should start in DISCONNECTED state', () => {
        expect(fsm.currentState).toBe(WsState.DISCONNECTED);
    });

    it('should transition correctly: DISCONNECTED -> CONNECTING -> CONNECTED', () => {
        fsm.transition(WsEvent.START);
        expect(fsm.currentState).toBe(WsState.CONNECTING);

        fsm.transition(WsEvent.OPEN);
        expect(fsm.currentState).toBe(WsState.CONNECTED);
    });

    it('should handle authentication flow: CONNECTED -> AUTHENTICATING -> AUTHENTICATED', () => {
        // Fast forward to connected
        fsm.transition(WsEvent.START);
        fsm.transition(WsEvent.OPEN);

        fsm.transition(WsEvent.LOGIN_REQ);
        expect(fsm.currentState).toBe(WsState.AUTHENTICATING);

        fsm.transition(WsEvent.LOGIN_OK);
        expect(fsm.currentState).toBe(WsState.AUTHENTICATED);
    });

    it('should ignore invalid transitions', () => {
        // From DISCONNECTED, LOGIN_REQ is invalid
        fsm.transition(WsEvent.LOGIN_REQ);
        expect(fsm.currentState).toBe(WsState.DISCONNECTED);
    });

    it('should handle errors by going to RECONNECTING', () => {
        fsm.transition(WsEvent.START); // CONNECTING
        fsm.transition(WsEvent.ERROR);
        expect(fsm.currentState).toBe(WsState.RECONNECTING);
    });

    it('should trigger callbacks on state change', () => {
        const spy = vi.fn();
        fsm.setCallback(spy);

        fsm.transition(WsEvent.START);
        expect(spy).toHaveBeenCalledWith(WsState.CONNECTING, WsState.DISCONNECTED);
    });
});
