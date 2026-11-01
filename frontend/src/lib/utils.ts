import { clsx, type ClassValue } from 'clsx';
import { format, formatDistanceToNowStrict } from 'date-fns';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const currency = new Intl.NumberFormat('en-PK', { style: 'currency', currency: 'PKR', maximumFractionDigits: 0 });
export const formatMoney = (n: number | undefined | null) => (n === undefined || n === null ? '—' : currency.format(n));

export const formatDate = (iso?: string | null, pattern = 'dd MMM yyyy') => (iso ? format(new Date(iso), pattern) : '—');
export const formatDateTime = (iso?: string | null) => formatDate(iso, 'dd MMM yyyy, HH:mm');
export const timeAgo = (iso?: string | null) => (iso ? `${formatDistanceToNowStrict(new Date(iso))} ago` : '—');

export const titleCase = (s: string) => s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('');

export const todayKey = () => format(new Date(), 'yyyy-MM-dd');
