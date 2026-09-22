# BuildCores OpenDB 스키마 조사

- **대상**: `github.com/buildcores/buildcores-open-db`
- **clone 시점**: 2026-09-18 / 커밋 `4880970` (2026-09-18 06:51:02 +0000)
- **근거 문서**: `docs/pc-builder-spec.md` §5.7 (데이터 소스), §4.1 (호환성 규칙), §5.1 (필요 필드)
- **관련 ADR**: ADR-0002 (OpenDB 1차 소스), ADR-0003 (parts/skus 분리)

> **조사 방법**: clone한 저장소를 직접 파싱해 측정했다. 스키마 파일(`/schemas/*.json`)에서
> 필드 목록을 추출하고, 부품 JSON 48,207건 전량을 순회해 필드별 실제 충전율을 셌다.
> **스키마에 필드가 있는 것과 데이터가 채워져 있는 것은 다르므로 둘을 분리해 측정했다.**
> 수치는 전부 이 clone 기준이며 재현 명령은 §8에 있다.

---

## 1. 요약

**결론부터: §4.1 호환성 규칙 8개 중 7개는 OpenDB만으로 구현 가능하다. 막히는 것은
규칙 6(PSU 폼팩터) 하나뿐이고, 그 원인은 케이스 카테고리에 집중되어 있다.**

| 항목 | 결과 |
|---|---|
| 전체 부품 수 | **48,207건** (MVP 6종 기준 20,282건) |
| §4.1 규칙 8개 | **7개 구현 가능 / 1개 수동 보강 필요** |
| 케이스 GPU 최대 길이 | ✅ 있음, 97.4% 충전 |
| 케이스 쿨러 최대 높이 | ⚠️ 있음, **35.8% 충전** (Phase 1 규칙 9에 영향) |
| 케이스 라디에이터 장착 | ❌ **필드 자체가 없음** (Phase 1 규칙 10 구현 불가) |
| GPU AIB 물리 치수 | ✅ **있음, 사실상 100%** — 스펙의 비관적 전제가 틀렸다 |
| 현행 인기 부품 20종 | ✅ **21/21 전부 존재** |

가장 중요한 두 가지는 방향이 반대다.

- **좋은 쪽**: GPU AIB 모델별 길이·두께가 이미 거의 100% 채워져 있다. 스펙 §5.1이
  "개인이 감당할 규모가 아니다"라며 세운 우회 전략(칩 레벨만 쓰고 인기 AIB 3~5개만
  등록, 나머지는 사용자 직접 입력)이 **불필요해진다.** → §7.1
- **나쁜 쪽**: 케이스의 **라디에이터 장착 정보가 스키마에 존재하지 않는다.** 수동
  보강으로 메울 수는 있지만 OpenDB 기여로도 해결되지 않는 구조적 공백이다. → §7.2

---

## 2. 저장소 구조와 규모

```
buildcores-open-db/
├── open-db/<Category>/<uuid>.json   부품 1개 = 파일 1개 (48,207건)
├── schemas/<Category>.schema.json   JSON Schema draft-07 (30종)
├── docs/DATA_MODEL.md               식별자·변형 모델 설명
└── LICENSE.txt                      ODC-By v1.0
```

스펙 §5.7의 기술과 일치한다. API도 쿼터도 없고 `git clone`으로 초기 적재가 끝난다.
clone 용량 295MB, 소요 약 1분. 마지막 커밋이 조사 당일이라 **저장소는 활성 상태**이며,
§5.7.1의 "OpenDB sync 주 1회" 계획은 무리가 없다.

**카테고리 이름이 스펙 표기와 다르다.** 적재 스크립트에서 매핑이 필요하다.

| 스펙 표기 | OpenDB 디렉터리 | 건수 |
|---|---|---|
| CPU | `CPU` | 789 |
| 메인보드 | `Motherboard` | 3,701 |
| 메모리 | `RAM` | 4,876 |
| GPU | `GPU` | 3,837 |
| 케이스 | **`PCCase`** | 3,782 |
| 파워 | `PSU` | 3,297 |
| 쿨러 (Phase 1) | **`CPUCooler`** | 2,404 |
| 스토리지 (Phase 1) | `Storage` | 3,495 |

MVP 6종 합계 **20,282건**. 스펙 §5.4가 잡은 초기 범위(100~150개)의 130배가 넘는다.
§5.4 단서("전량을 넣고 §5.7.1 유통 판정으로 거르는 편이 낫다")가 옳은 판단이었음이
규모로 확인된다.

**라이선스**: README와 LICENSE.txt 모두 ODC-By v1.0을 명시한다. README가 용도로
"compatibility checking, component research, and building PC builder / part picking apps"를
적시하고 있어 스펙 §5.7의 기술이 정확하다.

---

## 3. 카테고리별 필드 목록 (MVP 6종)

`metadata`(name/manufacturer/part_numbers/series/variant/releaseYear/manufacturer_color/
last_manually_spec_verified_at), `general_product_information`(리테일러 SKU),
`identifiers`는 전 카테고리 공통이므로 아래에서 생략한다. 공통 필드는 §6에서 따로 다룬다.

### 3.1 CPU (789건)

```
socket(enum 51)  series  microarchitecture  coreFamily
cores.{total, performance, efficiency, threads}
clocks.performance.{base, boost}   clocks.efficiency.{base, boost}
cache.{l1, l2, l3}
specifications.tdp        specifications.ppt
specifications.memory.{maxSupport, types(enum 5), channels}
specifications.integratedGraphics.{model, baseClock, boostClock, shaderCount}
specifications.{eccSupport, includesCooler, packaging, lithography, simultaneousMultithreading}
```

스펙 §5.1의 CPU 요구 필드를 거의 전부 덮는다. **`PPT`(실측 최대)까지 있다.**
없는 것은 `PCIe 버전` 하나뿐이며, MVP 규칙 8개 중 어디에도 쓰이지 않는다.

### 3.2 Motherboard (3,701건)

```
socket(enum 51)   form_factor(enum 13)   chipset
memory.{max, ram_type(enum 6), slots}
pcie_slots[]      { gen(enum 5), quantity, lanes }
m2_slots[]        { size, key(enum 4), interface }
storage_devices.{sata_6_gb_s, sata_3_gb_s, u2}
onboard_ethernet[] { speed(enum 5), controller }   wireless_networking
usb_headers.*  fan_headers.*  rgb_headers.*  front_panel_headers.*  other_headers.*
power_connectors.{main_power, cpu_power[]}
bios_features.{flashback, clear_cmos}
audio.{chipset, channels}   back_panel_ports[]
ecc_support  raid_support  back_connect_connectors
```

