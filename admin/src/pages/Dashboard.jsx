import { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { adminApi, jobsApi } from '../api/client';
import { useAuth } from '../context/AuthContext';

const emptyTask = {
  title: '',
  description: '',
  category: 'Household',
  date: new Date().toISOString().slice(0, 10),
  startTime: '09:00',
  endTime: '17:00',
  payment: '',
  paymentUnit: 'day',
  location: '',
  workersRequired: '1',
};

function CreatorDashboard() {
  const [task, setTask] = useState(emptyTask);
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const loadJobs = () => {
    setLoading(true);
    jobsApi.list({ limit: 50 })
      .then((res) => setJobs(res.data.jobs))
      .catch((err) => setError(err.response?.data?.message || 'Failed to load your tasks.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadJobs(); }, []);

  const update = (field, value) => setTask((current) => ({ ...current, [field]: value }));

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const response = await jobsApi.create({
        ...task,
        payment: Number(task.payment),
        workersRequired: Number(task.workersRequired),
        location: { city: task.location },
      });
      setMessage(response.data.message || 'Task added successfully.');
      setTask(emptyTask);
      loadJobs();
    } catch (err) {
      setError(err.response?.data?.message || 'Could not add task.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="rm-creator-heading">
        <div><span className="rm-eyebrow">JOB CREATOR</span><h2>Add a task</h2><p>Post work and make it available to local workers.</p></div>
      </div>
      {message && <div className="rm-worker-alert rm-worker-alert--success">{message}</div>}
      {error && <div className="rm-worker-alert rm-worker-alert--error">{error}</div>}
      <div className="rm-creator-grid">
        <form className="rm-card rm-creator-form" onSubmit={submit}>
          <label>Task title<input className="rm-input" value={task.title} onChange={(e) => update('title', e.target.value)} placeholder="e.g. Kitchen helper" required /></label>
          <label>Description<textarea className="rm-input" value={task.description} onChange={(e) => update('description', e.target.value)} placeholder="Describe the work" rows="3" /></label>
          <div className="rm-creator-form__row"><label>Category<select className="rm-select" value={task.category} onChange={(e) => update('category', e.target.value)}><option>Household</option><option>Construction</option><option>Events</option><option>Shops & Businesses</option></select></label><label>Workers needed<input className="rm-input" type="number" min="1" value={task.workersRequired} onChange={(e) => update('workersRequired', e.target.value)} required /></label></div>
          <div className="rm-creator-form__row"><label>Date<input className="rm-input" type="date" value={task.date} onChange={(e) => update('date', e.target.value)} required /></label><label>Location<input className="rm-input" value={task.location} onChange={(e) => update('location', e.target.value)} placeholder="City" required /></label></div>
          <div className="rm-creator-form__row"><label>Start<input className="rm-input" type="time" value={task.startTime} onChange={(e) => update('startTime', e.target.value)} required /></label><label>End<input className="rm-input" type="time" value={task.endTime} onChange={(e) => update('endTime', e.target.value)} required /></label></div>
          <div className="rm-creator-form__row"><label>Payment<input className="rm-input" type="number" min="0" value={task.payment} onChange={(e) => update('payment', e.target.value)} placeholder="650" required /></label><label>Unit<select className="rm-select" value={task.paymentUnit} onChange={(e) => update('paymentUnit', e.target.value)}><option value="day">Per day</option><option value="hour">Per hour</option><option value="task">Per task</option></select></label></div>
          <button className="rm-btn rm-btn--primary" disabled={saving}>{saving ? 'Adding task...' : 'Add task'}</button>
        </form>
        <section className="rm-card"><div className="rm-preview-section-heading"><div><span className="rm-eyebrow">YOUR TASKS</span><h3>Saved in database</h3></div><span className="rm-badge rm-badge--blue">{jobs.length}</span></div>{loading ? <div className="rm-loading">Loading tasks...</div> : jobs.length === 0 ? <div className="rm-empty">No tasks added yet.</div> : <div className="rm-preview-task-list">{jobs.map((job) => <article className="rm-preview-task" key={job._id}><div><span className="rm-badge rm-badge--gray">{job.category}</span><h4>{job.title}</h4><p>{job.location?.city || 'Location pending'} · ₹{job.payment}/{job.paymentUnit} · {job.date?.slice(0, 10)}</p></div><span className="rm-badge rm-badge--blue">{job.status.replace(/_/g, ' ')}</span></article>)}</div>}</section>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState(null);
  const [error, setError] = useState('');

  if (user?.role === 'job_creator') return <CreatorDashboard />;

  useEffect(() => {
    adminApi
      .getStats()
      .then((res) => setStats(res.data.stats))
      .catch((err) => setError(err.response?.data?.message || 'Failed to load stats.'));
  }, []);

  if (error) return <div className="rm-card rm-empty">{error}</div>;
  if (!stats) return <div className="rm-loading">Loading dashboard...</div>;

  const cards = [
    { label: 'Total Users', value: stats.totalUsers },
    { label: 'Workers', value: stats.workers },
    { label: 'Job Creators', value: stats.jobCreators },
    { label: 'Active Jobs', value: stats.activeJobs },
    { label: 'Completed Jobs', value: stats.completedJobs },
    { label: 'Applications', value: stats.applications },
    { label: 'Open Reports', value: stats.openReports },
    { label: 'Pending Verification', value: stats.pendingVerification },
  ];

  const chartData = [
    { name: 'Workers', value: stats.workers },
    { name: 'Job Creators', value: stats.jobCreators },
    { name: 'Active Jobs', value: stats.activeJobs },
    { name: 'Completed Jobs', value: stats.completedJobs },
    { name: 'Applications', value: stats.applications },
  ];

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>ROZGARMITRA ADMIN</h2>

      <div className="rm-stat-grid">
        {cards.map((c) => (
          <div className="rm-stat-card" key={c.label}>
            <div className="rm-stat-card__label">{c.label}</div>
            <div className="rm-stat-card__value">{c.value.toLocaleString()}</div>
          </div>
        ))}
      </div>

      <div className="rm-card">
        <h3>Platform Overview</h3>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="name" fontSize={12} />
            <YAxis fontSize={12} />
            <Tooltip />
            <Bar dataKey="value" fill="#0f766e" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
