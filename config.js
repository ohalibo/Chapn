// 회고록 기본 설정. 필요하면 숫자/날짜만 바꿔서 주차를 늘리세요.
export const FIRST_WEEK_START = "2026-07-01"; // 1주차 시작일 (월요일 기준 아님, 노션 표와 동일)
export const WEEK_COUNT = 12;

// 한 회고에 첨부할 수 있는 사진 장수 / 용량 가드 (Firestore 문서 1개 최대 1MB 제한 때문)
export const MAX_PHOTOS = 6;
export const MAX_PHOTO_BASE64_TOTAL = 700000; // 대략 700KB 상당의 문자 수
export const PHOTO_MAX_WIDTH = 1000;
export const PHOTO_JPEG_QUALITY = 0.72;

export function getWeeks() {
  const start = parseDate(FIRST_WEEK_START);
  const weeks = [];
  for (let n = 1; n <= WEEK_COUNT; n++) {
    const weekStart = addDays(start, (n - 1) * 7);
    const weekEnd = addDays(weekStart, 6);
    weeks.push({
      n,
      start: weekStart,
      end: weekEnd,
      label: `${n}주차`,
      range: `${formatMD(weekStart)} - ${formatMD(weekEnd)}`,
    });
  }
  return weeks;
}

function parseDate(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function formatMD(date) {
  return `${date.getMonth() + 1}.${date.getDate()}`;
}
