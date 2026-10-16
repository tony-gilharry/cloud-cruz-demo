// Billing for every won deal. Self-serve bills monthly by card; Premium and
// Enterprise bill quarterly in advance on net-30 terms (decision 60). A
// commission is earned only when an invoice is paid (decision 21).
import { AS_OF, DAY, addMonths, id, program, startOfDay } from "../config.ts";
import type { Rng } from "../rng.ts";
import type { Invoice, Opportunity } from "../types.ts";

const SELF_SERVE_CHURN_PER_MONTH = 0.03;
const REFUND_RATE = 0.04;          // self-serve customers who refund their first invoice
const LATE_PAYMENT_RATE = 0.03;    // quarterly invoices still unpaid weeks later

export function generateInvoices(rng: Rng, opportunities: Opportunity[]): Invoice[] {
  const rows: Omit<Invoice, "id">[] = [];
  for (const opp of opportunities) {
    if (!opp.won || opp.closed_at === null) continue;
    const monthly = program.pricing_plans[opp.pricing_plan].billing === "monthly";
    const step = monthly ? 1 : 3;
    const amount = Math.round((opp.amount / (monthly ? 12 : 4)) * 100) / 100;
    const start = startOfDay(opp.closed_at);
    const refunds = monthly && rng.chance(REFUND_RATE);

    for (let n = 0; ; n += 1) {
      const issued = addMonths(start, n * step);
      if (issued > AS_OF) break;
      const paid = monthly ? issued + rng.int(0, 1) * DAY : rng.chance(LATE_PAYMENT_RATE) ? null : issued + rng.int(5, 40) * DAY;
      const row: Omit<Invoice, "id"> = {
        opportunity_id: opp.id, account_id: opp.account_id, period_start: issued, amount, issued_at: issued,
        paid_at: paid !== null && paid <= AS_OF ? paid : null, refunded_at: null,
      };
      rows.push(row);
      // A refund inside the clawback window ends the subscription.
      if (refunds && n === 0 && row.paid_at !== null) {
        const refunded = row.paid_at + rng.int(5, 80) * DAY;
        if (refunded <= AS_OF) {
          row.refunded_at = refunded;
          break;
        }
      }
      if (monthly && rng.chance(SELF_SERVE_CHURN_PER_MONTH)) break;
    }
  }
  return rows
    .sort((a, b) => a.issued_at - b.issued_at || a.opportunity_id.localeCompare(b.opportunity_id))
    .map((row, i) => ({ id: id("INV", i + 1, 6), ...row }));
}
