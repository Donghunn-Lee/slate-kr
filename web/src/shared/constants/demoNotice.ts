// 첫 방문 안내 카드의 닫음 기록. DemoNotice(읽기 · 쓰기)와 루트 layout 의 인라인 스크립트(읽기)가 이 값만 참조한다.
export const DEMO_NOTICE_STORAGE_KEY = "slatekr_demo_notice";
// 문구를 바꾸면 올린다 — 이전 버전을 닫은 방문자에게도 다시 뜬다.
export const DEMO_NOTICE_VERSION = "v1";

// <body> 맨 앞에서 파서가 동기 실행한다 — 카드보다 먼저 속성이 붙어 닫은 방문자에게는 첫 페인트부터 숨겨진다.
// 속성 이름은 DemoNotice 의 in-data-demo-notice-seen:hidden 과 짝이다.
// 저장소가 막힌 브라우저는 접근 자체가 throw 한다 — 속성 없이 둬 카드를 연다.
export const DEMO_NOTICE_SEEN_SCRIPT = `try{if(localStorage.getItem(${JSON.stringify(DEMO_NOTICE_STORAGE_KEY)})===${JSON.stringify(DEMO_NOTICE_VERSION)})document.documentElement.setAttribute("data-demo-notice-seen","")}catch(e){}`;