- **BIOS 버전별 CPU 지원 목록은 없다.** 스펙 §5.7의 예상대로다
- **메인보드 소비전력 필드가 없다.** `power_connectors`는 커넥터 종류일 뿐 W가 아니다
  → 규칙 7에 영향 (§5 규칙 7 참조)
- `m2_slots`에 **SATA 포트와의 레인 공유 관계가 없다** → Phase 1 규칙 13 구현 불가
- `bios_features.flashback`이 99.3% 채워져 있다 → 규칙 12의 부분 대체 수단 (§7.4)

### 3.3 RAM (4,876건)

```
ram_type(enum 6)  speed  cas_latency  timings  voltage  profile_support(enum 2)
form_factor(enum 10)   modules.{quantity, capacity_gb}   capacity
height   heat_spreader   rgb   ecc(enum 3)   registered(enum 4)
```

**`height`(mm) 필드가 존재한다.** 스펙 §5.1이 "히트싱크 높이 데이터가 거의 없음"이라고
본 것보다는 낫지만, 충전율이 낮다 (DDR5 기준 25.2%). → Phase 1 규칙 11에 영향

### 3.4 GPU (3,837건)

```
chipset_manufacturer(enum 4)   chipset
core_count  core_base_clock  core_boost_clock
memory  memory_type(enum 17)  effective_memory_clock  memory_bus
tdp   interface(enum 17)   frame_sync(enum 5)
length                       ← AIB 모델별 길이 (mm)
total_slot_width             ← 두께 (슬롯 수)
case_expansion_slot_width
cooling(enum 9)  radiator_size  fan_size  fan_quantity
power_connectors.{pcie_6_pin, pcie_8_pin, pcie_12VHPWR, pcie_12V_2x6}
video_outputs.*
```

**구조가 스펙 §5.8의 가정과 다르다.** 스펙은 칩 레벨 레코드와 AIB 레벨 레코드를
`parts.chip_id` 자기참조로 잇는 모델을 상정했지만, **OpenDB는 AIB 레벨 단일 계층**이고
칩은 `chipset` 문자열 필드로만 표현된다. 3,837개 AIB 모델이 **276개 chipset**에 걸쳐 있다.

→ `chip_id`는 별도 레코드가 아니라 `chipset` 값으로 그룹핑해 유도하면 된다. §7.1 참조.

### 3.5 PCCase (3,782건)

```
form_factor(enum 17)
supported_motherboard_form_factors[](enum 12)
supported_power_supply_form_factors[](enum 7)
max_video_card_length        ← GPU 최대 길이 (mm)
max_cpu_cooler_height        ← 쿨러 최대 높이 (mm)
max_psu_length
internal_3_5_bays  internal_2_5_bays  external_3_5_bays  external_5_25_bays
expansion_slots  riser_expansion_slots
side_panel(enum 10)  has_transparent_side_panel  power_supply_shroud
supports_rear_connecting_motherboard
front_usb_ports[]  front_panel_usb(deprecated)
dimensions(문자열)  dimensions_mm.{depth, width, height}  volume  weight
power_supply  power_supply_included
```

**라디에이터·팬 장착 관련 필드가 하나도 없다.** 스키마 전문을 검색해 확인했고,
부품 데이터 3,782건 중 "radiator" 문자열이 나오는 것은 4건뿐인데 전부 제품명이나
URL 안의 자유 텍스트다 (예: `"...supports up to 2 x 420mm radiators..."`).
구조화된 필드로는 존재하지 않는다.

### 3.6 PSU (3,297건)

```
wattage   form_factor(enum 8)   length   modular(enum 4)   fanless
efficiency_rating(enum 9)  cybernetics_efficiency_rating  cybernetics_noise_rating
connectors.{atx_24_pin, eps_8_pin, pcie_12vhpwr, pcie_6_plus_2_pin,
            sata, molex_4_pin, floppy_4_pin}
```

스펙 §5.1의 PSU 요구 필드를 전부 덮는다. 난이도 '하'라는 평가가 맞다.

---

## 4. clone 직후 확인 3항목 (§5.7)

### ✅ / ⚠️ / ❌ 항목 1 — 케이스 스키마

| 필드 | 존재 | 충전율(ATX/mATX 지원 케이스 3,396건 기준) |
|---|---|---|
| GPU 최대 길이 `max_video_card_length` | ✅ | **97.4%** (89건 결측) |
| 쿨러 최대 높이 `max_cpu_cooler_height` | ✅ | ⚠️ **35.8%** (2,179건 결측) |
| 라디에이터 장착 | ❌ **없음** | — |
| (참고) PSU 폼팩터 `supported_power_supply_form_factors` | ✅ | ⚠️ **16.8%** (2,827건 결측) |
| (참고) PSU 최대 길이 `max_psu_length` | ✅ | ⚠️ **14.9%** (2,890건 결측) |

**GPU 길이는 안심해도 된다. 나머지 케이스 필드가 문제다.**

### ✅ 항목 2 — GPU AIB 물리 치수

현행 세대(RTX 40/50, RX 7600 이상) **1,344개 AIB 모델** 기준:

| 필드 | 결측 | 충전율 |
|---|---|---|
| `length` (길이 mm) | 0 / 1,344 | **100.0%** |
| `total_slot_width` (두께) | 2 / 1,344 | **99.9%** |
| `tdp` | 0 / 1,344 | **100.0%** |
| `power_connectors.pcie_8_pin` | 10 / 1,344 | 99.3% |
| `power_connectors.pcie_12VHPWR` | 45 / 1,344 | 96.7% |
| `power_connectors.pcie_12V_2x6` | 35 / 1,344 | 97.4% |

**스펙 §5.1의 GPU 난이도 평가('상', "개인이 감당할 규모가 아니다")가 OpenDB에서는
성립하지 않는다.** 이 항목은 조사 전 가장 큰 리스크로 잡혀 있었는데 해소됐다.

### ✅ 항목 3 — 현행 세대 커버리지 (샘플 21종)

국내 커뮤니티 견적에 자주 등장하는 현행 부품으로 검색했다. **21/21 전부 존재.**

