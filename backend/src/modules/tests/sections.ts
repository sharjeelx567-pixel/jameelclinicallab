import type { TestParameter } from '../../common/entities';

const PATIENT = /^patient'?s? name$/i;
const DONOR = /^donor'?s? name$/i;
const SCREENING = /hbs\s*ag|hcv|hiv|vdrl|syphilis|malaria/i;

/**
 * Section heading per parameter id (only on the row where a heading starts).
 * Headings typed in the test editor win. A test with none typed that has both a
 * "Patient Name" and a "Donor Name" row (cross match) gets PATIENT / DONOR /
 * SCREENING REPORT automatically, so the lab does not have to set them up.
 */
export function parameterSections(parameters: Pick<TestParameter, 'id' | 'name' | 'section' | 'sortOrder'>[]): Map<string, string> {
  const out = new Map<string, string>();
  if (parameters.some((p) => p.section?.trim())) {
    for (const p of parameters) if (p.section?.trim()) out.set(p.id, p.section.trim());
    return out;
  }
  const sorted = [...parameters].sort((a, b) => a.sortOrder - b.sortOrder);
  const patient = sorted.find((p) => PATIENT.test(p.name.trim()));
  const donor = sorted.find((p) => DONOR.test(p.name.trim()));
  if (!patient || !donor) return out;
  out.set(patient.id, 'Patient');
  out.set(donor.id, 'Donor');
  const screening = sorted.find((p) => p.sortOrder > donor.sortOrder && SCREENING.test(p.name));
  if (screening) out.set(screening.id, 'Screening Report');
  return out;
}
