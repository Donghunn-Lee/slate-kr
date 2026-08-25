"use client";

import { useEffect } from "react";

type GlobalErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

const styles = `
  html, body { margin: 0; padding: 0; }
  body {
    background: #fafaf7;
    color: #2a2c3a;
    font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1rem;
    box-sizing: border-box;
  }
  .ge-panel {
    max-width: 32rem;
    width: 100%;
    padding: 2rem;
    border: 1px solid #d8d6cf;
    border-radius: 0.5rem;
    text-align: center;
  }
  .ge-title { font-size: 1.25rem; margin: 0 0 0.75rem; font-weight: 600; }
  .ge-desc { color: #6b6d7a; margin: 0 0 1.5rem; font-size: 0.9rem; line-height: 1.55; }
  .ge-btn {
    background: #2a2c3a;
    color: #fafaf7;
    border: 0;
    border-radius: 0.375rem;
    padding: 0.55rem 1.1rem;
    font-size: 0.9rem;
    font-weight: 500;
    cursor: pointer;
    font-family: inherit;
  }
  .ge-btn:hover { opacity: 0.85; }
  @media (prefers-color-scheme: dark) {
    body { background: #211f19; color: #eeece7; }
    .ge-panel { border-color: #3b3934; }
    .ge-desc { color: #a4a5ae; }
    .ge-btn { background: #eeece7; color: #211f19; }
  }
`;

export default function GlobalError({ error, reset }: GlobalErrorProps) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="ko">
      <body>
        <title>오류 · SlateKR</title>
        <style>{styles}</style>
        <div className="ge-panel">
          <h1 className="ge-title">페이지를 표시할 수 없습니다</h1>
          <p className="ge-desc">일시적인 오류가 발생했습니다. 새로고침해 주세요.</p>
          <button type="button" className="ge-btn" onClick={reset}>
            새로고침
          </button>
        </div>
      </body>
    </html>
  );
}
