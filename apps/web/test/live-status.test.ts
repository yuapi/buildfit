/**
 * 제출 결과 문구는 화면 낭독기에 전해진다 — WCAG 4.1.3, T-26.
 *
 * 오류 신고·어드민 저장의 결과 문구에 `role`이 없어 낭독기가 아무 말도 하지 않았다.
 * 또 결과가 생길 때 요소를 새로 끼워 넣으면(`{state && <span>…}`) live 영역이 늦게 생겨
 * 첫 문구를 놓친다. **처음부터 있는 영역에 문구만 바꿔 넣는다.**
 *
 * 서버 동작 결과는 `state.message`(또는 `state?.message`)로 그린다. 그 줄을 감싼 요소를 본다.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SRC = fileURLToPath(new URL('../src', import.meta.url));

function tsxFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = join(dir, e.name);
    if (e.isDirectory()) return tsxFiles(full);
    return e.isFile() && e.name.endsWith('.tsx') ? [full] : [];
  });
}

const files = tsxFiles(SRC).filter((f) => /state\??\.message/.test(readFileSync(f, 'utf8')));

describe('서버 동작 결과 문구', () => {
  it('검사할 파일이 있다 (신고·어드민 저장 둘)', () => {
    expect(files.length).toBeGreaterThanOrEqual(3);
  });

  it.each(files)('%s — 문구가 처음부터 있는 live 영역 안이다', (file) => {
    const text = readFileSync(file, 'utf8');
    const at = text.search(/\{state\??\.message/);
    // 문구 바로 앞의 여는 태그
    const open = text.lastIndexOf('<', at);
    const tag = text.slice(open, text.indexOf('>', open) + 1);
    expect(tag, `live 영역이 아니다: ${tag}`).toMatch(/role="(status|alert)"|aria-live=/);
    // 결과가 있을 때만 끼우면 낭독기가 첫 문구를 놓친다
    const before = text.slice(Math.max(0, open - 200), open);
    expect(before, '결과가 생길 때 요소를 새로 끼운다 — 영역은 늘 두고 문구만 바꾼다').not.toMatch(
      /\{state &&\s*\(?\s*$/,
    );
  });
});
