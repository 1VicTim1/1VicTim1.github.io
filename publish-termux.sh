#!/data/data/com.termux/files/usr/bin/bash
set -Eeuo pipefail
trap 'printf "\nОшибка на строке %s. Исправь указанную выше причину; история репозитория не перезаписывается.\n" "$LINENO" >&2' ERR
OWNER='1VicTim1'
REPO='1VicTim1.github.io'
FULL="$OWNER/$REPO"
command -v pkg >/dev/null || { echo 'Запусти скрипт в Termux без su.'; exit 1; }
[ "$(id -u)" != 0 ] || { echo 'Выйди из su командой exit и повтори.'; exit 1; }
pkg install -y git gh
if ! gh auth status --hostname github.com >/dev/null 2>&1; then
  gh auth login --hostname github.com --git-protocol https --web --scopes repo,workflow
fi
LOGIN=$(gh api user --jq .login)
if [ "${LOGIN,,}" != "${OWNER,,}" ]; then
  printf 'Вход выполнен как %s, нужен %s.\n' "$LOGIN" "$OWNER"
  echo 'Выполни: gh auth switch --hostname github.com --user 1VicTim1'
  echo 'Если аккаунт ещё не добавлен: gh auth login --hostname github.com --git-protocol https --web --scopes repo,workflow'
  exit 1
fi
# workflow scope permits uploading .github/workflows/pages.yml.
if [ -z "${GH_TOKEN:-}${GITHUB_TOKEN:-}" ]; then
  gh auth refresh --hostname github.com --scopes repo,workflow
fi
gh auth setup-git --hostname github.com
SOURCE=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
[ -f "$SOURCE/site/config.json" ] && [ -f "$SOURCE/.github/workflows/pages.yml" ] || { echo 'Распакуй весь архив и запускай скрипт из него.'; exit 1; }
# Read repo list rather than treating every API/network error as a missing repo.
EXISTS=$(gh api --paginate 'user/repos?per_page=100&affiliation=owner' --jq '.[].full_name' | awk -v repo="$FULL" 'tolower($0)==tolower(repo){print $0}')
if [ -n "$EXISTS" ]; then
  if [ -n "$(git ls-remote "https://github.com/$FULL.git")" ]; then
    echo "Репозиторий $FULL уже содержит историю. Скрипт остановлен, чтобы сохранить существующий сайт."
    exit 1
  fi
else
  gh repo create "$FULL" --public --description 'VicTim — GitHub activity and Android ROM downloads'
fi
WORK=$(mktemp -d "$HOME/victim-pages-publish.XXXXXX")
cp -R "$SOURCE/." "$WORK/"
cd "$WORK"
# Generated files are built by Actions, not committed.
cat > .gitignore <<'EOF'
dist/
node_modules/
.env
.env.*
EOF
git init -b main
git config user.name "$OWNER"
git config user.email "$OWNER@users.noreply.github.com"
git add .
git commit -m 'Publish neon GitHub dashboard and ROM catalog'
git remote add origin "https://github.com/$FULL.git"
git push -u origin main
if gh api "repos/$FULL/pages" >/dev/null 2>pages-error.txt; then
  gh api --method PUT "repos/$FULL/pages" -f build_type=workflow >/dev/null
else
  # Only a genuine 404 allows creation; authorization/network failures stop here.
  if ! grep -q 'HTTP 404' pages-error.txt; then cat pages-error.txt >&2; exit 1; fi
  gh api --method POST "repos/$FULL/pages" -f build_type=workflow >/dev/null
fi
rm -f pages-error.txt
# Explicit dispatch after Pages is enabled avoids the initial push/setup race.
DISPATCHED=0
for attempt in 1 2 3 4 5 6; do
  if gh workflow run pages.yml --repo "$FULL" --ref main; then DISPATCHED=1; break; fi
  sleep 5
done
[ "$DISPATCHED" = 1 ] || { echo "Запусти workflow вручную: https://github.com/$FULL/actions"; exit 1; }
RUN_ID=''
for attempt in 1 2 3 4 5 6; do
  RUN_ID=$(gh run list --repo "$FULL" --workflow pages.yml --event workflow_dispatch --branch main --limit 1 --json databaseId --jq '.[0].databaseId // empty')
  [ -n "$RUN_ID" ] && break
  sleep 5
done
[ -n "$RUN_ID" ] || { echo "Публикация запущена. Проверь https://github.com/$FULL/actions"; exit 0; }
echo 'Ожидание сборки и публикации…'
if ! gh run watch "$RUN_ID" --repo "$FULL" --exit-status; then
  gh run view "$RUN_ID" --repo "$FULL" --log-failed
  echo "Сборка не завершилась успешно. Логи: https://github.com/$FULL/actions/runs/$RUN_ID"
  exit 1
fi
printf '\nСайт опубликован: https://1victim1.github.io/\nИсходники: %s\n' "$WORK"
