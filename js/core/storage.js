// Таблица рекордов и прогресс игрока в localStorage.
// Любая ошибка хранилища (приватный режим, запрет cookies) не ломает игру.

const KEY = 'luiqi.v1';
const MAX_RECORDS = 10;

function load(storage) {
  try {
    const raw = storage?.getItem(KEY);
    const data = raw ? JSON.parse(raw) : null;
    if (data && Array.isArray(data.records)) return { records: data.records, best: data.best ?? {}, games: data.games ?? 0, name: data.name ?? '' };
  } catch {
    /* хранилище недоступно или повреждено */
  }
  return { records: [], best: {}, games: 0, name: '' };
}

function save(storage, data) {
  try {
    storage?.setItem(KEY, JSON.stringify(data));
  } catch {
    /* игнорируем: рекорды просто не сохранятся */
  }
}

export class Progress {
  constructor(storage = globalThis.localStorage) {
    this.storage = storage;
    this.data = load(storage);
  }

  get records() {
    return this.data.records;
  }

  get name() {
    return this.data.name;
  }

  setName(name) {
    this.data.name = String(name).trim().slice(0, 20);
    save(this.storage, this.data);
  }

  /** Добавляет результат игры, возвращает место в таблице (1..10) или null. */
  addGame({ name, score, accuracy, shapes }) {
    const entry = { name: name || 'Художник', score, accuracy, shapes, date: new Date().toISOString() };
    this.data.games++;
    const records = [...this.data.records, entry].sort((a, b) => b.score - a.score).slice(0, MAX_RECORDS);
    this.data.records = records;
    save(this.storage, this.data);
    const idx = records.indexOf(entry);
    return idx === -1 ? null : idx + 1;
  }

  /** Переименовывает запись, добавленную последней (имя можно поменять на экране итогов). */
  renameLatest(name) {
    this.setName(name);
    const latest = this.data.records.reduce((a, b) => (!a || b.date > a.date ? b : a), null);
    if (latest) {
      latest.name = this.data.name || latest.name;
      save(this.storage, this.data);
    }
  }

  /** Лучшая точность по фигуре; возвращает true, если это новый личный рекорд. */
  recordShape(shapeId, accuracy) {
    const prev = this.data.best[shapeId] ?? 0;
    if (accuracy > prev) {
      this.data.best[shapeId] = accuracy;
      save(this.storage, this.data);
      return prev > 0;
    }
    return false;
  }

  bestFor(shapeId) {
    return this.data.best[shapeId] ?? 0;
  }

  get gamesPlayed() {
    return this.data.games;
  }
}

const ADJ = ['Смелый', 'Яркий', 'Быстрый', 'Точный', 'Весёлый', 'Неоновый', 'Космический', 'Тихий'];
const NOUN = ['Лис', 'Кот', 'Енот', 'Дракон', 'Кит', 'Филин', 'Панда', 'Тигр'];
export const randomName = (rand = Math.random) => `${ADJ[Math.floor(rand() * ADJ.length)]} ${NOUN[Math.floor(rand() * NOUN.length)]}`;
