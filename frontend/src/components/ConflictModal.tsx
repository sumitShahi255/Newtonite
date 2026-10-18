import React from 'react';
import { AlertTriangle, RefreshCw, XCircle, ShieldAlert } from 'lucide-react';

interface ConflictModalProps {
  isOpen: boolean;
  onClose: () => void;
  onReload: () => void;
  conflictDetails?: {
    message?: string;
    expectedVersion?: number;
    currentVersion?: number;
    currentAssignee?: string;
    currentStatus?: string;
  };
}

export const ConflictModal: React.FC<ConflictModalProps> = ({
  isOpen,
  onClose,
  onReload,
  conflictDetails,
}) => {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay" style={{ zIndex: 1100 }}>
      <div
        className="modal-content"
        style={{
          maxWidth: 540,
          border: '1px solid rgba(239, 68, 68, 0.4)',
          boxShadow: '0 25px 60px -15px rgba(239, 68, 68, 0.25)',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '20px 24px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            background: 'rgba(239, 68, 68, 0.08)',
          }}
        >
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 10,
              background: 'rgba(239, 68, 68, 0.2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <AlertTriangle size={22} color="#ef4444" />
          </div>
          <div>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#fecaca' }}>
              Concurrency Conflict (HTTP 409)
            </h3>
            <p style={{ fontSize: '0.8rem', color: '#f87171', margin: 0 }}>
              Optimistic concurrency lock prevented data overwrite
            </p>
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: '24px' }}>
          <p style={{ fontSize: '0.88rem', color: 'var(--text-main)', lineHeight: 1.5, marginBottom: 16 }}>
            {conflictDetails?.message ||
              'This work item was modified by another operator while you were preparing your update. Your change was safely rejected to preserve system integrity.'}
          </p>

          {/* Conflict Details Panel */}
          <div
            style={{
              background: 'rgba(14, 20, 32, 0.8)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: 8,
              padding: 14,
              fontSize: '0.82rem',
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
              marginBottom: 20,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-dim)' }}>Your Client Version:</span>
              <span className="font-mono" style={{ color: '#f87171', fontWeight: 700 }}>
                v{conflictDetails?.expectedVersion ?? '?'} (Stale)
              </span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-dim)' }}>Current Server Version:</span>
              <span className="font-mono" style={{ color: '#34d399', fontWeight: 700 }}>
                v{conflictDetails?.currentVersion ?? '?'} (Latest)
              </span>
            </div>

            {conflictDetails?.currentStatus && (
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-dim)' }}>Latest State:</span>
                <span style={{ color: '#fbbf24', fontWeight: 600 }}>
                  {conflictDetails.currentStatus}
                </span>
              </div>
            )}

            {conflictDetails?.currentAssignee && (
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-dim)' }}>Claimed By:</span>
                <span style={{ color: '#818cf8', fontWeight: 600 }}>
                  {conflictDetails.currentAssignee}
                </span>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <button onClick={onClose} className="btn btn-secondary">
              Dismiss
            </button>
            <button
              onClick={() => {
                onReload();
                onClose();
              }}
              className="btn btn-primary"
              style={{ background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)' }}
            >
              <RefreshCw size={15} />
              <span>Reload Latest State</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
