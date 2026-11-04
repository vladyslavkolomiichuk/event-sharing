import * as React from 'react';
import { cn } from '@/lib/utils';
import { nativeFieldError } from '@/lib/form-validation';

type TextareaProps = React.ComponentProps<'textarea'> & {
  validate?: (value: string, element: HTMLTextAreaElement) => string;
  forceValidation?: boolean;
};

function Textarea({
  className,
  validate,
  forceValidation = false,
  onChange,
  onBlur,
  onInvalid,
  'aria-describedby': describedBy,
  'aria-invalid': externalInvalid,
  ...props
}: TextareaProps) {
  const inputRef = React.useRef<HTMLTextAreaElement>(null);
  const lastEditedValue = React.useRef<string | null>(null);
  const fallbackId = React.useId();
  const errorId = `${props.id ?? fallbackId}-error`;
  const [interacted, setInteracted] = React.useState(false);
  const [error, setError] = React.useState('');
  const showError = interacted || forceValidation;

  const check = (element: HTMLTextAreaElement) => {
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
      <textarea
        data-slot="textarea"
        ref={inputRef}
        className={cn(
          'min-h-28 w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-black outline-none placeholder:text-neutral-500 focus:border-orange-700 aria-invalid:border-red-600 aria-invalid:bg-red-50/40 aria-invalid:focus:border-red-700 disabled:opacity-50',
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

export { Textarea };
