# JCL Frontend — Next.js staff application

The staff user interface for JAMEEL CLINICAL LABORATORY. It holds no business logic and no secrets. Everything goes through the backend REST API, and Firebase is used only for sign-in, with the public web config.

```bash
npm install
cp .env.example .env.local    # NEXT_PUBLIC_AUTH_MODE=dev for local development with the dev backend
npm run dev                   # http://localhost:3000
```

| Script | Purpose |
|---|---|
| `npm run build` / `npm start` | Production build / serve |
| `npm run typecheck` / `npm run lint` | TypeScript / ESLint |
| `npm test` | Vitest unit and component tests |
| `npm run test:responsive` | Playwright responsive and smoke check across 11 viewport widths (needs both servers running in dev mode; run `npx playwright install chromium` once) |

Stack: Next.js App Router, React 19, TypeScript, Tailwind CSS with shadcn-style Radix primitives, Framer Motion, Lucide, React Hook Form + Zod, TanStack Table, Recharts, date-fns, Sonner, JsBarcode and QRCode.

Design tokens are in `src/styles/globals.css` and `tailwind.config.ts` (light and dark themes, plus A4 print styles).
