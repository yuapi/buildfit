/** 어드민의 배포 상태 — T-22 */
import { describe, expect, it } from 'vitest';
import { deployStatus } from '../src/lib/deploy-status';

const fs = (files: Record<string, string>) => (p: string) => {
  if (p in files) return files[p]!;
  throw new Error('ENOENT');
};
const WEB = '/opt/buildfit/releases/20261020-1728-8d99bc087fed/apps/web';
const REL = '/opt/buildfit/releases/20261020-1728-8d99bc087fed';

describe('deployStatus', () => {
  it('릴리스 폴더의 버전·커밋을 읽는다', () => {
    expect(deployStatus(WEB, fs({ [`${REL}/.release-sha`]: 'abc123\n', [`${REL}/.release-label`]: 'v0.2.3\n' }))).toEqual({
      sha: 'abc123',
      label: 'v0.2.3',
      failedSha: null,
    });
  });

  it('★ 자동 배포가 실패한 커밋이 있으면 알린다', () => {
    const s = deployStatus(WEB, fs({ [`${REL}/.release-sha`]: 'abc123', '/opt/buildfit/.deploy/failed': 'def456\n' }));
    expect(s?.failedSha).toBe('def456');
    expect(s?.label).toBe('abc123'.slice(0, 7));
  });

  it('개발 환경(릴리스 폴더 아님)에서는 없다', () => {
    expect(deployStatus('/home/dev/buildfit/apps/web', fs({}))).toBeNull();
  });

  it('표시 파일이 없으면 없다 — 지어내지 않는다', () => {
    expect(deployStatus(WEB, fs({}))).toBeNull();
  });
});
