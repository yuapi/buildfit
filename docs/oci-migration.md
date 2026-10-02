# OCI 서버로 옮기기 — 개발 세션 이관과 서비스 구성

작성: 2026-10-02. 지금까지의 개발은 claude.ai의 클라우드 세션(컨테이너)에서 했다. 이 문서는
**OCI 인스턴스 한 대**에서 (1) Claude Code 개발 세션을 이어가고 (2) buildfit을 서비스하는 절차다.

배포 자체의 규칙(빌드 시점 환경 변수, `/healthz`, 어드민 404)은 `docs/deployment.md`가 정본이다.
여기서는 그 절차를 **OCI에서** 어떻게 세우는지와, 클라우드 세션에서 무엇을 옮겨야 하는지를 적는다.

> **이 문서에서 확인하지 못한 것.** 이 문서는 클라우드 컨테이너(x86_64, Ubuntu 24.04)에서 썼다.
> OCI 콘솔 화면, ARM(Ampere A1) 위의 빌드, `claude remote-control`의 실제 동작은 **여기서 돌려보지
> 못했다.** 레포 쪽 사실(스크립트·환경 변수·DB 요구)은 전부 코드에서 확인한 것이다. 서버에서 다르게
> 동작하면 이 문서를 고친다.

```mermaid
flowchart LR
  subgraph OCI["OCI 인스턴스 (Ubuntu 24.04)"]
    subgraph DEV["개발 — 사용자 dev"]
      CC["claude remote-control<br/>(tmux 안)"] --> DEVREPO["~/buildfit<br/>develop 브랜치"]
      DEVREPO --> PGDEV[("PG 클러스터 dev<br/>:5433, 슈퍼유저 역할")]
    end
    subgraph PROD["서비스 — 사용자 buildfit"]
      CADDY["Caddy :80/:443<br/>자동 HTTPS"] --> NEXT["next start<br/>127.0.0.1:3000"]
      NEXT --> PGPROD[("PG 클러스터 main<br/>:5432, 일반 역할")]
      TIMER["주 1회 타이머<br/>sync:opendb → 재빌드"] --> PGPROD
    end
  end
  APP["Claude Code 앱"] -.-> CC
  USER["사용자"] --> CADDY
  DEVREPO -- "PR · CI 녹색 · 머지" --> GH["GitHub 레포"]
  GH -- "release 태그 checkout" --> NEXT
```

---

## 1. 무엇을 옮기는가

