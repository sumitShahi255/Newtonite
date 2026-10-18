import React, { useState, useEffect, useCallback } from 'react';
import { api } from './api';
import { WorkItem, TeamSummary } from './types';
import { useAuth } from './context/AuthContext';
import { Navbar } from './components/Navbar';
import { StatsCards } from './components/StatsCards';
import { FilterBar } from './components/FilterBar';
import { WorkItemCard } from './components/WorkItemCard';
import { WorkItemDetailModal } from './components/WorkItemDetailModal';
import { CreateItemModal } from './components/CreateItemModal';
import { ConflictModal } from './components/ConflictModal';
import { OutboxMonitorModal } from './components/OutboxMonitorModal';
import { ChevronLeft, ChevronRight, Inbox, AlertTriangle } from 'lucide-react';

export const App: React.FC = () => {
  const { user, token } = useAuth();

  const [items, setItems] = useState<WorkItem[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [page, setPage] = useState<number>(1);
  const limit = 20;

  const [teams, setTeams] = useState<TeamSummary[]>([]);
  const [currentView, setCurrentView] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedTeamId, setSelectedTeamId] = useState<string>('');
  const [selectedStatus, setSelectedStatus] = useState<string>('');
  const [selectedPriority, setSelectedPriority] = useState<string>('');
  const [selectedType, setSelectedType] = useState<string>('');

  const [assignedCount, setAssignedCount] = useState<number>(0);
  const [urgentCount, setUrgentCount] = useState<number>(0);
  const [approvalCount, setApprovalCount] = useState<number>(0);

  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [selectedItem, setSelectedItem] = useState<WorkItem | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState<boolean>(false);
  const [isCreateOpen, setIsCreateOpen] = useState<boolean>(false);
  const [isOutboxOpen, setIsOutboxOpen] = useState<boolean>(false);
  const [conflictDetails, setConflictDetails] = useState<any | null>(null);

  // Load available teams
  const fetchTeams = useCallback(async () => {
    if (!token) return;
    try {
      const res = await api.getTeams();
      setTeams(res.teams);
    } catch (err) {
      console.error('Error fetching teams:', err);
    }
  }, [token]);

  // Load telemetry stats
  const fetchStats = useCallback(async () => {
    if (!token) return;
    try {
      const [assignedRes, urgentRes, approvalRes] = await Promise.all([
        api.getWorkItems({ view: 'assigned_to_me', limit: 1 }),
        api.getWorkItems({ view: 'unassigned_urgent', limit: 1 }),
        api.getWorkItems({ view: 'awaiting_my_approval', limit: 1 }),
      ]);
      setAssignedCount(assignedRes.totalCount);
      setUrgentCount(urgentRes.totalCount);
      setApprovalCount(approvalRes.totalCount);
    } catch (err) {
      console.error('Error fetching stats:', err);
    }
  }, [token]);

  // Load main work items list
  const fetchWorkItems = useCallback(async () => {
    if (!token) return;
    setIsLoading(true);
    try {
      const params: Record<string, any> = {
        limit,
        page,
      };

      if (currentView !== 'all') {
        params.view = currentView;
      }
      if (searchQuery.trim()) {
        params.q = searchQuery.trim();
      }
      if (selectedTeamId) {
        params.teamId = selectedTeamId;
      }
      if (selectedStatus) {
        params.status = selectedStatus;
      }
      if (selectedPriority) {
        params.priority = selectedPriority;
      }
      if (selectedType) {
        params.type = selectedType;
      }

      const res = await api.getWorkItems(params);
      setItems(res.items);
      setTotalCount(res.totalCount);
    } catch (err) {
      console.error('Error fetching work items:', err);
    } finally {
      setIsLoading(false);
    }
  }, [
    token,
    page,
    limit,
    currentView,
    searchQuery,
    selectedTeamId,
    selectedStatus,
    selectedPriority,
    selectedType,
  ]);

  useEffect(() => {
    fetchTeams();
    fetchStats();
  }, [fetchTeams, fetchStats, user]);

  useEffect(() => {
    fetchWorkItems();
  }, [fetchWorkItems]);

  // View preset switch handler
  const handleSelectView = (view: string) => {
    setCurrentView(view);
    setPage(1);
  };

  // Reset filters
  const handleResetFilters = () => {
    setSearchQuery('');
    setSelectedTeamId('');
    setSelectedStatus('');
    setSelectedPriority('');
    setSelectedType('');
    setPage(1);
  };

  // Open item detail
  const handleOpenDetail = async (item: WorkItem) => {
    try {
      const res = await api.getWorkItemById(item.id);
      setSelectedItem(res.item);
      setIsDetailOpen(true);
    } catch (err: any) {
      if (err.status === 403) {
        alert('Access denied: You do not belong to the team this work item belongs to.');
      } else {
        alert(err.message || 'Failed to open work item');
      }
    }
  };

  // Optimistic Quick Claim Action
  const handleQuickClaim = async (item: WorkItem, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user) return;

    // Save previous state for rollback
    const previousItems = [...items];

    // Optimistically update UI
    setItems((prev) =>
      prev.map((i) =>
        i.id === item.id
          ? {
              ...i,
              assigneeId: user.id,
              assignee: { id: user.id, name: user.name, email: user.email },
              status: i.status === 'OPEN' ? 'IN_PROGRESS' : i.status,
              version: i.version + 1,
            }
          : i
      )
    );

    try {
      const res = await api.claimWorkItem(item.id);
      // Synchronize with server response
      setItems((prev) => prev.map((i) => (i.id === item.id ? res.item : i)));
      fetchStats();
    } catch (err: any) {
      // Rollback optimistic update
      setItems(previousItems);

      if (err.status === 409) {
        setConflictDetails({
          message: err.message,
          expectedVersion: item.version,
          currentVersion: err.details?.currentVersion,
          currentAssignee: err.details?.currentAssignee?.name,
          currentStatus: err.details?.currentStatus,
        });
      } else {
        alert(err.message || 'Failed to claim work item');
      }
    }
  };

  const totalPages = Math.ceil(totalCount / limit) || 1;

  return (
    <div>
      <Navbar
        onOpenCreateModal={() => setIsCreateOpen(true)}
        onOpenOutboxModal={() => setIsOutboxOpen(true)}
      />

      <main className="app-container">
        {/* Telemetry Stat Cards */}
        <StatsCards
          currentView={currentView}
          onSelectView={handleSelectView}
          assignedCount={assignedCount}
          urgentCount={urgentCount}
          approvalCount={approvalCount}
          totalCount={totalCount}
        />

        {/* Search & Filter Toolbar */}
        <FilterBar
          searchQuery={searchQuery}
          onSearchChange={(q) => {
            setSearchQuery(q);
            setPage(1);
          }}
          selectedTeamId={selectedTeamId}
          onTeamChange={(id) => {
            setSelectedTeamId(id);
            setPage(1);
          }}
          selectedStatus={selectedStatus}
          onStatusChange={(s) => {
            setSelectedStatus(s);
            setPage(1);
          }}
          selectedPriority={selectedPriority}
          onPriorityChange={(p) => {
            setSelectedPriority(p);
            setPage(1);
          }}
          selectedType={selectedType}
          onTypeChange={(t) => {
            setSelectedType(t);
            setPage(1);
          }}
          teams={teams}
          onResetFilters={handleResetFilters}
          onRefresh={() => {
            fetchWorkItems();
            fetchStats();
          }}
          isLoading={isLoading}
        />

        {/* Work Item List */}
        <div style={{ position: 'relative', minHeight: 300 }}>
          {isLoading && (
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                background: 'rgba(7, 9, 14, 0.5)',
                backdropFilter: 'blur(2px)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 10,
                borderRadius: 'var(--radius-lg)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--primary)', fontWeight: 600 }}>
                <div
                  style={{
                    width: 20,
                    height: 20,
                    border: '3px solid rgba(99, 102, 241, 0.2)',
                    borderTopColor: 'var(--primary)',
                    borderRadius: '50%',
                    animation: 'spin 0.8s linear infinite',
                  }}
                />
                <span>Syncing Database Telemetry...</span>
              </div>
            </div>
          )}

          {items.length === 0 && !isLoading ? (
            <div
              className="glass-panel"
              style={{
                padding: '60px 20px',
                textAlign: 'center',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 12,
              }}
            >
              <Inbox size={42} color="var(--text-dim)" />
              <h3 style={{ fontSize: '1.1rem', color: '#f8fafc', fontWeight: 700 }}>
                No Operational Items Found
              </h3>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-dim)', maxWidth: 400 }}>
                No work items match the current filter criteria or assigned view. Try adjusting your search query or reset filters.
              </p>
              <button onClick={handleResetFilters} className="btn btn-secondary btn-sm">
                Clear Filters
              </button>
            </div>
          ) : (
            <div>
              {items.map((item) => (
                <WorkItemCard
                  key={item.id}
                  item={item}
                  currentUserId={user?.id}
                  onSelect={handleOpenDetail}
                  onClaim={handleQuickClaim}
                />
              ))}
            </div>
          )}
        </div>

        {/* Server-Side Pagination Bar */}
        {totalCount > 0 && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginTop: 20,
              padding: '12px 16px',
              background: 'rgba(14, 20, 32, 0.4)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-md)',
              fontSize: '0.85rem',
              color: 'var(--text-muted)',
              flexWrap: 'wrap',
              gap: 12,
            }}
          >
            <div>
              Showing{' '}
              <strong style={{ color: '#fff' }}>
                {(page - 1) * limit + 1}
              </strong>{' '}
              to{' '}
              <strong style={{ color: '#fff' }}>
                {Math.min(page * limit, totalCount)}
              </strong>{' '}
              of <strong style={{ color: '#fff' }}>{totalCount.toLocaleString()}</strong> operational items
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="btn btn-secondary btn-sm"
              >
                <ChevronLeft size={16} />
                <span>Prev</span>
              </button>

              <span style={{ padding: '0 8px', fontWeight: 600, color: '#f8fafc' }}>
                Page {page} of {totalPages}
              </span>

              <button
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="btn btn-secondary btn-sm"
              >
                <span>Next</span>
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </main>

      {/* Item Detail Modal Drawer */}
      <WorkItemDetailModal
        item={selectedItem}
        isOpen={isDetailOpen}
        onClose={() => setIsDetailOpen(false)}
        onItemUpdated={(updated) => {
          setSelectedItem(updated);
          setItems((prev) => prev.map((i) => (i.id === updated.id ? updated : i)));
          fetchStats();
        }}
        onConflictDetected={(info) => {
          setConflictDetails(info);
        }}
      />

      {/* Create Work Item Modal */}
      <CreateItemModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        teams={teams}
        onSuccess={(newItem) => {
          setItems((prev) => [newItem, ...prev]);
          setTotalCount((c) => c + 1);
          fetchStats();
        }}
      />

      {/* Concurrency Conflict Resolution Dialog */}
      <ConflictModal
        isOpen={Boolean(conflictDetails)}
        onClose={() => setConflictDetails(null)}
        conflictDetails={conflictDetails}
        onReload={async () => {
          if (selectedItem) {
            try {
              const res = await api.getWorkItemById(selectedItem.id);
              setSelectedItem(res.item);
              setItems((prev) => prev.map((i) => (i.id === res.item.id ? res.item : i)));
            } catch (e) {
              console.error(e);
            }
          }
          fetchWorkItems();
          fetchStats();
        }}
      />

      {/* Outbox Background Jobs Monitor */}
      <OutboxMonitorModal
        isOpen={isOutboxOpen}
        onClose={() => setIsOutboxOpen(false)}
      />
    </div>
  );
};
