# ClientFlow Edge Functions

All four functions accept `POST` JSON, require `Authorization: Bearer <access-token>`,
and return the public contract value directly. Errors use `ContractErrorShape`.

## App integration

1. Call `prepare-upload` with `PrepareUploadInput`.
2. Upload the bytes with
   `supabase.storage.from("chat-screenshots").uploadToSignedUrl(storagePath, signedUploadToken, file)`.
3. Call `request-extraction` with `RequestExtractionInput` after the upload completes.
4. Poll `get-extraction` with `GetExtractionInput` until the returned
   `AIExtraction.status` is `needs_review` or `failed`.
5. Call `confirm-extraction` with `ConfirmExtractionInput`. Retrying the same
   extraction returns the original `ConfirmExtractionResult` IDs.

The bucket is private, accepts only JPEG, PNG, and WebP, and has a 10 MiB limit.
The server verifies the stored object size and MIME type before extraction.

## Server environment

- `SUPABASE_URL`: Supabase project URL. Supplied automatically when deployed.
- `SUPABASE_ANON_KEY`, `SUPABASE_PUBLISHABLE_KEY`, or the default entry in
  `SUPABASE_PUBLISHABLE_KEYS`: used to verify the user session and create the
  RLS-bound client.
- `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_SECRET_KEY`, or the default entry in
  `SUPABASE_SECRET_KEYS`: server-only key for private Storage and ingestion
  metadata. Never expose it to the App.
- `AI_PROVIDER_STUB_RESULT_JSON`: server-only JSON returned by the Phase 1 AI
  stub. It must pass `AIExtractionResultSchema`; invalid or absent values fail
  extraction without storing the raw value.
