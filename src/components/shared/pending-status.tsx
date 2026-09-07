/**
 * Announces that something asynchronous is happening.
 *
 * The app had no live region at all — `aria-live`, `role="status"` and
 * `aria-atomic` each appeared zero times — so "Saving…", "Sending…",
 * "Uploading photos…" and "Searching…" were changes a screen reader never
 * heard. Failure was already handled well: seventeen `role="alert"` messages.
 * Only progress was silent.
 *
 * The region is mounted whatever the state, and only its text changes.
 * A live region created at the same moment as its first content is not
 * reliably announced, which is the usual way this is got wrong.
 *
 * Visually hidden on purpose: every one of these states is already shown,
 * on the button that was just pressed or in the panel being filled. This
 * adds the announcement, not a second copy on screen.
 */
export function PendingStatus({ message }: { message: string | null }) {
  return (
    <span role="status" aria-live="polite" className="sr-only">
      {message ?? ""}
    </span>
  );
}