| 카테고리 | 대상 | 결과 |
|---|---|---|
| CPU | Ryzen 7 9800X3D / 7800X3D / Ryzen 5 7500F / Core Ultra 5 245K / i5-14400F | 5/5 ✅ 규칙 필드 결측 없음 |
| 메인보드 | TUF B650-PLUS WIFI / MAG B650 TOMAHAWK WIFI / B650M Pro RS / B760M-A WIFI / B860M | 5/5 ✅ 규칙 필드 결측 없음 |
| 메모리 | Trident Z5 DDR5-6000 CL30 / T-Force Delta RGB | 2/2 ✅ (단 `height` 일부 결측) |
| GPU | RTX 5070 / 4070 SUPER / 5080 / RX 7800 XT | 4/4 ✅ 규칙 필드 거의 결측 없음 |
| 케이스 | Fractal Design North / O11 Dynamic EVO / NZXT H5 Flow | 3/3 ✅ (단 `max_psu_length` 등 결측) |
| 파워 | Seasonic Focus GX-850 / Corsair RM850x | 2/2 ✅ 규칙 필드 결측 없음 |

AIB·리비전 변형까지 폭넓게 들어 있다 (RTX 5070 계열 147건, 4070 SUPER 59건).
**국내 인기 부품 커버리지는 문제가 아니다.**

다만 **중복 레코드가 있다.** 정확히 같은 제품명이 둘 이상인 경우: RAM 300건,
CPU 73건, GPU 48건, PSU 33건, 메인보드 17건, 케이스 15건. 여기에 `OEM/Tray` 판이나
표기 차이(`ASUS TUF GAMING B650-PLUS` vs `Asus TUF GAMING B650-PLUS WIFI`)까지 더하면
실질 중복은 더 많다. → §5.2 canonical slug 작업에서 처리해야 한다.

---

## 5. §4.1 호환성 규칙 8개 × OpenDB 필드 대조표

충전율은 **현행 세대 부분집합** 기준이다 (CPU/메인보드: AM5·LGA1700·LGA1851,
GPU: RTX 40/50·RX 7600+, RAM: DDR5, PSU: ATX/SFX 550W 이상, 케이스: ATX/mATX 지원).

| # | 규칙 | 필요 필드 → OpenDB 경로 | 충전율 | 판정 |
|---|---|---|---|---|
| 1 | CPU 소켓 = 메인보드 소켓 | `CPU.socket` / `Motherboard.socket` | 100% / 100% | ✅ **가능** |
| 2 | 메모리 규격 일치 | `RAM.ram_type` / `Motherboard.memory.ram_type` / `CPU.specifications.memory.types` | 100% / 100% / 100% | ✅ **가능** |
| 3 | 모듈 수 ≤ 슬롯 수 | `RAM.modules.quantity` / `Motherboard.memory.slots` | 100% / 100% | ✅ **가능** |
| 4 | GPU 길이 ≤ 케이스 최대 길이 | `GPU.length` / `PCCase.max_video_card_length` | 100% / **97.4%** | ✅ **가능** |
| 5 | 보드 폼팩터 ⊂ 케이스 지원 | `Motherboard.form_factor` / `PCCase.supported_motherboard_form_factors` | 100% / 100% | ✅ **가능** |
| 6 | PSU 폼팩터 ⊂ 케이스 지원 | `PSU.form_factor` / `PCCase.supported_power_supply_form_factors` | 100% / **16.8%** | ❌ **보강 필요** |
| 7 | 총 소비전력 × 1.3 ≤ PSU 정격 | `CPU.specifications.tdp` / `GPU.tdp` / `PSU.wattage` + **보드 파워 없음** | 100% / 100% / 100% / — | ⚠️ **가능 (단서)** |
| 8 | PCIe 보조전원 커넥터 충족 | `GPU.power_connectors.*` / `PSU.connectors.*` | 96.7~100% / 100% | ⚠️ **가능 (정규화 필요)** |

### 규칙 1·2·3·5 — 손댈 것 없음

소켓(enum 51), 메모리 규격(enum 6), 폼팩터 enum이 양쪽 카테고리에서 **완전히 동일한
값 집합**을 쓴다. 확인 결과 `Motherboard.form_factor`와
`PCCase.supported_motherboard_form_factors`의 enum 12개가 정확히 일치하고,
`PSU.form_factor`와 `PCCase.supported_power_supply_form_factors`도 7개가 일치한다.
**매핑표 없이 문자열 비교로 끝난다.**

### 규칙 4 — 가능

GPU 길이 100%, 케이스 최대 길이 97.4%. 결측 89건은 판정 불가로 처리한다(§7.5).
스펙 §5.1의 "표기값의 95% 이상이면 빠듯할 수 있음 경고" 규칙은 그대로 적용 가능하다.

### 규칙 6 — ❌ 유일한 차단 지점

`PCCase.supported_power_supply_form_factors`가 **3,396건 중 2,827건(83.2%) 결측**이다.
필드는 존재하고 enum도 PSU 쪽과 일치하므로 **값만 채우면 즉시 동작한다.** 보강 규모는 §6.

### 규칙 7 — 가능하지만 스펙 문구 수정 필요

스펙 §4.1이 이 규칙의 필요 데이터를 "TDP, **보드 파워**"로 적었는데,
**OpenDB 메인보드 스키마에 소비전력 필드가 없다.** `tdp`/`wattage`/`power_draw`를
전부 검색했고 없다. `power_connectors`는 커넥터 종류(`24-pin`, `['8-pin','8-pin']`)일 뿐이다.

CPU TDP와 GPU TDP는 100% 있으므로, **보드·메모리·스토리지·팬은 상수 가정으로 처리**해야
한다. 이는 업계 계산기들의 통상적 방식이라 실용성에 문제가 없지만, 근거 없는 수치를
지어내지 않는다는 규칙(CLAUDE.md)에 따라 **가정값과 그 출처를 결과 화면에 명시**해야 한다.

### 규칙 8 — 가능하지만 커넥터 정규화 필요

GPU와 PSU의 커넥터 표현이 **비대칭**이다.

| | GPU 쪽 | PSU 쪽 |
|---|---|---|
| 6핀 | `pcie_6_pin` (75W each) | `pcie_6_plus_2_pin` — 6+2핀 **통합 카운트** |
| 8핀 | `pcie_8_pin` (150W each) | 위와 동일 필드 |
| 16핀 | `pcie_12VHPWR` **와** `pcie_12V_2x6` **분리** | `pcie_12vhpwr` **하나뿐** |

