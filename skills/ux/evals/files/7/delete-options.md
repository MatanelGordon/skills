# Deleting photos from an album: two candidate designs

Mobile gallery app. People mostly delete in batches after a trip: the median
deleting session removes 12 photos.

## Option A: swipe to delete

- Swipe a photo to the left and it is removed at once. No dialog.
- There is no undo and no trash. A deleted photo is removed from the phone and
  from the cloud backup.
- Quick test with 8 people who had never seen the app, task "delete these 5
  photos": 8 of 8 finished, median 9 seconds. 2 of the 8 also deleted a photo
  they meant to keep and had no way to get it back.
- Comments: "fast", "clean".

## Option B: select, then delete, with undo

- Tap "Select", tick the photos, tap the bin icon. A bar at the bottom reads
  "5 photos deleted · Undo" for 10 seconds. Deleted photos stay in Trash for
  30 days.
- "Select" sits inside the "…" menu at the top right.
- Same test with 8 other people: 7 of 8 finished, median 21 seconds. One
  person never found "Select" and gave up. 1 of the 8 deleted a photo they
  meant to keep and got it back with Undo.
- Comments: "safe", "a bit slow".

## Where the team stands

Most of the team prefers A: it tested faster, everyone finished, and the
screen looks cleaner.