**코드·문서·autopilot 상태는 전부 GitHub에 있다.** `develop`(2026-10-02, PR #113까지)이 정본이고,
클라우드 세션 브랜치 `claude/buildfit-initial-setup-23acp8`도 같은 커밋이다. 옮길 것은 git에 없는 것뿐이다.

| 것 | 클라우드 세션에서 | 서버에서 |
|---|---|---|
| 코드·문서·`.autopilot/` | GitHub `develop` | `git clone`. 끝 |
| DB 카탈로그 (부품 26,511건) | 세션 훅이 원본에서 적재 | **다시 적재한다** — 원본에서 22초. 옮길 것이 아니다 |
| 어드민이 손으로 넣은 스펙 값 | **0행** (2026-10-02 확인) | 옮길 것 없음. 서비스가 뜬 뒤부터 백업 대상 (§4.8) |
| 사용자 신고 (`spec_reports`) | 개발 DB라 실제 신고 없음 | 같음 |
| `.env` | 훅이 `.env.example`을 복사 | 손으로 만든다 (§3.4) |
| `DATABASE_URL` 등 세션 환경 변수 | 훅이 `CLAUDE_ENV_FILE`로 넘김 | `.claude/settings.local.json`의 `env` (§3.4) |
| SessionStart 훅 | `CLAUDE_CODE_REMOTE=true`일 때만 돈다 | **돌지 않는다.** 클라우드 전용이다 — §3의 손 절차가 그 대신이다 |
| MCP 서버 6개 | `.mcp.json` + 자동 승인 | 같은 파일. `npx`(Node)와 `uvx`(uv)만 깔려 있으면 된다 |
| autopilot 스킬 | 계정 동기화(`~/.claude/skills/synced/…`) | 목록에 보이는지 확인. 없으면 스킬 폴더를 `~/.claude/skills/autopilot/`에 둔다 (§3.6) |
| 스크래치 Playwright 스크립트 | 세션 scratchpad | **옮기지 않는다.** 검증용 일회성이다. 필요하면 handoff-guide §8.5의 방법으로 다시 만든다 |

`.autopilot/STOP`이 있다 — 직전 재발굴에서 실질 작업이 0이었다. autopilot을 다시 돌리려면 지운다.

---

## 2. OCI 인스턴스 준비

### 2.1 모양

| 항목 | 권장 | 이유 |
|---|---|---|
| Shape | **VM.Standard.A1.Flex** (Ampere, ARM64) 2 OCPU / 12GB 이상 | `next build`와 테스트가 메모리를 쓴다. Always Free 한도(4 OCPU·24GB) 안이다 |
| 피할 것 | VM.Standard.E2.1.Micro (1GB) | 빌드가 메모리 부족으로 죽는다 |
| OS | **Ubuntu 24.04** | 지금 컨테이너와 같다. PostgreSQL 16이 기본 저장소에 있고 `pg_createcluster`를 쓴다 (§3.3) |
| 부트 볼륨 | 50GB 이상 | OpenDB clone 295MB ×2(개발·서비스), `node_modules`·`.next` ×2, Blender 측정값 zip 101MB |

**ARM이어도 된다** — Next.js(SWC), PostgreSQL, Node 22, Playwright Chromium 모두 linux-arm64를 낸다.
다만 이 레포는 ARM에서 빌드해 본 적이 없다. §3.5의 확인을 꼭 돌린다.

### 2.2 네트워크 — 두 군데를 다 연다

1. **VCN 보안 목록**(또는 NSG)에 인그레스 규칙: TCP 22(관리용, 가능하면 내 IP만), **80, 443**(0.0.0.0/0)
2. **인스턴스 안의 방화벽.** OCI의 Ubuntu 이미지는 iptables 규칙이 22번 말고는 들어오는 연결을 막는다.
   VCN만 열면 밖에서 여전히 안 닿는다 — 이게 OCI에서 가장 흔히 막히는 곳이다

```bash
sudo iptables -I INPUT -p tcp -m multiport --dports 80,443 -j ACCEPT
sudo netfilter-persistent save
sudo iptables -L INPUT -n --line-numbers   # ACCEPT가 REJECT보다 위에 있는지
```

**5432·5433·3000은 열지 않는다.** DB와 Next.js는 인스턴스 안에서만 듣는다.

### 2.3 사용자 둘

| 사용자 | 하는 일 | 왜 나누나 |
|---|---|---|
| `dev` (로그인 사용자) | Claude Code 세션, 개발 체크아웃 | 세션이 서비스 파일과 비밀을 건드리지 못하게 |
| `buildfit` (시스템 사용자, 로그인 없음) | 서비스 실행, 주간 재동기 | 서비스가 개발 체크아웃에 기대지 않게 |

```bash
sudo adduser --system --group --home /srv/buildfit buildfit
```

### 2.4 패키지

```bash
sudo apt update
sudo apt install -y git tmux postgresql-16 postgresql-client-16 caddy
# Node 22 — CI와 같은 주 버전 (.github/workflows/ci.yml). engines는 >=20.9
#   배포판 저장소는 버전이 오래될 수 있다. NodeSource나 nvm으로 22를 깐다
# GitHub CLI — PR을 서버에서 연다 (§3.2)
sudo apt install -y gh
# uv — MCP 서버 셋이 uvx로 뜬다 (.mcp.json)
curl -LsSf https://astral.sh/uv/install.sh | sh
```

`caddy`가 기본 저장소에 없거나 오래됐으면 Caddy 공식 apt 저장소를 쓴다.

---

## 3. 개발 세션 이관 (사용자 `dev`)

### 3.1 Claude Code 설치와 로그인

```bash
npm install -g @anthropic-ai/claude-code   # 또는 공식 설치 스크립트
claude                                     # 처음 한 번 — 화면 안내대로 로그인 (claude.ai 계정)
```

서버에 브라우저가 없으므로 로그인 URL을 내 컴퓨터 브라우저에서 연다. 같은 계정으로 로그인해야 앱에
세션이 보이고 계정 동기화 스킬이 따라온다.

### 3.2 레포와 GitHub

```bash
gh auth login                       # PR을 열고 머지하려면 필요하다
git clone <레포 주소> ~/buildfit      # GitHub 레포 화면의 Code 버튼에서 복사한다
cd ~/buildfit && git checkout develop
```

**지금 레포 이름의 주소로 clone한다.** 클라우드 세션의 원격은 옛 이름이라 push마다
「This repository moved」가 떴다 (handoff-guide §8.5). 주소를 여기 적지 않는 것은 레포 이름을 문서·코드에
박지 않는 규칙 때문이다 (ADR-0019, `apps/web/test/repo-name.test.ts`).

규칙은 그대로다 — `develop`·`main`은 Ruleset으로 보호돼 직접 push가 거절되고, PR의 `verify`가
녹색이어야 머지된다 (ADR-0024). 클라우드 세션은 GitHub MCP로 PR을 열었고, 서버에서는 `gh pr create`·
`gh pr merge --merge`가 같은 일을 한다.

### 3.3 개발 DB — 서비스 DB와 **클러스터를 나눈다**

개발 역할은 **슈퍼유저여야 한다** — 테스트가 격리 DB를 만들고 지우고(`create database` /
`drop … with (force)`), 마이그레이션이 확장을 만든다 (handoff-guide §8.3). 슈퍼유저는 같은 클러스터의
**어떤 DB든 지울 수 있다.** 서비스 DB와 같은 클러스터에 두면 테스트 하나가 서비스 DB를 지울 수 있다.

그래서 개발은 **별도 클러스터(포트 5433)**에 둔다.

```bash
sudo pg_createcluster 16 dev --port 5433 --start
sudo -u postgres psql -p 5433 -c "create role buildfit login superuser password 'buildfit'"
sudo -u postgres createdb -p 5433 -O buildfit buildfit
```

자격증명 `buildfit/buildfit`은 로컬 전용이고 비밀이 아니다 (ADR-0001, `docker-compose.yml` 주석).
5433은 밖으로 열지 않는다 (§2.2).

### 3.4 설정과 적재

```bash
cd ~/buildfit
cp .env.example .env
#   DATABASE_URL=postgres://buildfit:buildfit@localhost:5433/buildfit   ← 포트 5433
#   OPENDB_PATH=../buildcores-open-db
```

**Claude Code 세션에도 같은 값을 넘긴다.** 클라우드에서는 세션 훅이 넘겼다. 이게 없으면 DB 테스트가
**오류 없이 건너뛴다** (`DATABASE_URL`이 없으면 `describe.skip`). `.claude/settings.local.json`
(커밋하지 않는 파일):

```json
{
  "env": {
    "DATABASE_URL": "postgres://buildfit:buildfit@localhost:5433/buildfit",
    "OPENDB_PATH": "/home/dev/buildcores-open-db"
  }
}
```

그다음은 handoff-guide §8.3의 4)~6)과 같다.

