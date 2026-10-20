# 배포 준비

**아직 배포하지 않았다.** 이 문서는 배포하려면 무엇이 필요한지, 그리고
**무엇을 확인해야 조용히 잘못 배포되지 않는지**를 적는다.

`docs/pipeline-plan.md`(자율 운영 인프라)는 이 상태가 된 **뒤에** 착수한다.
그러므로 여기 목록이 그 선행 조건이다.

여기 적힌 동작은 전부 프로덕션 빌드(`npm run build` → `npm start`)로 실제
확인한 것이다. 확인한 날짜: 2026-09-22.

## 1. 필요한 것

| 것 | 필수 | 없으면 |
|---|---|---|
| PostgreSQL 16 | ✅ | 아래 §3 |
| `DATABASE_URL` | ✅ | 마이그레이션·적재·빌드가 전부 실패한다 |
| `NEXT_PUBLIC_SITE_URL` | ⚠️ **빌드 시점에** | `localhost:3000`이 색인에 올라간다. §2 |
| `ADMIN_TOKEN` (16자 이상) | 선택 | `/admin`이 404. 보강을 못 한다 |
| OpenDB clone + `OPENDB_PATH` | 적재할 때만 | 카탈로그가 빈다 |

캐시도 큐도 두지 않는다 (ADR-0010). 배포 단위는 **Next.js 하나 + DB 하나**다.

## 2. ★ `NEXT_PUBLIC_SITE_URL`은 빌드 시점에 있어야 한다

sitemap과 `robots.txt`는 SSG라 **파일로 구워져** 배포된다. 런타임에만 넣으면
기본값이 그대로 굳는다.

```
$ curl -s https://<도메인>/robots.txt
Sitemap: http://localhost:3000/sitemap/pages.xml   ← 이렇게 나간다
```

