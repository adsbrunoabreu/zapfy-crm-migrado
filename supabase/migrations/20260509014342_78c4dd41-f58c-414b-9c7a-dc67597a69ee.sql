UPDATE outbound_message_queue
SET status='pending', retry_count=0, next_attempt_at=now(), error=NULL, picked_at=NULL
WHERE status IN ('dead','pending') AND processed_at IS NULL;