```bash
export DATABASE_URL=postgres://buildfit:buildfit@localhost:5433/buildfit
npm ci
npm run migrate
git clone --depth 1 https://github.com/buildcores/buildcores-open-db ../buildcores-open-db
OPENDB_PATH=../buildcores-open-db npm run ingest
# (선택) 성능 측정값 — ADR-0023
curl -sSO https://opendata.blender.org/snapshots/opendata-latest.zip
npm run ingest:benchmarks -- opendata-latest.zip
```

### 3.5 다 됐는지 확인 — ARM에서 처음이다

handoff-guide §8.4를 그대로 돌린다. **`test:empty-db`를 건너뛰지 않는다.**

```bash
npm run typecheck && npm run lint
npm test                    # 기준: 284 / 486 / 545 (ingest / web / compat, 2026-10-02)
npm run test:empty-db
NEXT_PUBLIC_SITE_URL=http://localhost:3100 npm run build
```

수가 다르면 서버 차이(ARM·포트·환경 변수)부터 의심한다 — 코드는 클라우드 세션에서 전부 녹색이었다.

### 3.6 도구 — MCP와 autopilot

- **MCP 서버**: 레포의 `.mcp.json`과 `.claude/settings.json`(`enableAllProjectMcpServers`)이 그대로
  온다. `npx`·`uvx`가 PATH에 있으면 뜬다. 도구 목록에 `mcp__security-audit__…` 등이 보이는지로 판단한다
  (`claude mcp list`의 「Pending approval」은 판단 근거가 아니다 — CLAUDE.md)
