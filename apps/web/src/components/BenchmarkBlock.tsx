import type { PartBenchmark } from '@buildfit/db/part';
import { axisLabel, backendLabel } from '@/lib/perf';

/**
 * 부품 하나의 성능 측정값 — ADR-0023, 명세 §6.9.
 *
 * **측정값과 그 근거를 함께 보인다.** 중앙값·실행 수·출처가 기록한 장치 이름을 그대로
 * 적는다 — 맞춘 것이 맞는지 사용자가 확인할 수 있어야 한다. 단일 점수로 부르지 않고
 * 용도 축(3D 렌더링)의 이름을 붙인다 (ADR-0004).
 */
export function BenchmarkBlock({ bench }: { readonly bench: PartBenchmark }) {
  return (
    <div className="card p-4">
      <p className="text-sm font-medium">
        {axisLabel(bench.axis)}
        <span className="ml-2 text-xs font-normal text-fg-subtle">
          Blender {bench.measuredVersion} · {backendLabel(bench.backend)}
        </span>
      </p>
      <p className="mt-1 text-2xl font-semibold tnum">
        {Math.round(bench.value).toLocaleString('ko-KR')}
        <span className="ml-1 text-sm font-normal text-fg-muted">{bench.unit}</span>
      </p>
      <p className="mt-2 text-xs leading-relaxed text-fg-subtle">
        세 장면 합의 중앙값 · 실행 <span className="tnum">{bench.runs.toLocaleString('ko-KR')}</span>회 ·
        측정 장치 「{bench.deviceName}」
        {bench.perChip && ' · 칩 기준 측정이라 같은 칩의 모든 제품이 같은 값입니다'}
      </p>
      <p className="mt-1 text-xs leading-relaxed text-fg-subtle">
        3D 렌더링(Cycles) 한 용도의 측정값입니다. 게임 성능이 아닙니다. 출처{' '}
        <a href={bench.sourceUrl} className="link">
          Blender Open Data
        </a>{' '}
        (CC0, <span className="tnum">{bench.snapshotDate}</span> 스냅숏)
      </p>
    </div>
  );
}
