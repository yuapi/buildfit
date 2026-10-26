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

  it('★ 서비스가 쓸 수 있는 releases 에 서비스 그룹의 쓰기가 없다 (이슈 #152)', () => {
    // 서비스(buildfit)는 ReadWritePaths 로 releases 에 쓸 수 있다. 폴더에 그룹 쓰기가 있으면 앱이 뚫렸을 때
    // 지금 릴리스를 바꿔치기해, 2분마다 deploy 계정이 돌리는 current/deploy/deploy.sh 를 갈아 끼울 수 있다
    const unit = read(join(UNITS, 'buildfit.service'));
    expect(unit).toMatch(/^User=buildfit$/m);
    expect(unit).toMatch(/^ReadWritePaths=\/opt\/buildfit\/releases$/m);
    const install = /^install -d -m (\d+) -o deploy -g buildfit "\$APP" "\$APP\/releases"$/m.exec(setup);
    expect(install?.[1]).toBe('2755');
    // 예전 설치(2775)도 다음 배포에 고쳐진다 — 빌드보다 먼저
    const fix = deploy.indexOf('chmod g-w "$APP" "$RELEASES"');
    expect(fix).toBeGreaterThan(-1);
    expect(fix).toBeLessThan(deploy.indexOf('npm ci'));
    // 서비스에 쓰기를 주는 것은 새로 빌드한 .next 뿐이다
    expect([...deploy.matchAll(/g\+\w*w/g)].map((m) => deploy.slice(deploy.lastIndexOf('\n', m.index) + 1, deploy.indexOf('\n', m.index)))).toEqual([
      'chgrp -R "${SERVICE_GROUP:-buildfit}" apps/web/.next && chmod -R g+rwX apps/web/.next',
    ]);
  });
});
