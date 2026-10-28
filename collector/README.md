# collector

SlateKR의 데이터 수집 스크립트입니다. KIS(시세 · 지수 · 분봉) · DART(재무 · 배당 · 기업 코드) · FSS(종목 목록) · KRX(상장주식수 · 상장일)에서 수집해 Neon(PostgreSQL)에 적재합니다.

## 수집 주기

| 주기 | 수집 항목                                                                                      |
| ---- | ---------------------------------------------------------------------------------------------- |
| 일일 | 종목 목록 · 일봉(종목 · 국내 지수 · 해외 지수) · 주식 수 · 거래일 캘린더 · 마감 후 시세 스냅샷 |
| 장중 | 국내 · 해외 지수 분봉, 30분 주기                                                               |
| 주간 | 재무제표 · 배당 · 상장일                                                                       |

GitHub Actions 수집 워크플로우 6개는 전부 `workflow_dispatch`이고 cron-job.org가 트리거합니다. `schedule` 이벤트는 지연 · 드롭이 있어 사용하지 않습니다.

## 일봉 기준

종목 일봉은 애프터마켓 체결을 포함한 KRX 20:00 마감 캔들이고, 거래일 20:12 KIS 시세로 적재합니다. 등락률은 전일 정규장 종가 기준입니다. 네이버 차트와는 일부 종목에서 거래량 · 종가가 다를 수 있습니다.

## 기업행위와 백필

- 분할 · 병합 같은 기업행위로 기준가가 직전 봉 범위를 벗어난 종목은, Daily가 네 가지 검증(KIS 수정주가 반영 · 재적재 전후 비율 일치 · 사건 비율 · 구간 안 비율 단일)을 전부 통과한 건만 과거 일봉을 재적재 · rescale하고 처리 이력 테이블(원장)에 기록합니다.
- 거절 건과 결손 보충은 백필 스크립트로 수동 실행합니다: `backfill_prices.py` 결손 채움 · `backfill_prices_kis.py` 수정주가 · `backfill_index_prices.py` 국내 지수 · `backfill_overseas_index_prices.py` 해외 지수 · `fetch_prices.py` 과거 증분.

`backfill_prices.py`는 수집 워크플로우에 없는 pykrx를 쓰므로, 이 스크립트로 백필할 때만 아래 명령으로 설치합니다.

```bash
pip install -r requirements-backfill.txt
```

## 테스트

```bash
pip install -r requirements.txt
python -m unittest discover -s tests
```
