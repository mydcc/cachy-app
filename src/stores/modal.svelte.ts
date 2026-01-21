/*
 * Copyright (C) 2026 MYDCT
 */

import { browser } from "$app/environment";

export interface ModalState {
  title: string;
  message: string;
  type: "alert" | "confirm" | "prompt" | "symbolPicker";
  defaultValue?: string;
  isOpen: boolean;
  resolve: ((value: boolean | string) => void) | null;
  extraClasses?: string;
}

class ModalManager {
  state = $state<ModalState>({
    title: "",
    message: "",
    type: "alert",
    defaultValue: "",
    isOpen: false,
    resolve: null,
    extraClasses: "",
  });

  show(
    title: string,
    message: string,
    type: "alert" | "confirm" | "prompt" | "symbolPicker",
    defaultValue: string = "",
    extraClasses: string = "",
  ): Promise<boolean | string> {
    return new Promise((resolve) => {
      if (!browser) {
        console.warn("Modal cannot be shown in SSR environment.");
        resolve(false);
        return;
      }

      this.state = {
        title,
        message,
        type,
        defaultValue,
        isOpen: true,
        resolve,
        extraClasses,
      };
    });
  }

  handleModalConfirm(result: boolean | string) {
    if (this.state.resolve) {
      this.state.resolve(result);
    }
    this.close();
  }

  close() {
    this.state = {
      ...this.state,
      isOpen: false,
      resolve: null,
    };
  }
}

export const modalState = new ModalManager();