- **mermaid**: 클라우드에서는 root라 Chromium이 안 떠서 뺐다. 서버의 `dev`는 root가 아니므로
  CLAUDE.md의 대로 `claude mcp add --scope local mermaid claude-mermaid`로 붙일 수 있다
- **autopilot 스킬**: 세션에서 스킬 목록에 `autopilot`이 보이면 된다. 안 보이면 스킬 폴더(SKILL.md·
  assets·scripts)를 `~/.claude/skills/autopilot/`에 둔다. **터미널이 있으므로 드라이버 모드를 쓸 수
  있다** — 작업마다 컨텍스트가 초기화돼 긴 루프에 낫다 (스킬 문서 「드라이버 실행」)
- **Stop 훅(autopilot 1.5.0)은 레포에 커밋하지 않는다.** STOP 파일이 없으면 이 레포의 **모든** 세션
  종료를 막는다 — 2026-10-02에 같은 이유로 넣지 않았다 (`.autopilot/LOG.md`). 쓰려면
  `.claude/settings.local.json`에만 둔다

### 3.7 원격 세션 띄우기

```bash
tmux new -s claude
cd ~/buildfit
claude remote-control
# Ctrl-b d 로 빠져나와도 세션은 tmux 안에서 계속 돈다. 다시 붙기: tmux attach -t claude
```

그러면 그 세션이 **Claude Code 앱(웹·모바일·데스크톱)에 뜬다.** 서버 재부팅 뒤에는 위를 다시 한다.

첫 프롬프트 (handoff-guide §8.6을 이 서버에 맞춘 것):

```
CLAUDE.md, docs/handoff-guide.md §8, docs/oci-migration.md §3을 읽어줘.
이 서버는 클라우드 컨테이너가 아니다 — SessionStart 훅이 돌지 않고, 개발 DB는 5433이다.
§3.5로 확인한 결과만 짧게 보고해. 그다음 .autopilot/의 상태를 읽고 이어서 진행해.
```

### 3.8 클라우드와 달라지는 것

| 클라우드 세션 | 이 서버 |
|---|---|
| PostgreSQL이 도구 호출 사이에 죽었다 (§8.5) | systemd가 띄운다. 그 함정은 사라진다 |
| `git push --delete`가 403(프록시) | 된다. 그래도 머지된 브랜치는 워크플로가 지운다 |
| GitHub는 MCP 도구, 옛 레포 이름 | `gh`, 새 이름 |
| 컨테이너가 사라지면 미커밋 작업도 사라진다 | 남는다. 그래도 **작업 단위로 PR**이 규칙이다 |
| `pkill -f next-server`가 자기 셸을 죽인다 | 같다. `pkill -f 'next-serve[r]'` |

---

## 4. 서비스 구성 (사용자 `buildfit`)

### 4.1 먼저 정할 것 — 도메인

`NEXT_PUBLIC_SITE_URL`은 **빌드 시점에** 있어야 하고(deployment.md §2), Caddy의 자동 HTTPS도 도메인이
있어야 된다. 도메인은 아직 미정이다 (명세 §12). **도메인 없이 배포하면** sitemap·`robots.txt`·
`rel=canonical`이 잘못된 주소로 구워지고 오류는 나지 않는다. 정하고 DNS A 레코드를 인스턴스 공인 IP로
돌린 뒤 진행한다.

### 4.2 릴리스 — `main`에 처음 올린다

