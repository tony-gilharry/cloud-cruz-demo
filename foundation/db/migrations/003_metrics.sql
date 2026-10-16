-- The metric layer for Build 2, the Measurement Layer.
--
-- Every number on the measurement page, and every answer "Ask the data" gives,
-- comes from these views, never from the raw tables directly. Each view says
-- what it means in its comment, because the AI reads those comments too.
--
-- Revenue credit follows decision 105: won revenue is split into buckets that
-- never overlap, so the buckets always add up to real revenue.
--   partner_sourced  a partner brought the deal (opportunities.source)
--   marketplace      sold through a cloud marketplace; credit to the partner of record
--   influenced       direct deal where one or more partners helped within 90 days of close
--   direct           no partner involved
-- Influenced credit is split between partners by touch weight, using the
-- weights in foundation/config/attribution.yaml.

set search_path = ecosystem;

-- Touch weights from attribution.yaml (influenced.touch_weights).
create view touch_weights as
select * from (values
  ('referral'::touch_type, 1.0::numeric),
  ('co_sell', 0.6),
  ('implementation', 0.4),
  ('influence', 0.2)
) as w (touch_type, weight);
comment on view touch_weights is
  'Relative weight of each partner touch type when splitting influenced credit (attribution.yaml).';

-- One row per won deal, with its credit bucket.
create view deal_credit as
with qualifying_touches as (
  -- A touch counts when it lands within 90 days before close (attribution.yaml).
  select t.opportunity_id, t.partner_id, sum(w.weight) as weight
  from deal_touches t
  join opportunities o on o.id = t.opportunity_id
  join touch_weights w on w.touch_type = t.touch_type
  where o.won and t.touched_at between o.closed_at - interval '90 days' and o.closed_at
  group by t.opportunity_id, t.partner_id
)
select
  o.id as opportunity_id,
  o.account_id,
  o.pricing_plan,
  o.amount as acv,
  o.closed_at::date as closed_on,
  date_trunc('month', o.closed_at)::date as closed_month,
  o.go_live_at,
  case
    when o.source = 'partner_sourced' then 'partner_sourced'
    when o.source = 'marketplace' then 'marketplace'
    when exists (select 1 from qualifying_touches q where q.opportunity_id = o.id) then 'influenced'
    else 'direct'
  end as credit_bucket,
  coalesce(
    o.sourcing_partner_id,
    (select op.partner_id from opportunity_partners op
      where op.opportunity_id = o.id and op.role = 'partner_of_record'
      order by op.added_at, op.partner_id limit 1)
  ) as credited_partner_id
from opportunities o
where o.won;
comment on view deal_credit is
  'One row per won deal. credit_bucket is partner_sourced, marketplace, influenced or direct; buckets never overlap, so they sum to total won revenue (decision 105). acv is annual contract value. credited_partner_id is the sourcing partner, or the marketplace partner of record.';

-- Partner-level influenced credit: each influencing partner's share of a deal.
create view influenced_credit as
with qualifying_touches as (
  select t.opportunity_id, t.partner_id, sum(w.weight) as weight
  from deal_touches t
  join opportunities o on o.id = t.opportunity_id
  join touch_weights w on w.touch_type = t.touch_type
  where o.won and t.touched_at between o.closed_at - interval '90 days' and o.closed_at
  group by t.opportunity_id, t.partner_id
)
select
  d.opportunity_id,
  q.partner_id,
  round(q.weight / sum(q.weight) over (partition by d.opportunity_id), 4) as share,
  round(d.acv * q.weight / sum(q.weight) over (partition by d.opportunity_id), 2) as credited_acv,
  d.closed_month
from deal_credit d
join qualifying_touches q on q.opportunity_id = d.opportunity_id
where d.credit_bucket = 'influenced';
comment on view influenced_credit is
  'For influenced deals only: each helping partner''s share of the deal, split by touch weight. Shares on one deal add to 1, so credited_acv adds to the deal''s acv.';

-- Collected revenue: invoices paid and not refunded, by the month they were paid.
create view collected_revenue as
select
  i.id as invoice_id,
  i.opportunity_id,
  d.credit_bucket,
  d.credited_partner_id,
  i.amount,
  i.paid_at,
  date_trunc('month', i.paid_at)::date as paid_month
from invoices i
join deal_credit d on d.opportunity_id = i.opportunity_id
where i.paid_at is not null and i.refunded_at is null;
comment on view collected_revenue is
  'Cash actually collected: paid invoices that were not refunded, tagged with the deal''s credit bucket. Use this for "how much did partners bring in" questions about cash; use deal_credit.acv for bookings.';

-- The north star (decision 57): customers live with a partner as sourcing
-- partner, partner of record or implementer.
create view customers_live as
select
  o.account_id,
  min(o.go_live_at) as first_live_on,
  date_trunc('month', min(o.go_live_at))::date as first_live_month
from opportunities o
join opportunity_partners op on op.opportunity_id = o.id
where o.go_live_at is not null
  and op.role in ('sourced', 'partner_of_record', 'implementer')
group by o.account_id;
comment on view customers_live is
  'The north star: one row per customer in production through a partner (sourcing partner, partner of record or implementer), with the month it first went live (decision 57).';

-- Program cost by month and category (the six categories in program_costs).
create view monthly_costs as
select period as month, category, amount
from program_costs;
comment on view monthly_costs is
  'What the partner program cost each month, by category: headcount, commissions, implementation_packages, co_marketing, exam_vouchers, tools.';

-- One row per month: the measurement page's spine.
create view monthly_summary as
with months as (
  select generate_series(
    (select min(month) from monthly_costs),
    (select max(month) from monthly_costs),
    interval '1 month'
  )::date as month
)
select
  m.month,
  (select count(*) from customers_live c where c.first_live_month = m.month) as new_customers_live,
  (select count(*) from customers_live c where c.first_live_month <= m.month) as customers_live_to_date,
  (select coalesce(sum(acv), 0) from deal_credit d where d.closed_month = m.month and d.credit_bucket = 'partner_sourced') as sourced_acv,
  (select coalesce(sum(acv), 0) from deal_credit d where d.closed_month = m.month and d.credit_bucket = 'marketplace') as marketplace_acv,
  (select coalesce(sum(acv), 0) from deal_credit d where d.closed_month = m.month and d.credit_bucket = 'influenced') as influenced_acv,
  (select coalesce(sum(acv), 0) from deal_credit d where d.closed_month = m.month and d.credit_bucket = 'direct') as direct_acv,
  (select coalesce(sum(amount), 0) from collected_revenue r where r.paid_month = m.month and r.credit_bucket <> 'direct') as partner_cash_collected,
  (select coalesce(sum(amount), 0) from monthly_costs c where c.month = m.month) as program_cost
from months m
order by m.month;
comment on view monthly_summary is
  'One row per month: customers newly live and to date, bookings (acv) by credit bucket, cash collected on partner deals, and total program cost.';

-- "Ask the data" reads only these views, through the read-only role.
grant select on touch_weights, deal_credit, influenced_credit, collected_revenue,
  customers_live, monthly_costs, monthly_summary to ecosystem_readonly;
