#!/usr/bin/env bash
# ==============================================================================
# SHINKŌ SYSTEMS — SCRIPT DE DEPLOY DO SILO SOBERANO VITACARE
# VPS: 179.198.125.140 | Destino: /opt/vitacare
# ==============================================================================

set -euo pipefail

VPS_HOST="root@179.198.125.140"
REMOTE_DIR="/opt/vitacare"
LOCAL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "🚀 [1/4] Criando estrutura de diretórios na VPS (${REMOTE_DIR})..."
ssh "${VPS_HOST}" "mkdir -p ${REMOTE_DIR}/infra ${REMOTE_DIR}/data/postgres ${REMOTE_DIR}/data/waha ${REMOTE_DIR}/backups"

echo "📦 [2/4] Sincronizando arquivos de configuração e orquestração..."
scp "${LOCAL_DIR}/infra/docker-compose.vitacare.yml" "${VPS_HOST}:${REMOTE_DIR}/infra/docker-compose.yml"
scp "${LOCAL_DIR}/infra/backup-soberano.sh" "${VPS_HOST}:${REMOTE_DIR}/infra/backup-soberano.sh"

# Se o .env de produção ainda não existir na VPS, copia o template .env.example
ssh "${VPS_HOST}" "[ -f ${REMOTE_DIR}/infra/.env ] || cp ${REMOTE_DIR}/infra/docker-compose.yml ${REMOTE_DIR}/infra/.env" 2>/dev/null || true
scp "${LOCAL_DIR}/infra/.env.example" "${VPS_HOST}:${REMOTE_DIR}/infra/.env.example"

echo "🔐 [3/4] Ajustando permissões estritas de segurança (chmod 700)..."
ssh "${VPS_HOST}" "chmod +x ${REMOTE_DIR}/infra/backup-soberano.sh && chmod -R 700 ${REMOTE_DIR}/data ${REMOTE_DIR}/backups"

echo "⚡ [4/4] Inicializando contêineres do Silo VitaCare..."
ssh "${VPS_HOST}" "cd ${REMOTE_DIR}/infra && docker compose up -d"

echo ""
echo "✅ Deploy do Silo VitaCare finalizado com sucesso na VPS Soberana!"
echo "   Status dos contêineres:"
ssh "${VPS_HOST}" "docker ps --filter 'name=vitacare' --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'"
