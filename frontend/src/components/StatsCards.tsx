import React from 'react';
import { UserCheck, AlertTriangle, Clock, Layers } from 'lucide-react';

interface StatsCardsProps {
  currentView: string;
  onSelectView: (view: string) => void;
  assignedCount: number;
  urgentCount: number;
  approvalCount: number;
  totalCount: number;
}

export const StatsCards: React.FC<StatsCardsProps> = ({
  currentView,
  onSelectView,
  assignedCount,
  urgentCount,
  approvalCount,
  totalCount,
}) => {
  const cards = [
    {
      id: 'assigned_to_me',
      title: 'Assigned to Me',
      subtitle: 'Active items requiring my execution',
      count: assignedCount,
      icon: UserCheck,
      color: '#6366f1',
      glow: 'rgba(99, 102, 241, 0.25)',
      active: currentView === 'assigned_to_me',
    },
    {
      id: 'unassigned_urgent',
      title: 'Unassigned Urgent',
      subtitle: 'Urgent / High priority needing claim',
      count: urgentCount,
      icon: AlertTriangle,
      color: '#ef4444',
      glow: 'rgba(239, 68, 68, 0.25)',
      active: currentView === 'unassigned_urgent',
    },
    {
      id: 'awaiting_my_approval',
      title: 'Awaiting Lead Approval',
      subtitle: 'Completed items waiting for Lead review',
      count: approvalCount,
      icon: Clock,
      color: '#ec4899',
      glow: 'rgba(236, 72, 153, 0.25)',
      active: currentView === 'awaiting_my_approval',
    },
    {
      id: 'all',
      title: 'Total Active Queue',
      subtitle: 'Combined cross-team operational workload',
      count: totalCount,
      icon: Layers,
      color: '#38bdf8',
      glow: 'rgba(56, 189, 248, 0.25)',
      active: currentView === 'all',
    },
  ];

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
        gap: 16,
        marginBottom: 24,
      }}
    >
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <div
            key={card.id}
            onClick={() => onSelectView(card.id)}
            className="glass-panel"
            style={{
              padding: '18px 20px',
              cursor: 'pointer',
              border: card.active ? `2px solid ${card.color}` : '1px solid var(--border-subtle)',
              background: card.active
                ? `linear-gradient(135deg, rgba(18, 24, 38, 0.95), ${card.glow})`
                : 'var(--bg-card)',
              boxShadow: card.active ? `0 8px 25px -5px ${card.glow}` : undefined,
              transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
              transform: card.active ? 'translateY(-2px)' : 'none',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 8,
                  background: `rgba(${card.color === '#6366f1' ? '99, 102, 241' : card.color === '#ef4444' ? '239, 68, 68' : card.color === '#ec4899' ? '236, 72, 153' : '56, 189, 248'}, 0.15)`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Icon size={18} color={card.color} />
              </div>
              <span
                style={{
                  fontSize: '1.6rem',
                  fontWeight: 800,
                  fontFamily: 'JetBrains Mono',
                  color: card.active ? '#fff' : 'var(--text-main)',
                }}
              >
                {card.count.toLocaleString()}
              </span>
            </div>

            <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#f8fafc', marginBottom: 4 }}>
              {card.title}
            </div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-dim)' }}>
              {card.subtitle}
            </div>
          </div>
        );
      })}
    </div>
  );
};
