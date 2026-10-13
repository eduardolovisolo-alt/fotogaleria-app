const DEFAULT_WHATSAPP_NUMBER = '5491124043503';

function digitsOnly(phone) {
  return String(phone || '').replace(/\D/g, '');
}

function toWhatsAppNumber(phone) {
  let digits = digitsOnly(phone);
  if (!digits) return null;
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.startsWith('54')) return digits;
  if (digits.startsWith('0')) digits = digits.slice(1);
  if (digits.length === 10) return `549${digits}`;
  if (digits.length >= 8 && digits.length <= 13) return `54${digits}`;
  return null;
}

function isValidWhatsAppNumber(phone) {
  const normalized = toWhatsAppNumber(phone);
  return Boolean(normalized && normalized.length >= 11 && normalized.length <= 15);
}

function formatWhatsAppDisplay(phone) {
  const normalized = toWhatsAppNumber(phone);
  if (!normalized) return '';
  if (normalized.startsWith('549') && normalized.length === 13) {
    const local = normalized.slice(3);
    return `${local.slice(0, 2)} ${local.slice(2, 6)} ${local.slice(6)}`;
  }
  if (normalized.startsWith('54')) return `+${normalized}`;
  return normalized;
}

module.exports = {
  DEFAULT_WHATSAPP_NUMBER,
  digitsOnly,
  toWhatsAppNumber,
  isValidWhatsAppNumber,
  formatWhatsAppDisplay,
};
