import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  ShieldCheck,
  UserCheck,
  PlusCircle,
  Activity,
  LogOut,
  ChevronDown,
} from 'lucide-react';
import { NewtoniteLogo } from './NewtoniteLogo';

interface NavbarProps {
  onOpenCreateModal: () => void;
  onOpenOutboxModal: () => void;
}

const PRESET_PERSONAS = [
  { email: 'admin@newtonite.internal', name: 'Alex Vance', role: 'Global Admin', badge: 'ADMIN' },
  { email: 'lead.platform@newtonite.internal', name: 'Sarah Chen', role: 'Platform Lead', badge: 'LEAD' },
  { email: 'dev.platform@newtonite.internal', name: 'David Kim', role: 'Platform Engineer', badge: 'MEMBER' },
  { email: 'lead.billing@newtonite.internal', name: 'Marcus Rodriguez', role: 'Billing Lead', badge: 'LEAD' },
  { email: 'analyst.trust@newtonite.internal', name: 'Priya Sharma', role: 'Trust Analyst', badge: 'MEMBER' },
  { email: 'viewer.auditor@newtonite.internal', name: 'Arthur Pendelton', role: 'Auditor', badge: 'VIEWER' },
];

export const Navbar: React.FC<NavbarProps> = ({ onOpenCreateModal, onOpenOutboxModal }) => {
  const { user, switchPersona, logout } = useAuth();
  const [dropdownOpen, setDropdownOpen] = useState(false);

  return (
    <header
      style={{
        borderBottom: '1px solid var(--border-subtle)',
        background: 'rgba(7, 9, 14, 0.85)',
        backdropFilter: 'blur(16px)',
        position: 'sticky',
        top: 0,
        zIndex: 100,
        padding: '12px 24px',
        marginBottom: '24px',
      }}
    >
      <div
        style={{
          maxWidth: 1440,
          margin: '0 auto',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
        }}
      >
        {/* Brand & System Status */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <NewtoniteLogo size={38} />

          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: '1.1rem', fontWeight: 800, letterSpacing: '-0.02em', color: '#fff' }}>
                Newtonite <span style={{ color: 'var(--primary)' }}>Ops</span>
              </span>
              <span
                style={{
                  fontSize: '0.68rem',
                  fontWeight: 700,
                  background: 'rgba(16, 185, 129, 0.15)',
                  color: '#10b981',
                  border: '1px solid rgba(16, 185, 129, 0.3)',
                  padding: '2px 6px',
                  borderRadius: 4,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                <span
                  style={{
                    width: 5,
                    height: 5,
                    borderRadius: '50%',
                    background: '#10b981',
                    display: 'inline-block',
                    boxShadow: '0 0 6px #10b981',
                  }}
                />
                PRESSURE ACTIVE
              </span>
            </div>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-dim)', margin: 0 }}>
              Cross-Team Operational Orchestration Engine
            </p>
          </div>
        </div>

        {/* Center / Right Actions & Persona Switcher */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {/* Outbox Background Jobs Monitor Button */}
          <button
            onClick={onOpenOutboxModal}
            className="btn btn-secondary"
            title="Inspect Transactional Outbox Background Worker"
          >
            <Activity size={16} color="var(--primary)" />
            <span>Outbox Worker</span>
          </button>

          {/* Create Work Item Button */}
          <button
            onClick={onOpenCreateModal}
            className="btn btn-primary"
            id="btn-create-work-item"
          >
            <PlusCircle size={16} />
            <span>New Work Item</span>
          </button>

          {/* Persona Switcher Dropdown */}
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setDropdownOpen(!dropdownOpen)}
              className="btn btn-secondary"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '6px 12px',
                border: '1px solid rgba(255, 255, 255, 0.15)',
              }}
            >
              <div
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: '50%',
                  background: 'rgba(99, 102, 241, 0.25)',
                  color: '#818cf8',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 700,
                  fontSize: '0.75rem',
                }}
              >
                {user?.name?.[0] || 'U'}
              </div>
              <div style={{ textAlign: 'left', lineHeight: 1.2 }}>
                <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#f8fafc' }}>
                  {user?.name || 'Not logged in'}
                </div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>
                  {user?.memberships?.[0]?.role ? `${user.memberships[0].role} (${user.memberships[0].teamName})` : 'Guest'}
                </div>
              </div>
              <ChevronDown size={14} color="var(--text-muted)" />
            </button>

            {dropdownOpen && (
              <div
                style={{
                  position: 'absolute',
                  top: '100%',
                  right: 0,
                  marginTop: 8,
                  width: 290,
                  background: '#0f172a',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  borderRadius: 'var(--radius-md)',
                  boxShadow: '0 15px 35px rgba(0, 0, 0, 0.6)',
                  padding: 8,
                  zIndex: 200,
                }}
              >
                <div
                  style={{
                    fontSize: '0.7rem',
                    textTransform: 'uppercase',
                    color: 'var(--text-dim)',
                    padding: '6px 8px',
                    fontWeight: 700,
                  }}
                >
                  Switch Role / Persona (Demo 1-Click)
                </div>

                {PRESET_PERSONAS.map((p) => {
                  const isCurrent = user?.email === p.email;
                  return (
                    <button
                      key={p.email}
                      onClick={async () => {
                        await switchPersona(p.email);
                        setDropdownOpen(false);
                      }}
                      style={{
                        width: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '8px 10px',
                        background: isCurrent ? 'rgba(99, 102, 241, 0.15)' : 'transparent',
                        border: 'none',
                        borderRadius: 6,
                        color: isCurrent ? '#a5b4fc' : '#cbd5e1',
                        cursor: 'pointer',
                        textAlign: 'left',
                        fontSize: '0.82rem',
                        transition: 'background 0.15s',
                      }}
                      onMouseEnter={(e) => {
                        if (!isCurrent) e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                      }}
                      onMouseLeave={(e) => {
                        if (!isCurrent) e.currentTarget.style.background = 'transparent';
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 600 }}>{p.name}</div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>{p.role}</div>
                      </div>
                      <span
                        className="badge"
                        style={{
                          fontSize: '0.65rem',
                          background:
                            p.badge === 'ADMIN'
                              ? 'rgba(168, 85, 247, 0.2)'
                              : p.badge === 'LEAD'
                              ? 'rgba(245, 158, 11, 0.2)'
                              : p.badge === 'VIEWER'
                              ? 'rgba(100, 116, 139, 0.2)'
                              : 'rgba(59, 130, 246, 0.2)',
                          color:
                            p.badge === 'ADMIN'
                              ? '#c084fc'
                              : p.badge === 'LEAD'
                              ? '#fcd34d'
                              : p.badge === 'VIEWER'
                              ? '#94a3b8'
                              : '#93c5fd',
                        }}
                      >
                        {p.badge}
                      </span>
                    </button>
                  );
                })}

                <div
                  style={{
                    borderTop: '1px solid rgba(255, 255, 255, 0.08)',
                    margin: '6px 0',
                    paddingTop: 6,
                  }}
                >
                  <button
                    onClick={() => {
                      logout();
                      setDropdownOpen(false);
                    }}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '8px 10px',
                      background: 'transparent',
                      border: 'none',
                      borderRadius: 6,
                      color: '#f87171',
                      cursor: 'pointer',
                      fontSize: '0.8rem',
                    }}
                  >
                    <LogOut size={14} />
                    <span>Log Out</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
