/** @type {import('tailwindcss').Config} */
const withOpacity = (variable) => `rgb(var(${variable}) / <alpha-value>)`;

export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        bg: {
          DEFAULT: withOpacity('--bg-rgb'),
          dark: withOpacity('--bg-rgb'),
        },
        surface: {
          DEFAULT: withOpacity('--surface-rgb'),
          dark: withOpacity('--surface-rgb'),
        },
        border: {
          DEFAULT: withOpacity('--border-rgb'),
          dark: withOpacity('--border-rgb'),
        },
        text: {
          DEFAULT: withOpacity('--text-rgb'),
          dark: withOpacity('--text-rgb'),
        },
        'text-muted': {
          DEFAULT: withOpacity('--text-muted-rgb'),
          dark: withOpacity('--text-muted-rgb'),
        },
        accent: withOpacity('--accent-rgb'),
        'brand-reel': {
          400: withOpacity('--brand-reel-400-rgb'),
          500: withOpacity('--brand-reel-500-rgb'),
          600: withOpacity('--brand-reel-600-rgb'),
          glow: withOpacity('--brand-reel-glow-rgb'),
        },
        'brand-ink': {
          950: withOpacity('--brand-ink-950-rgb'),
          900: withOpacity('--brand-ink-900-rgb'),
          850: withOpacity('--brand-ink-850-rgb'),
          700: withOpacity('--brand-ink-700-rgb'),
          500: withOpacity('--brand-ink-500-rgb'),
        },
        'brand-paper': {
          DEFAULT: withOpacity('--brand-paper-rgb'),
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['Inter Display', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'SF Mono', 'ui-monospace', 'monospace'],
      },
      borderRadius: {
        cinema: 'var(--radius-cinema)',
      },
      boxShadow: {
        panel: 'var(--shadow-panel)',
        spotlight: 'var(--shadow-spotlight)',
        'card-hover': 'var(--shadow-card-hover)',
      },
    },
  },
  plugins: [],
}
