-- Shared Notes read receipt for Today. One fingerprint per Chicago day,
-- synced on the existing day_notes row so every desk sees the same pulse.
-- Null or a mismatch with non-empty note text means unread.
-- An empty note clears it.

alter table public.day_notes
  add column if not exists read_hash text;

comment on column public.day_notes.read_hash is
  'FNV-1a fingerprint of note text last opened in the Notes popup. Null or a mismatch with a non-empty note means unread. Cleared when the note is empty.';

notify pgrst, 'reload schema';
