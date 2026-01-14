import type { LayoutServerLoad } from "./$types";
import { CONSTANTS } from "../lib/constants";
import { initialTradeState } from "../stores/tradeStore"; // Import initialTradeState

export const prerender = true;
export const ssr = false; // Disable SSR to prevent hydration mismatch with theme

export const load: LayoutServerLoad = async ({ cookies }) => {
  const theme = cookies.get(CONSTANTS.LOCAL_STORAGE_THEME_KEY) || "dark"; // Default to dark if no cookie
  return {
    theme,
    initialTradeState, // Pass initialTradeState to the layout
  };
};
