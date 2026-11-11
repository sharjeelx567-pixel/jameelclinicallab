import { databaseProblem } from './http-exception.filter';

describe('databaseProblem', () => {
  it('says "quota" only when Firebase says Quota exceeded', () => {
    const quota = databaseProblem({ code: 8, message: '8 RESOURCE_EXHAUSTED: Quota exceeded.' });
    expect(quota?.[1]).toMatchObject({ code: 'DATABASE_QUOTA_EXCEEDED', details: { firestoreStatus: 'RESOURCE_EXHAUSTED' } });
    expect(databaseProblem({ code: 8, message: '8 RESOURCE_EXHAUSTED: Too much contention on these datastore entities.' })?.[1].code).toBe('DATABASE_BUSY');
  });

  it('explains key, index, project and outage problems; leaves other errors generic', () => {
    expect(databaseProblem({ code: 16, message: '16 UNAUTHENTICATED: Request had invalid authentication credentials.' })?.[1].code).toBe('DATABASE_KEY_INVALID');
    expect(databaseProblem({ code: 7, message: '7 PERMISSION_DENIED: Missing or insufficient permissions.' })?.[1].code).toBe('DATABASE_KEY_INVALID');
    expect(databaseProblem(new Error('Getting metadata from plugin failed with error: invalid_grant'))?.[1].code).toBe('DATABASE_KEY_INVALID');
    expect(databaseProblem({ code: 9, message: '9 FAILED_PRECONDITION: The query requires an index.' })?.[1].code).toBe('DATABASE_INDEX_MISSING');
    expect(databaseProblem({ code: 5, message: '5 NOT_FOUND: The database (default) does not exist for project x' })?.[1].code).toBe('DATABASE_NOT_FOUND');
    expect(databaseProblem({ code: 14, message: '14 UNAVAILABLE: No connection established' })?.[1].code).toBe('DATABASE_UNAVAILABLE');
    expect(databaseProblem(new Error('something else'))).toBeNull();
    expect(databaseProblem({ code: 5, message: 'Document not found' })).toBeNull();
  });
});
