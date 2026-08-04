# The scales of the decimal columns amounts land in. Money is `decimal(12,2)` and quantity is
# `decimal(14,3)` everywhere in this schema — sale lines, payments, purchase order lines, receipt
# lines, the movement ledger and the snapshot cache all agree on those two.
#
# **Round to these before deriving anything from an amount.** Summing the unrounded values
# instead is a real bug this codebase shipped: a sale discounted 0.005 on each of three lines
# stored 0.01 apiece — 0.03 — while the header summed 0.015 and rounded it to 0.02, so the sale
# disagreed with its own lines. Worse, every client rounds to these same scales when it parses
# (`parseMoney` / `parseQuantity` in `mobile/src/util/money.ts` and `inventory/lib/quantity.ts`),
# so the till derived a different total from the server's and its sale was refused outright.
#
# Round **after** any sign or zero check, never before: -0.004 must stay a refused negative
# rather than rounding quietly to zero and passing as a free line.
#
# One caveat worth knowing before you try to make the two sides byte-identical: this rounds a
# BigDecimal and the client rounds a float, so at an *exact* half they can disagree. 1.005 is
# 1.00499… as a double, so the client rounds it down while `BigDecimal("1.005").round(2)` rounds
# up — and 2.005 goes the other way. It is not reachable through the app, because every client
# rounds at parse and sends the rounded string, so a raw sub-scale value never arrives from a
# till. The paired tests deliberately use values both sides agree on.
module ColumnScale
  MONEY = 2
  QUANTITY = 3

  def self.money(value)
    value&.round(MONEY)
  end

  def self.quantity(value)
    value&.round(QUANTITY)
  end
end
