export type UpsellTier = {
  id?: string
  min_amount: number
  max_amount: number | null
  upsell_amount: number
  active: boolean
  sort_order: number
}

type TierRow = {
  id?: string
  min_amount: number | string | null
  max_amount: number | string | null
  upsell_amount: number | string | null
  active?: boolean | null
  sort_order?: number | null
}

export function mapUpsellTier(row: TierRow): UpsellTier {
  return {
    id: row.id,
    min_amount: Number(row.min_amount) || 0,
    max_amount:
      row.max_amount === null || row.max_amount === undefined ? null : Number(row.max_amount),
    upsell_amount: Number(row.upsell_amount) || 0,
    active: row.active !== false,
    sort_order: Number(row.sort_order) || 0,
  }
}

/** First active tier whose range contains the package total. min inclusive, max exclusive. */
export function upsellForAmount(amount: number, tiers: UpsellTier[]) {
  const total = Math.max(0, Number(amount) || 0)
  const match = tiers
    .filter((tier) => tier.active)
    .filter(
      (tier) =>
        total >= tier.min_amount && (tier.max_amount === null || total < tier.max_amount),
    )
    .sort((a, b) => a.min_amount - b.min_amount || a.sort_order - b.sort_order)[0]
  return match ? match.upsell_amount : 0
}

export type SaleUpsellInput = {
  total: number | string | null
  items?: string | null
  upsell_amount: number | string | null
  upsell_staff: string | null
  administered_by: string | null
}

/** One sale, one upsell. Snapshotted sales keep their saved amount; older sales use current tiers. */
export function resolveSaleUpsell(sale: SaleUpsellInput, tiers: UpsellTier[]) {
  if (/installment/i.test(sale.items || '')) return null
  const snapshotted = sale.upsell_amount !== null && sale.upsell_amount !== undefined
  const staff = (
    snapshotted ? sale.upsell_staff || sale.administered_by : sale.administered_by || ''
  ).trim()
  if (!staff) return null
  const payment = Number(sale.total) || 0
  return {
    staff,
    payment,
    upsell: snapshotted ? Number(sale.upsell_amount) || 0 : upsellForAmount(payment, tiers),
  }
}
