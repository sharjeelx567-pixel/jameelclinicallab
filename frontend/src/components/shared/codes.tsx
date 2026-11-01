'use client';

import JsBarcode from 'jsbarcode';
import QRCode from 'qrcode';
import * as React from 'react';

/** CODE128 barcode rendered to SVG (crisp at any print resolution). */
export function Barcode({ value, height = 40, width = 1.6, fontSize = 12, displayValue = true, className }: { value: string; height?: number; width?: number; fontSize?: number; displayValue?: boolean; className?: string }) {
  const ref = React.useRef<SVGSVGElement>(null);
  React.useEffect(() => {
    if (!ref.current || !value) return;
    try {
      JsBarcode(ref.current, value, { format: 'CODE128', height, width, fontSize, displayValue, margin: 0, background: 'transparent' });
    } catch {
      /* invalid characters: leave empty rather than render a misleading code */
    }
  }, [value, height, width, fontSize, displayValue]);
  return <svg ref={ref} className={className} role="img" aria-label={`Barcode ${value}`} />;
}

export function QrCode({ value, size = 96, className }: { value: string; size?: number; className?: string }) {
  const [src, setSrc] = React.useState<string>();
  React.useEffect(() => {
    QRCode.toDataURL(value, { margin: 0, width: size * 2 }).then(setSrc).catch(() => setSrc(undefined));
  }, [value, size]);
  // eslint-disable-next-line @next/next/no-img-element
  return src ? <img src={src} width={size} height={size} alt="Report verification QR code" className={className} /> : <div style={{ width: size, height: size }} />;
}
