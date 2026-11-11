import { databaseProblem } from './http-exception.filter';

describe('databaseProblem', () => {
  it('explains quota, bad key and outages in plain words', () => {
    expect(databaseProblem({ code: 8, message: '8 RESOURCE_EXHAUSTED: Quota exceeded.' })?.[1].code).toBe('DATABASE_QUOTA_EXCEEDED');
    expect(databaseProblem({ code: 16, message: '16 UNAUTHENTICATED: Request had invalid authentication credentials.' })?.[1].code).toBe('DATABASE_KEY_INVALID');
    expect(databaseProblem(new Error('Getting metadata from plugin failed with error: invalid_grant')))?.toBeTruthy();
    expect(databaseProblem({ code: 14, message: '14 UNAVAILABLE: No connection established' })?.[1].code).toBe('DATABASE_UNAVAILABLE');
    expect(databaseProblem(new Error('something else'))).toBeNull();
  });
});
