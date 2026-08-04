import { firebaseConfig, isFirebaseConfigured } from "./firebase-config.js";
import { defaultWeeksSeed, DEFAULT_MEMBER_COLOR } from "./config.js";

// 이 파일은 "데모 모드(로컬 브라우저 저장)"와 "실서비스 모드(Firebase)"를
// 똑같은 함수 이름으로 감싸주는 어댑터입니다. app.js / admin/*.js는 store가
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
  const listeners = {
    members: new Set(),
    entries: new Set(),
    weeks: new Set(),
    months: new Set(),
    announcements: new Set(),
    comments: new Set(),
  };

  function seed() {
    return {
      members: [
        { id: "seed-1", name: "김영서", pin: "1111", color: { h: 208, s: 65, l: 60 }, createdAt: Date.now() - 2000 },
        { id: "seed-2", name: "남현아", pin: "2222", color: { h: 340, s: 60, l: 65 }, createdAt: Date.now() - 1000 },
      ],
      weeks: defaultWeeksSeed(),
      months: [],
      announcements: [
        {
          id: "seed-a1",
          title: "챕터n 회고록 사용법",
          blocks: [
            { type: "text", content: "안녕하세요! 매주 자신의 폴더에 들어가서 회고를 남겨주세요.\n사진도 함께 첨부할 수 있어요." },
          ],
          createdAt: Date.now() - 1000 * 60 * 60,
          updatedAt: Date.now() - 1000 * 60 * 60,
        },
      ],
      entries: {
        w1_김영서: {
          week: 1,
          person: "김영서",
          date: "2026-07-05",
          keep: "나의 가치찾기 한 것: 진심으로 사랑하며 자유롭게 꿈꾸는 사람",
          problem: "애들 성적 입력이 계속 밀렸다",
          try: "다음 주엔 화장대부터 정리해보기",
          photos: [],
          updatedAt: Date.now() - 1000 * 60 * 60 * 5,
        },
        w1_남현아: {
          week: 1,
          person: "남현아",
          date: "2026-07-06",
          keep: "인스타/블로그에 회고록 적으며 나를 위한 시간 갖기",
          problem: "시도와 도전을 구분 못하고 미루기만 함",
          try: "다들 20분씩 투자해보기, 궁금한 것 물어보기",
          photos: [],
          updatedAt: Date.now() - 1000 * 60 * 60 * 3,
        },
      },
      comments: [],
    };
  }

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) throw new Error("empty");
      const data = JSON.parse(raw);
      if (!data.weeks) data.weeks = defaultWeeksSeed();
      if (!data.months) data.months = [];
      if (!data.announcements) data.announcements = [];
      if (!data.comments) data.comments = [];
      return data;
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
      Object.keys(listeners).forEach((kind) => listeners[kind].forEach((cb) => cb(load())));
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

    async addMember(name, pin, color) {
      const data = load();
      if (data.members.some((m) => m.pin === pin)) {
        return { ok: false, error: "이미 사용 중인 번호예요." };
      }
      data.members.push({
        id: `m-${Date.now()}`,
        name,
        pin,
        color: color || { ...DEFAULT_MEMBER_COLOR },
        createdAt: Date.now(),
      });
      save(data);
      notify("members");
      return { ok: true };
    },

    async updateMember(id, fields) {
      const data = load();
      if (fields.pin && data.members.some((m) => m.id !== id && m.pin === fields.pin)) {
        return { ok: false, error: "이미 사용 중인 번호예요." };
      }
      const idx = data.members.findIndex((m) => m.id === id);
      if (idx < 0) return { ok: false, error: "팀원을 찾을 수 없어요." };
      data.members[idx] = { ...data.members[idx], ...fields };
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

    subscribeMonthEntry(month, person, cb) {
      const id = `m${month}_${person}`;
      const handler = (data) => cb(data.entries[id] || null);
      handler(load());
      listeners.entries.add(handler);
      return () => listeners.entries.delete(handler);
    },

    async saveMonthEntry(month, person, entry) {
      const data = load();
      const id = `m${month}_${person}`;
      data.entries[id] = { month, person, ...entry, updatedAt: Date.now() };
      save(data);
      notify("entries");
    },

    subscribeAllEntries(cb) {
      const handler = (data) => cb(new Map(Object.entries(data.entries)));
      handler(load());
      listeners.entries.add(handler);
      return () => listeners.entries.delete(handler);
    },

    subscribeWeeks(cb) {
      const handler = (data) => cb([...data.weeks].sort((a, b) => a.n - b.n));
      handler(load());
      listeners.weeks.add(handler);
      return () => listeners.weeks.delete(handler);
    },

    async saveWeek(week) {
      const data = load();
      const id = week.id || String(week.n);
      const idx = data.weeks.findIndex((w) => w.id === id);
      const record = { ...week, id };
      if (idx >= 0) data.weeks[idx] = record;
      else data.weeks.push(record);
      save(data);
      notify("weeks");
    },

    async deleteWeek(id) {
      const data = load();
      data.weeks = data.weeks.filter((w) => w.id !== id);
      save(data);
      notify("weeks");
    },

    subscribeMonths(cb) {
      const handler = (data) => cb([...data.months].sort((a, b) => a.n - b.n));
      handler(load());
      listeners.months.add(handler);
      return () => listeners.months.delete(handler);
    },

    async saveMonth(month) {
      const data = load();
      const id = month.id || String(month.n);
      const idx = data.months.findIndex((m) => m.id === id);
      const record = { ...month, id };
      if (idx >= 0) data.months[idx] = record;
      else data.months.push(record);
      save(data);
      notify("months");
    },

    async deleteMonth(id) {
      const data = load();
      data.months = data.months.filter((m) => m.id !== id);
      save(data);
      notify("months");
    },

    subscribeAnnouncements(cb) {
      const handler = (data) => cb([...data.announcements].sort((a, b) => b.createdAt - a.createdAt));
      handler(load());
      listeners.announcements.add(handler);
      return () => listeners.announcements.delete(handler);
    },

    async saveAnnouncement(id, fields) {
      const data = load();
      if (id) {
        const idx = data.announcements.findIndex((a) => a.id === id);
        if (idx >= 0) {
          data.announcements[idx] = { ...data.announcements[idx], ...fields, updatedAt: Date.now() };
        }
        save(data);
        notify("announcements");
        return id;
      }
      const newId = `a-${Date.now()}`;
      data.announcements.push({ id: newId, ...fields, createdAt: Date.now(), updatedAt: Date.now() });
      save(data);
      notify("announcements");
      return newId;
    },

    async deleteAnnouncement(id) {
      const data = load();
      data.announcements = data.announcements.filter((a) => a.id !== id);
      save(data);
      notify("announcements");
    },

    subscribeComments(entryId, cb) {
      const handler = (data) =>
        cb(data.comments.filter((c) => c.entryId === entryId).sort((a, b) => a.createdAt - b.createdAt));
      handler(load());
      listeners.comments.add(handler);
      return () => listeners.comments.delete(handler);
    },

    subscribeAllComments(cb) {
      const handler = (data) => cb([...data.comments]);
      handler(load());
      listeners.comments.add(handler);
      return () => listeners.comments.delete(handler);
    },

    async addComment(entryId, fields) {
      const data = load();
      data.comments.push({
        id: `c-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        entryId,
        parentId: null,
        ...fields,
        createdAt: Date.now(),
      });
      save(data);
      notify("comments");
    },

    async updateComment(id, fields) {
      const data = load();
      const idx = data.comments.findIndex((c) => c.id === id);
      if (idx < 0) return;
      data.comments[idx] = { ...data.comments[idx], ...fields, updatedAt: Date.now() };
      save(data);
      notify("comments");
    },

    async deleteComment(id) {
      const data = load();
      const toRemove = new Set([id]);
      let grew = true;
      while (grew) {
        grew = false;
        for (const c of data.comments) {
          if (toRemove.has(c.parentId) && !toRemove.has(c.id)) {
            toRemove.add(c.id);
            grew = true;
          }
        }
      }
      data.comments = data.comments.filter((c) => !toRemove.has(c.id));
      save(data);
      notify("comments");
    },
  };
}

// ---------------------------------------------------------------------------
// 실서비스 모드: Firebase Firestore. 13명 모두에게 실시간으로 공유됨.
// ---------------------------------------------------------------------------
async function createFirestoreStore() {
  // 세 SDK 조각을 하나씩 순서대로 기다리면 모바일처럼 왕복 지연이 큰
  // 네트워크에서 그만큼 느려지므로, Promise.all로 동시에 받아옵니다.
  const [{ initializeApp }, firestoreMod, authMod] = await Promise.all([
    import("https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js"),
    import("https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js"),
    import("https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js"),
  ]);
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
  } = firestoreMod;
  const { getAuth, signInAnonymously, onAuthStateChanged } = authMod;

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
  const weeksCol = collection(db, "weeks");
  const monthsCol = collection(db, "months");
  const announcementsCol = collection(db, "announcements");
  const commentsCol = collection(db, "comments");

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

    async addMember(name, pin, color) {
      const dupe = await getDocs(query(membersCol, where("pin", "==", pin), limit(1)));
      if (!dupe.empty) return { ok: false, error: "이미 사용 중인 번호예요." };
      await addDoc(membersCol, {
        name,
        pin,
        color: color || { ...DEFAULT_MEMBER_COLOR },
        createdAt: serverTimestamp(),
      });
      return { ok: true };
    },

    async updateMember(id, fields) {
      if (fields.pin) {
        const dupe = await getDocs(query(membersCol, where("pin", "==", fields.pin), limit(1)));
        if (!dupe.empty && dupe.docs[0].id !== id) {
          return { ok: false, error: "이미 사용 중인 번호예요." };
        }
      }
      await setDoc(doc(db, "members", id), fields, { merge: true });
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

    subscribeMonthEntry(month, person, cb) {
      const id = `m${month}_${person}`;
      return onSnapshot(doc(db, "retrospectives", id), (snap) => {
        cb(snap.exists() ? snap.data() : null);
      });
    },

    async saveMonthEntry(month, person, entry) {
      const id = `m${month}_${person}`;
      await setDoc(
        doc(db, "retrospectives", id),
        { month, person, ...entry, updatedAt: serverTimestamp() },
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

    subscribeWeeks(cb) {
      return onSnapshot(weeksCol, (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => a.n - b.n);
        cb(list);
      });
    },

    async saveWeek(week) {
      const id = week.id || String(week.n);
      const { id: _drop, ...data } = week;
      await setDoc(doc(db, "weeks", id), data, { merge: true });
    },

    async deleteWeek(id) {
      await deleteDoc(doc(db, "weeks", id));
    },

    subscribeMonths(cb) {
      return onSnapshot(monthsCol, (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => a.n - b.n);
        cb(list);
      });
    },

    async saveMonth(month) {
      const id = month.id || String(month.n);
      const { id: _drop, ...data } = month;
      await setDoc(doc(db, "months", id), data, { merge: true });
    },

    async deleteMonth(id) {
      await deleteDoc(doc(db, "months", id));
    },

    subscribeAnnouncements(cb) {
      return onSnapshot(announcementsCol, (snap) => {
        const list = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0));
        cb(list);
      });
    },

    async saveAnnouncement(id, fields) {
      if (id) {
        await setDoc(doc(db, "announcements", id), { ...fields, updatedAt: serverTimestamp() }, { merge: true });
        return id;
      }
      const ref = await addDoc(announcementsCol, {
        ...fields,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      return ref.id;
    },

    async deleteAnnouncement(id) {
      await deleteDoc(doc(db, "announcements", id));
    },

    subscribeComments(entryId, cb) {
      return onSnapshot(query(commentsCol, where("entryId", "==", entryId)), (snap) => {
        const list = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .sort((a, b) => (a.createdAt?.toMillis?.() ?? 0) - (b.createdAt?.toMillis?.() ?? 0));
        cb(list);
      });
    },

    subscribeAllComments(cb) {
      return onSnapshot(commentsCol, (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        cb(list);
      });
    },

    async addComment(entryId, fields) {
      await addDoc(commentsCol, {
        entryId,
        parentId: null,
        ...fields,
        createdAt: serverTimestamp(),
      });
    },

    async updateComment(id, fields) {
      await setDoc(doc(db, "comments", id), { ...fields, updatedAt: serverTimestamp() }, { merge: true });
    },

    async deleteComment(id) {
      const queue = [id];
      while (queue.length) {
        const current = queue.shift();
        await deleteDoc(doc(db, "comments", current));
        const replies = await getDocs(query(commentsCol, where("parentId", "==", current)));
        queue.push(...replies.docs.map((d) => d.id));
      }
    },
  };
}
