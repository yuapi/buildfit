# 케이스 form_factor와 지원 PSU 폼팩터의 관계

- 조사일: 2026-09-19
- 대상: BuildCores OpenDB `open-db/PCCase` 3,782건 (전수)
- 목적: 규칙 6(케이스 ↔ PSU 폼팩터)의 판정 불가 83.2%를 줄일 방법이 있는가
- 관련: `docs/research/opendb-schema-analysis.md` §6.1, `docs/compat-rules.md` §6

## 1. 결론부터

1. **OpenDB에 대체 필드는 없다.** `supported_power_supply_form_factors` 외에
   케이스의 PSU 규격을 담은 필드가 없다. 적재 누락이 아니라 원본 결측이다.
2. **form_factor로 추론하면 안 된다.** Mini ITX Tower는 데이터가 있는 17건 중
   14건(82%)이 SFX 전용이다. "타워니까 ATX"로 추론하면 거짓 통과가 난다.
   거짓 통과는 이 도구가 내면 안 되는 유일한 오답이다 (ADR-0009).
3. 다만 **분포 자체는 근거 있는 수치다.** 판정은 `unknown`으로 두고
   이 분포를 참고로 덧붙이면, 사용자가 무엇을 확인해야 하는지 알 수 있다.
   → ADR-0013

## 2. 상위 필드 채움률 (3,782건)

| 채움률 | 필드 |
|---|---|
| 100.0% | `form_factor`, `supported_motherboard_form_factors` |
| 98.7% | `expansion_slots` |
| 95.7% | `max_video_card_length` |
| 35.2% | `max_cpu_cooler_height` |
| **15.5%** | **`supported_power_supply_form_factors`** |
| 13.7% | `max_psu_length` |

`supported_power_supply_form_factors`의 15.5%는 규칙 6의 판정 불가율 83.2%와
정확히 대응한다 (나머지는 PSU 쪽 결측).

전수에서 관측된 값은 네 개뿐이다: `ATX` 567, `SFX` 32, `SFX-L` 28, `Flex ATX` 1.

## 3. form_factor별 지원 분포 (데이터가 있는 587건)

`n`은 그 폼팩터 중 값이 채워진 건수, `전체`는 OpenDB의 해당 폼팩터 총 건수다.

| form_factor | n | 전체 | 지원 비율 |
|---|---:|---:|---|
| ATX Mid Tower | 401 | 2,323 | ATX 99% (397) · SFX 1% (4) · SFX-L 1% (4) |
| Micro ATX Mini Tower | 56 | 396 | ATX 100% (56) · SFX 11% (6) · SFX-L 11% (6) |
| ATX Full Tower | 46 | 313 | ATX 100% (46) · SFX 4% (2) · SFX-L 4% (2) |
| Micro ATX Mid Tower | 31 | 214 | ATX 100% (31) · SFX 19% (6) · SFX-L 6% (2) |
| EATX Full Tower | 18 | 26 | ATX 100% (18) |
| **Mini ITX Tower** | **17** | **336** | **SFX 82% (14) · SFX-L 82% (14) · ATX 12% (2) · Flex ATX 6% (1)** |
| EATX Mid Tower | 13 | 30 | ATX 100% (13) |
| ATX Mini Tower | 4 | 19 | ATX 100% (4) — 표본 부족 |

HTPC(45), Micro ATX Desktop(44), Micro ATX Slim Tower(13), ATX Desktop(11),
테스트벤치(11)는 **데이터가 한 건도 없다.** 이 폼팩터에는 참고할 분포가 없다.

## 4. 추론이 위험한 이유

### 4.1 Mini ITX Tower

336건 중 데이터가 있는 17건에서 ATX 지원은 2건(12%)뿐이다.
"ATX 지원"으로 추론하면 나머지 88%에서 틀린다. 그것도 **거짓 통과** 방향으로
틀린다. 사용자는 ATX 파워를 사고, 케이스에 들어가지 않는다.

### 4.2 ATX Mid Tower도 100%가 아니다

99%는 높지만 401건 중 4건은 SFX 전용이다. 1%라도 거짓 통과는 거짓 통과다.
"대부분 맞으니 통과로 본다"는 이 도구의 전제와 충돌한다.

### 4.3 표본 편향 가능성

값이 채워진 587건은 무작위 표본이 아니다. OpenDB 기여자가 손으로 검증한
케이스일 가능성이 높고, 그런 케이스는 SFX 같은 특수 규격이거나 인기 제품일 수
있다. 따라서 위 비율은 **모집단 추정치가 아니라 관측된 분포**다.
문서와 화면에서 그렇게만 쓴다.

## 5. 그래서 무엇을 하는가

- 판정은 그대로 `unknown`. 추론으로 `pass`를 만들지 않는다.
- 판정 불가 메시지에 **관측된 분포와 표본 크기**를 덧붙인다.
  표본 10건 미만(ATX Mini Tower 등)은 인용하지 않는다.
- 데이터가 0건인 폼팩터는 분포 없이 "참고할 데이터가 없다"고 말한다.
- 근본 해결은 `/admin` 보강이다. 이 분포는 그때까지의 임시 안내다.

## 6. 재현

```bash
cd <opendb>/open-db/PCCase
python3 -c '
import json,os,collections
sup=collections.defaultdict(collections.Counter); known=collections.Counter()
for f in os.listdir("."):
    d=json.load(open(f)); ff=d.get("form_factor") or ""
    s=d.get("supported_power_supply_form_factors") or []
    if not s: continue
    known[ff]+=1
    for x in set(s): sup[ff][x]+=1
for ff,n in sorted(known.items(), key=lambda x:-x[1]): print(ff, n, dict(sup[ff]))
'
```
