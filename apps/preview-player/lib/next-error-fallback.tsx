/**
 * Fallback error page.
 *
 * vinext's router resolves a last-resort error page as
 * `errorLoader ?? (() => import('next/error'))`. That fallback is only ever
 * *reached* when the app defines neither `/404` nor `/_error`, but esbuild's
 * dependency optimizer resolves the specifier at bundle time regardless of
 * whether the branch can run. `next` is not a dependency of this app and must
 * not become one — vinext replaces the Next runtime rather than sitting on top
 * of it — so the preview server failed to start with
 * `Could not resolve "next/error"`.
 *
 * vite.config.ts aliases `next/error` here. The contract vinext expects is a
 * module whose default export is a page component taking an optional
 * `statusCode`, which is what Next's own error page exports.
 *
 * This is a genuine fallback, not a stub: if it ever renders, the customer sees
 * a styled page rather than an unhandled rejection.
 */

export default function ErrorPage({ statusCode }: { statusCode?: number }) {
  const heading = statusCode === 404 ? 'Page not found' : 'Something went wrong';
  const detail =
    statusCode === 404
      ? 'That page is not part of the preview.'
      : 'The preview hit an unexpected error. Reload to try again.';

  return (
    <main className="grid min-h-dvh place-items-center bg-[#05090d] px-6 text-white">
      <div className="max-w-md text-center">
        {statusCode ? (
          <p className="text-[10px] font-bold uppercase tracking-[.2em] text-[#ff7a45]">
            Error {statusCode}
          </p>
        ) : null}
        <h1 className="mt-3 text-3xl font-semibold tracking-[-.03em]">{heading}</h1>
        <p className="mt-3 text-sm leading-6 text-white/50">{detail}</p>
      </div>
    </main>
  );
}
