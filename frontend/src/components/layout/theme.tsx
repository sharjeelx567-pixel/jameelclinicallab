'use client';

import { Moon, Sun } from 'lucide-react';
import * as React from 'react';
import { Button } from '@/components/ui/button';
import { themeConfig } from '@/theme/config';

type Theme = 'light' | 'dark';
const KEY = 'jcl.theme';
const ThemeContext = React.createContext<{ theme: Theme; setTheme: (t: Theme) => void }>({ theme: 'light', setTheme: () => undefined });

/** Inline script (in <head>) applies the saved theme before paint to avoid a flash. */
export const themeInitScript = `try{var t=localStorage.getItem('${KEY}');if(t==='dark'||(!t&&'${themeConfig.defaultTheme}'==='dark'))document.documentElement.classList.add('dark')}catch(e){}`;

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = React.useState<Theme>(themeConfig.defaultTheme);
  React.useEffect(() => setThemeState(document.documentElement.classList.contains('dark') ? 'dark' : 'light'), []);
  const setTheme = React.useCallback((t: Theme) => {
    setThemeState(t);
    document.documentElement.classList.toggle('dark', t === 'dark');
    try {
      localStorage.setItem(KEY, t); // UI preference only
    } catch {
      /* private mode */
    }
  }, []);
  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => React.useContext(ThemeContext);

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  return (
    <Button variant="ghost" size="icon" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}>
      {theme === 'dark' ? <Sun /> : <Moon />}
    </Button>
  );
}
