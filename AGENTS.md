<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Rules that have already cost someone a day

Each of these caused a real incident. `HANDOFF.md` §3–4 has the longer history;
these are the ones you can violate before reading it.

## Database

- **Never run `prisma migrate dev`, `migrate reset` or `db push`.** Four objects
  are not modelled in `schema.prisma` — the `reservations_no_overlap` GiST
  exclusion constraint, the `btree_gist` extension, row-level security on every
  table, and two CHECK constraints on `rental_inspections`. Those commands
  regenerate the schema from the model and drop all four, taking the only real
  guarantee against double-booking with them. Write
  `prisma/migrations/<timestamp>_<name>/migration.sql` by hand and apply it with
  `prisma migrate deploy`. `npm run test:integration` fails if any of the four
  is missing.
- **Restart the dev server after `prisma generate`**, or a stale client throws
  `PrismaClientValidationError`.
- **`Prisma.Decimal` cannot cross the server/client boundary.** Convert to
  `Number` at the edge — a server action's return, or the page's `.map`. This
  has caused two separate bugs.
- **`Prisma.groupBy` loses its types inside `$transaction([...])`.** Use
  `Promise.all`.
- **Never spread an optional-typed object straight into a Prisma `update`.**
  `undefined` means "leave unchanged", so a field the user cleared silently
  keeps its old value. Use `null` to clear.
- Money is `Decimal(10,2)`. Never `float`.

## Uploads

- **Never route an uploaded file through a server action or route handler.**
  Vercel caps function request bodies at 4.5 MB whatever Next.js is told, and
  the rejection happens before your `try`, so it surfaces as a generic error.
  Photos go browser → Cloudinary on a signed request; the action only carries
  the receipt.
- **A direct upload means the client names the asset.** Anything the browser
  reports — `publicId` above all — is untrusted input. Verify Cloudinary's
  response signature and rebuild the URL server-side from the verified id.
  Never store a client-supplied URL.

## UI

- **shadcn here is the Base UI flavour, not Radix.** There is no `asChild`. Use
  `render={<Link/>}` plus `nativeButton={false}` on `Button`, and the same
  `render` pattern on `DialogTrigger`.
- **ESLint forbids synchronous `setState` in an effect.** Wrap it in
  `setTimeout(…, 0)`. Do **not** reach for `requestAnimationFrame` — it does not
  fire in headless or non-painting contexts and silently broke two features.

## Verifying

- **Verify through the page, not the service.** A service-level test passed
  while the fleet filters were completely dead, because the bug was in the
  page's `safeParse`. Curl the route or drive the browser.
- `npm test` needs no database. `npm run test:integration` needs one and
  refuses any non-local `DATABASE_URL`; `npm run db:setup` provides it.

## Before changing something that looks wrong

This codebase documents its reasoning in comments, and several odd-looking
shapes are deliberate. `docs/audit/ALFA-RENT-ENGINEERING-AUDIT.md` has a
"Things that should NOT be changed" section listing fifteen of them with the
reasons — read it before "fixing" the exclusion constraint, the 614-line
reservation service, the 642-line vehicle form, `businessCalendarStart`,
`src/proxy.ts`, or the IP-keyed login limiter.
