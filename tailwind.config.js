/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./src/**/*.{html,js,svelte,ts}",
    "./src/lib/components/**/*.svelte",
    "./src/routes/**/*.svelte",
  ],
  theme: {
    extend: {
      colors: {
        primary: "var(--bg-primary)",
        secondary: "var(--bg-secondary)",
        tertiary: "var(--bg-tertiary)",
        "text-primary": "var(--text-primary)",
        "text-secondary": "var(--text-secondary)",
        "border-color": "var(--border-color)",
        accent: "var(--accent-color)",
        "accent-hover": "var(--accent-color-hover)",
        success: "var(--success-color)",
        danger: "var(--danger-color)",
        warning: "var(--warning-color)",
      },
      backgroundColor: {
        primary: "var(--bg-primary)",
        secondary: "var(--bg-secondary)",
        tertiary: "var(--bg-tertiary)",
        "btn-default": "var(--btn-default-bg)",
        "btn-default-hover": "var(--btn-default-hover-bg)",
        "btn-danger": "var(--btn-danger-bg)",
        "btn-danger-hover": "var(--btn-danger-hover-bg)",
        "btn-accent": "var(--btn-accent-bg)",
        "btn-accent-hover": "var(--btn-accent-hover-bg)",
        "btn-success": "var(--btn-success-bg)",
        "btn-success-hover": "var(--btn-success-hover-bg)",
        "toggle-off": "var(--toggle-bg-off)",
        "toggle-on": "var(--toggle-bg-on)",
      },
      textColor: {
        primary: "var(--text-primary)",
        secondary: "var(--text-secondary)",
        "btn-default": "var(--btn-default-text)",
        "btn-danger": "var(--btn-danger-text)",
        "btn-accent": "var(--btn-accent-text)",
        "btn-success": "var(--btn-success-text)",
      },
      borderColor: {
        color: "var(--border-color)",
      },
      boxShadow: {
        tooltip: "var(--shadow-tooltip)",
      },
    },
  },
  darkMode: "class",
  plugins: [],
};