**오류가 나지 않는다.** 200이고 형식도 맞다. 색인이 잘못될 뿐이다.
부품 상세 페이지의 `rel=canonical`도 같은 값을 쓴다 (이슈 #11).

그래서 배포 뒤 확인은 선택이 아니다. §5의 체크리스트에 넣었다.

빌드에서 던지게 만들지 않은 이유: CI가 프로덕션 빌드를 도는데 CI에는 도메인이
없다. 던지게 하면 CI가 깨지고, 그러면 그 검사를 끄게 된다.

## 3. DB가 끊기면 어떻게 되는가

**공개 화면은 200을 낸다.** 각 화면이 "지금은 불러올 수 없습니다"로 떨어진다 —
사용자에게는 이게 맞다. 규칙 설명(`/rules`)처럼 DB 없이 보여줄 수 있는 것은
숫자만 빼고 낸다.

확인한 동작 (`DATABASE_URL`을 닫힌 포트로 두고):

| 주소 | 응답 |
|---|---|
| `/` `/part` `/part/ram` `/rules` `/build/<코드>` | 200, 안내 문구 |
| `/healthz` | **503** `{"ok":false}` |

**그래서 배포 플랫폼은 `/healthz`를 봐야 한다.** 화면의 200을 건강으로 읽으면
DB가 끊긴 채로 계속 서비스된다. 이 주소는 인증이 없으므로 몸통에
오류 내용도 접속 문자열 조각도 넣지 않는다 — 200이냐 503이냐만 말한다.
`robots.txt`가 색인에서 뺀다.

## 4. `ADMIN_TOKEN`이 없으면 `/admin`이 404다 (ADR-0020)

프로덕션 빌드에서 확인했다.

```
/admin                                          404
/admin/gaps/PCCase/supported_psu_form_factors   404
/admin/parts/<id>                               404
```

**404 응답의 몸통에도 어드민 데이터가 없다.** 이건 한 번 틀렸던 부분이다 —
레이아웃에서만 막았을 때는 404를 주면서 본문에 필드 이름과 결측 건수를 실어
보냈다. 그래서 각 화면이 **데이터를 만지기 전에** 스스로 막고,
`apps/web/test/admin-guard.test.ts`가 새 화면이 그걸 빠뜨리는 것을 잡는다.

토큰을 만들 때: `openssl rand -base64 24`. 계정이 아니라 비밀 하나이므로
브라우저가 물으면 **아이디 칸은 비우고** 이 값만 넣는다.

## 5. 배포 순서

```bash
# 1. 스키마
DATABASE_URL=... npm run migrate

# 2. 적재 (첫 배포)
git clone https://github.com/buildcores/buildcores-open-db <OPENDB_PATH>
DATABASE_URL=... OPENDB_PATH=... npm run ingest

# 2'. 재동기 (그 뒤 주 1회 — 명세 §5.6, ADR-0025). 원본을 받아 **새 커밋이 있을 때만** 재적재하고,
#     부품 id가 그대로인지 확인한다. ★ `npm run ingest`만 돌리면 새 데이터가 들어오지 않는다 —
#     원본 clone이 그대로이기 때문이다
DATABASE_URL=... OPENDB_PATH=... npm run sync:opendb

# 2b. 성능 측정값 (선택 — ADR-0023). 부품 적재 **뒤에** 돈다. 빼면 「측정값 없음」이 나올 뿐이다.
#     ★ 2'가 재적재했으면 이것도 다시 돌린다 — 측정값은 적재 순간의 부품 이름에 잇는다.
#     새로 들어온 부품은 다시 돌리기 전까지 「측정값 없음」이다
curl -sSO https://opendata.blender.org/snapshots/opendata-latest.zip
DATABASE_URL=... npm run ingest:benchmarks -- opendata-latest.zip

# 3. 빌드. ★ 도메인을 여기서 준다
NEXT_PUBLIC_SITE_URL=https://<도메인> DATABASE_URL=... npm run build

# 4. 실행. ★ 루트에는 start 스크립트가 없다 — 웹 워크스페이스를 부른다
DATABASE_URL=... ADMIN_TOKEN=... npm run start --workspace web
```

OCI 인스턴스에 세우는 절차(systemd·Caddy·주간 재동기·개발 세션 이관)는 `docs/oci-migration.md`.
**다른 서비스와 같은 서버에 세우는 절차는 §8이다** — 위 순서를 스크립트가 대신한다.

**재동기가 케이스 데이터를 늘리는 유일한 자동 경로다** (ADR-0025). 업스트림이 6시간마다 자동 동기로
채운다 — 2026-09-21 → 09-25의 커밋 16개로 케이스 PSU 폼팩터 599 → 703, PSU 길이 539 → 654,
출시 연도 578 → 687이 됐다.

적재는 멱등하다 (`opendb_id` upsert). **재적재해도 `parts.id`가 유지되므로**
이미 뿌려진 공유 링크가 살아 있다 (ADR-0012,
`apps/ingest/test/id-stability.test.ts`가 지킨다).

### 배포 뒤 확인

- [ ] `/healthz` → `{"ok":true}`
- [ ] `/robots.txt`의 `Sitemap:` 줄이 **실제 도메인**이다 (§2)
- [ ] `/sitemap/pages.xml`이 비어 있지 않다
- [ ] 부품 상세 페이지의 `rel=canonical`이 실제 도메인이다
- [ ] `/admin`이 비밀 없이는 404, 비밀로는 열린다
- [ ] `/` 에서 견적을 하나 구성해 판정이 나온다
- [ ] `curl -sI https://<도메인>/`에 `content-security-policy`(nonce 포함)·`x-frame-options`·
      `strict-transport-security`가 있고 `x-powered-by`가 없다 (§7)
- [ ] 브라우저 개발자 도구 콘솔에 CSP 위반이 없다

## 6. 아직 정하지 않은 것

**도메인** (명세 §12). 정해지기 전에는 §2가 확인할 수 없다. 서버 자리는 정했다 — §8.

**마이그레이션 시점.** 지금은 손으로 돌린다. 컬럼 추가는 expand-contract의 T0라
구버전과 공존한다 (pipeline-plan §7.1) — 즉 **마이그레이션을 먼저 돌리고 배포하는
순서가 안전하다.** 자동화는 pipeline-plan의 몫이다.

**백업.** 개인정보를 다루지 않으므로(ADR-0001) DB는 전부 재생성 가능하다 —
OpenDB 적재는 멱등하고 clone에서 다시 만들면 된다. **예외가 하나 있다:
어드민이 손으로 채운 값**(`part_specs`에서 `source_url`이 OpenDB가 아닌 행)은
어디에도 사본이 없다. 이 프로젝트에서 가장 비싼 데이터이므로 백업 대상은
사실상 그 행들이다. 적재의 「낡은 스펙 정리」가 그 행을 건드리지 않는 이유도
같다.

**릴리스 태그.** `main`은 "배포된 것만" 담고 Phase 완료마다 minor를 올린다
(CLAUDE.md). 아직 배포한 것이 없으므로 `main`은 비어 있고 태그도 없다.
**첫 배포 때 `release/0.3.0`을 따서 `main`에 머지하고 태그를 붙인다** —
Phase 0b가 `v0.2.0`이었어야 하므로 Phase 1 완료가 `v0.3.0`이다.

**Phase가 끝났다고 배포 전에 `main`에 머지하지 않는다.** 0a(2026-09-23, 유통 매칭을
폐기하며 완료 — ADR-0022)와 0b가 끝났지만 `v0.1.0`·`v0.2.0`은 만들지 않았다. 배포하지
않은 코드를 `main`에 올리면 「배포된 것만」이 거짓이 된다. 버전은 **첫 배포 시점에 끝나
있는 마지막 Phase**로 정한다 — Phase 1이 끝나기 전에 배포하면 `v0.2.0`이다.

## 7. 보안

2026-10-20 배포 전 점검 결과와 지금 걸려 있는 장치 (이슈 #115, ADR-0026).
**외부 서비스(분석·글꼴·이미지 CDN 등)를 붙이면 `apps/web/src/lib/security-headers.ts`의 CSP에 주소를 더한다.**

- **헤더**: CSP(요청마다 nonce, 인라인 스크립트·eval 금지, 외부 출처 없음, `object-src 'none'`,
  `frame-ancestors 'none'`), `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`,
  COOP·CORP `same-origin`, HSTS. `X-Powered-By` 없음. 모든 화면이 동적 렌더링이다 (nonce 때문)
- **어드민**: 공유 비밀 하나(ADR-0020), 타이밍 안전 비교, proxy와 화면·동작 양쪽에서 검사.
  틀린 응답 20번이면 그 IP는 30초에 한 번만 다시 시도할 수 있다. 응답은 `no-store`·`noindex`
- **요청 제한**: 서버 동작 IP당 120회 몰아 쓰기·초당 4회, 신고 IP당 시간 약 10건.
  IP는 Caddy가 채운 `X-Forwarded-For`의 맨 오른쪽 값 — **앱을 Caddy 없이 밖에 열면 IP를 지어낼 수 있다**
- **CSRF**: 상태를 바꾸는 것은 전부 서버 동작이고, Next가 `Origin`과 호스트가 다르면 거부한다
- **입력**: 서버 동작은 클라이언트 값을 믿지 않는다 — 검색어·견적서 길이, 제약 모양, 부품 id(uuid)와
  개수, 신고 대상은 DB에서 다시 읽는다. SQL은 전부 파라미터다(`sql.raw`는 고정 별칭만).
  외부 링크는 적재할 때 http(s)만 받는다
- **이미지 최적화 끔**: `next/image`를 쓰지 않는다. 켜 두면 `/_next/image`가 남의 주소를 받아 오는 통로다
- **`/healthz`**: 200/503만 말하고 오류 내용을 내보내지 않는다 (§3)
- **의존성**: `npm audit --omit=dev` 0건 — CI가 high 이상이면 실패한다. 남은 경고는 개발 도구뿐
  (eslint의 braces, drizzle-kit의 esbuild — 상위에 고친 버전이 없다)
- **서버**: 앱은 127.0.0.1에만 열고 Caddy가 HTTPS. systemd 전용 계정·쓰기 제한 (`deploy/systemd/buildfit.service`).
  비밀 파일은 `/etc/buildfit/buildfit.env`(640). 서버에 GitHub 러너를 두지 않는다 (ADR-0027)

## 8. 같은 서버에 배포 (3200) — ADR-0027

다른 서비스가 3000·3100을 쓰는 서버에 `127.0.0.1:3200` + Caddy로 세운다. 스크립트는 `deploy/`에 있다.

### 첫 설치 (한 번, sudo)

1. 도메인을 정하고 DNS를 서버 공인 IP로 돌린다 (`NEXT_PUBLIC_SITE_URL`이 빌드에 구워진다 — §2)
2. `main`에 릴리스가 있어야 한다 — 첫 배포는 `origin/main`을 꺼낸다 (§6 릴리스 태그)
3. 개발 체크아웃에서:

```bash
sudo DOMAIN=<도메인> bash deploy/setup-server.sh
```

PostgreSQL 16 설치, 계정·DB·비밀 파일, OpenDB 원본, 부품 적재, 빌드, systemd, Caddy, 헬스 체크까지 한다.
처음에는 적재·빌드로 몇 분 걸린다. 다시 돌려도 안전하다.

### 그 뒤 배포

**`main`이 바뀌면 서버가 2분 안에 알아서 배포한다** (`buildfit-deploy.timer`). 릴리스 PR을 머지하면 끝이다.

| 할 일 | 명령 (서버에서) |
|---|---|
| 배포 기록 | `journalctl -u buildfit-deploy -n 50` |
| 서비스 로그 | `journalctl -u buildfit -f` |
| 지금 바로 배포 | `sudo -u deploy bash /opt/buildfit/current/deploy/deploy.sh` |
| 특정 태그로 | `sudo -u deploy bash /opt/buildfit/current/deploy/deploy.sh v0.2.0` |
| 직전 릴리스로 되돌리기 | `sudo -u deploy bash /opt/buildfit/current/deploy/deploy.sh --rollback` |
| 도메인을 바꾼 뒤 다시 굽기 | 비밀 파일의 `NEXT_PUBLIC_SITE_URL` 수정 → `deploy.sh --rebuild` |
| 어드민 비밀 보기 | `sudo grep ADMIN_TOKEN /etc/buildfit/buildfit.env` |
| 백업 | `/opt/buildfit/backups/*.dump` (매일, 14개). 되살리기는 `deploy/backup.sh` 머리말 |

새 버전이 빌드·헬스 체크에 실패하면 이전 릴리스가 그대로 돌고, 그 커밋은 자동으로 다시 시도하지 않는다.
고친 커밋을 머지하면 다시 배포된다.

| 경로 | 무엇 |
|---|---|
| `/opt/buildfit/current` | 지금 릴리스 (`releases/<시각>-<커밋>`을 가리키는 링크) |
| `/opt/buildfit/repo` | 코드를 꺼내 오는 clone (작업 트리 없음) |
| `/opt/buildfit/opendb` | OpenDB 원본 — 매주 월요일 재동기 (`buildfit-sync.timer`) |
| `/etc/buildfit/buildfit.env` | DB 주소·어드민 비밀·도메인·포트 |
