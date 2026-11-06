# collector

SlateKR의 데이터 수집 스크립트입니다. DART(종목 목록 · 주식 수 · 재무제표 · 배당)에서 수집해 Neon(PostgreSQL)에 적재합니다.

## 수집 주기

| 주기 | 수집 항목                             |
| ---- | ------------------------------------- |
| 주간 | 종목 목록 · 재무제표 · 배당 · 주식 수 |

GitHub Actions 수집 워크플로우(Weekly)는 `workflow_dispatch`이고 cron-job.org가 트리거합니다. `schedule` 이벤트는 지연 · 드롭이 있어 사용하지 않습니다.

## 외화 재무

재무제표를 원화가 아닌 통화로 공시하는 종목은 `stocks.reporting_currency`에 등록하고 재무 수치를 NULL로 격리합니다. Weekly가 새로 발견한 종목은 세 조건(같은 공시 안 단일 통화 · 직전 보고서도 같은 통화 · run당 3건 이하)을 전부 통과한 건만 한 트랜잭션으로 격리 · 등록하고, 적용한 SQL과 변경 전 스냅샷을 run artifact에 남깁니다. 거절된 건은 `web/sql/isolate_non_krw_ticker.sql`로 수동 처리합니다.

## 테스트

```bash
pip install -r requirements.txt
python -m unittest discover -s tests
```
