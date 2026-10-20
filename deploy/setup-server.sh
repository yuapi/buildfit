#!/usr/bin/env bash
# 서버 첫 설치 (한 번만, sudo 로) — ADR-0027.
#
#   sudo DOMAIN=<도메인> bash deploy/setup-server.sh
#
# 하는 일: PostgreSQL 16 · 실행 계정(buildfit) · 서비스 DB · 비밀 파일 · 체크아웃 · OpenDB 원본 ·
#          systemd(서비스 + 자동 배포·재동기·백업 타이머) · 재시작 sudo 권한 · 첫 배포(적재 포함) ·
#          Caddy 도메인 · 헬스 체크
# 다시 실행해도 안전하다 (이미 된 단계는 건너뛴다). 같은 서버의 다른 서비스 설정은 건드리지 않는다.
set -euo pipefail
[[ $EUID -eq 0 ]] || { echo "sudo 로 실행해 주세요"; exit 1; }
DOMAIN="${DOMAIN:?DOMAIN=<도메인> 을 앞에 붙여 실행해 주세요}"
PORT="${PORT:-3200}"
HERE="$(cd "$(dirname "$0")/.." && pwd)"
# 레포 주소를 코드에 박지 않는다 (ADR-0019) — 이 스크립트를 부른 체크아웃의 origin 을 쓴다
REPO_URL="${REPO_URL:-$(git -C "$HERE" remote get-url origin)}"
APP=/opt/buildfit
ENV_DIR=/etc/buildfit
ENV_FILE=$ENV_DIR/buildfit.env
step() { echo; echo "== $*"; }

[[ -x /usr/bin/node ]] || { echo "/usr/bin/node 가 없어요 (Node 22 필요)"; exit 1; }
getent passwd deploy >/dev/null || { echo "deploy 계정이 없어요"; exit 1; }
if ss -ltn | grep -qE "[:.]$PORT\b" && ! systemctl is-active --quiet buildfit; then
  echo "포트 $PORT 를 이미 다른 프로그램이 쓰고 있어요 (ss -ltnp 로 확인)"; exit 1
fi

step "PostgreSQL 16"
if ! command -v psql >/dev/null || [[ ! -d /usr/lib/postgresql/16 ]]; then
  apt-get update -qq
  DEBIAN_FRONTEND=noninteractive apt-get install -y -qq postgresql-16 postgresql-client-16
fi
systemctl enable --now --quiet postgresql
# 밖에서 접속하지 않는다 — 기본값이 localhost 뿐인지 확인만 한다
sudo -u postgres psql -tAc "show listen_addresses" | grep -qx localhost || echo "주의: PostgreSQL 이 localhost 밖에서도 듣고 있어요"

step "실행 계정 buildfit"
id buildfit &>/dev/null || useradd --system --home-dir /var/lib/buildfit --create-home --shell /usr/sbin/nologin buildfit
usermod -aG buildfit deploy

step "서비스 DB (일반 역할 — 슈퍼유저가 아니다, oci-migration §4.3)"
install -d -m 750 -o root -g buildfit "$ENV_DIR"
if [[ ! -f "$ENV_FILE" ]]; then
  DB_PW="$(openssl rand -hex 24)"
  if sudo -u postgres psql -tAc "select 1 from pg_roles where rolname='buildfit_app'" | grep -q 1; then
    sudo -u postgres psql -qc "alter role buildfit_app password '$DB_PW'"
  else
    sudo -u postgres psql -qc "create role buildfit_app login password '$DB_PW'"
  fi
  cat > "$ENV_FILE" <<ENV
