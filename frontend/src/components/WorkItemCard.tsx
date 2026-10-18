import React from 'react';
import { WorkItem } from '../types';
import {
  AlertCircle,
  Clock,
  MessageSquare,
  History,
  User,
  Shield,
  CheckCircle2,
  Lock,
} from 'lucide-react';

interface WorkItemCardProps {
  item: WorkItem;
  currentUserId?: string;
  onSelect: (item: WorkItem) => void;
  onClaim: (item: WorkItem, e: React.MouseEvent) => void;
  isClaiming?: boolean;
}

export const WorkItemCard: React.FC<WorkItemCardProps> = ({
  item,
  currentUserId,
  onSelect,
  onClaim,
  isClaiming,
}) => {
  const isAssignedToMe = item.assigneeId === currentUserId;
  const isUnassigned = !item.assigneeId;

  return (
    <div
      onClick={() => onSelect(item)}
      className="glass-panel"
      style={{
        padding: '16px 20px',
        marginBottom: 12,
        cursor: 'pointer',
        transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        position: 'relative',
        overflow: 'hidden',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = 'var(--border-hover)';
        e.currentTarget.style.transform = 'translateY(-2px)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = 'var(--border-subtle)';
        e.currentTarget.style.transform = 'none';
      }}
    >
      {/* Top Header: ID, Version, Type, Priority, Status */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span
            className="font-mono"
            style={{ fontSize: '0.75rem', color: 'var(--text-dim)', fontWeight: 600 }}
          >
            {item.id}
          </span>

          <span
            className="badge font-mono"
            style={{
              fontSize: '0.65rem',
              background: 'rgba(255, 255, 255, 0.06)',
              color: '#cbd5e1',
              border: '1px solid rgba(255, 255, 255, 0.1)',
            }}
            title="Optimistic Concurrency Version"
          >
            v{item.version}
          </span>

          <span
            style={{
              fontSize: '0.72rem',
              fontWeight: 600,
              color: '#a5b4fc',
              background: 'rgba(99, 102, 241, 0.12)',
              padding: '2px 8px',
              borderRadius: 4,
            }}
          >
            {item.team?.name || 'Team'}
          </span>

          <span
            style={{
              fontSize: '0.7rem',
              color: 'var(--text-muted)',
              textTransform: 'uppercase',
              fontWeight: 600,
            }}
          >
            {item.type.replace('_', ' ')}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* Priority Badge */}
          <span className={`badge badge-${item.priority.toLowerCase()}`}>
            {item.priority === 'URGENT' && <AlertCircle size={12} />}
            {item.priority}
          </span>

          {/* Status Badge */}
          <span className={`badge-status badge-status-${item.status}`}>
            {item.status.replace('_', ' ')}
          </span>
        </div>
      </div>

      {/* Main Title & Description snippet */}
      <div>
        <h3
          style={{
            fontSize: '0.98rem',
            fontWeight: 700,
            color: '#f8fafc',
            marginBottom: 4,
            lineHeight: 1.35,
          }}
        >
          {item.title}
        </h3>
        <p
          style={{
            fontSize: '0.82rem',
            color: 'var(--text-muted)',
            lineHeight: 1.45,
            overflow: 'hidden',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
          }}
        >
          {item.description}
        </p>
      </div>

      {/* Bottom Footer: Assignee, Metadata, Quick Claim */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderTop: '1px solid rgba(255, 255, 255, 0.05)',
          paddingTop: 10,
          marginTop: 2,
          flexWrap: 'wrap',
          gap: 10,
        }}
      >
        {/* Assignee / Claim Section */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {isUnassigned ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: '0.78rem', color: '#f87171', fontStyle: 'italic' }}>
                Unassigned
              </span>
              <button
                onClick={(e) => onClaim(item, e)}
                disabled={isClaiming}
                className="btn btn-primary btn-sm"
                style={{
                  fontSize: '0.75rem',
                  padding: '3px 10px',
                  background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
                }}
              >
                {isClaiming ? 'Claiming...' : 'Claim Item'}
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: '50%',
                  background: isAssignedToMe ? 'rgba(16, 185, 129, 0.2)' : 'rgba(99, 102, 241, 0.2)',
                  color: isAssignedToMe ? '#34d399' : '#818cf8',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '0.7rem',
                  fontWeight: 700,
                }}
              >
                {item.assignee?.name?.[0] || 'U'}
              </div>
              <span
                style={{
                  fontSize: '0.8rem',
                  color: isAssignedToMe ? '#34d399' : 'var(--text-main)',
                  fontWeight: isAssignedToMe ? 700 : 500,
                }}
              >
                {item.assignee?.name || 'Assigned'}
                {isAssignedToMe && ' (You)'}
              </span>
            </div>
          )}
        </div>

        {/* Telemetry info */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: '0.75rem', color: 'var(--text-dim)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <Clock size={13} />
            <span>{new Date(item.createdAt).toLocaleDateString()}</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <MessageSquare size={13} />
            <span>{item._count?.comments || item.comments?.length || 0}</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <History size={13} />
            <span>{item._count?.activityEvents || item.activityEvents?.length || 0} events</span>
          </div>
        </div>
      </div>
    </div>
  );
};
