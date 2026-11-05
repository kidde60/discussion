// Builds a wa.me link from a stored phone number.
// +CC... and 00CC... are international and used as-is. Local Ugandan numbers (0XXXXXXXXX) become +256.
export function whatsappUrl(phone: string): string | null {
  const international = /^\s*(\+|00)/.test(phone)
  let digits = phone.replace(/\D/g, '')
  if (!international && digits.startsWith('0')) digits = `256${digits.slice(1)}`
  else if (/^00/.test(phone.trim())) digits = digits.slice(2)
  return digits.length >= 9 && digits.length <= 15 ? `https://wa.me/${digits}` : null
}
