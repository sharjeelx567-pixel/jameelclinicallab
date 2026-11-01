'use client';

import { AlertCircle, ImagePlus, Loader2, RefreshCw, Trash2, Upload } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';
import { CloudImage } from '@/components/shared/cloud-image';
import { ConfirmDialog } from '@/components/shared/dialogs';
import { Button } from '@/components/ui/button';
import { errorMessage } from '@/lib/api-client';
import { optimizedImageUrl } from '@/lib/cloudinary';
import { cn } from '@/lib/utils';
import { mediaService } from '@/services/admin.service';
import type { MediaAsset, MediaCategory, MediaConfig, MediaRef } from '@/types';

const ACCEPT = ['image/png', 'image/jpeg', 'image/webp'];
const FALLBACK_MAX: Record<MediaCategory, number> = { lab_logo: 2, lab_gallery: 5, staff_profile: 2, doctor_profile: 2, website_illustration: 5 };

let configPromise: Promise<MediaConfig> | null = null;
/** Media configuration from the server (is Cloudinary set up, size limits). Cached per page load. */
export function useMediaConfig() {
  const [config, setConfig] = React.useState<MediaConfig | null>(null);
  React.useEffect(() => {
    configPromise ??= mediaService.config().catch((err) => {
      configPromise = null;
      throw err;
    });
    let live = true;
    configPromise.then((c) => live && setConfig(c)).catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);
  return config;
}

const maxBytesFor = (config: MediaConfig | null, category: MediaCategory) =>
  config?.categories.find((c) => c.id === category)?.maxBytes ?? FALLBACK_MAX[category] * 1024 * 1024;

/** Same checks as the server, so users get instant feedback. The server re-checks the file's bytes. */
function checkFile(file: File, maxBytes: number): string | null {
  if (!ACCEPT.includes(file.type)) return 'Only PNG, JPEG or WebP images are allowed';
  if (file.size > maxBytes) return `Image must be ${Math.round(maxBytes / 1024 / 1024)} MB or smaller`;
  return null;
}

function ProgressBar({ value }: { value: number }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100} aria-label="Upload progress">
      <div className="h-full rounded-full bg-gradient-to-r from-brand-1 to-brand-2 transition-[width] duration-200" style={{ width: `${value}%` }} />
    </div>
  );
}

function NotConfigured() {
  return (
    <p className="flex items-start gap-1.5 text-xs text-warning">
      <AlertCircle className="mt-0.5 size-3.5 shrink-0" /> Image storage is not configured on the server yet (Cloudinary credentials missing).
    </p>
  );
}

function useUpload() {
  const [progress, setProgress] = React.useState<number | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const run = async <T,>(fn: (onProgress: (p: number) => void) => Promise<T>): Promise<T | undefined> => {
    setError(null);
    setProgress(0);
    try {
      return await fn(setProgress);
    } catch (err) {
      setError(errorMessage(err));
      return undefined;
    } finally {
      setProgress(null);
    }
  };
  return { progress, error, setError, run, busy: progress !== null };
}

interface SingleProps {
  category: Extract<MediaCategory, 'lab_logo' | 'staff_profile' | 'doctor_profile'>;
  ownerId?: string;
  current?: MediaRef | null;
  editable: boolean;
  onChange: (ref: MediaRef | null) => void;
  shape?: 'circle' | 'square';
  label?: string;
  className?: string;
}

