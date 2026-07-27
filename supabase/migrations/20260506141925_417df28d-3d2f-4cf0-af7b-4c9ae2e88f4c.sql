
UPDATE public.webhooks w
   SET secret_encrypted = pgp_sym_encrypt(
         w.secret,
         (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'webhook_secret_key' LIMIT 1)
       ),
       secret = 'whsec_' || repeat('*', 12) || right(w.secret, 4)
 WHERE w.secret_encrypted IS NULL
   AND w.secret IS NOT NULL
   AND w.secret NOT LIKE 'whsec_%';
