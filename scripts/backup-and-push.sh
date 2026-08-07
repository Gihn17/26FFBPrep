#!/bin/bash
# Snapshots the live app's data (via the running container's SQLite DB) to
# readable JSON and commits it to git — so it survives a lost Docker volume
# and is readable by a future Claude Code session without live server
# access. Run by cron nightly, or manually via `npm run backup`.
set -euo pipefail
cd "$(dirname "$0")/.."

mkdir -p backups
docker exec ffb-draft-prep node server/backup.js > backups/latest.json

if git diff --quiet -- backups/latest.json; then
  echo "No data changes since last backup — nothing to commit."
  exit 0
fi

git add backups/latest.json
git commit -m "Automated data backup $(date -u +%Y-%m-%dT%H:%M:%SZ)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
git push
