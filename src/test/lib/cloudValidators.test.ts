import { describe, it, expect } from 'vitest';
import {
  parseCloudProjectRow,
  unwrapRpcRow,
} from '../../lib/cloud-validators';

const validRow = {
  id: 'p1',
  organization_id: 'o1',
  name: 'Mariage',
  project_type: 'wedding',
  status: 'active',
  created_at: '2026-06-22T00:00:00Z',
  updated_at: '2026-06-22T00:00:00Z',
};

describe('cloud RPC validators (P1-7)', () => {
  it('unwraps a setof array response to a single row', () => {
    expect(unwrapRpcRow([validRow, { id: 'x' }])).toEqual(validRow);
    expect(unwrapRpcRow(validRow)).toEqual(validRow);
    expect(unwrapRpcRow([])).toBeUndefined();
  });

  it('accepts a valid project row (array or object)', () => {
    expect(parseCloudProjectRow(validRow).id).toBe('p1');
    expect(parseCloudProjectRow([validRow]).name).toBe('Mariage');
  });

  it('throws on a missing/invalid payload instead of casting silently', () => {
    expect(() => parseCloudProjectRow(null)).toThrow(/invalide/i);
    expect(() => parseCloudProjectRow([])).toThrow(/invalide/i);
    expect(() =>
      parseCloudProjectRow({ ...validRow, id: '' })
    ).toThrow(/invalide/i);
    expect(() => {
      const { id: _omit, ...noId } = validRow;
      void _omit;
      return parseCloudProjectRow(noId);
    }).toThrow(/id/);
  });
});
