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
    <div className="relative grid min-h-dvh lg:h-dvh lg:grid-cols-[1.1fr_1fr] lg:overflow-hidden">
      <AnimatedBackground variant="auth" />

      <aside className="relative hidden min-h-0 flex-col overflow-hidden px-10 py-7 lg:flex">
        <Logo className="relative" />
        <div className="relative my-auto">
          <div className="relative mx-auto w-full max-w-sm [@media(max-height:760px)]:max-w-[16rem]">
            {themeConfig.loginImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={themeConfig.loginImage} alt="Clinical laboratory" className="aspect-[4/3] w-full rounded-3xl object-cover shadow-elevated" />
            ) : (
              <div className="glass rounded-3xl p-5">
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
          <h2 className="mx-auto mt-6 max-w-sm font-display text-2xl font-bold leading-tight [@media(max-height:760px)]:mt-4 [@media(max-height:760px)]:text-xl">
            <span className="text-gradient">{BRAND.tagline}</span>
          </h2>
          <ul className="mx-auto mt-4 grid max-w-sm gap-3 [@media(max-height:760px)]:mt-3 [@media(max-height:760px)]:gap-2">
            {points.map((p) => (
              <li key={p.title} className="flex gap-3">
                <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/15 text-primary ring-1 ring-primary/25">
                  <p.icon className="size-4" aria-hidden />
                </span>
                <span>
                  <span className="block text-sm font-semibold">{p.title}</span>
                  <span className="block text-xs text-muted-foreground">{p.text}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-xs text-muted-foreground">© {new Date().getFullYear()} {BRAND.name}</p>
      </aside>

      <main className="relative flex min-w-0 flex-col">
        <div className="flex items-center justify-between p-4">
          <Logo className="lg:invisible" />
          <ThemeToggle />
        </div>
        <div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto px-4 pb-8 sm:px-6">
          <div className="glass w-full max-w-[360px] rounded-2xl p-6 shadow-elevated animate-in fade-in-0 slide-in-from-bottom-4 duration-500">{children}</div>
        </div>
      </main>
    </div>
  );
}
