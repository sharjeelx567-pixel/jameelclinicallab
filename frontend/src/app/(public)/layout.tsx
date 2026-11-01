import { Activity, FlaskConical, ShieldCheck, Workflow } from 'lucide-react';
import { AnimatedBackground } from '@/components/shared/animated-background';
import { LabHeroIllustration } from '@/components/shared/illustrations';
import { Logo } from '@/components/shared/logo';
import { ThemeToggle } from '@/components/layout/theme';
import { BRAND } from '@/constants';
import { themeConfig } from '@/theme/config';

const points = [
  { icon: ShieldCheck, title: 'Verified results only', text: 'Every result is reviewed by an authorised pathologist before a report is issued.' },
  { icon: Workflow, title: 'End-to-end traceability', text: 'Registration, samples, results, approvals and payments — all audited.' },
  { icon: FlaskConical, title: 'Analyzer-ready', text: 'Integration architecture for BIOELAB equipment, pending model verification.' },
];

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      <AnimatedBackground variant="auth" />

      <aside className="relative hidden flex-col overflow-hidden p-10 lg:flex">
        <Logo className="relative" />
        <div className="relative my-auto">
          <div className="relative mx-auto max-w-lg">
            {themeConfig.loginImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={themeConfig.loginImage} alt="Clinical laboratory" className="aspect-[4/3] w-full rounded-3xl object-cover shadow-elevated" />
            ) : (
              <div className="glass rounded-[2rem] p-8">
                <LabHeroIllustration />
              </div>
            )}
            {/* Floating decorative chips — illustrative UI only, not data */}
            <div className="glass absolute -left-6 top-10 hidden items-center gap-2 rounded-2xl px-3 py-2 text-xs font-medium xl:flex xl:animate-float">
              <span className="grid size-7 place-items-center rounded-lg bg-success/20 text-success"><ShieldCheck className="size-4" /></span>
              Verified by pathologist
            </div>
            <div className="glass absolute -right-4 bottom-10 hidden items-center gap-2 rounded-2xl px-3 py-2 text-xs font-medium xl:flex xl:animate-float [animation-delay:-3s]">
              <span className="grid size-7 place-items-center rounded-lg bg-primary/20 text-primary"><Activity className="size-4" /></span>
              Sample → result → report
            </div>
          </div>
          <h2 className="mx-auto mt-10 max-w-lg font-display text-3xl font-bold leading-tight xl:text-4xl">
            <span className="text-gradient">{BRAND.tagline}</span>
          </h2>
          <ul className="mx-auto mt-6 grid max-w-lg gap-4">
            {points.map((p) => (
              <li key={p.title} className="flex gap-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/15 text-primary ring-1 ring-primary/25">
                  <p.icon className="size-4" aria-hidden />
                </span>
                <span>
                  <span className="block text-sm font-semibold">{p.title}</span>
                  <span className="block text-sm text-muted-foreground">{p.text}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-xs text-muted-foreground">© {new Date().getFullYear()} {BRAND.name}</p>
      </aside>

      <main className="relative flex min-w-0 flex-col">
        <div className="flex items-center justify-between p-4 sm:p-6">
          <Logo className="lg:invisible" />
          <ThemeToggle />
        </div>
        <div className="flex flex-1 items-center justify-center px-4 pb-12 sm:px-6">
          <div className="glass w-full max-w-md rounded-3xl p-6 shadow-elevated animate-in fade-in-0 slide-in-from-bottom-4 duration-500 sm:p-8">{children}</div>
        </div>
      </main>
    </div>
  );
}
