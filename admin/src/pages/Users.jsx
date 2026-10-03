import { useEffect, useState, useCallback } from 'react';
import { adminApi } from '../api/client';
import { useAuth } from '../context/useAuth';
import EditUserModal from '../components/EditUserModal';

export default function Users() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState([]);
  const [role, setRole] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [editing, setEditing] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    adminApi
      .getUsers({ role: role || undefined, search: search || undefined, limit: 50 })
      .then((res) => setUsers(res.data.users))
      .catch((err) => setError(err.response?.data?.message || 'Failed to load users.'))
      .finally(() => setLoading(false));
  }, [role, search]);

  useEffect(() => {
    const t = setTimeout(load, 300);
    return () => clearTimeout(t);
  }, [load]);

  const handleToggleBlock = async (id) => {
    await adminApi.toggleBlock(id);
    load();
  };

  const handleVerify = async (id) => {
    await adminApi.verifyUser(id);
    load();
  };

  // Refresh the table and show a short-lived confirmation after a save.
  const handleSaved = (updated, message) => {
    setEditing(null);
    if (updated) {
      setNotice(message || 'User updated.');
      load();
    }
  };

  useEffect(() => {
    if (!notice) return undefined;
    const t = setTimeout(() => setNotice(''), 4000);
    return () => clearTimeout(t);
  }, [notice]);

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>Users</h2>

      <div className="rm-filters">
        <select className="rm-select" value={role} onChange={(e) => setRole(e.target.value)}>
          <option value="">All roles</option>
          <option value="worker">Workers</option>
          <option value="job_creator">Job Creators</option>
          <option value="admin">Admins</option>
        </select>
        <input
          className="rm-input"
          placeholder="Search name / mobile / business..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ minWidth: 260 }}
        />
      </div>

      <div className="rm-card">
        {error && <div className="rm-empty">{error}</div>}
        {notice && <div className="rm-notice">{notice}</div>}
        {loading && !error && <div className="rm-loading">Loading users...</div>}
        {!loading && !error && users.length === 0 && <div className="rm-empty">No users found.</div>}
        {!loading && !error && users.length > 0 && (
          <table className="rm-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Mobile</th>
                <th>Role</th>
                <th>Rating</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u._id}>
                  <td>{u.name || u.businessName || <em>Unnamed</em>}</td>
                  <td>{u.mobile}</td>
                  <td>
                    <span className="rm-badge rm-badge--blue">
                      {u.role === 'job_creator' ? 'Job Creator' : u.role}
                    </span>
                  </td>
                  <td>⭐ {u.rating?.toFixed?.(1) ?? u.rating} ({u.ratingCount})</td>
                  <td>
                    {u.blocked && <span className="rm-badge rm-badge--red">Blocked</span>}
                    {!u.blocked && u.verified && <span className="rm-badge rm-badge--green">Verified</span>}
                    {!u.blocked && !u.verified && <span className="rm-badge rm-badge--amber">Pending</span>}
                  </td>
                  <td style={{ display: 'flex', gap: 6 }}>
                    <button
                      className="rm-btn rm-btn--outline"
                      onClick={() => setEditing(u)}
                      title="Edit name, mobile, role or rating"
                    >
                      ✏️ Edit
                    </button>
                    {!u.verified && (
                      <button className="rm-btn rm-btn--success" onClick={() => handleVerify(u._id)}>
                        Verify
                      </button>
                    )}
                    <button
                      className={u.blocked ? 'rm-btn rm-btn--outline' : 'rm-btn rm-btn--danger'}
                      onClick={() => handleToggleBlock(u._id)}
                    >
                      {u.blocked ? 'Unblock' : 'Block'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {editing && (
        <EditUserModal
          user={editing}
          currentUserId={currentUser?.id}
          onClose={() => setEditing(null)}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}
