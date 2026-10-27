import { describe, expect, it } from 'vitest';
import { firstName } from '../../src/engine/index.ts';

describe('short names in sentences', () => {
  it('keeps a title that is part of the name, and drops the surname otherwise', () => {
    expect(firstName('Brother Anselm')).toBe('Brother Anselm');
    expect(firstName('Dr. Voss')).toBe('Dr. Voss');
    expect(firstName('Granny Esk')).toBe('Granny Esk');
    expect(firstName('Old Pell')).toBe('Old Pell');
    expect(firstName('Tilly Wells')).toBe('Tilly');
    expect(firstName('Lark')).toBe('Lark');
  });
});