/** One image slot: logo or a profile photo. Upload, replace and remove, with progress and errors. */
export function ImageUploader({ category, ownerId, current, editable, onChange, shape = 'square', label, className }: SingleProps) {
  const config = useMediaConfig();
  const input = React.useRef<HTMLInputElement>(null);
  const { progress, error, setError, run, busy } = useUpload();
  const [confirm, setConfirm] = React.useState(false);
  const [drag, setDrag] = React.useState(false);
  const maxBytes = maxBytesFor(config, category);
  const disabled = !editable || busy || config?.configured === false;

  const handle = async (file: File | undefined) => {
    if (!file) return;
    const problem = checkFile(file, maxBytes);
    if (problem) return setError(problem);
    const asset = await run((onProgress) =>
      current ? mediaService.replace(current.assetId, file, { onProgress }) : mediaService.upload(category, file, { ownerId, onProgress }),
    );
    if (asset) {
      onChange({ assetId: asset.id, publicId: asset.publicId, secureUrl: asset.secureUrl, width: asset.width, height: asset.height });
      toast.success(current ? 'Image replaced' : 'Image uploaded');
    }
  };

  const px = shape === 'circle' ? 96 : 112;
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      {label && <span className="text-[13px] font-medium">{label}</span>}
      <div className="flex flex-wrap items-center gap-4">
        <button
          type="button"
          disabled={disabled}
          onClick={() => input.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            if (!disabled) setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDrag(false);
            if (!disabled) void handle(e.dataTransfer.files?.[0]);
          }}
          className={cn(
            'group relative grid shrink-0 place-items-center overflow-hidden border-2 border-dashed border-border bg-background/40 transition-colors',
            shape === 'circle' ? 'rounded-full' : 'rounded-2xl',
            !disabled && 'hover:border-primary/60 focus-visible:border-primary',
            drag && 'border-primary bg-primary/10',
            current && 'border-solid',
          )}
          style={{ width: px, height: px }}
          aria-label={current ? 'Replace image' : 'Upload image'}
        >
          {current ? (
            // eslint-disable-next-line @next/next/no-img-element -- Cloudinary-resized preview
            <img
              src={optimizedImageUrl(current.secureUrl, shape === 'circle' ? { width: px * 2, height: px * 2, crop: 'thumb', gravity: 'face' } : { width: px * 2, height: px * 2, crop: 'fit' })}
              alt=""
              className={cn('size-full', shape === 'circle' ? 'object-cover' : 'object-contain p-2')}
            />
          ) : (
            <ImagePlus className="size-7 text-muted-foreground transition-colors group-hover:text-primary" />
          )}
          {busy && (
            <span className="absolute inset-0 grid place-items-center bg-background/70 text-xs font-semibold">
              <Loader2 className="mb-1 size-5 animate-spin text-primary" />
            </span>
          )}
        </button>
        <div className="min-w-0 flex-1 space-y-2">
          <input ref={input} type="file" accept={ACCEPT.join(',')} className="hidden" onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            void handle(f);
          }} />
          {editable && (
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => input.current?.click()}>
                {current ? <><RefreshCw /> Replace</> : <><Upload /> Upload</>}
              </Button>
              {current && (
                <Button type="button" variant="ghost" size="sm" disabled={disabled} onClick={() => setConfirm(true)}>
                  <Trash2 /> Remove
                </Button>
              )}
            </div>
          )}
          {busy ? (
            <div className="space-y-1"><ProgressBar value={progress ?? 0} /><p className="text-xs text-muted-foreground">Uploading… {progress}%</p></div>
          ) : error ? (
            <p className="flex items-start gap-1.5 text-xs text-destructive" role="alert"><AlertCircle className="mt-0.5 size-3.5 shrink-0" />{error}</p>
          ) : config?.configured === false ? (
            <NotConfigured />
          ) : (
            <p className="text-xs text-muted-foreground">PNG, JPEG or WebP · up to {Math.round(maxBytes / 1024 / 1024)} MB{editable ? ' · drag & drop supported' : ''}</p>
          )}
        </div>
      </div>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title="Remove image?"
        description="The image is deleted from Cloudinary. This is recorded in the audit trail."
        confirmLabel="Remove"
        destructive
        onConfirm={async () => {
          if (!current) return;
          try {
            await mediaService.remove(current.assetId);
            onChange(null);
            toast.success('Image removed');
          } catch (err) {
            toast.error(errorMessage(err));
          }
        }}
      />
    </div>
  );
}

