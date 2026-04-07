# from pykrx import stock

# # 1. 종목 리스트
# print(stock.get_market_ticker_list("20250404")[:5])

# # 2. 종목명
# print(stock.get_market_ticker_name("005930"))

# # 3. 일봉
# print(stock.get_market_ohlcv("20250301", "20250404", "005930").tail())

# # 4. 시가총액
# print(stock.get_market_cap("20250301", "20250404", "005930").tail())
import requests
import json

url = "https://opendart.fss.or.kr/api/fnlttSinglAcntAll.json"
params = {
    "crtfc_key": "key",
    "corp_code": "00126380",
    "bsns_year": "2024",
    "reprt_code": "11011",
    "fs_div": "CFS"
}

res = requests.get(url, params=params)
data = res.json()

for item in data["list"]:
    print(item["account_nm"])