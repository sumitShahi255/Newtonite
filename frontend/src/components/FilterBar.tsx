import React from 'react';
import { Search, Filter, X, RefreshCw } from 'lucide-react';
import { TeamSummary } from '../types';

interface FilterBarProps {
  searchQuery: string;
  onSearchChange: (q: string) => void;
  selectedTeamId: string;
  onTeamChange: (id: string) => void;
  selectedStatus: string;
  onStatusChange: (status: string) => void;
  selectedPriority: string;
  onPriorityChange: (p: string) => void;
  selectedType: string;
  onTypeChange: (t: string) => void;
  teams: TeamSummary[];
  onResetFilters: () => void;
  onRefresh: () => void;
  isLoading: boolean;
}

export const FilterBar: React.FC<FilterBarProps> = ({
  searchQuery,
  onSearchChange,
  selectedTeamId,
  onTeamChange,
  selectedStatus,
  onStatusChange,
  selectedPriority,
  onPriorityChange,
  selectedType,
  onTypeChange,
  teams,
  onResetFilters,
  onRefresh,
  isLoading,
}) => {
  const hasActiveFilters =
    Boolean(searchQuery) ||
    Boolean(selectedTeamId) ||
    Boolean(selectedStatus) ||
    Boolean(selectedPriority) ||
    Boolean(selectedType);

  return (
    <div
      className="glass-panel"
      style={{
        padding: '16px 20px',
        marginBottom: 20,
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: 12,
      }}
    >
      {/* Search Input */}
      <div style={{ flex: '1 1 240px', position: 'relative', minWidth: 200 }}>
        <Search
          size={16}
          color="var(--text-dim)"
          style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }}
        />
        <input
          type="text"
          className="input"
          placeholder="Search work items by title or description..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          style={{ paddingLeft: 36 }}
        />
        {searchQuery && (
          <button
            onClick={() => onSearchChange('')}
            style={{
              position: 'absolute',
              right: 10,
              top: '50%',
              transform: 'translateY(-50%)',
              background: 'none',
              border: 'none',
              color: 'var(--text-dim)',
              cursor: 'pointer',
            }}
          >
            <X size={14} />
          </button>
        )}
      </div>

      {/* Team Select */}
      <div style={{ flex: '0 1 180px' }}>
        <select
          className="select"
          value={selectedTeamId}
          onChange={(e) => onTeamChange(e.target.value)}
        >
          <option value="">All Scoped Teams</option>
          {teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name} {t.userRole ? `(${t.userRole})` : ''}
            </option>
          ))}
        </select>
      </div>

      {/* Status Filter */}
      <div style={{ flex: '0 1 150px' }}>
        <select
          className="select"
          value={selectedStatus}
          onChange={(e) => onStatusChange(e.target.value)}
        >
          <option value="">All Statuses</option>
          <option value="OPEN">Open</option>
          <option value="IN_PROGRESS">In Progress</option>
          <option value="AWAITING_APPROVAL">Awaiting Approval</option>
          <option value="RESOLVED">Resolved</option>
          <option value="CLOSED">Closed</option>
        </select>
      </div>

      {/* Priority Filter */}
      <div style={{ flex: '0 1 140px' }}>
        <select
          className="select"
          value={selectedPriority}
          onChange={(e) => onPriorityChange(e.target.value)}
        >
          <option value="">All Priorities</option>
          <option value="URGENT">Urgent</option>
          <option value="HIGH">High</option>
          <option value="MEDIUM">Medium</option>
          <option value="LOW">Low</option>
        </select>
      </div>

      {/* Type Filter */}
      <div style={{ flex: '0 1 150px' }}>
        <select
          className="select"
          value={selectedType}
          onChange={(e) => onTypeChange(e.target.value)}
        >
          <option value="">All Types</option>
          <option value="INCIDENT">Incident</option>
          <option value="CUSTOMER_ISSUE">Customer Issue</option>
          <option value="PAYMENT">Payment</option>
          <option value="COMPLIANCE">Compliance</option>
          <option value="TASK">Task</option>
        </select>
      </div>

      {/* Reset & Refresh Buttons */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto' }}>
        {hasActiveFilters && (
          <button
            onClick={onResetFilters}
            className="btn btn-secondary btn-sm"
            title="Clear all active filters"
          >
            <X size={14} />
            <span>Reset</span>
          </button>
        )}

        <button
          onClick={onRefresh}
          className="btn btn-secondary btn-sm"
          title="Refresh items from database"
          disabled={isLoading}
        >
          <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
          <span>Sync</span>
        </button>
      </div>
    </div>
  );
};
