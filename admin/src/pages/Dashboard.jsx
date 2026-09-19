import { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { adminApi } from '../api/client';

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [error, setError] = useState('');

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
