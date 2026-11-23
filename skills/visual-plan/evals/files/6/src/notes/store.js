// Notes live in memory only: every restart loses them.

const notes = new Map();
let nextId = 1;

export function addNote(text) {
  const note = { id: nextId, text, createdAt: Date.now() };
  notes.set(note.id, note);
  nextId += 1;
  return note;
}

export function removeNote(id) {
  return notes.delete(id);
}

export function listNotes() {
  return [...notes.values()];
}

export function clearNotes() {
  notes.clear();
  nextId = 1;
}
