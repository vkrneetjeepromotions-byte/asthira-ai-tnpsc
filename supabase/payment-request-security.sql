-- Review existing duplicate UTRs before creating the unique index.
-- If this returns rows, resolve them first; do not delete payment records blindly.
select upper(btrim(utr_number)) as normalized_utr, count(*) as request_count
from public.ast_payment_requests
group by upper(btrim(utr_number))
having count(*) > 1;

-- Prevent the public client from inserting requests with client-controlled values.
-- The server-side API uses the service-role key and remains able to insert.
alter table public.ast_payment_requests enable row level security;
drop policy if exists "Public submit payment request" on public.ast_payment_requests;

-- Admin reads remain available under the existing admin-only SELECT policy.
-- Decisions are made only through the server-side API, which checks identity,
-- admin role, pending status, and self-approval before writing reviewer fields.
drop policy if exists "Admins update payment requests" on public.ast_payment_requests;

-- Treat UTRs as case-insensitive and whitespace-insensitive.
create unique index if not exists ast_payment_requests_utr_number_unique
  on public.ast_payment_requests (upper(btrim(utr_number)));
