#!/bin/bash

# Dừng script ngay lập tức nếu có bất kỳ lệnh nào bị lỗi (exit code khác 0)
set -e

# --- Cấu hình ---
IMAGE_NAME="quangkhaidev/mc"
TAG="vps-monitoring"
SERVER_USER="root"
SERVER_IP="103.47.226.31"
export SSHPASS="6zL2LEtD7qcbCOAF"
REMOTE_PATH="/root/dev"

echo "🚀 Step 1: Bắt đầu build và push multi-platform..."
# Nếu build lỗi, script sẽ dừng tại đây
docker buildx build --platform linux/amd64,linux/arm64 -t $IMAGE_NAME:$TAG --push .

echo "🌐 Step 2: Kết nối tới server để deploy..."
# Sử dụng sshpass để tự điền mật khẩu
sshpass -e ssh -o StrictHostKeyChecking=no ${SERVER_USER}@${SERVER_IP} << EOF
    set -e
    cd ${REMOTE_PATH}
    echo "⬇️ Đang pull image..."
    docker compose pull
    echo "🆙 Đang khởi động lại container..."
    docker compose up -d
    echo "✅ Deploy thành công!"
EOF
