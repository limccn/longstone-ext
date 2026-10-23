/**
 * Shared wallet form pieces: masked password inputs, the non-gating strength
 * hint, the new-password form used by create/import/change, and a small dialog
 * with focus trapping and Escape-to-close.
 */
import {
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from 'react';
import {
  passwordStrength,
  validateNewPassword,
  type PasswordValidation,
} from '../../lib/wallet/password.js';
import {
  NO_RECOVERY_COPY,
  PASSWORD_RULES_COPY,
  passwordValidationCopy,
} from './copy.js';

export function PasswordInput({
  id,
  label,
  testId,
  value,
  onChange,
  disabled = false,
  autoFocus = false,
}: {
  id: string;
  label: string;
  testId: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  autoFocus?: boolean;
}) {
  const [revealed, setRevealed] = useState(false);
  return (
    <div className="wallet-field">
      <label htmlFor={id}>{label}</label>
      <div className="row">
        <input
          id={id}
          data-testid={testId}
          type={revealed ? 'text' : 'password'}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          disabled={disabled}
          autoFocus={autoFocus}
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
        />
        <button
          type="button"
          className="link-button"
          aria-pressed={revealed}
          aria-label={revealed ? `Hide ${label}` : `Show ${label}`}
          onClick={() => setRevealed((current) => !current)}
          disabled={disabled}
        >
          {revealed ? 'Hide' : 'Reveal'}
        </button>
      </div>
    </div>
  );
}

const STRENGTH_LABEL: Record<string, string> = {
  'too-short': 'Too short',
  weak: 'Weak',
  fair: 'Fair',
  good: 'Good',
};

export function StrengthMeter({ password }: { password: string }) {
  const strength = passwordStrength(password);
  return (
    <div className="wallet-strength" aria-live="polite">
      <span className={`wallet-strength-bar ${strength.level}`} />
      <span className="hint small">Strength: {STRENGTH_LABEL[strength.level] ?? 'Weak'}</span>
      {strength.common && (
        <span className="hint warn small">This is a commonly used password.</span>
      )}
    </div>
  );
}

export interface NewPasswordFormProps {
  submitLabel: string;
  submitTestId: string;
  onSubmit: (password: string) => Promise<void>;
  busy: boolean;
  error: string | null;
  errorTestId: string;
  newTestId?: string;
  confirmTestId?: string;
  idPrefix?: string;
  warning?: string;
  busyLabel?: string;
  onCancel?: () => void;
  cancelLabel?: string;
}

/**
 * Owns the two password fields and local policy checks; the parent owns the
 * async submit, its busy flag and any server-side (vault) error.
 */
export function NewPasswordForm({
  submitLabel,
  submitTestId,
  onSubmit,
  busy,
  error,
  errorTestId,
  newTestId = 'wallet-password-new',
  confirmTestId = 'wallet-password-confirm',
  idPrefix = 'wallet-password',
  warning = NO_RECOVERY_COPY,
  busyLabel = 'Encrypting… this can take a second on slower devices.',
  onCancel,
  cancelLabel = 'Cancel',
}: NewPasswordFormProps) {
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    const check: PasswordValidation = validateNewPassword(password, confirmation);
    if (!check.ok) {
      setLocalError(passwordValidationCopy(check.code));
      return;
    }
    setLocalError(null);
    await onSubmit(check.value);
  }

  const shownError = localError ?? error;

  return (
    <form className="wallet-form" onSubmit={(event) => void submit(event)}>
      <PasswordInput
        id={`${idPrefix}-new`}
        label="New password"
        testId={newTestId}
        value={password}
        onChange={setPassword}
        disabled={busy}
        autoFocus
      />
      <PasswordInput
        id={`${idPrefix}-confirm`}
        label="Confirm password"
        testId={confirmTestId}
        value={confirmation}
        onChange={setConfirmation}
        disabled={busy}
      />
      <p className="hint small">{PASSWORD_RULES_COPY}</p>
      <StrengthMeter password={password} />
      <p className="hint warn small">{warning}</p>
      {shownError !== null && (
        <p className="error" role="alert" data-testid={errorTestId}>
          {shownError}
        </p>
      )}
      <div className="row">
        <button type="submit" data-testid={submitTestId} disabled={busy}>
          {submitLabel}
        </button>
        {onCancel !== undefined && (
          <button type="button" className="link-button" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </button>
        )}
      </div>
      {busy && (
        <p className="loading" role="status">
          {busyLabel}
        </p>
      )}
    </form>
  );
}

export function Dialog({
  title,
  testId,
  children,
  onClose,
  dismissible = true,
}: {
  title: string;
  testId: string;
  children: ReactNode;
  onClose: () => void;
  dismissible?: boolean;
}) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    dialogRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!dismissible) return;
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [dismissible, onClose]);

  function trapFocus(event: ReactKeyboardEvent<HTMLDivElement>): void {
    if (event.key !== 'Tab') return;
    const dialog = dialogRef.current;
    if (dialog === null) return;
    const focusables = [...dialog.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
    )];
    if (focusables.length === 0) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (first === undefined || last === undefined) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return (
    <div className="wallet-backdrop">
      <div
        className="wallet-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-testid={testId}
        tabIndex={-1}
        ref={dialogRef}
        onKeyDown={trapFocus}
      >
        <h2 id={titleId}>{title}</h2>
        {children}
      </div>
    </div>
  );
}
