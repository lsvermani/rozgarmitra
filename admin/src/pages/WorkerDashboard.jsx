import { useEffect, useState } from 'react';
import { offersApi, jobsApi } from '../api/client';
import { useAuth } from '../context/useAuth';
import { useLanguage } from '../context/useLanguage';
import LanguageTabs from '../components/LanguageTabs';

const formatDate = (value) => {
  if (!value) return 'Flexible';
  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value));
};

export default function WorkerDashboard() {
  const { user, logout } = useAuth();
  const { t } = useLanguage();
  const [jobs, setJobs] = useState([]);
  const [myOffers, setMyOffers] = useState([]);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [loading, setLoading] = useState(true);

  // Selected job for modal / detail view
  const [selectedJob, setSelectedJob] = useState(null);

  // Offer form state
  const [proposedAmount, setProposedAmount] = useState('');
  const [offerMessage, setOfferMessage] = useState('');
  const [availabilityConfirmed, setAvailabilityConfirmed] = useState(true);
  const [submittingOffer, setSubmittingOffer] = useState(false);
  const [editingOfferId, setEditingOfferId] = useState(null);

  const [feedbackMsg, setFeedbackMsg] = useState('');
  const [feedbackErr, setFeedbackErr] = useState('');

  const loadData = async () => {
    try {
      const [jobsRes, offersRes] = await Promise.all([
        jobsApi.list({ search: search || undefined, category: category || undefined, limit: 50 }),
        offersApi.getMyOffers(),
      ]);
      setJobs(jobsRes.data.jobs || []);
      setMyOffers(offersRes.data.offers || []);
    } catch (err) {
      setFeedbackErr(err.response?.data?.message || 'Could not load jobs or offers.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let active = true;
    // The spinner is toggled by the search/category handlers that trigger this
    // effect, so no state is set synchronously here.
    jobsApi
      .list({ search: search || undefined, category: category || undefined, limit: 50 })
      .then((res) => {
        if (active) setJobs(res.data.jobs || []);
      })
      .catch((err) => {
        if (active) setFeedbackErr(err.response?.data?.message || 'Could not load jobs.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [search, category]);

  useEffect(() => {
    offersApi
      .getMyOffers()
      .then((res) => setMyOffers(res.data.offers || []))
      .catch(() => {});
  }, []);

  const getOfferForJob = (jobId) => {
    return myOffers.find((o) => (o.jobId?._id || o.jobId) === jobId && ['PENDING', 'ACCEPTED'].includes(o.status));
  };

  const openJobModal = (job, editOffer = null) => {
    setSelectedJob(job);
    setFeedbackMsg('');
    setFeedbackErr('');
    if (editOffer) {
      setEditingOfferId(editOffer._id);
      setProposedAmount(editOffer.proposedAmount || '');
      setOfferMessage(editOffer.message || '');
      setAvailabilityConfirmed(editOffer.availabilityConfirmation !== false);
    } else {
      setEditingOfferId(null);
      setProposedAmount(job.payment ? String(job.payment) : '');
      setOfferMessage('');
      setAvailabilityConfirmed(true);
    }
  };

  const closeJobModal = () => {
    setSelectedJob(null);
    setEditingOfferId(null);
  };

  const handleOfferSubmit = async (e) => {
    e.preventDefault();
    if (!proposedAmount || Number(proposedAmount) <= 0) {
      setFeedbackErr('Please enter a valid amount you wish to quote.');
      return;
    }
    setSubmittingOffer(true);
    setFeedbackErr('');
    setFeedbackMsg('');
    try {
      if (editingOfferId) {
        const res = await offersApi.edit(editingOfferId, {
          proposedAmount: Number(proposedAmount),
          message: offerMessage,
          availabilityConfirmation: availabilityConfirmed,
        });
        setFeedbackMsg(res.data.message || 'Offer updated successfully!');
      } else {
        const res = await offersApi.submit(selectedJob._id, {
          proposedAmount: Number(proposedAmount),
          message: offerMessage,
          availabilityConfirmation: availabilityConfirmed,
        });
        setFeedbackMsg(res.data.message || 'Offer submitted to job creator!');
      }
      await loadData();
      closeJobModal();
    } catch (err) {
      setFeedbackErr(err.response?.data?.message || 'Could not submit offer.');
    } finally {
      setSubmittingOffer(false);
    }
  };

  const handleWithdrawOffer = async (offerId) => {
    if (!window.confirm('Are you sure you want to withdraw your offer for this work?')) return;
    setFeedbackErr('');
    setFeedbackMsg('');
    try {
      const res = await offersApi.withdraw(offerId);
      setFeedbackMsg(res.data.message || 'Offer withdrawn.');
      await loadData();
      closeJobModal();
    } catch (err) {
      setFeedbackErr(err.response?.data?.message || 'Could not withdraw offer.');
    }
  };

  const statusBadgeClass = (status) => {
    switch (status) {
      case 'ACCEPTED':
      case 'WORKERS_SELECTED':
        return 'rm-badge--green';
      case 'PENDING':
      case 'OPEN':
      case 'OFFERS_RECEIVED':
        return 'rm-badge--blue';
      case 'REJECTED':
      case 'CANCELLED':
        return 'rm-badge--red';
      case 'WITHDRAWN':
      default:
        return 'rm-badge--gray';
    }
  };

  return (
    <div className="rm-worker-app">
      <LanguageTabs />
      <header className="rm-worker-topbar">
        <div>
          <div className="rm-login-mark">ROZGARMITRA / WORKER PORTAL</div>
          <h1>Namaste, {user?.name || 'Worker'} 🙏</h1>
          <p>Find daily work, quote your own rate, and get hired directly.</p>
        </div>
        <button
          className="rm-btn rm-btn--outline"
          onClick={() => {
            logout();
            window.location.href = `${import.meta.env.BASE_URL}entrywork`;
          }}
        >
          {t('signOut')}
        </button>
      </header>

      {/* Hero statistics */}
      <section className="rm-worker-intro">
        <div>
          <span className="rm-eyebrow">WORKER JOB BOARD</span>
          <h2>Available Work Near You</h2>
          <p>You can propose your own payment amount. Job creators will review your quote and select you.</p>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <div className="rm-worker-stat">
            <strong>{jobs.length}</strong>
            <span>Jobs Open</span>
          </div>
          <div className="rm-worker-stat">
            <strong>{myOffers.length}</strong>
            <span>My Offers</span>
          </div>
        </div>
      </section>

      {/* Global feedback alerts */}
      {feedbackMsg && <div className="rm-worker-alert rm-worker-alert--success">✅ {feedbackMsg}</div>}
      {feedbackErr && <div className="rm-worker-alert rm-worker-alert--error">⚠️ {feedbackErr}</div>}

      {/* My Active Offers / Status Tracker */}
      {myOffers.length > 0 && (
        <section style={{ marginBottom: '2rem' }}>
          <div className="rm-preview-section-heading">
            <div>
              <span className="rm-eyebrow">STATUS OF YOUR OFFERS</span>
              <h2>My Work Quotes & Offers ({myOffers.length})</h2>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px' }}>
            {myOffers.map((off) => {
              const j = off.jobId || {};
              const creator = off.contactDetails?.creator;
              return (
                <article
                  key={off._id}
                  style={{
                    background: '#fff',
                    borderRadius: '14px',
                    padding: '16px 20px',
                    border: off.status === 'ACCEPTED' ? '2px solid #16a34a' : '1px solid #e2e8f0',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.03)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span className="rm-badge rm-badge--blue">{j.category || 'General'}</span>
                    <span className={`rm-badge ${statusBadgeClass(off.status)}`}>
                      {off.status === 'ACCEPTED' ? '🎉 SELECTED & CONFIRMED' : off.status}
                    </span>
                  </div>
                  <h3 style={{ margin: '10px 0 6px 0', fontSize: '18px' }}>{j.title || 'Work Task'}</h3>
                  <p style={{ color: '#64748b', fontSize: '14px', margin: '0 0 10px 0' }}>
                    📍 {j.location?.city || 'Local area'} · Date: {formatDate(j.date)}
                  </p>
                  <div
                    style={{
                      background: '#f8fafc',
                      padding: '10px 14px',
                      borderRadius: '8px',
                      fontSize: '15px',
                      marginBottom: '12px',
                    }}
                  >
                    <span>Your Proposed Quote: </span>
                    <strong style={{ color: '#0f766e', fontSize: '18px' }}>₹{off.proposedAmount}</strong>
                    {off.message && (
                      <p style={{ margin: '6px 0 0 0', fontStyle: 'italic', color: '#475569', fontSize: '13px' }}>
                        "{off.message}"
                      </p>
                    )}
                  </div>

                  {/* If accepted, show contact details */}
                  {off.status === 'ACCEPTED' && creator && (
                    <div
                      style={{
                        background: '#ecfdf5',
                        border: '1px solid #a7f3d0',
                        borderRadius: '10px',
                        padding: '12px',
                        marginBottom: '12px',
                      }}
                    >
                      <strong style={{ color: '#065f46', display: 'block', marginBottom: '4px' }}>
                        🎉 Job Creator Contact Details:
                      </strong>
                      <p style={{ margin: '2px 0', color: '#047857' }}>
                        👤 <strong>{creator.name}</strong>
                      </p>
                      <p style={{ margin: '2px 0', color: '#047857' }}>
                        📞 <strong><a href={`tel:${creator.mobile}`} style={{ color: '#047857', textDecoration: 'underline' }}>{creator.mobile}</a></strong>
                      </p>
                      {creator.location?.address && (
                        <p style={{ margin: '2px 0', color: '#047857', fontSize: '13px' }}>
                          📍 {creator.location.address}, {creator.location.city}
                        </p>
                      )}
                    </div>
                  )}

                  {/* Actions if Pending */}
                  {off.status === 'PENDING' && (
                    <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
                      <button
                        className="rm-btn rm-btn--outline"
                        style={{ flex: 1, padding: '8px 12px', fontSize: '14px' }}
                        onClick={() => openJobModal(j, off)}
                      >
                        ✏️ Edit Quote
                      </button>
                      <button
                        className="rm-btn rm-btn--outline"
                        style={{ flex: 1, padding: '8px 12px', fontSize: '14px', color: '#dc2626', borderColor: '#fca5a5' }}
                        onClick={() => handleWithdrawOffer(off._id)}
                      >
                        ❌ Withdraw
                      </button>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </section>
      )}

      {/* Filter and search */}
      <div className="rm-worker-filters">
        <input
          className="rm-input"
          placeholder="🔍 Search work by title, skills or location..."
          value={search}
          onChange={(e) => {
            // Spinner comes from the event that changes the query, not the effect.
            setLoading(true);
            setSearch(e.target.value);
          }}
        />
        <select
          className="rm-select"
          value={category}
          onChange={(e) => {
            setLoading(true);
            setCategory(e.target.value);
          }}
        >
          <option value="">All categories</option>
          <option value="Construction">Construction / निर्माण</option>
          <option value="Household">Household / घरेलू काम</option>
          <option value="Shops & Businesses">Shops & Businesses / दुकान व व्यवसाय</option>
          <option value="Events">Events / उत्सव व कार्यक्रम</option>
          <option value="Agriculture">Agriculture / कृषि</option>
        </select>
      </div>

      {loading && <div className="rm-loading">Finding opportunities near you...</div>}
      {!loading && jobs.length === 0 && <div className="rm-empty">No work listings match your filter right now.</div>}

      {/* Job Grid */}
      {!loading && jobs.length > 0 && (
        <div className="rm-job-grid">
          {jobs.map((job) => {
            const activeOffer = getOfferForJob(job._id);
            const isFull = (job.workersSelected || 0) >= (job.workersRequired || 1);
            const isOpen = ['OPEN', 'OFFERS_RECEIVED', 'POSTED', 'APPLICATIONS_RECEIVED'].includes(job.status) && !isFull;

            return (
              <article className="rm-job-card" key={job._id}>
                <div className="rm-job-card__topline">
                  <span className="rm-badge rm-badge--blue">{job.category}</span>
                  <span className="rm-job-card__date">📅 {formatDate(job.date)}</span>
                </div>
                <h3>{job.title}</h3>
                <p className="rm-job-card__creator">
                  🏢 {job.creatorId?.businessName || job.creatorId?.name || 'Local Job Creator'}
                  {job.creatorId?.rating ? ` · ★ ${Number(job.creatorId.rating).toFixed(1)}` : ''}
                </p>
                <p className="rm-job-card__description">{job.description || 'No additional description provided.'}</p>

                <div className="rm-job-card__details">
                  <span>👥 Needed: <b>{job.workersRequired || 1} workers</b> ({job.workersSelected || 0} selected)</span>
                  <span>⏰ {job.startTime || '09:00'} - {job.endTime || '17:00'} ({job.duration || '1 Day'})</span>
                  <span>📍 {job.location?.city || 'Local area'}</span>
                  <span>💰 Suggested: ₹{job.payment}/{job.paymentUnit || 'day'}</span>
                </div>

                {job.requiredSkills && job.requiredSkills.length > 0 && (
                  <div style={{ marginTop: '8px', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    {job.requiredSkills.map((s, idx) => (
                      <span key={idx} style={{ background: '#f1f5f9', color: '#475569', fontSize: '12px', padding: '2px 8px', borderRadius: '4px' }}>
                        🏷️ {s}
                      </span>
                    ))}
                  </div>
                )}

                <div className="rm-job-card__footer" style={{ marginTop: '16px' }}>
                  <span className={`rm-badge ${statusBadgeClass(job.status)}`}>
                    {isFull ? 'WORKERS SELECTED' : job.status}
                  </span>

                  {activeOffer ? (
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <span
                        style={{
                          background: '#ecfdf5',
                          color: '#065f46',
                          fontWeight: 700,
                          padding: '8px 12px',
                          borderRadius: '8px',
                          fontSize: '14px',
                        }}
                      >
                        ✓ Offer: ₹{activeOffer.proposedAmount}
                      </span>
                      <button
                        className="rm-btn rm-btn--outline"
                        style={{ padding: '6px 12px', fontSize: '13px' }}
                        onClick={() => openJobModal(job, activeOffer)}
                      >
                        View / Edit
                      </button>
                    </div>
                  ) : isOpen ? (
                    <button
                      className="rm-btn rm-btn--primary"
                      style={{ fontSize: '15px', fontWeight: 700, padding: '10px 18px' }}
                      onClick={() => openJobModal(job)}
                    >
                      👁️ View & Apply (Quote Rate)
                    </button>
                  ) : (
                    <button className="rm-btn rm-btn--outline" disabled>
                      {isFull ? 'Positions Filled' : 'Closed'}
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* VIEW & APPLY / SELF-QUOTE MODAL */}
      {selectedJob && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.65)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '16px',
            overflowY: 'auto',
          }}
          onClick={closeJobModal}
        >
          <div
            style={{
              background: '#fff',
              borderRadius: '20px',
              maxWidth: '600px',
              width: '100%',
              padding: '24px',
              maxHeight: '90vh',
              overflowY: 'auto',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
              <div>
                <span className="rm-badge rm-badge--blue">{selectedJob.category}</span>
                <h2 style={{ margin: '8px 0 4px 0', fontSize: '22px' }}>{selectedJob.title}</h2>
                <p style={{ color: '#64748b', margin: 0, fontSize: '14px' }}>
                  Posted by: <b>{selectedJob.creatorId?.businessName || selectedJob.creatorId?.name || 'Local Employer'}</b>
                  {selectedJob.creatorId?.rating ? ` · ★ ${Number(selectedJob.creatorId.rating).toFixed(1)}` : ''}
                </p>
              </div>
              <button
                onClick={closeJobModal}
                style={{
                  background: '#f1f5f9',
                  border: 'none',
                  borderRadius: '50%',
                  width: '36px',
                  height: '36px',
                  fontSize: '18px',
                  cursor: 'pointer',
                }}
              >
                ✕
              </button>
            </div>

            {/* Job Details Card */}
            <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '12px', marginBottom: '20px' }}>
              <h4 style={{ margin: '0 0 10px 0', color: '#0f766e', fontSize: '15px' }}>📋 Work Details</h4>
              <p style={{ margin: '0 0 12px 0', fontSize: '14px', lineHeight: 1.5 }}>
                {selectedJob.description || 'No description provided.'}
              </p>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '13px', color: '#334155' }}>
                <div>📍 <b>Location:</b> {selectedJob.location?.city || selectedJob.location?.address || 'Local area'}</div>
                <div>👥 <b>Workers Needed:</b> {selectedJob.workersRequired || 1} ({selectedJob.workersSelected || 0} filled)</div>
                <div>📅 <b>Date:</b> {formatDate(selectedJob.date)}</div>
                <div>⏰ <b>Time:</b> {selectedJob.startTime} - {selectedJob.endTime}</div>
                <div>⌛ <b>Duration:</b> {selectedJob.duration || '1 Day'}</div>
                <div>💰 <b>Estimated Budget:</b> ₹{selectedJob.payment}/{selectedJob.paymentUnit || 'day'}</div>
              </div>

              {selectedJob.requiredSkills?.length > 0 && (
                <div style={{ marginTop: '12px' }}>
                  <b style={{ fontSize: '13px' }}>Skills / Requirements: </b>
                  <span style={{ fontSize: '13px', color: '#475569' }}>
                    {selectedJob.requiredSkills.join(', ')}
                  </span>
                </div>
              )}
            </div>

            {/* Self-Quoted Offer Form */}
            <form onSubmit={handleOfferSubmit}>
              <div
                style={{
                  background: '#f0fdf4',
                  border: '2px solid #86efac',
                  borderRadius: '16px',
                  padding: '20px',
                  marginBottom: '16px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                  <span style={{ fontSize: '24px' }}>🤝</span>
                  <h3 style={{ margin: 0, color: '#166534', fontSize: '18px' }}>
                    {editingOfferId ? 'Update Your Offer' : 'I Want to Accept This Work'}
                  </h3>
                </div>
                <p style={{ margin: '0 0 16px 0', fontSize: '14px', color: '#15803d' }}>
                  You decide the price! Enter the amount you are willing to work for. Multiple workers can quote their rates, and the job creator will choose.
                </p>

                {/* Worker's Proposed Amount Field */}
                <label style={{ display: 'block', fontWeight: 700, fontSize: '16px', color: '#0f172a', marginBottom: '8px' }}>
                  Your Proposed Amount (₹) <span style={{ color: '#dc2626' }}>*</span>
                </label>
                <div style={{ position: 'relative', marginBottom: '16px' }}>
                  <span
                    style={{
                      position: 'absolute',
                      left: '16px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      fontSize: '22px',
                      fontWeight: 700,
                      color: '#0f766e',
                    }}
                  >
                    ₹
                  </span>
                  <input
                    type="number"
                    min="1"
                    className="rm-input"
                    style={{
                      paddingLeft: '40px',
                      fontSize: '22px',
                      fontWeight: 800,
                      color: '#0f766e',
                      height: '56px',
                      background: '#fff',
                      border: '2px solid #0f766e',
                      borderRadius: '12px',
                    }}
                    value={proposedAmount}
                    onChange={(e) => setProposedAmount(e.target.value)}
                    placeholder="e.g. 1200"
                    required
                  />
                </div>

                {/* Optional Message to Creator */}
                <label style={{ display: 'block', fontWeight: 600, fontSize: '14px', color: '#334155', marginBottom: '6px' }}>
                  Message to Job Creator (Optional)
                </label>
                <textarea
                  className="rm-input"
                  style={{ background: '#fff', borderRadius: '10px', fontSize: '14px', marginBottom: '16px' }}
                  rows="2"
                  value={offerMessage}
                  onChange={(e) => setOfferMessage(e.target.value)}
                  placeholder="e.g. Available on time with my own tools / I have 5 years experience"
                />

                {/* Availability Confirmation */}
                <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '14px', fontWeight: 600, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    style={{ width: '20px', height: '20px', accentColor: '#0f766e' }}
                    checked={availabilityConfirmed}
                    onChange={(e) => setAvailabilityConfirmed(e.target.checked)}
                  />
                  <span>I confirm my availability for the date and time of this work.</span>
                </label>
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', gap: '12px' }}>
                <button
                  type="submit"
                  className="rm-btn rm-btn--primary"
                  style={{ flex: 2, height: '52px', fontSize: '17px', fontWeight: 700 }}
                  disabled={submittingOffer}
                >
                  {submittingOffer ? 'Submitting...' : editingOfferId ? '💾 I Accept (Update Quote)' : '🤝 I Accept'}
                </button>

                {editingOfferId && (
                  <button
                    type="button"
                    className="rm-btn rm-btn--outline"
                    style={{ flex: 1, color: '#dc2626', borderColor: '#fca5a5' }}
                    onClick={() => handleWithdrawOffer(editingOfferId)}
                  >
                    Withdraw Offer
                  </button>
                )}

                <button
                  type="button"
                  className="rm-btn rm-btn--outline"
                  style={{ flex: 1 }}
                  onClick={closeJobModal}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
