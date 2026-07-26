import { firebaseConfig, isFirebaseConfigured } from "./firebase-config.js";

// 이 파일은 "데모 모드(로컬 브라우저 저장)"와 "실서비스 모드(Firebase)"를
// 똑같은 함수 이름으로 감싸주는 어댑터입니다. app.js / admin.js는 store가
// 어느 모드인지 몰라도 되게 짜여 있어요.

let storePromise = null;

export function getStore() {
  if (!storePromise) {
    storePromise = isFirebaseConfigured ? createFirestoreStore() : createLocalStore();
  }
  return storePromise;
}

// ---------------------------------------------------------------------------
// 데모 모드: localStorage. 이 브라우저에서만 보이고, 다른 사람과 공유되지 않음.
// ---------------------------------------------------------------------------
function createLocalStore() {
  const KEY = "chapn_demo_v1";
  const listeners = { members: new Set(), entries: new Set() };

  function seed() {
    return {
      members: [
        { id: "seed-1", name: "김영서", pin: "1111", createdAt: Date.now() - 2000 },
        { id: "seed-2", name: "남현아", pin: "2222", createdAt: Date.now() - 1000 },
      ],
      entries: {
        w1_김영서: {
          week: 1,
          person: "김영서",
          date: "2026-07-05",
          content:
            "Keep - 나의 가치찾기 한 것: 진심으로 사랑하며 자유롭게 꿈꾸는 사람\nProblem - 애들 성적 입력이 계속 밀렸다\nTry - 다음 주엔 화장대부터 정리해보기",
          photos: [],
          updatedAt: Date.now() - 1000 * 60 * 60 * 5,
        },
        w1_남현아: {
          week: 1,
          person: "남현아",
          date: "2026-07-06",
          content:
            "Keep - 인스타/블로그에 회고록 적으며 나를 위한 시간 갖기\nProblem - 시도와 도전을 구분 못하고 미루기만 함\nTry - 다들 20분씩 투자해보기, 궁금한 것 물어보기",
          photos: [],
          updatedAt: Date.now() - 1000 * 60 * 60 * 3,
        },
      },
    };
  }

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) throw new Error("empty");
      return JSON.parse(raw);
    } catch {
      const data = seed();
      save(data);
      return data;
    }
  }

  function save(data) {
    localStorage.setItem(KEY, JSON.stringify(data));
  }

  function notify(kind) {
    listeners[kind].forEach((cb) => cb(load()));
  }

  window.addEventListener("storage", (e) => {
    if (e.key === KEY) {
      listeners.members.forEach((cb) => cb(load()));
      listeners.entries.forEach((cb) => cb(load()));
    }
  });

  return {
    mode: "demo",

    subscribeMembers(cb) {
      const handler = (data) =>
        cb([...data.members].sort((a, b) => a.createdAt - b.createdAt));
      handler(load());
      listeners.members.add(handler);
      return () => listeners.members.delete(handler);
    },

    async addMember(name, pin) {
      const data = load();
      if (data.members.some((m) => m.pin === pin)) {
        return { ok: false, error: "이미 사용 중인 번호예요." };
      }
      data.members.push({ id: `m-${Date.now()}`, name, pin, createdAt: Date.now() });
      save(data);
      notify("members");
      return { ok: true };
    },

    async deleteMember(id) {
      const data = load();
      data.members = data.members.filter((m) => m.id !== id);
      save(data);
      notify("members");
    },

    async verifyPin(pin) {
      const data = load();
      return data.members.find((m) => m.pin === pin) || null;
    },

    subscribeEntry(week, person, cb) {
      const id = `w${week}_${person}`;
      const handler = (data) => cb(data.entries[id] || null);
      handler(load());
      listeners.entries.add(handler);
      return () => listeners.entries.delete(handler);
    },

    async saveEntry(week, person, entry) {
      const data = load();
      const id = `w${week}_${person}`;
      data.entries[id] = { week, person, ...entry, updatedAt: Date.now() };
      save(data);
      notify("entries");
    },

    subscribeAllEntries(cb) {
      const handler = (data) => cb(new Map(Object.entries(data.entries)));
      handler(load());
      listeners.entries.add(handler);
      return () => listeners.entries.delete(handler);
    },
  };
}

// ---------------------------------------------------------------------------
// 실서비스 모드: Firebase Firestore. 13명 모두에게 실시간으로 공유됨.
// ---------------------------------------------------------------------------
async function createFirestoreStore() {
  const { initializeApp } = await import(
    "https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js"
  );
  const {
    getFirestore,
    collection,
    doc,
    onSnapshot,
    setDoc,
    addDoc,
    deleteDoc,
    query,
    where,
    limit,
    getDocs,
    serverTimestamp,
  } = await import("https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js");
  const { getAuth, signInAnonymously, onAuthStateChanged } = await import(
    "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js"
  );

  const app = initializeApp(firebaseConfig);
  const db = getFirestore(app);
  const auth = getAuth(app);

  await new Promise((resolve, reject) => {
    onAuthStateChanged(auth, (user) => {
      if (user) resolve(user);
    });
    signInAnonymously(auth).catch(reject);
  });

  const membersCol = collection(db, "members");
  const entriesCol = collection(db, "retrospectives");

  return {
    mode: "live",

    subscribeMembers(cb) {
      return onSnapshot(membersCol, (snap) => {
        const list = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .sort((a, b) => (a.createdAt?.toMillis?.() ?? 0) - (b.createdAt?.toMillis?.() ?? 0));
        cb(list);
      });
    },

    async addMember(name, pin) {
      const dupe = await getDocs(query(membersCol, where("pin", "==", pin), limit(1)));
      if (!dupe.empty) return { ok: false, error: "이미 사용 중인 번호예요." };
      await addDoc(membersCol, { name, pin, createdAt: serverTimestamp() });
      return { ok: true };
    },

    async deleteMember(id) {
      await deleteDoc(doc(db, "members", id));
    },

    async verifyPin(pin) {
      const snap = await getDocs(query(membersCol, where("pin", "==", pin), limit(1)));
      if (snap.empty) return null;
      const d = snap.docs[0];
      return { id: d.id, ...d.data() };
    },

    subscribeEntry(week, person, cb) {
      const id = `w${week}_${person}`;
      return onSnapshot(doc(db, "retrospectives", id), (snap) => {
        cb(snap.exists() ? snap.data() : null);
      });
    },

    async saveEntry(week, person, entry) {
      const id = `w${week}_${person}`;
      await setDoc(
        doc(db, "retrospectives", id),
        { week, person, ...entry, updatedAt: serverTimestamp() },
        { merge: true }
      );
    },

    subscribeAllEntries(cb) {
      return onSnapshot(entriesCol, (snap) => {
        const map = new Map();
        snap.docs.forEach((d) => map.set(d.id, d.data()));
        cb(map);
      });
    },
  };
}
