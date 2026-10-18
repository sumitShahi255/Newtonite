import React, { useState, useEffect } from 'react';
import { api } from '../api';
import { OutboxJob } from '../types';
import { Activity, Play, RefreshCw, X, CheckCircle, Clock, AlertOctagon } from 'lucide-react';

interface OutboxMonitorModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const OutboxMonitorModal: React.FC<OutboxMonitorModalProps> = ({ isOpen, onClose }) => {
  const [jobs, setJobs] = useState<OutboxJob[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const fetchJobs = async () => {
    setIsLoading(true);
    try {
      const res = await api.getOutboxJobs();
      setJobs(res.jobs);
    } catch (err: any) {
      console.error('Failed to load outbox jobs', err);
    } finally {
      setIsLoading(false);
    }
  };

  const triggerProcessBatch = async () => {
    setIsProcessing(true);
    setMessage(null);
    try {
      const res = await api.processOutboxBatch();
      setMessage(res.message);
      await fetchJobs();
    } catch (err: any) {
      setMessage(`Worker failed: ${err.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchJobs();
      const interval = setInterval(fetchJobs, 3000);
      return () => clearInterval(interval);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: 880 }}>
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 8,
                background: 'rgba(99, 102, 241, 0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Activity size={20} color="var(--primary)" />
            </div>
            <div>
              <h2 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#f8fafc' }}>
                Transactional Outbox & Worker Monitor
              </h2>
              <p style={{ fontSize: '0.78rem', color: 'var(--text-dim)', margin: 0 }}>
                Asynchronous event queue with exponential backoff and idempotent dispatch
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button
              onClick={triggerProcessBatch}
              disabled={isProcessing}
              className="btn btn-primary btn-sm"
              style={{ background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)' }}
            >
              <Play size={14} />
              <span>{isProcessing ? 'Processing...' : 'Run Worker Batch'}</span>
            </button>

            <button onClick={onClose} className="btn btn-secondary btn-sm">
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Status message */}
        {message && (
          <div
            style={{
              padding: '10px 24px',
              background: 'rgba(99, 102, 241, 0.1)',
              borderBottom: '1px solid rgba(99, 102, 241, 0.2)',
              fontSize: '0.82rem',
              color: '#a5b4fc',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <CheckCircle size={14} />
            <span>{message}</span>
          </div>
        )}

        {/* Content Table */}
        <div style={{ padding: 24, overflowX: 'auto' }}>
          {jobs.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-dim)' }}>
              No outbox jobs recorded yet. Trigger a work item transition or claim to generate jobs!
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.1)', textAlign: 'left', color: 'var(--text-dim)' }}>
                  <th style={{ padding: '8px 12px' }}>Job ID</th>
                  <th style={{ padding: '8px 12px' }}>Job Type</th>
                  <th style={{ padding: '8px 12px' }}>Status</th>
                  <th style={{ padding: '8px 12px' }}>Attempts</th>
                  <th style={{ padding: '8px 12px' }}>Created At</th>
                  <th style={{ padding: '8px 12px' }}>Diagnostics</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((job) => {
                  let badgeBg = 'rgba(100, 116, 139, 0.15)';
                  let badgeColor = '#94a3b8';

                  if (job.status === 'COMPLETED') {
                    badgeBg = 'rgba(16, 185, 129, 0.15)';
                    badgeColor = '#34d399';
                  } else if (job.status === 'PENDING') {
                    badgeBg = 'rgba(56, 189, 248, 0.15)';
                    badgeColor = '#38bdf8';
                  } else if (job.status === 'PROCESSING') {
                    badgeBg = 'rgba(245, 158, 11, 0.15)';
                    badgeColor = '#fbbf24';
                  } else if (job.status === 'FAILED' || job.status === 'FAILED_RETRYABLE') {
                    badgeBg = 'rgba(239, 68, 68, 0.15)';
                    badgeColor = '#f87171';
                  }

                  return (
                    <tr
                      key={job.id}
                      style={{
                        borderBottom: '1px solid rgba(255, 255, 255, 0.04)',
                        background: 'rgba(255, 255, 255, 0.01)',
                      }}
                    >
                      <td className="font-mono" style={{ padding: '10px 12px', color: 'var(--text-muted)' }}>
                        {job.id.substring(0, 8)}...
                      </td>
                      <td style={{ padding: '10px 12px', fontWeight: 600, color: '#f8fafc' }}>
                        {job.jobType}
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        <span
                          className="badge"
                          style={{ background: badgeBg, color: badgeColor, fontSize: '0.7rem' }}
                        >
                          {job.status}
                        </span>
                      </td>
                      <td style={{ padding: '10px 12px', color: 'var(--text-muted)' }}>
                        {job.attempts} / {job.maxAttempts}
                      </td>
                      <td style={{ padding: '10px 12px', color: 'var(--text-dim)' }}>
                        {new Date(job.createdAt).toLocaleTimeString()}
                      </td>
                      <td style={{ padding: '10px 12px', color: job.lastError ? '#f87171' : 'var(--text-dim)', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {job.lastError || 'Clean execution'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};
