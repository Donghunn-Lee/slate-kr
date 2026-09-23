"""스크립트 공용 로깅 초기화. 각 스크립트의 실행 진입점에서만 호출한다.

import 시점에 호출하면 root logger 가 import 된 모듈의 로그 파일로 선점된다
(basicConfig 은 first-win). 그래서 모듈 레벨이 아니라 main() 에서 부른다.
"""
from __future__ import annotations

import logging
import os
from datetime import datetime


def setup_logging(name: str) -> None:
    """root logger 를 logs/{name}_{YYYYMMDD}.log + stderr 로 설정."""
    log_dir = os.path.join(os.path.dirname(__file__), "logs")
    os.makedirs(log_dir, exist_ok=True)
    log_file = os.path.join(
        log_dir, f"{name}_{datetime.today().strftime('%Y%m%d')}.log"
    )
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(message)s",
        handlers=[
            logging.FileHandler(log_file, encoding="utf-8"),
            logging.StreamHandler(),
        ],
    )
