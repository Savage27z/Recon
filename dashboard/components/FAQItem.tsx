'use client';

import { useState } from 'react';

export function FAQItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div
      onClick={() => setOpen((o) => !o)}
      style={{
        borderBottom: '1px solid var(--bd-faq)',
        padding: '20px 4px',
        cursor: 'pointer',
        transition: 'background 0.15s ease',
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(253,250,243,0.03)')}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16 }}>
        <span style={{ fontWeight: 700, fontSize: 16.5, color: 'var(--fg-faq)' }}>{q}</span>
        <span
          style={{
            fontSize: 20,
            fontWeight: 800,
            color: 'var(--accent)',
            flexShrink: 0,
            transition: 'transform 0.3s ease',
            transform: open ? 'rotate(45deg)' : 'rotate(0)',
          }}
        >
          +
        </span>
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateRows: open ? '1fr' : '0fr',
          transition: 'grid-template-rows 0.3s ease',
        }}
      >
        <div style={{ overflow: 'hidden' }}>
          <p
            style={{
              color: 'var(--fgd-faq)',
              fontSize: 15,
              lineHeight: 1.6,
              margin: '14px 0 0',
            }}
          >
            {a}
          </p>
        </div>
      </div>
    </div>
  );
}
