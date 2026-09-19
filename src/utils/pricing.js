function normalizeDiscountTiers(input) {
  const list = Array.isArray(input) ? input : [];
  return list
    .map((tier) => ({
      min: Math.max(2, parseInt(tier.min, 10) || 0),
      percent: Math.max(0, Math.min(80, Number(tier.percent) || 0)),
    }))
    .filter((tier) => tier.min >= 2 && tier.percent > 0)
    .sort((a, b) => a.min - b.min)
    .slice(0, 3);
}

function parseDiscountTiers(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return normalizeDiscountTiers(raw);
  try {
    return normalizeDiscountTiers(JSON.parse(raw));
  } catch {
    return [];
  }
}

function quotePhotoOrder(pricePerPhoto, count, tiers) {
  const unit = Number(pricePerPhoto) || 0;
  const qty = Number(count) || 0;
  const subtotal = Math.round(unit * qty * 100) / 100;
  let percent = 0;
  parseDiscountTiers(tiers).forEach((tier) => {
    if (qty >= tier.min && tier.percent > percent) percent = tier.percent;
  });
  const discount = Math.round(subtotal * (percent / 100) * 100) / 100;
  const total = Math.max(0, Math.round((subtotal - discount) * 100) / 100);
  return { unit, qty, subtotal, percent, discount, total };
}

module.exports = {
  normalizeDiscountTiers,
  parseDiscountTiers,
  quotePhotoOrder,
};
