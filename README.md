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
    match /weeks/{docId} {
      allow read: if true;
      allow write: if request.auth != null;
    }
    match /months/{docId} {
      allow read: if true;
      allow write: if request.auth != null;
    }
    match /announcements/{docId} {
      allow read: if true;
      allow write: if request.auth != null;
    }
    match /comments/{docId} {
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

## 4. 관리자 빌더 (`admin/`)

팀원·주차·공지를 관리하는 화면은 `admin/index.html`에 따로 있어요.
공개 사이트(`index.html`)와는 별개 페이지라 링크로 연결돼 있지 않고,
주소를 직접 아는 사람만 들어갈 수 있어요.

1. `admin/app.js` 맨 위의 `ADMIN_PASSCODE` 값을 **배포 전에 꼭 바꾸세요.**
   (예: `"chapn-admin-2026"` → 운영진만 아는 문구로)
2. 로컬에서 열어보려면 메인 사이트와 같은 서버로 `http://localhost:8000/admin/` 접속
3. 배포 후에는 `https://<도메인>/admin/` 으로 접속 — 별도 안내 없이 이 주소를 아는
   사람만 씁니다.

탭 구성:
- **팀원 관리**: 이름·PIN·폴더 색상 추가/삭제. 이름/PIN은 입력 후 다른 곳을
  클릭하면(blur) 자동 저장되고, 색상은 슬라이더를 움직이는 즉시 저장돼요.
- **주차 관리 / 월 관리**: 완전히 같은 방식이에요. 각 주차(또는 월)의 이름·
  시작일·종료일을 자유롭게 수정, 새로 추가/삭제. 날짜는 커스텀 달력에서
  고르는 즉시 저장되고 달력이 자동으로 닫혀요.
- **주차별 작성 현황 / 월간 작성 현황**: 팀원 × 주차(또는 월) 표로 누가
  작성했는지 한눈에 보여요.
- **공지 빌더**: 목록 · 편집 2단 구성. 텍스트 블록과 사진 블록을 순서대로
  쌓아서 공지를 만들면, 저장 즉시 공개 사이트 Overview 화면에 문서 아이콘으로
  나타나요.

**⚠️ 보안 관련**: `members`와 마찬가지로 `weeks`, `months`, `announcements`
컬렉션도 Firestore 규칙상 읽기가 열려 있어야 공개 사이트가 실시간으로 읽을
수 있어요. `admin/` 페이지 자체는 위 암호로만 막혀 있는 구조라, URL과 암호가
새어나가지 않게 관리해주세요.

## 5. 데이터 구조 참고

**`members`** — 팀원 한 명당 문서 하나: `name`(string), `pin`(4자리 string),
`color`({h,s,l}, 폴더 아이콘 색), `createdAt`(timestamp)

**`weeks`** / **`months`** — 완전히 같은 구조, 컬렉션만 달라요. 주차(또는 월)
하나당 문서 하나, 문서 ID는 `n`과 같은 문자열(예: `"1"`): `n`(number),
`label`(string, 예: `1주차`/`1월`), `start`/`end`(`YYYY-MM-DD` string)

**`retrospectives`** — 회고 한 건당 문서 하나. 주차 회고는 문서 ID
`w{주차번호}_{이름}`(예: `w1_김영서`, `week`(number) 필드 포함), 월간 회고는
`m{월번호}_{이름}`(예: `m1_김영서`, `month`(number) 필드 포함). 공통 필드:
`person`(string), `keep`/`problem`/`try`(string, 각각 Keep/Problem/Try 칸),
`share`(string, 공유 링크 칸 — http/https URL이면 열람 화면에서 하이퍼링크로 표시),
`photos`(array\<{src, caption}\>, src는 base64 data URL), `updatedAt`(timestamp)

**`comments`** — 댓글/답글 한 건당 문서 하나: `entryId`(string, 위
`retrospectives` 문서 ID와 동일한 값), `author`(string, 작성자 이름),
`content`(string), `parentId`(string 또는 null — null이면 최상위 댓글, 값이
있으면 그 댓글의 답글), `createdAt`/`updatedAt`(timestamp)

**`announcements`** — 공지 한 건당 문서 하나: `title`(string), `blocks`(array,
각 항목은 `{type:'text', content}` 또는 `{type:'image', src, caption}`),
`month`(number 또는 null — null/미설정이면 전체 공지로 Overview에 노출,
값이 있으면 해당 월 페이지 상단에만 노출), `createdAt`/`updatedAt`(timestamp)

이 구조는 `store.js` 하나에 다 구현되어 있고, 공개 사이트(`app.js`)와
관리자 빌더(`admin/app.js`, `admin/builder.js`) 둘 다 같은 `store.js`를
가져다 씁니다.

## 6. 주차/월 추가하기

주차와 월은 기본값 없이 완전히 빈 상태로 시작해요. 관리자 빌더의
"주차 관리"/"월 관리" 탭에서 이름·시작일·종료일을 입력해 하나씩 추가하면
됩니다. (`config.js`의 `FIRST_WEEK_START`/`WEEK_COUNT`는 데모 모드가 처음
켜질 때 예시 데이터를 만드는 용도로만 남아있어요.)

## 7. GitHub Pages / Vercel로 배포하기

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

### Vercel에 같이 연결하기 (선택)

1. https://vercel.com → GitHub 계정으로 로그인 → **Add New... → Project**
2. 저장소 목록에서 이 레포 선택 → Import
3. Framework Preset은 **Other**, Root Directory는 `./` 그대로 두고 **Deploy**

빌드 과정이 없는 순수 정적 사이트라 설정은 이게 끝이에요. GitHub main
브랜치에 푸시할 때마다 GitHub Pages와 Vercel 둘 다 자동으로 재배포됩니다.
같은 `firebase-config.js`를 보고 있어서 데이터도 그대로 공유돼요. 다만
13명에게는 두 주소 중 **하나만 골라서** 알려주는 걸 추천해요 — 안 그러면
누구는 이 주소, 누구는 저 주소로 들어와서 헷갈릴 수 있어요.

이후 13명에게는 이 도메인(또는 github.io 주소)만 알려주면 됩니다.