`main`은 「배포된 것만」이고 아직 비어 있다 (`develop`보다 491커밋 뒤). Phase 1이 「진행 중」이므로
첫 배포는 **`v0.2.0`**이다 (deployment.md §6 — 「Phase 1이 끝나기 전에 배포하면 `v0.2.0`」).

```bash
# 개발 체크아웃에서
git checkout develop && git pull
git checkout -b release/0.2.0 && git push -u origin release/0.2.0
gh pr create --base main --head release/0.2.0 --title "release 0.2.0"
# CI 녹색 → merge 방식으로 머지
git fetch origin && git tag -a v0.2.0 origin/main -m "v0.2.0" && git push origin v0.2.0
# release/는 develop에도 머지한다 (CLAUDE.md 브랜치 표). 릴리스 중 고친 것이 없으면 바뀌는 것이 없다
```

### 4.3 서비스 DB — 일반 역할

서비스 역할은 **슈퍼유저가 아니다.** 마이그레이션이 만드는 확장 `pg_trgm`은 PostgreSQL 13부터 신뢰
확장이라 DB 소유자가 만들 수 있다.

```bash
PROD_PW=$(openssl rand -base64 24)
sudo -u postgres psql -p 5432 -c "create role buildfit_app login password '${PROD_PW}'"
sudo -u postgres createdb -p 5432 -O buildfit_app buildfit_prod
```

### 4.4 비밀 파일

`/etc/buildfit/buildfit.env` (소유 `root:buildfit`, 권한 `640`):

```bash
DATABASE_URL=postgres://buildfit_app:<PROD_PW>@localhost:5432/buildfit_prod
OPENDB_PATH=/srv/buildfit/buildcores-open-db
NEXT_PUBLIC_SITE_URL=https://<도메인>
ADMIN_TOKEN=<openssl rand -base64 24>      # 16자 이상. 비우면 /admin이 404 (ADR-0020)
NODE_ENV=production
```

`ADMIN_TOKEN`은 계정이 아니라 비밀 하나다 — 브라우저가 물으면 아이디 칸은 비우고 이 값만 넣는다.

### 4.5 첫 배포 — deployment.md §5의 순서

```bash
sudo -u buildfit -i
cd /srv/buildfit
git clone --branch v0.2.0 <레포 주소> app
git clone --depth 1 https://github.com/buildcores/buildcores-open-db buildcores-open-db
cd app
set -a; . /etc/buildfit/buildfit.env; set +a
npm ci
npm run migrate                       # 1. 스키마 — 배포보다 먼저 (deployment.md §6)
npm run ingest                        # 2. 적재
# 2b. (선택) 측정값
npm run build                         # 3. ★ NEXT_PUBLIC_SITE_URL이 이 셸에 있어야 한다
```

### 4.6 systemd — Next.js

`/etc/systemd/system/buildfit.service`:

```ini
[Unit]
Description=buildfit (Next.js)
After=network.target postgresql.service

[Service]
User=buildfit
WorkingDirectory=/srv/buildfit/app
EnvironmentFile=/etc/buildfit/buildfit.env
# 루트에는 start 스크립트가 없다 — 웹 워크스페이스의 next start를 부른다.
# 127.0.0.1에만 묶는다. 밖에서는 Caddy를 거친다
ExecStart=/usr/bin/npm run start --workspace web -- -H 127.0.0.1 -p 3000
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload && sudo systemctl enable --now buildfit
curl -s localhost:3000/healthz        # {"ok":true}
```

`npm`의 경로는 `which npm`으로 확인한다 (nvm으로 깔았으면 `/usr/bin`이 아니다).

### 4.7 Caddy — HTTPS

`/etc/caddy/Caddyfile`:

```
<도메인> {
    reverse_proxy 127.0.0.1:3000
}
```

```bash
sudo systemctl reload caddy
```

인증서는 Caddy가 받아 갱신한다. 80·443이 밖에서 닿아야 받는다 (§2.2).

### 4.8 주기 작업

