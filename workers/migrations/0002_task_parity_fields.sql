ALTER TABLE tasks ADD COLUMN recurrence_series_id TEXT;
ALTER TABLE tasks ADD COLUMN recurrence_index INTEGER;
ALTER TABLE tasks ADD COLUMN recurrence_count INTEGER;
ALTER TABLE tasks ADD COLUMN recurrence_frequency TEXT;
ALTER TABLE tasks ADD COLUMN recurrence_anchor_start_date TEXT;
ALTER TABLE tasks ADD COLUMN recurrence_anchor_due_date TEXT;
ALTER TABLE tasks ADD COLUMN managebac_subject TEXT;
ALTER TABLE tasks ADD COLUMN readonly INTEGER NOT NULL DEFAULT 0;
