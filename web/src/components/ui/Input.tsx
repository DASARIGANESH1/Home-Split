import type { InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  suffix?: ReactNode;
}

export function Input({ label, error, hint, suffix, className, id, ...rest }: InputProps) {
  const inputId = id ?? rest.name;
  return (
    <div className="field">
      {label && (
        <label className="field-label" htmlFor={inputId}>
          {label}
        </label>
      )}
      {suffix ? (
        <div className="input-group">
          <input id={inputId} className={`input ${className ?? ''}`} {...rest} />
          <div className="input-suffix">{suffix}</div>
        </div>
      ) : (
        <input id={inputId} className={`input ${className ?? ''}`} {...rest} />
      )}
      {hint && !error && <div className="input-hint">{hint}</div>}
      {error && <div className="field-error">{error}</div>}
    </div>
  );
}

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export function Textarea({ label, error, hint, className, id, ...rest }: TextareaProps) {
  const inputId = id ?? rest.name;
  return (
    <div className="field">
      {label && (
        <label className="field-label" htmlFor={inputId}>
          {label}
        </label>
      )}
      <textarea id={inputId} className={`textarea ${className ?? ''}`} {...rest} />
      {hint && !error && <div className="input-hint">{hint}</div>}
      {error && <div className="field-error">{error}</div>}
    </div>
  );
}