**재동기 (주 1회)** — 케이스 데이터가 늘어나는 유일한 자동 경로다 (ADR-0025). **재적재 뒤 재빌드가
필요하다** — 카테고리 sitemap이 빌드 때 구워져서, 새 부품은 다시 빌드하기 전까지 sitemap에 없다
(2026-10-02 확인: `prerender-manifest`에 `/sitemap/cpu.xml` 등이 있고 revalidate가 없다).

`/srv/buildfit/weekly-sync.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail
cd /srv/buildfit/app
set -a; . /etc/buildfit/buildfit.env; set +a
before=$(git -C "$OPENDB_PATH" rev-parse HEAD)
npm run sync:opendb                   # 새 커밋이 없으면 적재하지 않는다
after=$(git -C "$OPENDB_PATH" rev-parse HEAD)
if [ "$before" != "$after" ]; then
  # 측정값을 쓰면 여기서 ingest:benchmarks를 다시 돌린다 (deployment.md §5 2b)
  npm run build
  sudo systemctl restart buildfit     # sudoers에 이 명령만 허용
fi
```

systemd 타이머(`OnCalendar=weekly`) 또는 cron으로 `buildfit` 사용자가 돌린다.

**백업** — DB는 원본에서 다시 만들 수 있다. **사람이 넣은 것만 사본이 없다** (deployment.md §6):
어드민이 채운 스펙 값(`part_specs`에서 출처가 OpenDB가 아닌 행)과 사용자 신고(`spec_reports`).
매일 `pg_dump --data-only -t spec_reports`와 해당 `part_specs` 행을 인스턴스 밖(OCI Object Storage 등)에
둔다. 부트 볼륨 백업 정책을 켜 두면 서버째 되살릴 수 있다.

**감시** — `/healthz`를 밖에서 1~5분마다 본다. DB가 끊겨도 화면은 200을 내므로 화면으로는 알 수 없다
(deployment.md §3). OCI Monitoring의 헬스 체크나 외부 업타임 서비스를 쓴다.

### 4.9 배포 뒤 확인

deployment.md §5의 체크리스트를 그대로 돈다 — 특히 `robots.txt`의 `Sitemap:`이 **실제 도메인**인지.

### 4.10 다음 배포

`develop` → `release/<버전>` PR → `main` 머지 → 태그 → 서비스 체크아웃에서:

```bash
cd /srv/buildfit/app && git fetch --tags && git checkout v<버전>
set -a; . /etc/buildfit/buildfit.env; set +a
npm ci && npm run migrate && npm run build
sudo systemctl restart buildfit
```

마이그레이션을 먼저 돌린다 — 컬럼 추가는 구버전과 공존한다 (deployment.md §6).

---

## 5. 이관 체크리스트

- [ ] OCI: A1 인스턴스, VCN 80/443 인그레스, **인스턴스 iptables 80/443** (§2.2)
- [ ] `dev`: Claude Code 로그인, `gh auth login`, `buildfit`으로 clone (§3.1·3.2)
- [ ] 개발 DB는 **5433 별도 클러스터** (§3.3)
- [ ] `.env`와 `.claude/settings.local.json`의 `DATABASE_URL` (§3.4)
- [ ] §3.5 확인 — 테스트 수가 284 / 486 / 545, `test:empty-db` 통과, 빌드 성공
- [ ] MCP 도구가 세션에 보인다, autopilot 스킬이 보인다 (§3.6)
- [ ] `tmux` 안에서 `claude remote-control`, 앱에서 세션이 보인다 (§3.7)
- [ ] 도메인과 DNS (§4.1)
- [ ] `release/0.2.0` → `main`, 태그 `v0.2.0` (§4.2)
- [ ] 서비스 DB는 일반 역할 (§4.3), 비밀 파일 `640` (§4.4)
- [ ] 첫 배포 → systemd → Caddy → `/healthz` (§4.5~4.7)
- [ ] 주간 재동기 + 재빌드, 사람 데이터 백업, `/healthz` 감시 (§4.8)
- [ ] deployment.md §5 체크리스트 (§4.9)
- [ ] 클라우드 세션은 할 일이 없다 — 남은 것은 전부 `develop`에 있다
