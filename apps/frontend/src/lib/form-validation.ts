type ValidatedElement = HTMLInputElement | HTMLTextAreaElement;

export function nativeFieldError(element: ValidatedElement): string {
  const { validity } = element;
  if (validity.valueMissing) return 'This field is required.';
  if (validity.typeMismatch)
    return element instanceof HTMLInputElement && element.type === 'email'
      ? 'Enter a valid email address.'
      : 'Enter a valid URL.';
  if (validity.badInput) return 'Enter a valid number.';
  if (validity.tooShort) return `Use at least ${element.minLength} characters.`;
  if (validity.tooLong)
    return `Use no more than ${element.maxLength} characters.`;
  if (validity.rangeUnderflow && element instanceof HTMLInputElement)
    return `Enter a value of at least ${element.min}.`;
  if (validity.rangeOverflow && element instanceof HTMLInputElement)
    return `Enter a value of no more than ${element.max}.`;
  if (validity.stepMismatch) return 'Enter a valid step value.';
  if (validity.patternMismatch) return 'Use the required format.';
  return '';
}
