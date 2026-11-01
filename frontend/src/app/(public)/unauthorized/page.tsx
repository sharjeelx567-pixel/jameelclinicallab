import { ShieldAlert } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function UnauthorizedPage() {
  return (
    <div className="text-center">
      <div className="mx-auto mb-4 grid size-14 place-items-center rounded-full bg-destructive-soft text-destructive">
        <ShieldAlert className="size-7" />
      </div>
      <h1 className="font-display text-2xl font-semibold">Access restricted</h1>
      <p className="mt-2 text-sm text-muted-foreground">Your role does not have permission to open that page. If you need access, ask a laboratory administrator to update your role.</p>
      <Button asChild className="mt-6">
        <Link href="/dashboard">Back to dashboard</Link>
      </Button>
    </div>
  );
}
