// Firebase 프로젝트를 만든 뒤, 콘솔의 "프로젝트 설정 > 내 앱"에서 나오는
// firebaseConfig 값을 아래에 그대로 붙여넣으세요. (README.md 참고)
//
// 값을 채우기 전까지는 이 사이트가 "데모 모드"로 동작합니다.
// 데모 모드에서는 이 브라우저(내 컴퓨터)에만 데이터가 저장되고,
// 다른 사람과는 공유되지 않아요. 구조와 화면을 미리 확인하는 용도입니다.

export const firebaseConfig = {
  apiKey: "AIzaSyAHRPUDLunCfLhhF-FizobkzxEelF9TyC0",
  authDomain: "chaptern.firebaseapp.com",
  projectId: "chaptern",
  storageBucket: "chaptern.firebasestorage.app",
  messagingSenderId: "711845284344",
  appId: "1:711845284344:web:8e46a9ee2addcbbbf82e0d",
};

export const isFirebaseConfigured =
  !!firebaseConfig.apiKey && firebaseConfig.apiKey !== "YOUR_API_KEY";
