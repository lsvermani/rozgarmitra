import { useEffect, useRef, useState } from 'react';

/**
 * The six-box OTP field, shared by every sign-in page.
 *
 * Why one component instead of three copies: the boxes are a *view* over ONE
 * real input. That input is visually hidden, so the boxes are the only thing a
 * person can aim at - which means "can you actually type into it?" is a
 * question about this component, not about the page that uses it. Copying it
 * per-page just gives the bug more places to live. It already bit twice:
 *
 *   1. The boxes had no click handler, so a click fell through to <body> and
 *      every keystroke was silently dropped.
 *   2. Making the boxes a <label htmlFor> fixed that, but the page-wide
 *      `label { display: block }` rule then out-specified `display: flex` and
 *      stacked all six boxes vertically.
 *
 * Both are prevented structurally below - native label forwarding, and CSS
 * scoped to `.rm-otp-field` so no page rule can win.
 *
 * @param {object}   props
 * @param {string}   props.id         Must be unique on the page.
 * @param {string}   props.value      The digits, owned by the caller.
 * @param {Function} props.onChange   Called with the digits-only new value.
 * @param {string}   [props.label]    Caption. Rendered as a real <label htmlFor>.
 * @param {number}   [props.length]   Digit count, 6 unless told otherwise.
 * @param {boolean}  [props.disabled]
 * @param {string}   [props.autoComplete] Defaults to "one-time-code" so the
 *                                    platform can suggest the SMS code.
 */
export default function OtpField({
  id,
  value,
  onChange,
  label,
  length = 6,
  disabled = false,
  autoComplete = 'one-time-code',
}) {
  const inputRef = useRef(null);
  // Drives the ring on the boxes. Without it a click that failed to focus is
  // indistinguishable from one that worked, which is what made the original
  // bug so hard to see.
  const [focused, setFocused] = useState(false);

  const digitsOnly = (raw) => raw.replace(/\D/g, '').slice(0, length);

  // Take focus on mount, so arriving on the OTP step leaves the caret already
  // blinking and the first digit typed goes in. Without this the field looks
  // ready but is not, and nothing tells the user to click it. Safe because a
  // page only renders this on the OTP step - there is nothing to steal focus
  // from - and skipped while disabled.
  useEffect(() => {
    if (!disabled) inputRef.current?.focus();
  }, [disabled]);

  // The boxes ARE the label for the real input. A <label htmlFor> forwards a
  // click to its control natively, so this needs no JavaScript and does not
  // depend on event ordering. onClick is belt-and-braces; focus() is
  // idempotent, so running it twice costs nothing.
  return (
    <div className="rm-otp-field">
      {label && <label htmlFor={id}>{label}</label>}
      {/* The real control. Hidden but focusable, so paste, SMS autofill and the
          numeric keypad all behave normally. Six separate inputs would break
          paste and focus order. */}
      <input
        ref={inputRef}
        id={id}
        name="otp"
        className="rm-otp-native"
        type="text"
        inputMode="numeric"
        autoComplete={autoComplete}
        aria-label={label || `Enter the ${length}-digit code`}
        value={value}
        onChange={(e) => onChange(digitsOnly(e.target.value))}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        maxLength={length}
        disabled={disabled}
      />
      <label
        htmlFor={id}
        className={`rm-otp-boxes${focused ? ' rm-otp-boxes--focused' : ''}`}
        onClick={() => inputRef.current?.focus()}
      >
        {Array.from({ length }).map((_, i) => (
          <span
            key={i}
            aria-hidden="true"
            className={`rm-otp-box${value[i] ? ' rm-otp-box--filled' : ''}${(focused && i === value.length) ? ' rm-otp-box--active' : ''}`}
          >
            {value[i] || ''}
          </span>
        ))}
      </label>
    </div>
  );
}