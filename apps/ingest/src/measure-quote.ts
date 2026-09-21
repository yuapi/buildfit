/**
 * 견적서 줄 매칭 실측 — ADR-0018의 근거.
 *
 * 카탈로그의 **진짜 이름**을 국내 판매 표기처럼 흐트러뜨린 뒤, 원래 부품을
 * 다시 찾아내는지 센다. 지어낸 견적서가 아니라 실제 이름이 출발점이다.
 *
 * 이 환경에서는 실제 쇼핑몰 견적서를 볼 수 없다 (도메인 차단). 그래서 대신
 * **우리가 아는 변형만** 가한다 — 사전에 있는 표기를 한글로 바꾸고, ™를 지우고,
 * 유통사·포장 표기를 붙이고, 하이픈 주변 띄어쓰기를 흔든다. 실제 견적서에는
 * 이보다 더한 것이 있을 수 있으므로 **여기 수치는 상한이 아니라 하한 근처로 읽는다.**
 *
 *     npm run measure:quote --workspace @buildfit/ingest
 */

import { KO_ALIASES, readQuoteLine, squash } from '@buildfit/compat';
import postgres from 'postgres';

/** 한 카테고리에서 뽑을 표본 수 */
const PER_CATEGORY = 60;
/** 이보다 오래된 것은 견적서에 잘 오르지 않는다 */
const SINCE = 2023;

const CATEGORIES = ['CPU', 'GPU', 'Motherboard', 'RAM', 'PSU', 'PCCase', 'CPUCooler'];

/** 영문 → 한글. 사전을 뒤집어 쓴다 — **우리가 아는 표기로만** 흐트러뜨린다 */
const TO_KO = new Map<string, string>();
for (const a of KO_ALIASES) if (a.ko[0]) TO_KO.set(a.en, a.ko[0]);

const NOISE = ['(정품)', '멀티팩', '병행수입', '벌크', '대원씨티에스', '(신제품)'];

function mangle(name: string, brand: string | null, seed: number): string {
  // 1) ™·®는 판매 페이지에서 사라진다
  let out = name.replace(/[™®]/g, '');
  // 2) 제품군·제조사 이름을 한글로 바꾼다 (사전에 있는 것만, 낱말 단위로)
  for (const [en, ko] of TO_KO) {
    const re = new RegExp(`\\b${en.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    if (re.test(out) && (seed + en.length) % 2 === 0) out = out.replace(re, ko);
  }
  // 3) 국내 목록은 제조사를 앞에 붙인다
  if (brand !== null && !out.toLowerCase().startsWith(brand.toLowerCase().slice(0, 4))) {
    out = `${TO_KO.get(squash(brand)) ?? brand} ${out}`;
  }
  // 4) 유통·포장 표기
  out = `${out} ${NOISE[seed % NOISE.length]}`;
  // 5) 하이픈 주변 띄어쓰기가 제각각이다
  if (seed % 3 === 0) out = out.replace(/-/g, ' ');
  if (seed % 5 === 0) out = out.replace(/ - /g, '-');
  return out;
}

interface Tally {
  exact: number;
  /** 여럿인데 정답이 그 안에 있다 */
  among: number;
  none: number;
  /** ★ 하나로 확정했는데 그게 아니었다. 이 수가 0이 아니면 기능을 내지 않는다 */
  wrongSingle: number;
  /** 여럿인데 정답이 없다 */
  wrongMany: number;
  listSum: number;
  total: number;
}

async function measure(url: string, mergeShort: boolean): Promise<Tally> {
  const sql = postgres(url, { max: 4 });
  const t: Tally = { exact: 0, among: 0, none: 0, wrongSingle: 0, wrongMany: 0, listSum: 0, total: 0 };
  try {
    for (const category of CATEGORIES) {
      const rows = await sql<{ id: string; model_name: string; brand: string | null }[]>`
        select id, model_name, brand from parts
        where category = ${category} and release_year >= ${SINCE}
        -- 무작위지만 되풀이해도 같은 표본이 나와야 비교가 된다
        order by md5(id::text) limit ${PER_CATEGORY}`;

      let seed = 0;
      for (const row of rows) {
        t.total++;
        const line = mangle(row.model_name, row.brand, seed++);
        const parsed = readQuoteLine(line, { mergeShort });
        if (!parsed.isPart) {
          t.none++;
          continue;
        }
        const conds = parsed.terms.map(
          (term) => sql`(${term.any
            .map((v) => sql`search_text like ${`%${v}%`}`)
            .reduce((a, b) => sql`${a} or ${b}`)})`,
        );
        const hits = await sql<{ id: string }[]>`
          select id from parts
          where category = ${category} and ${conds.reduce((a, c) => sql`${a} and ${c}`)}
          limit 40`;

        if (hits.length === 0) t.none++;
        else if (hits.length === 1) {
          if (hits[0]?.id === row.id) t.exact++;
          else t.wrongSingle++;
        } else if (hits.some((h) => h.id === row.id)) {
          t.among++;
          t.listSum += hits.length;
        } else t.wrongMany++;
      }
    }
  } finally {
    await sql.end();
  }
  return t;
}

function report(label: string, t: Tally): void {
  const pct = (n: number) => `${((n / t.total) * 100).toFixed(1)}%`;
  console.log(`\n=== ${label} (n=${t.total}) ===`);
  console.log(`  하나로 확정      ${t.exact} (${pct(t.exact)})`);
  console.log(`  여럿, 정답 포함  ${t.among} (${pct(t.among)})  평균 ${(t.listSum / Math.max(1, t.among)).toFixed(1)}개`);
  console.log(`  못 찾음          ${t.none} (${pct(t.none)})`);
  console.log(`  ★ 단일 오답      ${t.wrongSingle} (${pct(t.wrongSingle)})`);
  console.log(`  여럿, 정답 없음  ${t.wrongMany} (${pct(t.wrongMany)})`);
}

async function main(): Promise<void> {
  const url = process.env['DATABASE_URL'];
  if (url === undefined) throw new Error('DATABASE_URL이 필요합니다.');
  report('짧은 조각 붙이지 않음', await measure(url, false));
  report('짧은 조각 붙임 (현재 기본값)', await measure(url, true));
}

main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
