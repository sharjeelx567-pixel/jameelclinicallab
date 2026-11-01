# Changing colours, fonts and look

Everything visual is controlled from **three files**. No component needs editing.

| What | File |
|---|---|
| Colours (brand, surfaces, status colours, glass, glow, background orbs, radius, animation speed) | `frontend/src/styles/theme.css` |
| Fonts (body + headings) | `frontend/src/theme/fonts.ts` |
| Default light/dark mode, animated background on/off, login photo | `frontend/src/theme/config.ts` |

## Colours

Colours are HSL values written as `H S% L%` (no `hsl()`), so opacity variants such as `bg-primary/20` keep working.

```css
/* theme.css */
:root {
  --brand-1: 199 95% 48%;   /* main brand colour (buttons, links, charts) */
  --brand-2: 186 85% 42%;   /* gradient partner of brand-1 */
  --brand-3: 258 80% 62%;   /* decorative glow */
  --highlight: 24 95% 55%;  /* warm accent */
}
.dark {
  --background: 228 62% 4%; /* page background in dark mode */
  --primary: 199 95% 58%;   /* brighter brand colour for dark backgrounds */
}
```

To find HSL values, use any colour picker (for example in VS Code or at hslpicker.com).

Keep `--success`, `--warning`, `--destructive` and `--info` clearly different from each other. They mark normal, abnormal and critical results.

## Fonts

```ts
// fonts.ts — swap Inter / Plus_Jakarta_Sans for any next/font/google family
import { Manrope, Sora } from 'next/font/google';
export const bodyFont = Manrope({ subsets: ['latin'], variable: '--font-sans', display: 'swap' });
export const displayFont = Sora({ subsets: ['latin'], variable: '--font-display', weight: ['500', '600', '700', '800'], display: 'swap' });
```

Keep the `variable` names (`--font-sans`, `--font-display`) unchanged.

## Images

The built-in illustrations are original vector art in `components/shared/illustrations.tsx`, so there are no licensing concerns. To use a photo on the login page:

1. Put a **licensed** image in `frontend/public/images/`.
2. Set `loginImage: '/images/your-file.jpg'` in `theme/config.ts`.

Printed reports and invoices use fixed print colours and are not affected by the screen theme.

After any change, run `npm run build` (or just save while `npm run dev` is running).
