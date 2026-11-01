/**
 * ════════════════════════════════════════════════════════════════════════
 *  THEME SETTINGS — colours live in src/styles/theme.css, fonts in ./fonts.ts
 * ════════════════════════════════════════════════════════════════════════
 */
export const themeConfig = {
  /** Theme used on first visit (users can still toggle; their choice is remembered). */
  defaultTheme: 'dark' as 'dark' | 'light',
  /** Animated background (orbs, grid, molecules). Automatically reduced on mobile and for "reduce motion" users. */
  animatedBackground: true,
  /** Optional hero image for the login page, e.g. '/images/login-lab.jpg' (place a LICENSED image in /public/images). Empty = built-in illustration. */
  loginImage: '',
} as const;
