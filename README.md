# 챕터n 회고록

주차 → 팀원 → 개인 회고 3단 구조의 정적 웹 페이지. 빌드 도구 없이 순수
HTML/CSS/JS로 되어 있고, GitHub Pages에 그대로 올려서 씁니다.

## 지금 상태 (데모 모드)

`firebase-config.js`를 아직 설정하지 않았기 때문에, 지금 `index.html`을
열면 **데모 모드**로 동작합니다. 데모 모드는 이 브라우저(localStorage)에만
저장되고 다른 사람과 공유되지 않아요. 구조/디자인 확인용입니다.

- 데모 로그인 PIN: 김영서 `1111`, 남현아 `2222`
- 로컬에서 바로 열어보려면: `python3 -m http.server 8000` 실행 후
  `http://localhost:8000` 접속 (file:// 로 직접 열면 모듈 로드가 막힐 수 있어요)

실제로 13명이 각자 브라우저에서 접속해 쓰고, 서로 실시간으로 볼 수 있게
하려면 아래 순서대로 Firebase를 딱 한 번만 연결하면 됩니다. **완전
무료(Spark 요금제)**로 충분하고, 카드 등록도 필요 없어요.

## 1. Firebase 프로젝트 만들기

1. https://console.firebase.google.com 접속 → "프로젝트 추가"
2. 이름 아무거나 (예: chapn-retro) 입력 → Google Analytics는 꺼도 됨
3. 왼쪽 메뉴 **Firestore Database** → "데이터베이스 만들기" → **프로덕션 모드** →
   리전은 asia-northeast3(서울) 추천
4. 왼쪽 메뉴 **Authentication** → "시작하기" → 로그인 방법 탭에서
   **익명(Anonymous)** 사용 설정 (이건 사람이 로그인하는 화면이 아니라,
   앱이 조용히 인증 토큰만 받아서 아무나 마구 쓰기(write)하는 걸 막는
   최소한의 장치예요)
5. 왼쪽 상단 톱니바퀴 → **프로젝트 설정** → 아래로 스크롤 → "웹 앱 추가"
   (</> 아이콘) → 이름 아무거나 → 나오는 `firebaseConfig` 객체를 통째로 복사

## 2. 이 프로젝트에 설정 붙여넣기

`firebase-config.js` 파일을 열어서 복사한 값을 그대로 붙여넣으세요.

```js
export const firebaseConfig = {
  apiKey: "...",
  authDomain: "...",
  projectId: "...",
  storageBucket: "...",
  messagingSenderId: "...",
  appId: "...",
};
```

저장하면 자동으로 "실서비스 모드"로 전환됩니다.

## 3. Firestore 보안 규칙 설정

Firebase 콘솔 → Firestore Database → **규칙(Rules)** 탭에 아래 내용을
붙여넣고 게시(Publish)하세요.

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /members/{docId} {
      allow read: if true;
      allow write: if request.auth != null;
    }
    match /retrospectives/{docId} {
      allow read: if true;
      allow write: if request.auth != null;
    }
  }
}
```

**⚠️ 알아두어야 할 점**: 로그인 PIN을 클라이언트(브라우저)에서 직접
확인하는 구조라서, `members` 컬렉션은 "읽기"가 모두에게 열려 있어야
해요. 즉 마음만 먹으면 개발자도구로 13명의 PIN을 모두 볼 수 있는
정도의 보안입니다. 서버 없이 완전 무료로 만드는 한 어쩔 수 없는
트레이드오프예요 — 외부에 공개하지 않고 아는 사람들끼리만 쓰는
용도로는 충분하지만, 민감한 내용은 올리지 않는 걸 추천해요.

## 4. 데이터 구조 (직접 만드실 관리자 페이지에서 참고)

관리자 페이지는 별도로 만드신다고 하셨으니, 이 앱이 기대하는 Firestore
구조만 정리해둘게요. 이 구조에 맞춰 문서를 추가/삭제하면 그대로 연동됩니다.

**`members` 컬렉션** — 팀원 한 명당 문서 하나

| 필드 | 타입 | 설명 |
|---|---|---|
| `name` | string | 표시 이름 (예: `김영서`) |
| `pin` | string | 4자리 숫자 문자열 (예: `"1234"`), 서로 중복되면 안 됨 |
| `createdAt` | timestamp | 생성 시각 (정렬용, `serverTimestamp()` 권장) |

**`retrospectives` 컬렉션** — 회고 한 건당 문서 하나, 문서 ID는 반드시
`w{주차번호}_{이름}` 형식 (예: `w1_김영서`)이어야 이 앱에서 읽힙니다.

| 필드 | 타입 | 설명 |
|---|---|---|
| `week` | number | 주차 번호 |
| `person` | string | 이름 (members의 name과 동일해야 함) |
| `date` | string | `YYYY-MM-DD` |
| `content` | string | 회고 본문 |
| `photos` | array\<string\> | 압축된 이미지 base64 data URL 배열 |
| `updatedAt` | timestamp | 마지막 저장 시각 |

참고로 `store.js` 안에 `addMember`, `deleteMember`, `subscribeMembers`
함수가 이미 이 구조에 맞춰 구현되어 있어서, 관리자 페이지에서도
`import { getStore } from "./store.js"` 해서 그대로 재사용하실 수 있어요.

## 5. 주차 개수 / 시작일 바꾸기

`config.js`의 `FIRST_WEEK_START`, `WEEK_COUNT` 두 값만 바꾸면 됩니다.
지금은 2026-07-01부터 12주차까지 생성돼요.

## 6. GitHub Pages로 배포하기

1. 이 폴더(`chap.n`)를 GitHub 저장소로 푸시
   ```
   git init
   git add .
   git commit -m "챕터n 회고록 초기 세팅"
   git branch -M main
   git remote add origin <레포 주소>
   git push -u origin main
   ```
2. 저장소 → Settings → Pages → Source를 "Deploy from a branch",
   Branch를 `main` / `(root)`로 설정 → Save
3. 몇 분 뒤 `https://<계정>.github.io/<레포명>/` 으로 접속 가능

### 커스텀 도메인 연결 (구매한 도메인이 있다면)

1. 같은 Settings → Pages 화면의 "Custom domain"에 도메인 입력 (예: `retro.내도메인.com`)
2. 도메인 구매처(가비아, 카페24 등) DNS 설정에서 해당 서브도메인에
   `CNAME` 레코드로 `<계정>.github.io` 를 추가
3. 몇 분~몇 시간 뒤 반영되면, 아래 "Enforce HTTPS" 체크박스 켜기

이후 13명에게는 이 도메인(또는 github.io 주소)만 알려주면 됩니다.
