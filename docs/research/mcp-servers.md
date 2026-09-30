# MCP 서버 설정과 검증 (2026-09-30)

레포 루트 `.mcp.json`에 둔 MCP 서버를 이 클라우드 환경에서 **실제로 띄워 도구를 불러** 확인했다.
사용 규칙은 `CLAUDE.md`의 「MCP 사용 규칙」에 있다.

## 1. 전제조건

| 명령 | 버전 | |
|---|---|---|
| node | v22.22.2 | 20+ 충족 |
| npm | 10.9.7 | |
| uv / uvx | 0.8.17 | |
| claude-mermaid | 1.6.6 | 없어서 `npm install -g claude-mermaid`로 설치 |

## 2. 검증 방법

`claude mcp list`는 7개를 모두 인식했지만 **「Pending approval」** 이었다. 프로젝트 `.mcp.json`의 서버는
사람이 대화형 `claude`에서 승인해야 붙는다. 승인은 대신하지 않았다.

그래서 각 서버를 `.mcp.json`의 명령 그대로 stdio로 띄우고 MCP JSON-RPC를 직접 보냈다 —
`initialize` → `tools/list` → `tools/call`. 도구를 실제로 부른 것이다.

## 3. 결과

| 서버 | 연결 | 호출 성공 | 비고 |
|---|---|---|---|
| mermaid | ✅ (도구 2) | ❌ | **제외.** 헤드리스 Chromium이 root에서 `--no-sandbox` 없이 뜨지 않는다 (`Running as root without --no-sandbox is not supported`). `claude-mermaid`는 퍼피티어 설정을 넘길 방법이 없다 |
| security-audit | ✅ (도구 1) | ✅ | 워크스페이스 전체 의존성 16개 → 알려진 취약점 0. **탐지가 도는지** 알려진 취약 버전(lodash 4.17.15)으로 확인 — GHSA 항목이 나온다 |
| excel | ✅ (도구 26) | ✅ | 워크북 생성·수식 쓰기·읽기. **수식을 계산하지 않는다** — 값 모드로 읽으면 `null` |
| logisheets | ✅ (도구 32) | ✅ | excel이 만든 파일을 열어 계산: `SUM` 1028 · `AVERAGE` 514 · `CEILING(552×1.3,1)` 718 (앱의 권장 파워와 같은 값). 임시 xlsx는 지웠다 |
| sql-analyzer | ✅ (도구 4) | ⚠️ 일부 | `lint_sql`: 레포 마이그레이션(`0004_duplicate_of.sql`) 통과, 깨진 쿼리는 위치까지 잡는다. `transpile_sql`은 **서버 버그** — 결과를 문자열이 아닌 목록으로 돌려 검증 오류 |
| quantakrypto | ✅ (도구 16) | ✅ | 레포 260파일, 발견 0, 준비도 100/100. 레포가 암호 모듈을 쓰지 않는다. **탐지가 도는지** RSA 키 생성 표본으로 확인 — high 1건. `probe_endpoint`는 부르지 않았다 |
| text-refactor | ✅ (도구 17) | ✅ | `CLAUDE.md` 앞 3줄 읽기. 읽기만 했다 |

## 4. 요청과 다르게 둔 인자

처음 받은 명령 그대로는 둘이 **뜨지도 않았다.** 둘 다 상위 패키지의 의존성 문제라 `uvx --with`로 고쳤다 —
여전히 PATH의 명령만 쓰고 절대 경로·비밀은 없다.

| 서버 | 원래 | 오류 | 고친 인자 |
|---|---|---|---|
| sql-analyzer | `--from git+… mcp-server-sql-analyzer` | `ModuleNotFoundError: No module named 'mcp.server.fastmcp'. This is mcp 2.x, where FastMCP was renamed…` | `--with "mcp<2"` 추가 |
| text-refactor | `text-file-read-and-refactor-mcp` | `AttributeError: 'NoneType' object has no attribute 'cpuinfo'` (의존성 `cengal`) | `--with py-cpuinfo` 추가 |
| text-refactor | (위 뒤에도) | `No accessible directories were configured` | 허용 디렉터리 `.` (레포 루트) 인자 추가 |

## 5. 다시 볼 때

- `mcp-server-sql-analyzer`가 mcp 2.x로 옮기면 `--with "mcp<2"`를 뗀다
- mermaid는 **비root 환경**(대개 로컬)에서는 이 원인이 없다. 거기서는 `--scope local`로 붙인다 — `.mcp.json`에 넣으면 클라우드 세션에서 또 실패한다
- 서버 버전을 고정하지 않았다 (`npx -y`·`uvx`가 최신을 받는다). 동작이 바뀌면 이 표를 다시 잰다

## 6. 버전 고정과 자동 승인 (2026-09-30)

검증한 버전 그대로 고정했다. `npx`·`uvx`가 실행할 때마다 최신을 받으면 검증한 것과 다른 코드가 돈다.

| 서버 | 고정 | 비고 |
|---|---|---|
| security-audit | `mcp-security-audit@1.0.4` | 서버가 스스로 알리는 버전은 0.1.0이다 (패키지 버전과 다르다) |
| excel | `excel-mcp-server@1.1.1` | |
| logisheets | `logisheets-mcp@0.6.0` | `-y`를 더했다 — 캐시에 없으면 `npx`가 설치 확인을 묻고 멈춘다 |
| sql-analyzer | 커밋 `d6d69c0c55826d6baa5033820078d1c72453ee33` + `mcp==1.30.0` | `mcp<2`를 정확한 버전으로 |
| quantakrypto | `@quantakrypto/mcp@0.12.0` | `-y` 추가 |
| text-refactor | `text-file-read-and-refactor-mcp@1.16.0` + `py-cpuinfo==9.0.0` | 서버가 스스로 알리는 버전은 0.1.0이다 |

고정한 명령으로 여섯을 다시 띄워 도구를 한 번씩 불렀다 — 전부 성공 (lodash 취약점 탐지, 수식 1028 계산,
`lint_sql` 통과, 레포 261파일 발견 0, `CLAUDE.md` 읽기).

**자동 승인:** `.claude/settings.json`에 `enableAllProjectMcpServers: true`를 넣었다.

- 이 클라우드 세션은 서버 도구(`mcp__sql-analyzer__lint_sql` 등)가 이미 붙어 있었고, 직접 불러 동작을 확인했다
- 하지만 셸에서 돌린 `claude mcp list`는 이 설정을 넣어도, `.claude/settings.local.json`에 넣어도 「Pending approval」로
  표시했다. **CLI 목록으로는 이 설정의 효과를 확인할 수 없었다** — 세션의 도구 목록이 기준이다
- 이 설정은 `.mcp.json`에 **새로 들어오는 서버도** 묻지 않고 붙인다. 서버를 더하는 변경은 PR에서 명령과 버전을 본다

