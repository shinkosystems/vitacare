#!/usr/bin/env bash
# ==============================================================================
# SCRIPT DE BACKUP SOBERANO & CRIPTOGRAFIA AES-256 — VITACARE OCUPACIONAL
# ==============================================================================
# Execução: Diária às 03:00 UTC via cron dentro do container vitacare-backup
# Retenção: 14 dias locais + criptografia ponta a ponta
# ==============================================================================

set -euo pipefail

TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_DIR="/backups"
RAW_FILE="${BACKUP_DIR}/vitacare_${TIMESTAMP}.sql.gz"
ENC_FILE="${BACKUP_DIR}/vitacare_${TIMESTAMP}.sql.gz.enc"

echo "[$(date '+%Y-%m-%d %H:%M:%S')] [VitaCare Backup] Iniciando dump do banco ${PGDATABASE}..."

# 1. Dump comprimido
pg_dump -h "${PGHOST}" -U "${PGUSER}" -d "${PGDATABASE}" --clean --if-exists | gzip -9 > "${RAW_FILE}"

# 2. Criptografia simétrica AES-256-CBC com OpenSSL
if [ -n "${BACKUP_ENCRYPTION_KEY:-}" ]; then
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] [VitaCare Backup] Criptografando com AES-256-CBC..."
  openssl enc -aes-256-cbc -salt -pbkdf2 -iter 100000 \
    -in "${RAW_FILE}" \
    -out "${ENC_FILE}" \
    -pass pass:"${BACKUP_ENCRYPTION_KEY}"
  
  # Remove o dump não criptografado imediatamente
  rm -f "${RAW_FILE}"
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] [VitaCare Backup] Sucesso: ${ENC_FILE} ($(du -h "${ENC_FILE}" | cut -f1))"
else
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] [VitaCare Backup] AVISO: BACKUP_ENCRYPTION_KEY não configurada. Arquivo salvo sem encriptação."
fi

# 3. Limpeza de backups com mais de 14 dias
find "${BACKUP_DIR}" -type f -name "vitacare_*.enc" -mtime +14 -delete 2>/dev/null || true
find "${BACKUP_DIR}" -type f -name "vitacare_*.sql.gz" -mtime +14 -delete 2>/dev/null || true

echo "[$(date '+%Y-%m-%d %H:%M:%S')] [VitaCare Backup] Rotina finalizada com sucesso."
