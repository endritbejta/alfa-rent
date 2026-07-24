-- Remove the legacy demo note after airport pickup was removed from the product.
-- Match the exact seeded sentence so customer-authored notes remain untouched.
UPDATE "reservations"
SET "notes" = NULL
WHERE "notes" = 'Airport pickup requested.';
