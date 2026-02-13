
/*
 * Copyright (C) 2026 MYDCT
 *
 * Global Error Handler
 * Catches unhandled exceptions and promise rejections to ensure user feedback.
 */

import { toastService } from "./toastService.svelte";
import { logger } from "./logger";
import { browser } from "$app/environment";
import { mapApiErrorToLabel } from "../utils/errorUtils";

export function initializeGlobalErrorHandling() {
    if (!browser) return;

    window.addEventListener("unhandledrejection", (event) => {
        // Prevent default console logging if handled
        // event.preventDefault();

        const error = event.reason;
        logger.error("ui", "Unhandled Promise Rejection", error);

        // Map error to user-friendly message
        const message = mapApiErrorToLabel(error) || (error?.message ?? "Unknown async error occurred");

        // Show toast
        toastService.error(message);
    });

    window.addEventListener("error", (event) => {
        const error = event.error;
        logger.error("ui", "Global Error", error);

        const message = error?.message || "An unexpected error occurred";
        toastService.error(message);
    });

    logger.log("ui", "Global error handlers initialized");
}
