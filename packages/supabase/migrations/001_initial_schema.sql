-- Enable required extensions
create extension if not exists "uuid-ossp";
create extension if not exists "vector";

-- ============================================================
-- Organizations
-- ============================================================
create table public.organizations (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  slug text not null unique,
  stripe_customer_id text,
  subscription_tier text not null default 'free'
    check (subscription_tier in ('free', 'starter', 'pro', 'enterprise')),
  subscription_status text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_organizations_slug on public.organizations (slug);
create index idx_organizations_stripe on public.organizations (stripe_customer_id) where stripe_customer_id is not null;

-- ============================================================
-- Organization Members (links auth.users to orgs)
-- ============================================================
create table public.organization_members (
  id uuid primary key default uuid_generate_v4(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'admin', 'member', 'viewer')),
  created_at timestamptz not null default now(),
  unique (organization_id, user_id)
);

create index idx_org_members_user on public.organization_members (user_id);
create index idx_org_members_org on public.organization_members (organization_id);

-- ============================================================
-- Sources (review collection integrations)
-- ============================================================
create table public.sources (
  id uuid primary key default uuid_generate_v4(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  type text not null check (type in (
    'google_places', 'yelp', 'g2', 'app_store', 'zendesk', 'intercom', 'typeform'
  )),
  name text not null,
  config jsonb not null default '{}',
  is_active boolean not null default true,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_sources_org on public.sources (organization_id);
create index idx_sources_type on public.sources (type);

-- ============================================================
-- Reviews (unified review storage)
-- ============================================================
create table public.reviews (
  id uuid primary key default uuid_generate_v4(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  source_id uuid not null references public.sources(id) on delete cascade,
  external_id text not null,
  author_name text,
  author_avatar_url text,
  content text not null,
  rating numeric(2,1),
  language text not null default 'en',
  published_at timestamptz not null,
  raw_data jsonb not null default '{}',
  embedding vector(1536),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_id, external_id)
);

create index idx_reviews_org on public.reviews (organization_id);
create index idx_reviews_source on public.reviews (source_id);
create index idx_reviews_published on public.reviews (organization_id, published_at desc);
create index idx_reviews_embedding on public.reviews using ivfflat (embedding vector_cosine_ops) with (lists = 100);

-- ============================================================
-- Themes (AI-extracted topic clusters)
-- ============================================================
create table public.themes (
  id uuid primary key default uuid_generate_v4(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  label text not null,
  description text,
  keywords text[] not null default '{}',
  review_count integer not null default 0,
  avg_sentiment numeric(4,3) not null default 0,
  trend_direction text not null default 'stable'
    check (trend_direction in ('rising', 'falling', 'stable')),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_themes_org on public.themes (organization_id);
create index idx_themes_sentiment on public.themes (organization_id, avg_sentiment);

-- ============================================================
-- Review-Theme junction
-- ============================================================
create table public.review_themes (
  review_id uuid not null references public.reviews(id) on delete cascade,
  theme_id uuid not null references public.themes(id) on delete cascade,
  relevance_score numeric(4,3) not null default 1.0,
  primary key (review_id, theme_id)
);

create index idx_review_themes_theme on public.review_themes (theme_id);

-- ============================================================
-- Sentiment Scores
-- ============================================================
create table public.sentiment_scores (
  id uuid primary key default uuid_generate_v4(),
  review_id uuid not null references public.reviews(id) on delete cascade unique,
  overall_score numeric(4,3) not null check (overall_score between -1 and 1),
  label text not null check (label in ('positive', 'negative', 'neutral', 'mixed')),
  confidence numeric(4,3) not null check (confidence between 0 and 1),
  aspects jsonb not null default '[]',
  analyzed_at timestamptz not null default now()
);

create index idx_sentiment_review on public.sentiment_scores (review_id);

-- ============================================================
-- Alerts
-- ============================================================
create table public.alerts (
  id uuid primary key default uuid_generate_v4(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  title text not null,
  description text not null,
  severity text not null default 'medium'
    check (severity in ('low', 'medium', 'high', 'critical')),
  status text not null default 'active'
    check (status in ('active', 'acknowledged', 'resolved')),
  trigger_data jsonb not null default '{}',
  created_at timestamptz not null default now(),
  acknowledged_at timestamptz,
  resolved_at timestamptz
);

create index idx_alerts_org on public.alerts (organization_id);
create index idx_alerts_status on public.alerts (organization_id, status) where status = 'active';

-- ============================================================
-- Reports
-- ============================================================
create table public.reports (
  id uuid primary key default uuid_generate_v4(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  title text not null,
  period text not null check (period in ('weekly', 'monthly', 'quarterly')),
  period_start date not null,
  period_end date not null,
  content jsonb not null default '{}',
  summary text not null default '',
  generated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index idx_reports_org on public.reports (organization_id);
create index idx_reports_period on public.reports (organization_id, period_start desc);

-- ============================================================
-- Suggested Responses
-- ============================================================
create table public.suggested_responses (
  id uuid primary key default uuid_generate_v4(),
  review_id uuid not null references public.reviews(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  response_text text not null,
  tone text not null default 'professional',
  is_approved boolean not null default false,
  is_sent boolean not null default false,
  approved_by uuid references auth.users(id),
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_responses_review on public.suggested_responses (review_id);
create index idx_responses_org on public.suggested_responses (organization_id);

-- ============================================================
-- Competitors
-- ============================================================
create table public.competitors (
  id uuid primary key default uuid_generate_v4(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  external_ids jsonb not null default '{}',
  avg_sentiment numeric(4,3) not null default 0,
  review_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_competitors_org on public.competitors (organization_id);

-- ============================================================
-- Functions
-- ============================================================

-- Semantic similarity search over review embeddings
create or replace function public.match_reviews(
  query_embedding vector(1536),
  match_threshold float,
  match_count int,
  org_id uuid
)
returns table (
  id uuid,
  content text,
  similarity float
)
language sql stable
as $$
  select
    r.id,
    r.content,
    1 - (r.embedding <=> query_embedding) as similarity
  from public.reviews r
  where r.organization_id = org_id
    and r.embedding is not null
    and 1 - (r.embedding <=> query_embedding) > match_threshold
  order by r.embedding <=> query_embedding
  limit match_count;
$$;

-- Sentiment trend over time
create or replace function public.get_sentiment_trend(
  org_id uuid,
  days int default 30
)
returns table (
  date date,
  avg_score numeric,
  count bigint
)
language sql stable
as $$
  select
    date_trunc('day', r.published_at)::date as date,
    avg(s.overall_score) as avg_score,
    count(*) as count
  from public.reviews r
  join public.sentiment_scores s on s.review_id = r.id
  where r.organization_id = org_id
    and r.published_at >= now() - make_interval(days => days)
  group by date_trunc('day', r.published_at)::date
  order by date;
$$;

-- Auto-update updated_at trigger
create or replace function public.handle_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Apply updated_at triggers
create trigger set_updated_at before update on public.organizations
  for each row execute function public.handle_updated_at();
create trigger set_updated_at before update on public.sources
  for each row execute function public.handle_updated_at();
create trigger set_updated_at before update on public.reviews
  for each row execute function public.handle_updated_at();
create trigger set_updated_at before update on public.themes
  for each row execute function public.handle_updated_at();
create trigger set_updated_at before update on public.suggested_responses
  for each row execute function public.handle_updated_at();
create trigger set_updated_at before update on public.competitors
  for each row execute function public.handle_updated_at();

-- ============================================================
-- Row Level Security
-- ============================================================
alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.sources enable row level security;
alter table public.reviews enable row level security;
alter table public.themes enable row level security;
alter table public.review_themes enable row level security;
alter table public.sentiment_scores enable row level security;
alter table public.alerts enable row level security;
alter table public.reports enable row level security;
alter table public.suggested_responses enable row level security;
alter table public.competitors enable row level security;

-- Helper: check if user is member of an organization
create or replace function public.is_org_member(org_id uuid)
returns boolean
language sql stable security definer
as $$
  select exists (
    select 1 from public.organization_members
    where organization_id = org_id
      and user_id = auth.uid()
  );
$$;

-- Helper: check if user is admin/owner of an organization
create or replace function public.is_org_admin(org_id uuid)
returns boolean
language sql stable security definer
as $$
  select exists (
    select 1 from public.organization_members
    where organization_id = org_id
      and user_id = auth.uid()
      and role in ('owner', 'admin')
  );
$$;

-- Organizations: members can read, admins can update
create policy "org_select" on public.organizations
  for select using (public.is_org_member(id));
create policy "org_insert" on public.organizations
  for insert with check (true);  -- signup flow
create policy "org_update" on public.organizations
  for update using (public.is_org_admin(id));

-- Organization Members
create policy "members_select" on public.organization_members
  for select using (public.is_org_member(organization_id));
create policy "members_insert" on public.organization_members
  for insert with check (public.is_org_admin(organization_id));
create policy "members_delete" on public.organization_members
  for delete using (public.is_org_admin(organization_id));

-- Sources
create policy "sources_select" on public.sources
  for select using (public.is_org_member(organization_id));
create policy "sources_insert" on public.sources
  for insert with check (public.is_org_admin(organization_id));
create policy "sources_update" on public.sources
  for update using (public.is_org_admin(organization_id));
create policy "sources_delete" on public.sources
  for delete using (public.is_org_admin(organization_id));

-- Reviews
create policy "reviews_select" on public.reviews
  for select using (public.is_org_member(organization_id));
create policy "reviews_insert" on public.reviews
  for insert with check (public.is_org_member(organization_id));

-- Themes
create policy "themes_select" on public.themes
  for select using (public.is_org_member(organization_id));
create policy "themes_insert" on public.themes
  for insert with check (public.is_org_member(organization_id));
create policy "themes_update" on public.themes
  for update using (public.is_org_member(organization_id));

-- Review Themes (via review's org membership)
create policy "review_themes_select" on public.review_themes
  for select using (
    exists (
      select 1 from public.reviews r
      where r.id = review_id and public.is_org_member(r.organization_id)
    )
  );
create policy "review_themes_insert" on public.review_themes
  for insert with check (
    exists (
      select 1 from public.reviews r
      where r.id = review_id and public.is_org_member(r.organization_id)
    )
  );

-- Sentiment Scores
create policy "sentiment_select" on public.sentiment_scores
  for select using (
    exists (
      select 1 from public.reviews r
      where r.id = review_id and public.is_org_member(r.organization_id)
    )
  );
create policy "sentiment_insert" on public.sentiment_scores
  for insert with check (
    exists (
      select 1 from public.reviews r
      where r.id = review_id and public.is_org_member(r.organization_id)
    )
  );

-- Alerts
create policy "alerts_select" on public.alerts
  for select using (public.is_org_member(organization_id));
create policy "alerts_update" on public.alerts
  for update using (public.is_org_member(organization_id));

-- Reports
create policy "reports_select" on public.reports
  for select using (public.is_org_member(organization_id));

-- Suggested Responses
create policy "responses_select" on public.suggested_responses
  for select using (public.is_org_member(organization_id));
create policy "responses_update" on public.suggested_responses
  for update using (public.is_org_member(organization_id));

-- Competitors
create policy "competitors_select" on public.competitors
  for select using (public.is_org_member(organization_id));
create policy "competitors_insert" on public.competitors
  for insert with check (public.is_org_admin(organization_id));
create policy "competitors_update" on public.competitors
  for update using (public.is_org_admin(organization_id));
create policy "competitors_delete" on public.competitors
  for delete using (public.is_org_admin(organization_id));
