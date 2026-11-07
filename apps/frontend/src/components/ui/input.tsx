import * as React from 'react';
import { cn } from '@/lib/utils';
import { nativeFieldError } from '@/lib/form-validation';

type InputProps = React.ComponentProps<'input'> & {
  validate?: (value: string, element: HTMLInputElement) => string;
  forceValidation?: boolean;
};

function Input({
  className,
  type,
  validate,
  forceValidation = false,
  onChange,
  onBlur,
  onInvalid,
  'aria-describedby': describedBy,
  'aria-invalid': externalInvalid,
  ...props
}: InputProps) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const lastEditedValue = React.useRef<string | null>(null);
  const fallbackId = React.useId();
  const errorId = `${props.id ?? fallbackId}-error`;
  const [interacted, setInteracted] = React.useState(false);
  const [error, setError] = React.useState('');
  const showError = interacted || forceValidation;

  const check = (element: HTMLInputElement) => {
    element.setCustomValidity('');
    const message =
      nativeFieldError(element) || validate?.(element.value, element) || '';
    element.setCustomValidity(message);
    setError(message);
  };

  React.useEffect(() => {
    if (props.value === '' && lastEditedValue.current && !forceValidation) {
      lastEditedValue.current = '';
      setInteracted(false);
      setError('');
      inputRef.current?.setCustomValidity('');
      return;
    }
    if (inputRef.current) check(inputRef.current);
  }, [props.value, showError, validate, forceValidation]);

  return (
    <>
      <input
        data-slot="input"
        ref={inputRef}
        type={type}
        className={cn(
          'h-10 w-full rounded-md border border-neutral-300 bg-white px-3 text-base text-black file:mr-3 file:font-semibold sm:text-sm [&[type=file]]:py-2 outline-none placeholder:text-neutral-500 focus:border-[var(--accent-strong)] aria-invalid:border-red-600 aria-invalid:bg-red-50/40 aria-invalid:focus:border-red-700 disabled:opacity-50',
          className,
        )}
        aria-invalid={
          externalInvalid || (showError && Boolean(error)) || undefined
        }
        aria-describedby={
          [describedBy, showError && error ? errorId : '']
            .filter(Boolean)
            .join(' ') || undefined
        }
        onChange={(event) => {
          lastEditedValue.current = event.currentTarget.value;
          setInteracted(true);
          check(event.currentTarget);
          onChange?.(event);
        }}
        onBlur={(event) => {
          setInteracted(true);
          check(event.currentTarget);
          onBlur?.(event);
        }}
        onInvalid={(event) => {
          event.preventDefault();
          setInteracted(true);
          check(event.currentTarget);
          onInvalid?.(event);
        }}
        {...props}
      />
      {showError && error && (
        <p
          id={errorId}
          className="mt-1 text-xs font-medium text-red-700"
          role="alert"
        >
          {error}
        </p>
      )}
    </>
  );
}

export { Input };
