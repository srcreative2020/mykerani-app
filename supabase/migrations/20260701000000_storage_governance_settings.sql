-- HQ-controlled storage governance config: storage mode per plan tier and
-- retention windows. No hardcoded values in app code — all read from this
-- single global row, configurable by HQ only.
create table if not exists storage_governance_settings (
  id text primary key default 'global',
  storage_mode_trial text not null default 'HQ_MANAGED' check (storage_mode_trial in ('HQ_MANAGED','GOOGLE_DRIVE')),
  storage_mode_paid text not null default 'GOOGLE_DRIVE' check (storage_mode_paid in ('HQ_MANAGED','GOOGLE_DRIVE')),
  trial_days integer not null default 30,
  freeze_days integer not null default 7,
  delete_days integer not null default 90,
  updated_at timestamptz not null default now()
);

insert into storage_governance_settings (id) values ('global')
on conflict (id) do nothing;

alter table storage_governance_settings enable row level security;

create policy hq_manage_storage_governance_settings on storage_governance_settings
  for all using (is_hq_user()) with check (is_hq_user());
