create sequence if not exists order_seq start 1;

create table if not exists orders (
  id          text primary key,
  product     text not null check (product in ('lite', 'pro', 'duo')),
  status      text not null default 'new',
  buyer       text not null,
  blood       text not null,
  ice         text not null,
  allergies   text not null,
  directives  text not null default '',
  tracking    text not null default '',
  reencode    jsonb,
  steps       jsonb not null default '{}'::jsonb,
  tag_uid     text,
  encoded_via text,
  encoded_at  timestamptz,
  created     date not null default current_date
);

create index if not exists orders_created_idx on orders (created desc, id desc);
