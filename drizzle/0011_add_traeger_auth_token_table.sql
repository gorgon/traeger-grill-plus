CREATE TABLE `traeger_auth` (
  `id` integer PRIMARY KEY,
  `email` text NOT NULL,
  `password` text NOT NULL,
  `id_token` text,
  `expires_at` integer
);
