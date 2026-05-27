# FastAPI on AWS Lambda (Container Image with Lambda Web Adapter).
#
# zip deploy の 250 MiB 上限を回避するため container image 方式 (10 GB まで OK).
# Lambda Web Adapter (LWA) を /opt/extensions/ に配置 → Lambda runtime API を
# HTTP に proxy. CMD で uvicorn を直接起動.
#
# https://github.com/awslabs/aws-lambda-web-adapter/tree/main/examples/python

FROM public.ecr.aws/docker/library/python:3.12-slim

# Lambda Web Adapter (extension として /opt/extensions/ に配置すれば自動 load)
COPY --from=public.ecr.aws/awsguru/aws-lambda-adapter:0.9.0 /lambda-adapter /opt/extensions/lambda-adapter

WORKDIR /var/task

# Python deps を pip install (project setuptools src layout)
COPY pyproject.toml ./
COPY src/ ./src/
RUN pip install --no-cache-dir .

# Lambda handler 用 bootstrap (uvicorn 起動)
COPY run.sh ./run.sh
RUN chmod +x ./run.sh

# LWA は AWS_LWA_PORT (default 8080) を listen するアプリを期待
ENV PORT=8080
EXPOSE 8080

# CMD で uvicorn を起動 (run.sh が wrap).
# - Lambda invoke が来ると LWA extension が HTTP request に変換して localhost:PORT に proxy
# - run.sh は exec uvicorn ... を呼ぶので PID 1 を keep alive
CMD ["./run.sh"]
