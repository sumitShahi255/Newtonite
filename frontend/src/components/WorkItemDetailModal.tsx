import React, { useState } from 'react';
import { api } from '../api';
import { WorkItem, ActivityEvent, Comment, TeamRole } from '../types';
import { useAuth } from '../context/AuthContext';
import {
  X,
  Clock,
  User,
  Shield,
  ArrowRight,
  Send,
  History,
  MessageSquare,
  AlertCircle,
  CheckCircle2,
  Lock,
  Edit3,
} from 'lucide-react';

interface WorkItemDetailModalProps {
  item: WorkItem | null;
  isOpen: boolean;
  onClose: () => void;
  onItemUpdated: (updatedItem: WorkItem) => void;
  onConflictDetected: (conflictInfo: any) => void;
}

export const WorkItemDetailModal: React.FC<WorkItemDetailModalProps> = ({
  item,
  isOpen,
  onClose,
  onItemUpdated,
  onConflictDetected,
}) => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'timeline' | 'edit'>('timeline');
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [isClaiming, setIsClaiming] = useState(false);
  const [newComment, setNewComment] = useState('');
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Edit fields
  const [editTitle, setEditTitle] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editPriority, setEditPriority] = useState('');
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  React.useEffect(() => {
    if (item) {
      setEditTitle(item.title);
      setEditDesc(item.description);
      setEditPriority(item.priority);
      setErrorMessage(null);
    }
  }, [item]);

  if (!isOpen || !item) return null;

  // Compute current user's role in this item's team
  const userMembership = user?.memberships?.find((m) => m.teamId === item.teamId);
  const userRole: TeamRole =
    user?.memberships?.some((m) => m.role === 'ADMIN')
      ? 'ADMIN'
      : (userMembership?.role as TeamRole) || 'VIEWER';

  const isLeadOrAdmin = userRole === 'LEAD' || userRole === 'ADMIN';
  const isMemberOrHigher = ['MEMBER', 'LEAD', 'ADMIN'].includes(userRole);
  const isViewer = userRole === 'VIEWER';

  interface TransitionOption {
    target: string;
    label: string;
    allowed: boolean;
    variant: string;
    note?: string;
  }

  // Available Transitions Logic
  const getAvailableTransitions = (): TransitionOption[] => {
    switch (item.status) {
      case 'OPEN':
        return [
          {
            target: 'IN_PROGRESS',
            label: 'Start Work (In Progress)',
            allowed: isMemberOrHigher,
            variant: 'btn-primary',
          },
        ];
      case 'IN_PROGRESS':
        return [
          {
            target: 'AWAITING_APPROVAL',
            label: 'Submit for Lead Approval',
            allowed: isMemberOrHigher,
            variant: 'btn-primary',
          },
          {
            target: 'RESOLVED',
            label: 'Resolve Directly',
            allowed: isMemberOrHigher,
            variant: 'btn-success',
          },
          {
            target: 'OPEN',
            label: 'Release to Unassigned Queue',
            allowed: isMemberOrHigher,
            variant: 'btn-secondary',
          },
        ];
      case 'AWAITING_APPROVAL':
        return [
          {
            target: 'RESOLVED',
            label: 'Approve Resolution (Lead)',
            allowed: isLeadOrAdmin,
            variant: 'btn-success',
            note: !isLeadOrAdmin ? 'Requires Team Lead sign-off' : undefined,
          },
          {
            target: 'IN_PROGRESS',
            label: 'Reject & Request Rework',
            allowed: isLeadOrAdmin,
            variant: 'btn-danger',
            note: !isLeadOrAdmin ? 'Requires Team Lead sign-off' : undefined,
          },
        ];
      case 'RESOLVED':
        return [
          {
            target: 'CLOSED',
            label: 'Verify & Close Incident',
            allowed: isMemberOrHigher,
            variant: 'btn-secondary',
          },
          {
            target: 'IN_PROGRESS',
            label: 'Reopen for Remediation',
            allowed: isMemberOrHigher,
            variant: 'btn-danger',
          },
        ];
      case 'CLOSED':
        return [
          {
            target: 'OPEN',
            label: 'Reopen Incident',
            allowed: isLeadOrAdmin,
            variant: 'btn-secondary',
            note: !isLeadOrAdmin ? 'Requires Lead role' : undefined,
          },
        ];
      default:
        return [];
    }
  };

  const handleClaim = async () => {
    setIsClaiming(true);
    setErrorMessage(null);
    try {
      const res = await api.claimWorkItem(item.id);
      onItemUpdated(res.item);
    } catch (err: any) {
      if (err.status === 409) {
        onConflictDetected({
          message: err.message,
          expectedVersion: item.version,
          currentVersion: err.details?.currentVersion,
          currentAssignee: err.details?.currentAssignee?.name,
          currentStatus: err.details?.currentStatus,
        });
      } else {
        setErrorMessage(err.message || 'Failed to claim work item');
      }
    } finally {
      setIsClaiming(false);
    }
  };

  const handleTransition = async (targetStatus: string) => {
    setIsTransitioning(true);
    setErrorMessage(null);
    try {
      // Sends optimistic version
      const res = await api.transitionWorkItem(item.id, targetStatus, item.version);
      onItemUpdated(res.item);
    } catch (err: any) {
      if (err.status === 409) {
        onConflictDetected({
          message: err.message,
          expectedVersion: item.version,
          currentVersion: err.details?.currentResource?.version,
          currentStatus: err.details?.currentResource?.status,
        });
      } else {
        setErrorMessage(err.message || 'Transition rejected');
      }
    } finally {
      setIsTransitioning(false);
    }
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingEdit(true);
    setErrorMessage(null);
    try {
      const res = await api.updateWorkItem(
        item.id,
        {
          title: editTitle,
          description: editDesc,
          priority: editPriority as any,
        },
        item.version
      );
      onItemUpdated(res.item);
      setActiveTab('timeline');
    } catch (err: any) {
      if (err.status === 409) {
        onConflictDetected({
          message: err.message,
          expectedVersion: item.version,
          currentVersion: err.details?.currentResource?.version,
          currentStatus: err.details?.currentResource?.status,
        });
      } else {
        setErrorMessage(err.message || 'Update failed');
      }
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim()) return;

    setIsSubmittingComment(true);
    try {
      await api.addComment(item.id, newComment.trim());
      setNewComment('');
      // Reload latest item detail
      const res = await api.getWorkItemById(item.id);
      onItemUpdated(res.item);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to post comment');
    } finally {
      setIsSubmittingComment(false);
    }
  };

  const availableTransitions = getAvailableTransitions();

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: 840 }}>
        {/* Top Header */}
        <div
          style={{
            padding: '20px 24px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 16,
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <span className="font-mono" style={{ fontSize: '0.8rem', color: 'var(--text-dim)', fontWeight: 600 }}>
                {item.id}
              </span>
              <span
                className="badge font-mono"
                style={{
                  background: 'rgba(99, 102, 241, 0.2)',
                  color: '#818cf8',
                  border: '1px solid rgba(99, 102, 241, 0.3)',
                  fontSize: '0.72rem',
                }}
              >
                Version {item.version}
              </span>
              <span className={`badge badge-${item.priority.toLowerCase()}`}>
                {item.priority}
              </span>
              <span className={`badge-status badge-status-${item.status}`}>
                {item.status.replace('_', ' ')}
              </span>
            </div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#f8fafc', lineHeight: 1.3 }}>
              {item.title}
            </h2>
          </div>

          <button onClick={onClose} className="btn btn-secondary btn-sm">
            <X size={16} />
          </button>
        </div>

        {/* Error message banner */}
        {errorMessage && (
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
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Operational Context Bar */}
        <div
          style={{
            padding: '12px 24px',
            background: 'rgba(14, 20, 32, 0.6)',
            borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 12,
            fontSize: '0.82rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div>
              <span style={{ color: 'var(--text-dim)' }}>Team: </span>
              <strong style={{ color: '#a5b4fc' }}>{item.team?.name}</strong>
            </div>

            <div>
              <span style={{ color: 'var(--text-dim)' }}>Your Role: </span>
              <strong style={{ color: isLeadOrAdmin ? '#fcd34d' : '#93c5fd' }}>{userRole}</strong>
            </div>

            <div>
              <span style={{ color: 'var(--text-dim)' }}>Assignee: </span>
              {item.assignee ? (
                <strong style={{ color: item.assigneeId === user?.id ? '#34d399' : '#f8fafc' }}>
                  {item.assignee.name} {item.assigneeId === user?.id && '(You)'}
                </strong>
              ) : (
                <span style={{ color: '#f87171', fontStyle: 'italic' }}>Unassigned</span>
              )}
            </div>
          </div>

          {/* Quick Claim Button if unassigned */}
          {!item.assigneeId && !isViewer && (
            <button
              onClick={handleClaim}
              disabled={isClaiming}
              className="btn btn-primary btn-sm"
              style={{ background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)' }}
            >
              <User size={13} />
              <span>{isClaiming ? 'Claiming (Row Lock)...' : 'Claim Item Now'}</span>
            </button>
          )}
        </div>

        {/* Workflow State Machine Actions Panel */}
        {!isViewer && availableTransitions.length > 0 && (
          <div
            style={{
              padding: '16px 24px',
              background: 'rgba(99, 102, 241, 0.05)',
              borderBottom: '1px solid rgba(99, 102, 241, 0.15)',
            }}
          >
            <div style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-dim)', marginBottom: 8 }}>
              Allowed Workflow Actions (Server Enforced)
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
              {availableTransitions.map((t) => (
                <div key={t.target} style={{ position: 'relative' }}>
                  <button
                    onClick={() => handleTransition(t.target)}
                    disabled={!t.allowed || isTransitioning}
                    className={`btn ${t.variant} btn-sm`}
                    style={{ opacity: t.allowed ? 1 : 0.4 }}
                    title={t.note || `Transition to ${t.target}`}
                  >
                    <span>{t.label}</span>
                    <ArrowRight size={13} />
                  </button>
                  {t.note && (
                    <div style={{ fontSize: '0.68rem', color: '#f59e0b', marginTop: 3 }}>
                      {t.note}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tab Navigation: Timeline vs Edit */}
        <div
          style={{
            display: 'flex',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
            padding: '0 24px',
          }}
        >
          <button
            onClick={() => setActiveTab('timeline')}
            style={{
              padding: '12px 16px',
              background: 'none',
              border: 'none',
              borderBottom: activeTab === 'timeline' ? '2px solid var(--primary)' : '2px solid transparent',
              color: activeTab === 'timeline' ? '#fff' : 'var(--text-dim)',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontSize: '0.85rem',
            }}
          >
            <History size={15} />
            <span>Operational Timeline & Comments</span>
          </button>

          {!isViewer && (
            <button
              onClick={() => setActiveTab('edit')}
              style={{
                padding: '12px 16px',
                background: 'none',
                border: 'none',
                borderBottom: activeTab === 'edit' ? '2px solid var(--primary)' : '2px solid transparent',
                color: activeTab === 'edit' ? '#fff' : 'var(--text-dim)',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                fontSize: '0.85rem',
              }}
            >
              <Edit3 size={15} />
              <span>Edit Details (Optimistic Version Lock)</span>
            </button>
          )}
        </div>

        {/* Tab Body */}
        <div style={{ padding: 24, maxHeight: '50vh', overflowY: 'auto' }}>
          {activeTab === 'edit' ? (
            <form onSubmit={handleSaveEdit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-dim)', marginBottom: 4 }}>
                  Title
                </label>
                <input
                  type="text"
                  className="input"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  required
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-dim)', marginBottom: 4 }}>
                  Priority Level
                </label>
                <select
                  className="select"
                  value={editPriority}
                  onChange={(e) => setEditPriority(e.target.value)}
                >
                  <option value="URGENT">Urgent</option>
                  <option value="HIGH">High</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="LOW">Low</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-dim)', marginBottom: 4 }}>
                  Description
                </label>
                <textarea
                  className="textarea"
                  rows={4}
                  value={editDesc}
                  onChange={(e) => setEditDesc(e.target.value)}
                  required
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button
                  type="button"
                  onClick={() => setActiveTab('timeline')}
                  className="btn btn-secondary btn-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingEdit}
                  className="btn btn-primary btn-sm"
                >
                  {isSavingEdit ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          ) : (
            <div>
              {/* Description box */}
              <div
                style={{
                  background: 'rgba(255, 255, 255, 0.02)',
                  border: '1px solid rgba(255, 255, 255, 0.05)',
                  borderRadius: 8,
                  padding: 14,
                  marginBottom: 20,
                  fontSize: '0.88rem',
                  lineHeight: 1.5,
                  color: '#e2e8f0',
                }}
              >
                {item.description}
              </div>

              {/* Activity Timeline */}
              <h4 style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-dim)', marginBottom: 12, textTransform: 'uppercase' }}>
                Immutable Activity History (Atomic Log)
              </h4>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
                {item.activityEvents && item.activityEvents.length > 0 ? (
                  item.activityEvents.map((event) => (
                    <div
                      key={event.id}
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: 12,
                        padding: '10px 12px',
                        background: 'rgba(255, 255, 255, 0.015)',
                        border: '1px solid rgba(255, 255, 255, 0.04)',
                        borderRadius: 6,
                        fontSize: '0.8rem',
                      }}
                    >
                      <div
                        style={{
                          width: 24,
                          height: 24,
                          borderRadius: '50%',
                          background: 'rgba(99, 102, 241, 0.15)',
                          color: '#818cf8',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '0.68rem',
                          fontWeight: 700,
                          flexShrink: 0,
                        }}
                      >
                        {event.user?.name?.[0] || 'U'}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <span style={{ fontWeight: 600, color: '#f8fafc' }}>
                            {event.user?.name || 'System Operator'}
                          </span>
                          <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>
                            {new Date(event.createdAt).toLocaleTimeString()}
                          </span>
                        </div>
                        <div style={{ color: 'var(--text-muted)', marginTop: 2 }}>
                          <span
                            className="badge"
                            style={{
                              fontSize: '0.65rem',
                              marginRight: 6,
                              background: 'rgba(99, 102, 241, 0.1)',
                              color: '#a5b4fc',
                            }}
                          >
                            {event.eventType}
                          </span>
                          {event.fromState && event.toState && (
                            <span>
                              {event.fromState} → <strong>{event.toState}</strong>
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>No events recorded.</div>
                )}
              </div>

              {/* Comments Section */}
              <h4 style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-dim)', marginBottom: 12, textTransform: 'uppercase' }}>
                Comments & Operator Notes
              </h4>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
                {item.comments && item.comments.length > 0 ? (
                  item.comments.map((c) => (
                    <div
                      key={c.id}
                      style={{
                        padding: '10px 14px',
                        background: 'rgba(14, 20, 32, 0.6)',
                        border: '1px solid rgba(255, 255, 255, 0.06)',
                        borderRadius: 8,
                        fontSize: '0.82rem',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <strong style={{ color: '#a5b4fc' }}>{c.user?.name}</strong>
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>
                          {new Date(c.createdAt).toLocaleTimeString()}
                        </span>
                      </div>
                      <p style={{ color: '#e2e8f0', margin: 0 }}>{c.content}</p>
                    </div>
                  ))
                ) : (
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>No comments yet.</div>
                )}
              </div>

              {/* Add Comment Input */}
              {!isViewer && (
                <form onSubmit={handleAddComment} style={{ display: 'flex', gap: 8 }}>
                  <input
                    type="text"
                    className="input"
                    placeholder="Add an operational note or status update..."
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                  />
                  <button
                    type="submit"
                    disabled={isSubmittingComment || !newComment.trim()}
                    className="btn btn-primary btn-sm"
                  >
                    <Send size={14} />
                    <span>Post</span>
                  </button>
                </form>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
