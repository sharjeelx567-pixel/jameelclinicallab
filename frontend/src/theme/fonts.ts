/**
 * ════════════════════════════════════════════════════════════════════════
 *  FONTS — change the two imports below to switch the whole app's typography.
 *  Any Google font from `next/font/google` works, e.g. Manrope, Outfit,
 *  Poppins, DM_Sans, Sora, Urbanist. Keep the `variable` names unchanged.
 * ════════════════════════════════════════════════════════════════════════
 */
import { Inter, Plus_Jakarta_Sans } from 'next/font/google';

/** Body text, tables, forms. */
export const bodyFont = Inter({ subsets: ['latin'], variable: '--font-sans', display: 'swap' });

/** Headings, numbers on stat cards, brand wordmark. */
export const displayFont = Plus_Jakarta_Sans({ subsets: ['latin'], variable: '--font-display', weight: ['500', '600', '700', '800'], display: 'swap' });

export const fontVariables = `${bodyFont.variable} ${displayFont.variable}`;
