import { readFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';

/**
 * 지금 도는 배포 — T-22, ADR-0027.
 *
 * 서버는 `/opt/buildfit/releases/<시각>-<커밋>/`에서 돈다. deploy.sh가 그 폴더에 `.release-sha`·
 * `.release-label`을 쓰고, 실패한 커밋은 `<앱>/.deploy/failed`에 남긴다. 이것을 읽어 어드민에 보인다 —
 * 그러지 않으면 어느 버전이 도는지, 자동 배포가 멈췄는지 서버 journal 을 봐야만 안다.
 *
 * 릴리스 폴더에서 도는 게 아니면(개발 환경) `null`이다.
 */
export interface DeployStatus {
  readonly label: string;
  readonly sha: string;
  /** 자동 배포가 마지막으로 실패한 커밋. 그 뒤 성공했으면 deploy.sh가 지운다 */
  readonly failedSha: string | null;
}

export function deployStatus(webDir: string, read: (p: string) => string = (p) => readFileSync(p, 'utf8')): DeployStatus | null {
  const releaseDir = dirname(dirname(webDir));
  if (basename(dirname(releaseDir)) !== 'releases') return null;
  const get = (p: string): string | null => {
    try {
      return read(p).trim() || null;
    } catch {
      return null;
    }
  };
  const sha = get(join(releaseDir, '.release-sha'));
  if (!sha) return null;
  const appDir = dirname(dirname(releaseDir));
  const failed = get(join(appDir, '.deploy', 'failed'));
  return {
    sha,
    label: get(join(releaseDir, '.release-label')) ?? sha.slice(0, 7),
    failedSha: failed && failed !== sha ? failed : null,
  };
}
