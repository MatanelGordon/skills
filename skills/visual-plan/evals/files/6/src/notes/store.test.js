import assert from 'node:assert/strict';
import test from 'node:test';
import { addNote, clearNotes, listNotes, removeNote } from './store.js';

test('a note can be added, listed and removed', () => {
  clearNotes();
  const note = addNote('buy milk');
  assert.deepEqual(listNotes().map((entry) => entry.text), ['buy milk']);
  assert.equal(removeNote(note.id), true);
  assert.deepEqual(listNotes(), []);
});