# buildfit 운영 설정 (deploy/setup-server.sh 가 만들었다). 권한 640 root:buildfit
DATABASE_URL=postgres://buildfit_app:$DB_PW@127.0.0.1:5432/buildfit_prod
OPENDB_PATH=$APP/opendb
# ★ 빌드 시점에 쓰인다 — 바꾸면 deploy/deploy.sh --rebuild (deployment.md §2)
NEXT_PUBLIC_SITE_URL=https://$DOMAIN
# 어드민 공유 비밀 (ADR-0020). 브라우저가 물으면 아이디 칸은 비우고 이 값만 넣는다
ADMIN_TOKEN=$(openssl rand -base64 24)
PORT=$PORT
ENV
fi
chown root:buildfit "$ENV_FILE" && chmod 640 "$ENV_FILE"
sudo -u postgres psql -tAc "select 1 from pg_database where datname='buildfit_prod'" | grep -q 1 \
  || sudo -u postgres createdb -O buildfit_app buildfit_prod

step "체크아웃 $APP"
install -d -m 2775 -o deploy -g buildfit "$APP" "$APP/releases"
[[ -d "$APP/repo/.git" ]] || sudo -u deploy git clone --quiet --no-checkout "$REPO_URL" "$APP/repo"
[[ -d "$APP/opendb/.git" ]] || sudo -u deploy git clone --quiet --depth 1 https://github.com/buildcores/buildcores-open-db "$APP/opendb"
sudo -u deploy git -C "$APP/repo" fetch --quiet --tags origin

step "systemd 서비스·타이머 + 재시작 권한"
SRC="$(mktemp -d)"
git -C "$APP/repo" archive origin/main deploy/systemd | tar -x -C "$SRC"
install -m 644 "$SRC"/deploy/systemd/buildfit*.service "$SRC"/deploy/systemd/buildfit*.timer /etc/systemd/system/
rm -rf "$SRC"
echo 'deploy ALL=(root) NOPASSWD: /usr/bin/systemctl restart buildfit' > /etc/sudoers.d/buildfit
chmod 440 /etc/sudoers.d/buildfit
visudo -cf /etc/sudoers.d/buildfit >/dev/null
systemctl daemon-reload
systemctl enable --quiet buildfit

step "첫 배포 (처음이면 부품 적재까지 — 몇 분 걸려요)"
if [[ ! -e "$APP/current" ]]; then
  # 첫 배포는 레포에서 꺼낸 스크립트로 돈다. 그 뒤로는 배포된 릴리스의 스크립트를 쓴다
  TMP="$(mktemp -d)" && chmod 755 "$TMP"
  git -C "$APP/repo" show origin/main:deploy/deploy.sh > "$TMP/deploy.sh"
  sudo -u deploy bash "$TMP/deploy.sh" origin/main
  rm -rf "$TMP"
fi
systemctl enable --now --quiet buildfit-deploy.timer buildfit-sync.timer buildfit-backup.timer

step "Caddy: $DOMAIN → 127.0.0.1:$PORT"
if ! grep -q "^$DOMAIN " /etc/caddy/Caddyfile; then
  cp /etc/caddy/Caddyfile "/etc/caddy/Caddyfile.bak.$(date +%Y%m%d%H%M%S)"
  # 보안 헤더(HSTS 포함)는 앱이 붙인다 (ADR-0026)
  printf '\n%s {\n\tencode zstd gzip\n\treverse_proxy 127.0.0.1:%s\n}\n' "$DOMAIN" "$PORT" >> /etc/caddy/Caddyfile
fi
caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null
systemctl reload caddy

step "헬스 체크"
curl -fsS "http://127.0.0.1:$PORT/healthz" && echo
for i in 1 2 3 4 5 6; do
  curl -fsS -o /dev/null "https://$DOMAIN/healthz" && { echo "https://$DOMAIN 정상"; break; }
  echo "HTTPS 인증서 받는 중… ($i)"; sleep 5
done
echo
echo "끝났어요. 이후 배포는 main 이 바뀌면 서버가 2분 안에 알아서 해요."
echo "어드민 비밀: sudo grep ADMIN_TOKEN $ENV_FILE"
echo "로그: journalctl -u buildfit -f   /   배포 로그: journalctl -u buildfit-deploy"
