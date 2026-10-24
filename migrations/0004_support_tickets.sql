create table if not exists support_tickets (
  id         bigserial primary key,
  name       text not null,
  email      text not null,
  order_id   text not null default '',
  message    text not null,
  status     text not null default 'open' check (status in ('open', 'resolved')),
  created    timestamptz not null default now(),
  updated    timestamptz not null default now()
);

create index if not exists support_tickets_created_idx on support_tickets (created desc, id desc);
