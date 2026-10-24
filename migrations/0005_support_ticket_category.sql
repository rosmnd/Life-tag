alter table support_tickets
  add column if not exists category text not null default 'general'
  check (category in ('general', 'reencode'));