/** Many images in one category (lab gallery, website illustrations). */
export function MediaGallery({ category, editable }: { category: Extract<MediaCategory, 'lab_gallery' | 'website_illustration'>; editable: boolean }) {
  const config = useMediaConfig();
  const [items, setItems] = React.useState<MediaAsset[] | null>(null);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [queue, setQueue] = React.useState<{ name: string; done: number; total: number } | null>(null);
  const [pendingDelete, setPendingDelete] = React.useState<MediaAsset | null>(null);
  const [replacing, setReplacing] = React.useState<string | null>(null);
  const addInput = React.useRef<HTMLInputElement>(null);
  const replaceInput = React.useRef<HTMLInputElement>(null);
  const replaceTarget = React.useRef<MediaAsset | null>(null);
  const { progress, error, setError, run, busy } = useUpload();
  const maxBytes = maxBytesFor(config, category);

  const load = React.useCallback(async () => {
    setLoadError(null);
    try {
      setItems(await mediaService.list(category));
    } catch (err) {
      setLoadError(errorMessage(err));
    }
  }, [category]);
  React.useEffect(() => {
    void load();
  }, [load]);

  const addFiles = async (files: File[]) => {
    const rejected = files.map((f) => [f, checkFile(f, maxBytes)] as const).filter(([, p]) => p);
    if (rejected.length) setError(`${rejected[0][0].name}: ${rejected[0][1]}`);
    const ok = files.filter((f) => !checkFile(f, maxBytes));
    for (const [i, file] of ok.entries()) {
      setQueue({ name: file.name, done: i, total: ok.length });
      const asset = await run((onProgress) => mediaService.upload(category, file, { onProgress }));
      if (asset) setItems((prev) => [asset, ...(prev ?? [])]);
      else break;
    }
    setQueue(null);
    if (ok.length && !rejected.length) toast.success(ok.length === 1 ? 'Image uploaded' : `${ok.length} images uploaded`);
  };

  const replace = async (target: MediaAsset, file: File) => {
    const problem = checkFile(file, maxBytes);
    if (problem) return setError(problem);
    setReplacing(target.id);
    const asset = await run((onProgress) => mediaService.replace(target.id, file, { onProgress }));
    setReplacing(null);
    if (asset) {
      setItems((prev) => prev?.map((x) => (x.id === asset.id ? asset : x)) ?? null);
      toast.success('Image replaced');
    }
  };

  const disabled = !editable || busy || config?.configured === false;

  return (
    <div className="space-y-3">
      <input ref={addInput} type="file" multiple accept={ACCEPT.join(',')} className="hidden" onChange={(e) => {
        const files = Array.from(e.target.files ?? []);
        e.target.value = '';
        if (files.length) void addFiles(files);
      }} />
      <input ref={replaceInput} type="file" accept={ACCEPT.join(',')} className="hidden" onChange={(e) => {
        const f = e.target.files?.[0];
        e.target.value = '';
        if (f && replaceTarget.current) void replace(replaceTarget.current, f);
      }} />

      {config?.configured === false && <NotConfigured />}
      {error && <p className="flex items-start gap-1.5 text-xs text-destructive" role="alert"><AlertCircle className="mt-0.5 size-3.5 shrink-0" />{error}</p>}
      {busy && (
        <div className="space-y-1">
          <ProgressBar value={progress ?? 0} />
          <p className="text-xs text-muted-foreground">{queue ? `Uploading ${queue.name} (${queue.done + 1} of ${queue.total})… ${progress}%` : `Uploading… ${progress}%`}</p>
        </div>
      )}

      {loadError ? (
        <p className="text-sm text-destructive">{loadError} <button className="underline" onClick={() => void load()}>Retry</button></p>
      ) : !items ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">{Array.from({ length: 4 }, (_, i) => <div key={i} className="aspect-[4/3] animate-pulse rounded-2xl bg-muted" />)}</div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {editable && (
            <button
              type="button"
              disabled={disabled}
              onClick={() => addInput.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (!disabled) void addFiles(Array.from(e.dataTransfer.files ?? []));
              }}
              className="grid aspect-[4/3] place-items-center rounded-2xl border-2 border-dashed border-border bg-background/40 text-sm text-muted-foreground transition-colors enabled:hover:border-primary/60 enabled:hover:text-primary disabled:opacity-60"
            >
              <span className="flex flex-col items-center gap-1.5"><ImagePlus className="size-6" />Add images<span className="text-[11px]">up to {Math.round(maxBytes / 1024 / 1024)} MB each</span></span>
            </button>
          )}
          {items.map((a) => (
            <figure key={a.id} className="group relative aspect-[4/3] overflow-hidden rounded-2xl border bg-background/40">
              <CloudImage src={a.secureUrl} alt={a.alt ?? a.originalName} fill sizes="(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw" className="object-cover" />
              {replacing === a.id && <span className="absolute inset-0 grid place-items-center bg-background/70"><Loader2 className="size-5 animate-spin text-primary" /></span>}
              <figcaption className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/70 to-transparent px-2.5 pb-1.5 pt-5 text-[11px] text-white">{a.originalName} · {a.width}×{a.height}</figcaption>
              {editable && (
                <div className="absolute right-1.5 top-1.5 flex gap-1 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
                  <Button size="icon-sm" variant="secondary" disabled={disabled} aria-label={`Replace ${a.originalName}`} onClick={() => { replaceTarget.current = a; replaceInput.current?.click(); }}><RefreshCw /></Button>
                  <Button size="icon-sm" variant="secondary" disabled={disabled} aria-label={`Delete ${a.originalName}`} onClick={() => setPendingDelete(a)}><Trash2 /></Button>
                </div>
              )}
            </figure>
          ))}
          {!editable && !items.length && <p className="col-span-full text-sm text-muted-foreground">No images yet.</p>}
        </div>
      )}

      <ConfirmDialog
        open={!!pendingDelete}
        onOpenChange={(o) => !o && setPendingDelete(null)}
        title="Delete image?"
        description={pendingDelete ? `“${pendingDelete.originalName}” will be deleted from Cloudinary. This is recorded in the audit trail.` : undefined}
        confirmLabel="Delete"
        destructive
        onConfirm={async () => {
          if (!pendingDelete) return;
          try {
            await mediaService.remove(pendingDelete.id);
            setItems((prev) => prev?.filter((x) => x.id !== pendingDelete.id) ?? null);
            setPendingDelete(null);
            toast.success('Image deleted');
          } catch (err) {
            toast.error(errorMessage(err));
          }
        }}
      />
    </div>
  );
}
