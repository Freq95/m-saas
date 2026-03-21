const PHONE_INPUT_REGEX = /^[\d\s\+\-\(\)]+$/;

export function validatePhoneInput(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (!PHONE_INPUT_REGEX.test(trimmed)) {
    return 'Telefon invalid. Folositi doar cifre, spatii si +, -, (, )';
  }
  const digitCount = trimmed.replace(/\D/g, '').length;
  if (digitCount < 7 || digitCount > 15) {
    return 'Telefon invalid. Numarul trebuie sa aiba intre 7 si 15 cifre.';
  }
  return '';
}

