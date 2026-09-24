# ADR-0024: develop 머지는 PR로 하고, 머지된 feature 브랜치는 워크플로가 지운다

## 상태
채택 (2026-09-24). ADR-0008의 **머지 방법**을 대체한다 — 브랜치 구조는 그대로다.

## 배경

ADR-0008은 「머지는 `--no-ff`」와 「머지한 feature 브랜치는 삭제한다」를 정했다. 그런데 방법은
정하지 않았고, 실제로는 이렇게 해 왔다.

```bash
git checkout develop && git merge --no-ff feature/…   # 로컬에서 합친다
git push origin develop                                # develop에 바로 올린다
git branch -d feature/…                                # 로컬만 지운다
```

그 결과가 셋이다 (2026-09-24 확인).

- **PR이 한 건도 없다.** CI는 develop에 들어간 **뒤에** 돌았다. 깨진 것이 먼저 통합 브랜치에 들어가고
  나중에 알게 되는 구조다
- **원격에 머지를 마친 브랜치 17개가 남았다** (`feature/` 14개, `fix/` 3개). 전부 develop의 조상이다.
  로컬 `git branch -d`는 원격을 지우지 않는다
- 「`develop`에 직접 커밋하지 않는다」는 지켰지만, **직접 push**는 막는 것이 없었다

## 결정

**feature → develop 머지는 GitHub PR로 한다.**

| 항목 | 정한 것 |
|---|---|
| PR 대상 | `develop` (release·hotfix는 ADR-0008대로 `main`과 `develop`) |
| 머지 방식 | **`merge`** — `--no-ff`와 같은 머지 커밋을 만든다. squash·rebase는 쓰지 않는다 |
| 머지 조건 | PR의 CI가 녹색 |
| 브랜치 삭제 | **워크플로가 한다** — `.github/workflows/delete-merged-branch.yml` |
| 삭제 대상 | 머지된 PR의 head가 **이 레포의 `feature/`** 일 때만 |

```bash
git checkout develop && git pull
git checkout -b feature/36-pr-merge-flow
# … 작업·커밋 …
git push -u origin feature/36-pr-merge-flow
# PR을 develop으로 연다 → CI 녹색 → merge 방식으로 머지 → 워크플로가 브랜치를 지운다
git checkout develop && git pull && git branch -d feature/36-pr-merge-flow   # 로컬 사본만 지운다
```

## 이유

- **CI가 머지 전에 돈다.** ci.yml은 이미 `pull_request: [develop, main]`에서 돌도록 되어 있었는데,
  PR이 없어서 한 번도 그 경로로 돌지 않았다
- **`merge` 방식이 ADR-0008의 `--no-ff`와 같다.** 머지 커밋이 이슈 경계가 되고 그 안이 세부 커밋이 된다.
  squash는 커밋을 작게 쪼개는 규칙(CLAUDE.md 작업 규칙 5)을 머지 순간에 지운다. rebase는 경계를 지운다
- **삭제를 사람의 기억에 맡기지 않는다.** 17개가 남은 것이 증거다

**왜 레포 설정 「Automatically delete head branches」가 아닌가**

그 설정은 **머지된 모든 head 브랜치**를 지운다. Git Flow에서 `release/`와 `hotfix/`는 `main`과
`develop` **두 곳에** 머지해야 한다 (ADR-0008). 첫 PR이 머지되는 순간 브랜치가 지워지면 둘째 PR의
head가 사라진다. 워크플로는 접두사로 가를 수 있다 — `feature/`만 지운다.

세션 브랜치(`claude/…`)도 지우지 않는다. 클라우드 세션이 계속 쓰는 자리다.

**검토한 대안**

| 대안 | 탈락 이유 |
|---|---|
| 로컬 머지 유지 + 머지 후 `git push origin --delete` | 이 환경의 프록시가 원격 브랜치 삭제를 막는다. 막히지 않아도 사람(세션)이 기억해야 한다 |
| 레포 설정의 자동 삭제 | 위 — release·hotfix의 둘째 머지를 깨뜨린다 |
| squash 머지 | 작업 단위 안의 작은 커밋이 사라진다 |

## 결과

- 워크플로 권한은 `contents: write` 하나다. 포크에서 온 PR은 head가 이 레포에 없으므로 건드리지 않는다
- 이미 지워진 브랜치(사람이 먼저 지웠거나 설정이 켜진 경우)는 실패로 치지 않는다
- **develop 보호 규칙(직접 push 금지, PR 필수)은 레포 설정이라 수동이다.** 켜기 전까지는 이 ADR을
  지키는 것이 규칙이다
- 원격에 남은 머지 완료 브랜치 17개는 **손으로 돌리는 워크플로**(`prune-merged-branches.yml`)로 치운다 —
  전부 develop의 조상임을 확인했다. 이 환경의 프록시가 `git push --delete`를 403으로 막아 GitHub 안에서 지운다.
  develop에 전부 들어간 `feature/`·`fix/`만, 열린 PR의 head가 아닌 것만 지우고 기본은 dry run이다
