import type { Config } from 'tailwindcss';
import animate from 'tailwindcss-animate';

/** Design tokens live as CSS variables in src/styles/globals.css (light + dark). */
const config: Config = {
  // `dark:` utilities apply on screen only, never in print.
  darkMode: ['variant', '@media screen { &:is(.dark *) }'],
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    container: { center: true, padding: '1rem' },
    extend: {
      // Text uses a deeper blue in light mode so links, tabs and badges stay readable (AA).
      textColor: { primary: { DEFAULT: 'hsl(var(--primary-text))' } },
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: { DEFAULT: 'hsl(var(--primary))', foreground: 'hsl(var(--primary-foreground))', soft: 'hsl(var(--primary-soft))' },
        secondary: { DEFAULT: 'hsl(var(--secondary))', foreground: 'hsl(var(--secondary-foreground))' },
        muted: { DEFAULT: 'hsl(var(--muted))', foreground: 'hsl(var(--muted-foreground))' },
        accent: { DEFAULT: 'hsl(var(--accent))', foreground: 'hsl(var(--accent-foreground))' },
        card: { DEFAULT: 'hsl(var(--card))', foreground: 'hsl(var(--card-foreground))' },
        popover: { DEFAULT: 'hsl(var(--popover))', foreground: 'hsl(var(--popover-foreground))' },
        destructive: { DEFAULT: 'hsl(var(--destructive))', foreground: 'hsl(var(--destructive-foreground))', soft: 'hsl(var(--destructive-soft))' },
        success: { DEFAULT: 'hsl(var(--success))', soft: 'hsl(var(--success-soft))' },
        warning: { DEFAULT: 'hsl(var(--warning))', soft: 'hsl(var(--warning-soft))' },
        info: { DEFAULT: 'hsl(var(--info))', soft: 'hsl(var(--info-soft))' },
        sidebar: { DEFAULT: 'hsl(var(--sidebar))', foreground: 'hsl(var(--sidebar-foreground))', muted: 'hsl(var(--sidebar-muted))', active: 'hsl(var(--sidebar-active))' },
        highlight: { DEFAULT: 'hsl(var(--highlight))', foreground: 'hsl(var(--highlight-foreground))' },
        brand: { 1: 'hsl(var(--brand-1))', 2: 'hsl(var(--brand-2))', 3: 'hsl(var(--brand-3))' },
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
        display: ['var(--font-display)', 'var(--font-sans)', 'system-ui', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      borderRadius: { lg: 'var(--radius)', md: 'calc(var(--radius) - 2px)', sm: 'calc(var(--radius) - 4px)', xl: 'calc(var(--radius) + 4px)' },
      boxShadow: {
        card: 'var(--shadow-card)',
        elevated: 'var(--shadow-elevated)',
        glow: 'var(--glow-primary)',
      },
      transitionTimingFunction: { smooth: 'var(--ease-out)' },
      keyframes: { shimmer: { '100%': { transform: 'translateX(100%)' } } },
      animation: { shimmer: 'shimmer 1.6s infinite' },
    },
  },
  plugins: [animate],
};

export default config;
