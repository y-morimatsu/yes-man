#!/bin/bash
# Lambda Web Adapter bootstrap for FastAPI (apps/api).
#
# AWS Lambda Web Adapter (LWA) Layer attach 後、Lambda の handler を `run.sh`
# に指定 + `AWS_LAMBDA_EXEC_WRAPPER=/opt/bootstrap` で起動.
# - LWA bootstrap が PORT (default 8080) を listen するプロセスを起動
# - uvicorn が PORT で FastAPI app を serve
# - Lambda invoke は LWA が HTTP リクエストに変換して uvicorn に proxy
#
# https://github.com/awslabs/aws-lambda-web-adapter
set -euo pipefail

# LWA は PORT 環境変数で listen port を決める. default 8080 だが Lambda 側で
# 明示的にしておく (env var 設定漏れ時の fallback).
export PORT="${PORT:-8080}"

# Lambda の /var/task は read-only な場所. Python の site-packages は同じく
# /var/task 配下 (zip 展開先). uvicorn は yesman_api.main:app を import する.
exec python -m uvicorn yesman_api.main:app \
    --host 0.0.0.0 \
    --port "${PORT}" \
    --no-access-log \
    --workers 1