따라서 판정식은 이렇게 된다.

```
PSU.connectors.pcie_6_plus_2_pin  ≥  GPU.pcie_8_pin + GPU.pcie_6_pin
PSU.connectors.pcie_12vhpwr       ≥  GPU.pcie_12VHPWR + GPU.pcie_12V_2x6
```

GPU 스키마 설명에 "A 16-pin PCIe connector is 2x 8-pin PCIe connectors"라는 문구가
있어 **일부 레코드가 16핀을 8핀 2개로 기입했을 가능성**이 있다. 12VHPWR GPU 표본으로
교차 검증이 필요하다. → §9 후속 작업

---

## 6. 수동 보강 규모 추정

**보강 대상은 사실상 케이스 카테고리 하나다.** CPU·메인보드·GPU·PSU는 규칙에 필요한
필드가 전부 99% 이상 채워져 있어 보강할 것이 없다.

### 6.1 결측 절대 건수 (현행 세대 부분집합)

| 카테고리 | 모집단 | 필드 | 결측 건수 | 영향 규칙 |
|---|---|---|---|---|
| **PCCase** | 3,396 | `supported_power_supply_form_factors` | **2,827** | **6 (Phase 0)** |
| **PCCase** | 3,396 | `max_cpu_cooler_height` | **2,179** | 9 (Phase 1) |
| **PCCase** | 3,396 | `max_psu_length` | **2,890** | (규칙 없음, 경고용) |
| PCCase | 3,396 | `max_video_card_length` | 89 | 4 (Phase 0) |
| **RAM** | 2,701 | `height` | **2,020** | 11 (Phase 1) |
| CPUCooler | 2,404 | `height` | 712 | 9 (Phase 1) |
| GPU | 1,344 | `pcie_12VHPWR` | 45 | 8 (Phase 0) |
| Motherboard | 516 | `metadata.releaseYear` | 207 | 12 (Phase 1) |

### 6.2 Phase 0 기준 보강 규모 — 작다

**Phase 0에서 막히는 것은 규칙 6 하나이고, 필요한 것은 케이스당 필드 1개다.**

전량(3,396건)을 채우는 건 비현실적이지만, **채울 필요가 없다.** ADR-0003의 국내 유통
판정을 통과한 케이스만 보강하면 되고, 스펙 §5.4가 잡은 케이스 초기 범위는 **약 20종**이다.

| 보강 범위 | 대상 건수 | 필드/건 | 예상 소요 |
|---|---|---|---|
| §5.4 초기 범위 (인기 케이스) | ~20 | 1 (PSU 폼팩터) | **1시간 미만** |
| 국내 유통 케이스 상위 100 | ~85 (83% 결측 적용) | 1 | **3~4시간** |
| Phase 1까지 포함 (쿨러 높이·PSU 길이 동시) | ~85 | 3 | **6~8시간** |
| 전량 | 2,827 | 1 | ~200시간 **(비현실적)** |

케이스 하나당 제조사 스펙시트에서 값 3개를 읽어 넣는 작업이고, §5.3의 어드민 워크플로
(스펙시트 URL 붙여넣기 → Claude가 추출 → 사람이 확인)로 처리하면 건당 3~5분이다.

**즉 Phase 0a의 데이터 보강 부담은 스펙이 우려한 수준보다 훨씬 작다.** 스펙 §5.3이
"어드민을 Phase 0에서 가장 먼저 만든다"고 한 판단 자체는 여전히 유효하지만, 그 어드민이
감당할 물량은 수백 건이 아니라 **수십 건**이다.

### 6.3 Phase 1 이후가 더 무겁다

- 규칙 9 (쿨러 높이): 케이스(64.2% 결측)와 쿨러(29.6% 결측) **양쪽**이 비어 있다
- 규칙 11 (메모리 높이): DDR5 기준 **74.8% 결측**
- 규칙 10 (라디에이터): **필드 자체가 없어 보강으로 해결되지 않는다** → §7.2

---

## 7. 스펙에 영향을 주는 발견

### 7.1 ★ GPU 대응 전략을 수정해야 한다 (§5.1)

스펙 §5.1은 GPU를 난이도 '상'으로 놓고 이렇게 적었다.

> 같은 4070이라도 제조사·모델마다 길이가 240mm에서 340mm까지 벌어진다. (…)
> AIB 모델을 전부 수집하는 건 개인이 감당할 규모가 아니다.
>
> **대응 전략** — 칩 레벨 데이터를 기본으로 하고, AIB는 인기 모델 3~5개만 등록 /
> 사용자가 자기 모델이 없으면 "길이 직접 입력" 옵션 제공 / 칩만 선택한 경우
> "모델에 따라 220~350mm" 범위로 경고 표시

**이 전제가 OpenDB에서는 성립하지 않는다.** 현행 세대 AIB 1,344개 전부가 `length`를
갖고 있고 `total_slot_width`도 99.9%다. 수집 부담이 0이다.

제안하는 수정:
- AIB "3~5개만 등록" → **전량 적재**
- "길이 직접 입력" 옵션 → 유지하되 **예외 경로로 격하** (OpenDB에 없는 구형·특수 모델용)
- "220~350mm 범위 경고" → 칩만 선택한 경우에만 적용. AIB를 고르면 확정값으로 판정

이 변경은 §2.2 차별점(호환성 규칙의 깊이)을 **더 강하게** 만든다. 경쟁 도구가 약한
물리 간섭 검증을 범위 추정이 아니라 확정값으로 할 수 있다.

### 7.2 ★ 라디에이터 규칙(§4.2 #10)은 OpenDB로 해결되지 않는다

케이스 스키마에 라디에이터·팬 장착 필드가 **아예 없다.** 값이 비어 있는 게 아니라
필드가 없으므로, 업스트림에 기여(§5.7 기여 전략)하려 해도 **스키마 변경 PR이 먼저**다.

Phase 1의 규칙 10("라디에이터 크기 ⊂ 케이스 장착 위치, 두께도 포함")은 선택지가 셋이다.

1. **전량 수동 보강** — 케이스당 장착 위치별 지원 크기를 스펙시트에서 수집.
   국내 유통 케이스 ~100종이면 감당 가능하지만, 스펙 §5.1이 지적했듯 **제조사 표기에
   두께 제약이 특히 부실**해서 정확도가 낮을 위험이 있다
