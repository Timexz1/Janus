-- End-to-end encrypted API keys. The row holds ONLY ciphertext: the passphrase
-- and the derived key never leave the user's browser, so neither the server nor
-- a database admin can decrypt these values.
--   salt       : base64, PBKDF2 input (per user)
--   iterations : PBKDF2 round count (future-proof if we raise it)
--   verifier   : { ct, iv } of a known token — lets the client confirm a
--                passphrase is correct without exposing any real secret
--   secrets    : { "<provider>": { ct, iv }, ... } AES-256-GCM ciphertexts
create table public.encrypted_secrets (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  salt       text not null,
  iterations int not null default 600000,
  verifier   jsonb not null,
  secrets    jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.encrypted_secrets enable row level security;

-- Owner-only. (Even so, every column is ciphertext — RLS just limits the blast
-- radius; confidentiality comes from the client-held passphrase, not from RLS.)
create policy encrypted_secrets_owner on public.encrypted_secrets for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
