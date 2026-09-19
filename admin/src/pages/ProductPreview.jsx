import { useState } from 'react';

const starterTasks = [
  {
    id: 1,
    title: 'Kitchen helper for evening shift',
    category: 'Household',
    location: 'Indore',
    payment: '₹650/day',
    status: 'OPEN',
  },
  {
    id: 2,
    title: 'Paint two rooms',
    category: 'Construction',
    location: 'Bhopal',
    payment: '₹900/day',
    status: 'OPEN',
  },
];

const emptyTask = {
  title: '',
  category: 'Household',
  location: '',
  payment: '',
};

export default function ProductPreview() {
  const [view, setView] = useState('creator');
  const [tasks, setTasks] = useState(starterTasks);
  const [form, setForm] = useState(emptyTask);
  const [message, setMessage] = useState('');

  const addTask = (event) => {
    event.preventDefault();
    if (!form.title.trim() || !form.location.trim() || !form.payment.trim()) return;
    setTasks((current) => [
      { ...form, id: Date.now(), title: form.title.trim(), location: form.location.trim(), payment: `₹${form.payment}/day`, status: 'OPEN' },
      ...current,
    ]);
    setForm(emptyTask);
    setMessage('Task added to the creator preview.');
  };

  const acceptTask = (id) => {
    setTasks((current) => current.map((task) => task.id === id ? { ...task, status: 'ACCEPTED' } : task));
    setMessage('Task accepted in the worker preview.');
  };

  return (
    <div>
      <div className="rm-preview-heading">
        <div>
          <span className="rm-eyebrow">PRODUCT PREVIEW</span>
          <h2>See both sides of a task</h2>
          <p>Preview how a creator adds work and how a worker accepts it.</p>
        </div>
        <div className="rm-preview-tabs" role="tablist" aria-label="Product views">
          <button className={`rm-preview-tab ${view === 'creator' ? 'active' : ''}`} onClick={() => setView('creator')}>Job creator</button>
          <button className={`rm-preview-tab ${view === 'worker' ? 'active' : ''}`} onClick={() => setView('worker')}>Worker</button>
        </div>
      </div>

      {message && <div className="rm-worker-alert rm-worker-alert--success">{message}</div>}

      {view === 'creator' ? (
        <div className="rm-preview-grid">
          <form className="rm-card rm-preview-form" onSubmit={addTask}>
            <span className="rm-eyebrow">JOB CREATOR</span>
            <h3>Add a task</h3>
            <label>Task title<input className="rm-input" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="e.g. Delivery helper" required /></label>
            <label>Category<select className="rm-select" value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })}><option>Household</option><option>Construction</option><option>Events</option><option>Shops & Businesses</option></select></label>
            <label>Location<input className="rm-input" value={form.location} onChange={(event) => setForm({ ...form, location: event.target.value })} placeholder="City or neighbourhood" required /></label>
            <label>Payment per day<input className="rm-input" type="number" min="1" value={form.payment} onChange={(event) => setForm({ ...form, payment: event.target.value })} placeholder="650" required /></label>
            <button className="rm-btn rm-btn--primary" type="submit">Add task</button>
          </form>
          <section className="rm-card">
            <div className="rm-preview-section-heading"><div><span className="rm-eyebrow">CREATOR TASKS</span><h3>Published work</h3></div><span className="rm-badge rm-badge--blue">{tasks.length} tasks</span></div>
            <div className="rm-preview-task-list">{tasks.map((task) => <TaskCard key={task.id} task={task} />)}</div>
          </section>
        </div>
      ) : (
        <section className="rm-card">
          <div className="rm-preview-section-heading"><div><span className="rm-eyebrow">WORKER DASHBOARD</span><h3>Available tasks</h3></div><span className="rm-badge rm-badge--green">Ready to accept</span></div>
          <div className="rm-preview-task-list">{tasks.map((task) => <TaskCard key={task.id} task={task} onAccept={() => acceptTask(task.id)} />)}</div>
        </section>
      )}
    </div>
  );
}

function TaskCard({ task, onAccept }) {
  return (
    <article className="rm-preview-task">
      <div><span className="rm-badge rm-badge--gray">{task.category}</span><h4>{task.title}</h4><p>{task.location} · {task.payment}</p></div>
      <div className="rm-preview-task__action"><span className={`rm-badge rm-badge--${task.status === 'ACCEPTED' ? 'green' : 'blue'}`}>{task.status === 'ACCEPTED' ? 'Accepted' : 'Open'}</span>{onAccept && <button className="rm-btn rm-btn--primary" disabled={task.status === 'ACCEPTED'} onClick={onAccept}>{task.status === 'ACCEPTED' ? 'Accepted' : 'Accept task'}</button>}</div>
    </article>
  );
}
