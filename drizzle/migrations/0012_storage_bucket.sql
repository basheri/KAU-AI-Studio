-- The private bucket for uploaded program sources. Earlier it was created in the hosting console, so a fresh
-- database had the storage policies (0002) but no bucket. Idempotent: an existing bucket is brought to these limits.
-- Limits mirror ALLOWED_UPLOAD_TYPES / UPLOAD_LIMIT_BYTES in src/features/intake/brief.ts and register_source_file.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('project-sources', 'project-sources', false, 10485760,
  ARRAY['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain', 'text/markdown'])
ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;
