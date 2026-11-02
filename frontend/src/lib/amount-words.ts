const ONES = ['', 'ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE', 'TEN', 'ELEVEN', 'TWELVE', 'THIRTEEN', 'FOURTEEN', 'FIFTEEN', 'SIXTEEN', 'SEVENTEEN', 'EIGHTEEN', 'NINETEEN'];
const TENS = ['', '', 'TWENTY', 'THIRTY', 'FORTY', 'FIFTY', 'SIXTY', 'SEVENTY', 'EIGHTY', 'NINETY'];

function belowHundred(n: number): string {
  if (n < 20) return ONES[n];
  return `${TENS[Math.floor(n / 10)]}${n % 10 ? ` ${ONES[n % 10]}` : ''}`;
}

function belowThousand(n: number): string {
  const h = Math.floor(n / 100);
  const rest = n % 100;
  return [h ? `${ONES[h]} HUNDRED` : '', rest ? belowHundred(rest) : ''].filter(Boolean).join(' ');
}

/**
 * Rupee amount in words using the Pakistani system (thousand, lakh, crore),
 * e.g. 2000 → "TWO THOUSAND ONLY", 160000 → "ONE LAKH SIXTY THOUSAND ONLY".
 */
export function amountInWords(amount: number): string {
  const n = Math.round(Math.max(0, amount));
  if (n === 0) return 'ZERO ONLY';
  const crore = Math.floor(n / 10_000_000);
  const lakh = Math.floor((n % 10_000_000) / 100_000);
  const thousand = Math.floor((n % 100_000) / 1000);
  const rest = n % 1000;
  const parts = [
    crore ? `${crore >= 1000 ? amountInWords(crore).replace(' ONLY', '') : belowThousand(crore)} CRORE` : '',
    lakh ? `${belowHundred(lakh)} LAKH` : '',
    thousand ? `${belowHundred(thousand)} THOUSAND` : '',
    rest ? belowThousand(rest) : '',
  ];
  return `${parts.filter(Boolean).join(' ')} ONLY`;
}
