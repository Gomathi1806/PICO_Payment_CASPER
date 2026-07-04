import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { NextResponse } from 'next/server';
import { auth } from '@/auth';

// Tokens are valid for 30 minutes — plenty for a 50MB upload over a slow
// connection, but short enough that a leaked token can't be used forever.
const ONE_MINUTE = 60;

// Mime types the uploader will accept. We deliberately exclude executables,
// scripts, archives, and HTML to keep the abuse surface small. Creators who
// need to ship a .zip can still paste a URL hosted elsewhere.
const ALLOWED_CONTENT_TYPES = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'image/svg+xml',
  'audio/mpeg',
  'audio/mp4',
  'audio/wav',
  'audio/ogg',
  'audio/x-m4a',
];

const MAX_BYTES = 50 * 1024 * 1024; // 50 MB

export async function POST(request: Request): Promise<NextResponse> {
  // Without this token @vercel/blob can't mint client upload tokens and the
  // browser sees an opaque "Failed to retrieve the client token" error.
  // Fail loudly with the real reason instead.
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    console.error('[blob upload] BLOB_READ_WRITE_TOKEN is not set — connect a Blob store to this project and pull envs (vercel env pull .env.local)');
    return NextResponse.json(
      { error: 'File uploads are not configured on this server yet. Use "Paste URL" instead, or ask the site owner to connect Vercel Blob storage.' },
      { status: 503 },
    );
  }

  const body = (await request.json()) as HandleUploadBody;

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      // onBeforeGenerateToken runs on every upload request — this is our
      // gate. We auth the caller, scope the upload to their user id, and
      // declare which content types and sizes Blob should reject.
      onBeforeGenerateToken: async (pathname /* , clientPayload */) => {
        const session = await auth();
        if (!session?.user?.id) {
          throw new Error('Not authenticated.');
        }

        return {
          allowedContentTypes: ALLOWED_CONTENT_TYPES,
          maximumSizeInBytes: MAX_BYTES,
          // Embedded in the client token; surfaced back to us in
          // onUploadCompleted so we can audit who uploaded what.
          tokenPayload: JSON.stringify({
            userId: session.user.id,
            pathname,
          }),
          addRandomSuffix: true,
          validUntil: Date.now() + 30 * ONE_MINUTE * 1000,
        };
      },
      // Webhook fired by Blob once the file lands. Local dev can't receive
      // this (no public URL); production gets it automatically. We log
      // rather than write to the DB because the DB write happens when the
      // creator saves the link form — this is just an audit trail hook.
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        try {
          const payload = tokenPayload ? JSON.parse(tokenPayload) : null;
          console.log('[blob upload] complete', { url: blob.url, userId: payload?.userId });
        } catch (e) {
          console.warn('[blob upload] could not parse tokenPayload', e);
        }
      },
    });

    return NextResponse.json(jsonResponse);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Upload failed';
    console.error('[blob upload] failed', { message, error });
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