2. **업스트림 스키마 기여** — OpenDB에 필드를 제안하고 데이터도 채운다. 수집 비용을
   커뮤니티와 분담한다는 §5.7 기여 전략에 부합하지만 시간이 걸린다
3. **Phase 2 이후로 미룬다** — 규칙 10은 '경고' 등급이고 수랭 사용자 비중이 제한적이다

**권장: 3번으로 미루고, 1번을 국내 인기 케이스 20~30종에만 선별 적용.** 판단은
Phase 1 착수 시점에 다시 한다.

참고로 쿨러 쪽(`CPUCooler.radiator_size`, 53.6% 충전)은 있으므로, **막히는 것은
케이스 쪽 한 면뿐**이다.

### 7.3 §5.8 데이터 모델 — `chip_id`는 유도하면 된다

스펙 §5.8은 `parts.chip_id`를 자기참조로 두어 AIB가 칩 레코드를 참조하는 구조를
상정했지만, OpenDB는 AIB 단일 계층이고 칩은 `chipset` 문자열이다
(3,837 AIB / 276 chipset).

→ 적재 시 `chipset` 값으로 그룹핑해 칩 레벨 레코드를 **생성**하거나,
`chip_id`를 정규화한 chipset slug로 두면 된다. 스키마 변경은 필요 없고 적재
스크립트의 문제다. 데이터 모델 초안은 그대로 써도 된다.

### 7.4 BIOS 규칙(§4.2 #12) — 우회책이 절반만 작동한다

스펙 §5.1의 우회책은 "보드 출시일과 CPU 출시일을 비교해서 CPU가 더 나중이면 경고"다.
OpenDB에는 `metadata.releaseYear`가 있지만 문제가 둘이다.

- **연 단위다.** 날짜가 아니라 연도라 같은 해 출시 조합은 판정할 수 없다
- **현행 세대 메인보드 516건 중 207건(40.1%)이 결측이다.** 전체로는 79.4% 결측

대신 **`bios_features.flashback`이 99.3% 채워져 있다.** BIOS Flashback이 있는 보드는
CPU 없이 BIOS를 업데이트할 수 있으므로, 같은 경고라도 심각도가 다르다.

제안: 출시연도 비교만 쓰지 말고 **두 신호를 조합**한다.

```
CPU 출시연도 > 보드 출시연도  AND  flashback 없음   → 경고 (CPU 없이 업데이트 불가)
CPU 출시연도 > 보드 출시연도  AND  flashback 있음   → 정보 (업데이트 필요할 수 있음)
보드 출시연도 결측                                 → 판정 불가
```

이러면 결측 40%를 "판정 불가"로 정직하게 처리하면서, 나머지 60%에는 스펙의 우회책보다
쓸모 있는 경고를 낼 수 있다.

### 7.5 ★ 결측 필드는 "통과"가 아니라 "판정 불가"여야 한다

