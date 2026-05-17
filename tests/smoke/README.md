# tests/smoke — deploy 後 sanity check

## 実行

```bash
# Local
bash tests/smoke/smoke.sh

# Prod
API_URL=https://api.yesman.example.com \
WEB_URL=https://yesman.example.com \
  bash tests/smoke/smoke.sh
```

## 検証内容

1. `${API}/health` が 200
2. `${API}/v1/profiles/me` が 401/403 (認証必須確認)
3. `${WEB}/` が `<title>YesMan</title>` 含む

CI では `pr-test.yml` の最後の step で実行 (Mock backend で local sanity)、
prod deploy 後は `deploy-web.yml` の post-deploy step で実行。
