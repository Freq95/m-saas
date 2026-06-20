const PHONE_INPUT_REGEX = /^[\d\s\+\-\(\)]+$/;

export function validatePhoneInput(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (!PHONE_INPUT_REGEX.test(trimmed)) {
    return 'Telefon invalid. Folosiți doar cifre, spații și +, -, (, )';
  }
  const digitCount = trimmed.replace(/\D/g, '').length;
  if (digitCount < 7 || digitCount > 15) {
    return 'Telefon invalid. Numărul trebuie să aiba între 7 și 15 cifre.';
  }
  return '';
}