규칙 6이 83% 결측이라는 사실은 설계 결정 하나를 강제한다. **필드가 없을 때 규칙을
조용히 통과시키면, 사용자는 "호환 확인됨"을 보고 안 맞는 파워를 산다.** 이건 이 도구가
낼 수 있는 최악의 결과다 (스펙 §5.3: "스펙 오류는 사용자가 실제로 부품을 잘못 사게
만드는 결과로 이어진다").

`pipeline-plan.md` §9.6이 "최소 표본 미달 시 승급 보류 — 이상 없음이 아니라 판정 불가로
처리"라고 한 것과 같은 원칙을 호환성 판정에도 적용해야 한다.

→ §4.3 판정 등급(오류/경고/정보)에 **"판정 불가"를 추가**할 것을 제안한다.

### 7.6 국내 유통 매칭 — MPN이 GTIN보다 강하다 (ADR-0003 영향)

OpenDB `identifiers`에 제조사 식별자가 들어 있다. 카테고리별 커버리지:

| 카테고리 | MPN | GTIN/UPC/EAN |
|---|---|---|
| CPU | 99.7% | 84.8% |
| PSU | 99.6% | 31.5% |
| RAM | 99.1% | 50.2% |
| GPU | 99.3% | 49.1% |
| Motherboard | 98.9% | 40.2% |
| PCCase | 98.5% | 45.1% |

**MPN이 전 카테고리 99% 내외로 압도적이다.** ADR-0003의 매칭 파이프라인(§5.7.1)에서
2단계 검색 쿼리 생성 시 모델명 토큰만 쓰지 말고 **MPN을 우선 검색 키로 쓰는 것**을
검토해야 한다. 국내 상품명에 제조사 파트넘버가 병기되는 경우가 많다.

또 GTIN이 31~85% 이미 들어 있으므로, 스펙 §5.7.2가 "기대치 낮음"으로 잡은
**GS1 코리안넷 조회의 필요성이 더 낮아진다.** 5분 검증조차 후순위로 미뤄도 된다.

---

## 8. 재현 방법

```bash
git clone --depth 1 https://github.com/buildcores/buildcores-open-db
# 조사 시점 커밋: 4880970 (2026-09-18)

# 카테고리별 건수
for d in buildcores-open-db/open-db/*/; do echo "$(basename $d) $(ls -1 $d | wc -l)"; done

# 스키마 필드 목록 / 충전율 / 결측 건수 측정 스크립트는
# 본 조사에서 임시로 작성해 사용했으며 레포에 남기지 않았다 (조사 전용).
# 재측정이 필요하면 open-db/<Category>/*.json 을 순회하며
# 필드별 non-null 비율을 세는 것으로 동일한 수치를 얻을 수 있다.
```

충전율은 두 기준으로 측정했다.

- **전량 기준**: 카테고리 전체
- **현행 세대 기준**: CPU/메인보드는 소켓 AM5·LGA1700·LGA1851, GPU는 chipset이
  RTX 40/50·RX 7600 이상, RAM은 DDR5, PSU는 ATX/SFX 550W 이상, 케이스는 ATX/mATX 지원

본문 수치는 별도 표기가 없으면 **현행 세대 기준**이다. `metadata.releaseYear` 기반
필터는 쓰지 않았다 — 결측률이 높은 데다(PSU 95.3%, RAM 88%) 연도가 채워진 레코드가
곧 잘 관리된 레코드여서 충전율이 낙관적으로 편향되기 때문이다.

---

## 9. 후속 작업

### 9.1 ★ 적재 후 확인된 추가 사실

DB 적재(이슈 #3) 후 전수 집계하니 §8.4의 커넥터 모순이 **처음 추정보다 훨씬 넓다.**

| 범위 | 모순 건수 |
|---|---|
| RTX 40/50 (이 조사의 표본) | 166 / 1,069 |
| **GPU 전체 (TDP > 75W)** | **705 / 3,468 = 20.3%** |

TDP 75W 초과 GPU의 **다섯 중 하나**가 보조전원 커넥터 4필드 전부 명시적 `0`이다.
`null`이 아니므로 결측 검사로는 잡히지 않는다. 규칙 8의 모순 검사(§8.4)가 없으면
이만큼이 거짓 통과한다.

적재 데이터로 재측정한 다른 수치는 조사와 일치했다 — 케이스 PSU 폼팩터 결측
2,827 / 3,396 (83.2%)로 동일.

### 9.2 ★ GPU 성능 필드 — 같은 칩 안의 모델 차이

**§4·§7.1은 GPU의 *물리* 치수만 다뤘다.** 같은 칩이라도 AIB 모델마다 성능이 다르다는
점은 적재 후에야 확인했다.

```
RTX 4090 부스트 클럭  2235 ~ 2670 MHz   (61개 AIB, 435MHz · 약 19% 차이)
```

`core_boost_clock`이 OC 에디션을 구분하는 필드인데 **초기 적재 허용 목록에서 빠져
있었다.** 성능 관련 필드를 추가하고 재적재했다 (스펙 173,622 → 197,049건).

**충전율 (GPU 3,837건 기준)**

| 필드 | 충전 | §6.6.1의 대응 |
|---|---|---|
| `core_boost_clock_mhz` | 99.8% | 클럭 |
| `core_base_clock_mhz` | 98.9% | 클럭 |
| `effective_memory_clock` | 80.4% | 메모리 대역폭 |
| `core_count` | **56.2%** | **연산 유닛** |
| `memory_bus_bit` | **33.0%** | **메모리 대역폭** |

**결론: Phase 3는 이 데이터만으로 성립하지 않는다.** §6.6.1의 구조적 모델은
`g(연산 유닛, 클럭, 메모리 대역폭, VRAM, 해상도)`인데,

- **연산 유닛이 절반 가까이 비어 있다** (56.2%)
- **메모리 대역폭은 계산할 수 없다.** 버스 폭이 33%뿐이고, 대역폭은 버스 × 클럭이라
  둘 다 있어야 한다

다만 이 둘은 **칩 레벨 값이라 AIB마다 다르지 않다.** 칩 276종에만 채우면 전체가
해결되므로 보강 규모는 작다 (§6.2의 케이스 보강과 같은 구조).

**데이터 품질 문제 2건**

1. **base/boost 클럭 혼동.** `Sapphire PULSE RX 7800 XT`의 부스트가 1295MHz로
   들어가 있는데 이는 이 칩의 **베이스 클럭**이다 (같은 칩 다른 모델은 2430~2565MHz).
   칩별 부스트 스프레드가 1270MHz까지 벌어지는 것은 OC 차이가 아니라 이 혼동 때문이다
2. **메모리 클럭 단위 불일치.** 같은 `effective_memory_clock`에 `1313`(MHz)과
   `21000`(MT/s)이 섞여 있다. 정규화 없이 대역폭 계산에 쓰면 안 된다

둘 다 **개별적으로는 불가능하지 않은 값**이라 적재 단계에서 자동으로 거를 수 없다.
칩 레벨 기준값과 대조하는 검증이 Phase 3 착수 전에 필요하다.

### 9.3 ★ 규칙 엔진 실측 기준선 — 판정 불가가 실제로 얼마나 나오는가

규칙 엔진은 순수 모듈이라 단위 테스트로는 고정 픽스처만 본다. 적재된 실제 데이터로
돌려본 결과다. 재현: `DATABASE_URL=... npm run sample -w @buildfit/ingest`

**국내 인기 구성 1건** (9800X3D · B650 TOMAHAWK · Trident Z5 · RTX 5080 VANGUARD ·
O11 Dynamic EVO · RM850x)

```
통과 6 · 실패 1 · 판정 불가 1
✕ #8  필요 16핀 1개, 파워 제공 16핀 0개
?  #7  전력 계산 기준값 미확정
```

**규칙 8의 실패는 오판이 아니다.** 매칭된 PSU가 `Corsair RM850x (2018)`이고 2018년
모델에는 12VHPWR이 없다. 엔진이 실제 비호환을 잡았다. 이 판정이 정확하다는 것이
규칙 8 정규화(§8.2)가 동작한다는 증거다.

**무작위 300개 조합**

| 규칙 | 통과 | 실패 | 판정 불가 | 판정 불가율 |
|---|---|---|---|---|
| #1 소켓 | 28 | 272 | 0 | 0% |
| #2 메모리 규격 | 54 | 246 | 0 | 0% |
| #3 모듈/슬롯 | 284 | 16 | 0 | 0% |
| #4 GPU 길이 | 248 | 43 | 9 | 3.0% |
| #5 보드 폼팩터 | 241 | 59 | 0 | 0% |
| **#6 PSU 폼팩터** | 43 | 2 | **255** | **85.0%** |
| **#7 전력** | 0 | 0 | **300** | **100%** |
| #8 커넥터 | 148 | 86 | 66 | 22.0% |

판정 불가 사유: `missing` 571건, **`inconsistent` 59건**

읽을 것 셋.

1. **규칙 6의 85.0%가 케이스 데이터 결측 84.5%와 일치한다.** 데이터 구멍이 판정에
   그대로 비친다. 어드민 보강의 효과를 이 숫자로 측정할 수 있다
2. **`inconsistent` 59건은 §8.4의 커넥터 모순 검사가 실제로 걸러낸 것이다.**
   무작위 300개 중 20%에서 데이터 오류를 잡았다. 이 검사가 없으면 그만큼이
   거짓 통과한다 — ADR-0009의 근거가 실측으로 확인됐다
3. **★ 규칙 7이 100% 판정 불가라 모든 견적에 판정 불가가 하나씩 뜬다.**
   ADR-0009의 제약에 적어둔 "덜 만들어진 도구로 보일 위험"이 지금 상태다

**이것이 우선순위를 바꿨다.** 전력 상수 확정(§7.2)이 케이스 보강보다 먼저였다 —
케이스는 견적의 85%에 영향을 주지만 전력은 **100%** 였다.

### 9.3.1 구간 판정 적용 후 (갱신)

전력은 점 값을 고를 수 없어 **구간 판정**으로 해결했다
(`docs/research/power-constants.md`, 스펙 §4.1).

| 규칙 | 판정 불가율 (이전 → 이후) |
|---|---|
| #6 PSU 폼팩터 | 85.0% → **83.3%** |
| **#7 전력** | **100% → 0%** |
| #8 커넥터 | 22.0% → **20.7%** |
| 판정 불가가 있는 견적 | 100% → **86.7%** |

**이제 케이스 보강이 가장 큰 개선 항목이다.** 규칙 6의 83.3%가 남은 판정 불가의
대부분을 만든다.

**Phase 0a 진입 전**

- [ ] 규칙 8 교차 검증 — 12VHPWR GPU 표본에서 16핀을 `pcie_8_pin: 2`로 기입한
      레코드가 있는지 확인 (§5 규칙 8)
- [ ] 국내 유통 판정(ADR-0003) 후 보강 대상 케이스 목록 확정 → 예상 ~20~85종
- [ ] 어드민 워크플로에 케이스 3필드(PSU 폼팩터·쿨러 높이·PSU 길이) 입력 폼 우선 구현
- [ ] 중복 레코드 병합 정책 — canonical slug 부여 시 `OEM/Tray`·표기 변형 처리 (§5.2)

**스펙 수정 — 반영 완료** (문서 먼저, CLAUDE.md 작업 규칙 2)

- [x] §5.1 GPU 대응 전략 → AIB 전량 적재로 수정 (§7.1)
- [x] §4.1 규칙 7의 필요 데이터에서 "보드 파워" 삭제, 상수 가정 명시 (§5)
- [x] §4.3 판정 등급에 **"판정 불가"** 추가 (§7.5) → ADR-0009
- [x] §4.2 규칙 10(라디에이터) Phase 2 이후로 이동 (§7.2)
- [x] §5.1 메인보드 BIOS 우회책에 `flashback` 신호 추가 (§7.4)
- [x] §5.7.2 GS1 코리안넷 우선순위 하향 (§7.6)
- [x] §5.7 clone 직후 확인 항목을 조사 결과로 갱신
- [x] §5.8 `chip_id`는 `chipset` 그룹핑으로 유도한다고 명시 (§7.3)
- [x] §10.4 검증 기준에 판정 불가 회귀 케이스 추가
- [x] §12 결정 대기 항목에서 OpenDB 스키마 확인 항목 해제

**ADR**

- [x] 결측 필드 처리 원칙 — "판정 불가" 등급 도입 (§7.5)
      → `docs/decisions/0009-unknown-verdict-grade.md`

---

## 10. 다시 확인한 것 (2026-09-22)

막혀 있는 이슈들이 여전히 막혀 있는지 원본을 다시 훑었다. **전부 그대로다.**
다음에 같은 질문이 나올 때 다시 캐지 않아도 되게 적어 둔다.

재현: `apps/ingest/src/mapping.ts`가 읽는 것과 별개로, 카테고리 디렉터리의 모든
JSON을 평탄화해 키를 세는 방식이다 (§8과 같다).

### 10.1 스토리지 소비전력 — 필드가 없다 (이슈 #5)

Storage 3,495건의 키를 전수로 세어 봤다. 전력 관련 필드가 **하나도 없다.**

실제로 있는 것: `capacity`(3,493) · `storage_type`(3,493) · `form_factor`(3,493) ·
`interface`(3,493) · `nvme`(1,537) · `cache`(65) 그리고 메타데이터·식별자.

그래서 규칙 7의 전력 합계에 드라이브가 빠져 있고, **빠졌다고 화면에 적는 것이
현재 정답이다** (`describeExcluded`). 출처 있는 범위를 얻을 때까지 그대로 둔다.

### 10.2 라디에이터·램 간섭 — 필드가 없다 (이슈 #4, 규칙 10·11)

| 찾은 낱말 | PCCase 3,784건 | CPUCooler 2,405건 |
|---|---|---|
| `radiator` | **없다** | `radiator_size` 1,268건 |
| `clearance` | 없다 | 없다 |
| `ram` / `memory` | 없다 | **없다** |
| `fan` | 없다 | `fan_size` 577 · `fan_quantity` 328 · `max_fan_rpm` 1,848 |

쿨러 쪽 라디에이터 크기는 있는데 **케이스 쪽 장착 위치가 없다** — 규칙 10은
한쪽만으로 성립하지 않는다. 규칙 11의 램 간섭 여유는 양쪽 모두에 없다.
§7.2의 판단이 그대로 유효하다.

### 10.3 케이스 지원 PSU 폼팩터 — 원본에 더 없다 (이슈 #3, 규칙 6)

`supported_power_supply_form_factors`가 599건(15.8%)뿐인데, 다른 이름으로 같은
사실을 담은 필드가 있는지 봤다. **없다.**

| 필드 | 값 있음 | 규칙 6에 쓸 수 있나 |
|---|---|---|
| `supported_power_supply_form_factors` | 599 (15.8%) | ✅ 이 필드다 |
| `power_supply` | 3,653 (96.5%) | ❌ **파워 포함 여부다.** 3,507건이 `"None"` |
| `max_psu_length` | 539 (14.2%) | ❌ 길이는 폼팩터를 정하지 않는다 |
| `power_supply_shroud` | 447 (11.8%) | ❌ 쉬라우드 유무 |

`power_supply`의 96.5%를 보고 기대할 수 있는데 **그건 폼팩터가 아니다.** 값 분포가
`"None"` 3,507 · `"300 W"` 29 · `"Not Included"` 10 … 이다.

### 10.4 출처 주소도 상한이 8.7%다 (이슈 #3)

보강에서 가장 오래 걸리는 단계는 출처를 찾는 것이다. 케이스 레코드에서
`http(s)`로 시작하는 문자열을 **전부** 찾아보니 한 군데뿐이다 —
`general_product_information.manufacturer_url` 820건(21.7%).

규칙 6이 막힌 케이스 3,185건으로 좁히면 **278건(8.7%)**만 주소가 있다.
`/admin`의 빈 필드 목록이 그 278건을 먼저 주도록 고쳤다 (이슈 #3).

### 10.5 ★ OpenDB에 유통 목록이 있지만 한국이 없다 (이슈 #1)

전 카테고리 48,300 레코드 중 **23,677건(49.0%)**에
`identifiers.retailer_listings[]`가 있다. 「네이버 API를 기다리지 않고 이걸
쓰면 되지 않나」라는 질문의 답이다.

- source: amazon 320,779 · proshop 22,464 · newegg 21,546 · alternate 16,924 ·
  walmart 12,945 · geizhals/skinflint/cenowarka 각 10,187 …
- channel: **us 57,076 · uk 51,648 · de 48,124 · pl 37,292 · ca 33,253 ·
  es · fr · nl · it · au · ie · sg · be · jp · se · fi · pt**

**`kr`이 없다.** jp까지 있고 한국만 빠져 있다. 이슈 #1의 국내 유통 매칭은
네이버 쇼핑 API(또는 다른 국내 소스)가 있어야 한다 — 원본으로는 안 된다.

부수적으로, 「전 세계 어디에도 유통 목록이 없다」는 신호는 얻을 수 있다.
다만 그것으로 목록을 거르지는 않는다 — ADR-0016의 탈락 대안("현행 세대만
보여주기")과 같은 문제이고, 국내 유통과는 다른 사실이다.

### 9.3.2 스토리지 규칙을 처음으로 실측했다 (2026-09-22)

`sample.ts`가 **드라이브를 담지 않고 있었다.** 그래서 규칙 17·18·19가 표에 아예
나오지 않았고, 스토리지 규칙만 전수 수치가 없는 상태였다. 무작위 표본에 드라이브
둘을 넣고 다시 쟀다 (300 조합).

| 규칙 | 통과 | 실패 | 판정 불가 | 판정 불가율 |
|---|---|---|---|---|
| #1 소켓 | 21 | 279 | 0 | 0.0% |
| #2 메모리 규격 | 49 | 251 | 0 | 0.0% |
| #3 모듈 수 | 292 | 8 | 0 | 0.0% |
| #4 GPU 길이 | 258 | 33 | 9 | 3.0% |
| #5 보드 폼팩터 | 251 | 49 | 0 | 0.0% |
| **#6 PSU 폼팩터** | 35 | 5 | 260 | **86.7%** |
| #7 소비전력 | 258 | 38 | 4 | 1.3% |
| #8 보조전원 | 147 | 86 | 67 | 22.3% |
| **#9 쿨러 높이** | 42 | 7 | 251 | **83.7%** |
| **#12 BIOS** | 40 | 3 | 257 | **85.7%** |
| #15 GPU 두께 | 282 | 9 | 9 | 3.0% |
| #16 최대 메모리 | 247 | 53 | 0 | 0.0% |
| **#17 M.2 슬롯** | 91 | 42 | 167 | **55.7%** |
| #18 SATA 포트 | 229 | 0 | 71 | 23.7% |
| #19 베이 | 267 | 33 | 0 | 0.0% |

읽을 것 세 가지.

1. **최악은 규칙 6이 아니다.** 6·12·9가 83~87%로 나란히 있다. 「다음 개선 지점은
   규칙 6」이라고만 적어 두면 나머지 둘을 놓친다
2. **#17의 55.7%는 결측이 아니라 모순이다.** M.2 슬롯 수를 셀 수 없다고
   결론지은 결과다 (§17.4) — 원본이 같은 보드 계열을 2·4·6행으로 담고 있어
   배열 길이가 슬롯 수가 아니다. 데이터를 채워서 줄지 않는다
3. **#18은 실패가 0이다.** 보드 SATA 포트가 4~6개이고 표본이 드라이브 2개라
   넘칠 수가 없다. 포트 부족을 보려면 드라이브를 더 담아야 한다

### 9.3.3 ★ 규칙 12의 판정 불가는 선언에 없던 필드 때문이었다 (이슈 #15)

위 표의 #12가 85.7%인데, `/rules`는 규칙 12의 결측을 **0.7%**로 보여주고 있었다
(`Motherboard.bios_flashback` 26/3,701). 그 페이지의 존재 이유가 결측을 공개하는
것인데 정반대를 말하고 있었다.

규칙 12는 **CPU와 메인보드의 출시 연도**를 비교한다. `bios_flashback`은 경고
등급을 가르는 보조 신호일 뿐이다. 그런데 연도는 `part_specs` 행이 아니라
`parts` 컬럼이라 선언에서 빠져 있었다.

연도 채움률:

| 카테고리 | 연도 있음 |
|---|---|
| CPU | 696/789 (88.2%) |
| **Motherboard** | **757/3,701 (20.5%)** |
| GPU | 1,196/3,862 (31.0%) |
| PCCase | 578/3,784 (15.3%) |
| CPUCooler | 286/2,405 (11.9%) |
| RAM | 565/4,876 (11.6%) |
| PSU | 127/3,297 (3.9%) |
| Storage | 76/3,495 (2.2%) |

`0.882 × 0.205 ≈ 18%`. 측정된 판정 가능률과 맞는다. **메인보드 연도가 규칙 12의
진짜 병목이다.** 원본에 다른 경로는 없다 — Motherboard 레코드의 연도·날짜 낱말을
전수로 찾으면 `metadata.releaseYear` 하나뿐이고 그건 이미 적재한다.

고친 뒤 `/rules`가 보여주는 값:

```
규칙 12  Motherboard.release_year     결측 79.5% (2944/3701)
규칙 12  CPU.release_year             결측 11.8% (93/789)
규칙 12  Motherboard.bios_flashback   결측  0.7% (26/3701)
```

**같은 종류의 누락이 다른 규칙에는 없었다.** 부품 타입의 모든 필드를 선언과
맞대 보았고 규칙 12만 빠져 있었다. 되돌아오는 것을 막기 위해
`apps/ingest/test/undeclared-input.test.ts`가 수치로 잡는다 — 한 규칙의 **결측
때문인** 판정 불가율은 그 규칙이 선언한 필드들의 결측률 합(합집합 상한)을 넘을 수
없다. 선언을 지워 확인해 보니 「규칙 12: 결측 판정 불가 78.3%인데 선언한 필드의
결측 합은 0.7%다」로 잡힌다.
