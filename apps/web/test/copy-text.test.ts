import { describe, expect, it } from 'vitest';
import { copyText } from '../src/lib/copy-text';

describe('copyText (T-27)', () => {
  it('클립보드가 없으면 false — 인앱 브라우저', async () => {
    expect(await copyText('x', undefined)).toBe(false);
  });

  it('★ 거절되면 던지지 않고 false — 권한 거절', async () => {
    const denied = { writeText: () => Promise.reject(new DOMException('denied', 'NotAllowedError')) };
    expect(await copyText('x', denied)).toBe(false);
  });

  it('되면 true이고 그 글자를 넘긴다', async () => {
    let got = '';
    const ok = { writeText: async (t: string) => void (got = t) };
    expect(await copyText('https://a/build/b', ok)).toBe(true);
    expect(got).toBe('https://a/build/b');
  });
});
