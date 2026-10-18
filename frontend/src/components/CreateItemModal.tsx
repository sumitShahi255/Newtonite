import React, { useState } from 'react';
import { api } from '../api';
import { TeamSummary, WorkItem } from '../types';
import { PlusCircle, X, AlertCircle } from 'lucide-react';

interface CreateItemModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (item: WorkItem) => void;
  teams: TeamSummary[];
}

export const CreateItemModal: React.FC<CreateItemModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  teams,
}) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [teamId, setTeamId] = useState(teams[0]?.id || '');
  const [type, setType] = useState('INCIDENT');
  const [priority, setPriority] = useState('HIGH');
  const [dueDate, setDueDate] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !description.trim()) {
      setError('Please provide both title and description.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const res = await api.createWorkItem({
        title: title.trim(),
        description: description.trim(),
        teamId: teamId || teams[0]?.id,
        type,
        priority,
        dueDate: dueDate || undefined,
      });

      onSuccess(res.item);
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to create work item');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: 600 }}>
        {/* Header */}
        <div
          style={{
            padding: '20px 24px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <PlusCircle size={20} color="var(--primary)" />
            <h2 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#f8fafc' }}>
              Create Operational Work Item
            </h2>
          </div>
          <button onClick={onClose} className="btn btn-secondary btn-sm">
            <X size={16} />
          </button>
        </div>

        {/* Error Alert */}
        {error && (
          <div
            style={{
              padding: '12px 24px',
              background: 'rgba(239, 68, 68, 0.15)',
              borderBottom: '1px solid rgba(239, 68, 68, 0.3)',
              color: '#fca5a5',
              fontSize: '0.85rem',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>
              Item Title *
            </label>
            <input
              type="text"
              required
              placeholder="e.g., Stripe Webhook 400 Signature Failure in Production"
              className="input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>
                Target Team *
              </label>
              <select
                className="select"
                value={teamId}
                onChange={(e) => setTeamId(e.target.value)}
                required
              >
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>
                Work Item Type
              </label>
              <select className="select" value={type} onChange={(e) => setType(e.target.value)}>
                <option value="INCIDENT">Incident</option>
                <option value="CUSTOMER_ISSUE">Customer Issue</option>
                <option value="PAYMENT">Payment</option>
                <option value="COMPLIANCE">Compliance</option>
                <option value="TASK">Task</option>
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>
                Priority Level
              </label>
              <select className="select" value={priority} onChange={(e) => setPriority(e.target.value)}>
                <option value="URGENT">Urgent (Immediate P1)</option>
                <option value="HIGH">High (P2)</option>
                <option value="MEDIUM">Medium (P3)</option>
                <option value="LOW">Low (P4)</option>
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>
                Due Date (Optional)
              </label>
              <input
                type="date"
                className="input"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>
              Description & Operational Runbook Notes *
            </label>
            <textarea
              required
              rows={4}
              placeholder="Detail the telemetry metrics, reproducing steps, error codes, and mitigation protocol..."
              className="textarea"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          {/* Footer Actions */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 8 }}>
            <button type="button" onClick={onClose} className="btn btn-secondary">
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="btn btn-primary"
              id="submit-create-item"
            >
              <PlusCircle size={15} />
              <span>{isSubmitting ? 'Submitting (Atomic Outbox)...' : 'Create Work Item'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
