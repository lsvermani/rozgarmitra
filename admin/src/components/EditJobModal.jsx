import { useEffect, useState } from 'react';
import { adminApi, categoryApi } from '../api/client';

/**
 * Modal for an administrator to correct one job: title, category, creator and
 * payment. Only fields that actually changed are sent, so the audit trail
 * records a meaningful diff.
 *
 * The category and creator dropdowns are loaded from the API rather than
 * hard-coded, because the backend validates both against live data
 * (the `categories` collection and job_creator accounts).
 */
export default function EditJobModal({ job, onClose, onSaved }) {
  const [form, setForm] = useState(() => ({
    title: job.title || '',
    category: job.category || '',
    creatorId: job.creatorId?._id || job.creatorId || '',
    payment: job.payment ?? '',
  }));
  const [categories, setCategories] = useState([]);
  const [creators, setCreators] = useState([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    categoryApi
      .list()
      .then((res) => {
        if (!cancelled) setCategories(res.data.categories || []);
      })
      .catch(() => {
        if (!cancelled) setError('Could not load the category list.');
      });
    adminApi
      .getUsers({ role: 'job_creator', limit: 100 })
      .then((res) => {
        if (!cancelled) setCreators(res.data.users || []);
      })
      .catch(() => {
        if (!cancelled) setError('Could not load the job creator list.');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const update = (field, value) => setForm((f) => ({ ...f, [field]: value }));

  const save = async (event) => {
    event.preventDefault();
    setError('');

    if (form.title.trim().length < 2) {
      setError('Title must be at least 2 characters.');
      return;
    }
    if (!form.category) {
      setError('Please choose a category.');
      return;
    }
    if (!form.creatorId) {
      setError('Please choose a job creator.');
      return;
    }
    const payment = Number(form.payment);
    if (!Number.isFinite(payment) || payment < 0) {
      setError('Payment must be zero or a positive number.');
      return;
    }

    const payload = {};
    if (form.title.trim() !== (job.title || '')) payload.title = form.title.trim();
    if (form.category !== job.category) payload.category = form.category;
    const originalCreator = job.creatorId?._id || job.creatorId || '';
    if (String(form.creatorId) !== String(originalCreator)) payload.creatorId = form.creatorId;
    if (payment !== Number(job.payment)) payload.payment = payment;

    if (Object.keys(payload).length === 0) {
      onSaved(null);
      return;
    }

    setSaving(true);
    try {
      const res = await adminApi.updateJob(job._id, payload);
      onSaved(res.data.job, res.data.message);
    } catch (err) {
      setError(err.response?.data?.message || 'Could not save the changes.');
    } finally {
      setSaving(false);
    }
  };

  const creatorName = (u) => u.businessName || u.name || u.mobile;

  return (
    <div className="rm-modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="rm-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Edit job"
      >
        <h3 className="rm-modal__title">Edit job</h3>
        <p className="rm-modal__subtitle">
          Currently: {job.title} &middot; {job.category} &middot; ₹{job.payment}/{job.paymentUnit}
        </p>

        <form onSubmit={save}>
          <label className="rm-modal__field">
            <span>Title</span>
            <input
              value={form.title}
              onChange={(e) => update('title', e.target.value)}
              maxLength={160}
              autoFocus
            />
          </label>

          <label className="rm-modal__field">
            <span>Category</span>
            <select value={form.category} onChange={(e) => update('category', e.target.value)}>
              {/* Keep the job's current category selectable even if it was
                  retired, so opening the modal never silently changes it. */}
              {categories.length === 0 && <option value={form.category}>{form.category}</option>}
              {categories.map((c) => (
                <option key={c._id} value={c.name}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>

          <label className="rm-modal__field">
            <span>Creator</span>
            <select value={form.creatorId} onChange={(e) => update('creatorId', e.target.value)}>
              {creators.length === 0 && (
                <option value={form.creatorId}>
                  {job.creatorId?.businessName || job.creatorId?.name || 'Loading...'}
                </option>
              )}
              {creators.map((u) => (
                <option key={u._id} value={u._id}>
                  {creatorName(u)} &middot; {u.mobile}
                </option>
              ))}
            </select>
          </label>

          <label className="rm-modal__field">
            <span>
              Payment (₹ per {job.paymentUnit || 'day'})
            </span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={form.payment}
              onChange={(e) => update('payment', e.target.value)}
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
