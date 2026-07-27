
ALTER TABLE public.attendance_ticket_events
  DROP CONSTRAINT IF EXISTS attendance_ticket_events_event_type_check;

ALTER TABLE public.attendance_ticket_events
  ADD CONSTRAINT attendance_ticket_events_event_type_check
  CHECK (event_type = ANY (ARRAY[
    'opened'::text,
    'created'::text,
    'closed'::text,
    'reopened'::text,
    'assigned'::text,
    'transferred'::text,
    'note'::text,
    'rating'::text,
    'escalated'::text,
    'responded'::text
  ]));

UPDATE public.webhook_retry_queue
   SET status = 'pending',
       attempts = 0,
       next_attempt_at = now(),
       last_error = NULL,
       picked_at = NULL
 WHERE last_error ILIKE '%attendance_ticket_events_event_type_check%';
