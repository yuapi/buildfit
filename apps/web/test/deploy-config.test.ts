/**
 * 배포 스크립트·systemd 유닛이 서로 맞는가 — T-19, ADR-0027.
 *
 * 서버 스크립트는 CI가 돌려 볼 수 없다 (sudo·systemd가 필요하다). 그래서 **글자가 서로 맞는지**를 본다.
 * 어긋나면 배포 순간에야 터진다 — 타이머가 없는 스크립트를 부르거나, 재시작 권한이 다른 명령에 걸리거나.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const DEPLOY = join(ROOT, 'deploy');
const UNITS = join(DEPLOY, 'systemd');
const read = (p: string) => readFileSync(p, 'utf8');

const scripts = readdirSync(DEPLOY).filter((f) => f.endsWith('.sh'));
const units = readdirSync(UNITS);
const setup = read(join(DEPLOY, 'setup-server.sh'));
const deploy = read(join(DEPLOY, 'deploy.sh'));

describe('배포 스크립트', () => {
  it('검사할 것을 찾았다', () => {
    expect(scripts.length).toBeGreaterThanOrEqual(4);
    expect(units.length).toBeGreaterThanOrEqual(7);
  });

  it.each(scripts)('%s 가 bash 문법 검사를 통과한다', (f) => {
    const r = spawnSync('bash', ['-n', join(DEPLOY, f)], { encoding: 'utf8' });
    expect(r.stderr).toBe('');
    expect(r.status).toBe(0);
  });
});

describe('systemd 유닛', () => {
  it.each(units.filter((u) => u.endsWith('.service')))('★ %s 가 부르는 deploy/ 스크립트가 레포에 있다', (u) => {
    const exec = /^ExecStart=(.*)$/m.exec(read(join(UNITS, u)))?.[1] ?? '';
    for (const [, name] of exec.matchAll(/\/opt\/buildfit\/current\/deploy\/([\w.-]+\.sh)/g)) {
      expect(existsSync(join(DEPLOY, name!)), `${u} → deploy/${name}`).toBe(true);
    }
  });

  it.each(units.filter((u) => u.endsWith('.timer')))('%s 와 짝인 서비스가 있고, 설치가 켠다', (t) => {
    expect(units).toContain(t.replace(/\.timer$/, '.service'));
    expect(setup).toContain(t);
  });

  it('서비스가 띄우는 next 실행 파일이 의존성 안의 경로다', () => {
    const exec = /^ExecStart=(.*)$/m.exec(read(join(UNITS, 'buildfit.service')))?.[1] ?? '';
    const rel = /\/opt\/buildfit\/current\/(\S+)/.exec(exec)?.[1];
    expect(rel).toBeDefined();
    expect(existsSync(join(ROOT, rel!)), rel).toBe(true);
    // 포트는 비밀 파일에서 받는다 — 하나로 정한 곳을 따른다
    expect(exec).toContain('-p ${PORT}');
    expect(exec).toContain('-H 127.0.0.1');
  });
});

describe('서로 맞물리는 값', () => {
  it('★ 기본 포트가 설치·배포·문서에서 같다 (3200)', () => {
    expect(setup).toMatch(/PORT="\$\{PORT:-3200\}"/);
    expect(deploy).toMatch(/PORT="\$\{PORT:-3200\}"/);
    expect(read(join(ROOT, 'docs/deployment.md'))).toContain('127.0.0.1:3200');
  });

  it('★ sudo 로 허용한 명령이 배포가 부르는 명령과 같다', () => {
    const allowed = /NOPASSWD: (\/usr\/bin\/systemctl restart \w+)/.exec(setup)?.[1];
    expect(allowed).toBe('/usr/bin/systemctl restart buildfit');
    expect(deploy).toContain('sudo -n /usr/bin/systemctl restart "$SERVICE"');
    expect(deploy).toMatch(/SERVICE="\$\{SERVICE:-buildfit\}"/);
  });
});
