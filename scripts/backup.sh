#!/usr/bin/env bash
# Snapshot every Postgres + MinIO volume → ./backups/<timestamp>/
set -euo pipefail
ts=$(date +%Y%m%d-%H%M%S)
out="backups/$ts"
mkdir -p "$out"
echo "▸ Backing up to $out"
for c in $(docker ps --format '{{.Names}}' | grep -E 'postgres|db'); do
  echo "  · $c"
  docker exec "$c" pg_dumpall -U postgres > "$out/${c}.sql" 2>/dev/null || true
done
docker run --rm -v oss_minio_data:/data -v "$PWD/$out":/out alpine \
  sh -c 'tar -czf /out/minio.tgz -C /data .' 2>/dev/null || true
echo "✓ Backup done: $out"
echo "  Tip: rclone copy $out remote:oss-empire-backups/$ts"
