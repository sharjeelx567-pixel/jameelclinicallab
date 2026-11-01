export interface ParsedResult {
  analyzerTestCode: string;
  value: string;
  unit?: string;
  flags?: string;
}

export interface ParsedMessage {
  sampleIdentifier?: string;
  results: ParsedResult[];
  /** Structural problems. A message with errors is still forwarded (with raw) for review. */
  errors: string[];
}
