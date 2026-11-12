// 가상 시세 생성기의 난수 기반. 같은 입력 → 같은 값이 서버·클라이언트·재배포 어디서든
// 성립해야 하므로 Math.random 을 쓰지 않고 시드 해시 + 결정론 PRNG 로만 뽑는다.

// FNV-1a 32bit. 부분들을 "|" 로 이어 붙여 ("A", "B") 와 ("AB", "") 가 같은 시드가 되지 않게 한다.
export const hashSeed = (...parts: (string | number)[]): number => {
  const s = parts.join("|");
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
};

// mulberry32 — 32bit 상태 하나로 충분한 품질, 분당 수천 번 호출해도 싸다.
export const createRng = (seed: number): (() => number) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

// Box-Muller. 1 − u 로 log(0) 을 피한다(u ∈ [0,1)).
export const gaussian = (rng: () => number): number => {
  const u = 1 - rng();
  const v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
};

// Box-Muller 는 한 번에 정규 난수 둘을 만든다 — 분봉처럼 수십만 번 뽑는 경로는 짝을 버리지 않고 캐시한다.
export const createGaussian = (rng: () => number): (() => number) => {
  let spare: number | null = null;
  return () => {
    if (spare !== null) {
      const z = spare;
      spare = null;
      return z;
    }
    const radius = Math.sqrt(-2 * Math.log(1 - rng()));
    const angle = 2 * Math.PI * rng();
    spare = radius * Math.sin(angle);
    return radius * Math.cos(angle);
  };
};

export const logUniform = (rng: () => number, min: number, max: number): number =>
  Math.exp(Math.log(min) + (Math.log(max) - Math.log(min)) * rng());
