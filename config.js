// 회고록 기본 설정.
// 주차 날짜는 이제 관리자 빌더(admin/)에서 편집한 값이 우선이고,
// 여기 FIRST_WEEK_START / WEEK_COUNT는 "처음 한 번 기본값 채우기"용 시드입니다.
export const FIRST_WEEK_START = "2026-07-01";
export const WEEK_COUNT = 12;

// 한 회고에 첨부할 수 있는 사진 장수 / 용량 가드 (Firestore 문서 1개 최대 1MB 제한 때문)
export const MAX_PHOTOS = 6;
export const MAX_PHOTO_BASE64_TOTAL = 700000; // 대략 700KB 상당의 문자 수
export const PHOTO_MAX_WIDTH = 1000;
export const PHOTO_JPEG_QUALITY = 0.72;

// 팀원 폴더 색상 (관리자 빌더의 컬러 피커, 공개 사이트의 폴더 아이콘이 함께 씀)
export const DEFAULT_MEMBER_COLOR = { h: 208, s: 65, l: 60 };

export function hslToHex(h, s, l) {
  s /= 100;
  l /= 100;
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const toHex = (x) => Math.round(255 * x).toString(16).padStart(2, "0");
  return `#${toHex(f(0))}${toHex(f(8))}${toHex(f(4))}`.toUpperCase();
}

export function parseISO(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function toISO(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function formatMD(date) {
  return `${date.getMonth() + 1}.${date.getDate()}`;
}

export function formatRange(startISO, endISO) {
  if (!startISO || !endISO) return "";
  return `${formatMD(parseISO(startISO))} - ${formatMD(parseISO(endISO))}`;
}

// 관리자가 "기본값으로 채우기"를 누르거나, 데모 모드가 처음 초기화될 때 쓰는 시드 데이터.
export function defaultWeeksSeed() {
  const start = parseISO(FIRST_WEEK_START);
  const weeks = [];
  for (let n = 1; n <= WEEK_COUNT; n++) {
    const weekStart = addDays(start, (n - 1) * 7);
    const weekEnd = addDays(weekStart, 6);
    weeks.push({
      id: String(n),
      n,
      label: `${n}주차`,
      start: toISO(weekStart),
      end: toISO(weekEnd),
    });
  }
  return weeks;
}
