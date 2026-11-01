'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field, Textarea } from '@/components/ui/form-controls';

interface ConfirmProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  destructive?: boolean;
  /** If set, the user must type a reason (sent to the server and audited). */
  reasonLabel?: string;
  onConfirm: (reason: string) => Promise<unknown> | void;
  children?: React.ReactNode;
}

export function ConfirmDialog({ open, onOpenChange, title, description, confirmLabel = 'Confirm', destructive, reasonLabel, onConfirm, children }: ConfirmProps) {
  const [reason, setReason] = React.useState('');
  const [pending, setPending] = React.useState(false);
  React.useEffect(() => {
    if (!open) setReason('');
  }, [open]);
  const disabled = !!reasonLabel && reason.trim().length < 3;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        {(reasonLabel || children) && (
          <DialogBody className="space-y-4">
            {children}
            {reasonLabel && (
              <Field label={reasonLabel} htmlFor="confirm-reason" required hint="This is recorded in the audit trail.">
                <Textarea id="confirm-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} autoFocus />
              </Field>
            )}
          </DialogBody>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button
            variant={destructive ? 'destructive' : 'default'}
            loading={pending}
            disabled={disabled}
            onClick={async () => {
              setPending(true);
              try {
                await onConfirm(reason.trim());
                onOpenChange(false);
              } finally {
                setPending(false);
              }
            }}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
