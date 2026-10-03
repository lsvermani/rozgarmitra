import { useState } from 'react';
import { adminApi } from '../api/client';

/**
 * Mirrors the `role` enum on the backend User schema. The backend rejects
 * anything outside this list, so the select must not offer more than this.
 * (The RBAC table also knows `super_admin` / `manager` / `viewer`, but the
 * schema has not been widened to store them yet.)
 */
const ROLES = [
  { value: 'worker', label: 'Worker' },
  { value: 'job_creator', label: 'Job Creator' },
  { value: 'admin', label: 'Admin' },
];

/**
 * Modal for an administrator to correct one user's name, mobile, role and
 * rating. Only the fields that actually changed are sent, so the audit trail
 * records a meaningful diff rather than a full overwrite.
 */
export default function EditUserModal({ user, currentUserId, onClose, onSaved }) {
  const [form, setForm] = useState(() => ({
    name: user.name || '',
    mobile: user.mobile || '',
    role: user.role || 'worker',
    rating: Number(user.rating ?? 0),
  }));
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  // The backend refuses to let an admin change their own role or mobile — that
  // would lock them out of the panel — so those fields are disabled on your row.
  const isSelf = String(user._id) === String(currentUserId);
  const update = (field, value) => setForm((f) => ({ ...f, [field]: value }));

  const save = async (event) => {
    event.preventDefault();
    setError('');

    if (form.name.trim().length < 2) {
      setError('Name must be at least 2 characters.');
      return;
    }
    if (!/^[6-9]\d{9}$/.test(form.mobile.trim())) {
      setError('Enter a valid 10-digit mobile number.');
      return;
    }

    const payload = {};
    if (form.name.trim() !== (user.name || '')) payload.name = form.name.trim();
    if (form.mobile.trim() !== user.mobile) payload.mobile = form.mobile.trim();
    if (form.role !== user.role) payload.role = form.role;
    if (Number(form.rating) !== Number(user.rating ?? 0)) payload.rating = Number(form.rating);

    if (Object.keys(payload).length === 0) {
      onSaved(null);
      return;
    }

    setSaving(true);
    try {
      const res = await adminApi.updateUser(user._id, payload);
      onSaved(res.data.user, res.data.message);
    } catch (err) {
      setError(err.response?.data?.message || 'Could not save the changes.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rm-modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="rm-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Edit user"
      >
        <h3 className="rm-modal__title">Edit user</h3>
        <p className="rm-modal__subtitle">
          Currently: {user.mobile} &middot;{' '}
          {user.role === 'job_creator' ? 'Job Creator' : user.role}
        </p>

        <form onSubmit={save}>
          <label className="rm-modal__field">
            <span>Name</span>
            <input
              value={form.name}
              onChange={(e) => update('name', e.target.value)}
              maxLength={60}
              autoFocus
            />
          </label>

          <label className="rm-modal__field">
            <span>Mobile number</span>
            <input
              type="tel"
              inputMode="numeric"
              value={form.mobile}
              onChange={(e) => update('mobile', e.target.value.replace(/\D/g, '').slice(0, 10))}
              maxLength={10}
              disabled={isSelf}
            />
            {isSelf && <small className="rm-modal__note">You cannot change your own mobile number.</small>}
          </label>

          <label className="rm-modal__field">
            <span>Role</span>
            <select value={form.role} onChange={(e) => update('role', e.target.value)} disabled={isSelf}>
              {ROLES.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
            {isSelf && <small className="rm-modal__note">You cannot change your own role.</small>}
          </label>

          <label className="rm-modal__field">
            <span>Rating (0&ndash;5)</span>
            <input
              type="number"
              min="0"
              max="5"
              step="0.1"
              value={form.rating}
              onChange={(e) => update('rating', e.target.value)}
            />
          </label>

          {error && <div className="rm-error">{error}</div>}

          <div className="rm-modal__actions">
            <button type="button" className="rm-btn rm-btn--outline" onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button type="submit" className="rm-btn rm-btn--primary" disabled={saving}>
              {saving ? 'Saving...' : 'Save changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
