import Link from 'next/link';
import { FAQItem } from '@/components/FAQItem';

const demoRows = [
  { amount: '200.00', invoice: '#1042', wallet: '0x71…4f2a', tierLabel: 'Tier 1', tierBg: 'rgba(88,204,2,0.15)', tierColor: '#58CC02' },
  { amount: '49.99', invoice: '#1043', wallet: '0x38…b019', tierLabel: 'Tier 2', tierBg: 'rgba(88,204,2,0.15)', tierColor: '#58CC02' },
  { amount: '199.50', invoice: '#1044', wallet: '0xB1…E1aA', tierLabel: 'AI · 95%', tierBg: 'rgba(255,106,57,0.15)', tierColor: '#FF6A39' },
  { amount: '77.77', invoice: '#1045', wallet: '0xCe…8fD3', tierLabel: 'Tier 1', tierBg: 'rgba(88,204,2,0.15)', tierColor: '#58CC02' },
  { amount: '33.30', invoice: '#1046', wallet: '0x91…2b6c', tierLabel: 'Tier 2', tierBg: 'rgba(88,204,2,0.15)', tierColor: '#58CC02' },
];
const demoRowsDoubled = [...demoRows, ...demoRows];

const faqs = [
  { q: 'What if I already use Stripe?', a: 'Recon runs alongside it — merchants use Stripe for cards and Recon for stablecoin payments. Same webhook shape, so your fulfillment code doesn\'t know or care which one paid.' },
  { q: 'Which stablecoins do you support?', a: 'Any ERC-20 stablecoin on HashKey Chain — USDC, USDT, and anything you deploy or bridge yourself. Configure the token addresses in the watcher\'s env.' },
  { q: 'What if the AI gets it wrong?', a: 'Anything below your confidence threshold lands in the review queue for manual approval — it doesn\'t auto-match. Above the threshold, matches fire your webhook and can be reversed with a rejection.' },
  { q: 'Do I need to run a node?', a: 'No. The watcher polls a public RPC and stores state in SQLite. Deploy it on any small VM, or run it locally alongside your own backend.' },
  { q: 'How much does it cost?', a: 'Recon itself is open source and free. You pay HashKey Chain gas for invoice creation and confirmation — currently pennies. LLM matches use your own API key.' },
  { q: 'Is my customer\'s wallet linked to their identity?', a: 'No. Recon only knows what\'s on-chain: sending wallet, amount, timestamp. The invoice reference is opaque to the chain unless you choose to make it identifiable.' },
];

export default function LandingPage() {
  return (
    <div
      className="landing-root"
      style={{
        background: '#1C1B18',
        color: '#FDFAF3',
        fontFamily: "'Manrope', sans-serif",
        minHeight: '100vh',
      }}
    >
      {/* NAV */}
      <div
        className="l-nav"
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 20,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '24px 48px',
          background: 'rgba(28,27,24,0.85)',
          backdropFilter: 'blur(8px)',
        }}
      >
        <span
          style={{
            fontWeight: 800,
            fontSize: 20,
            color: '#FDFAF3',
            letterSpacing: '-0.01em',
          }}
        >
          Recon
        </span>
        <div className="l-nav-links" style={{ display: 'flex', alignItems: 'center', gap: 28 }}>
          <a href="#how" style={{ fontWeight: 700, fontSize: 14, color: '#B7B2A6' }}>
            How it works
          </a>
          <a href="#faq" style={{ fontWeight: 700, fontSize: 14, color: '#B7B2A6' }}>
            FAQ
          </a>
          <Link
            href="/dashboard"
            style={{
              fontWeight: 800,
              fontSize: 14,
              background: 'var(--accent)',
              color: '#1C1B18',
              padding: '11px 20px',
              borderRadius: 10,
              whiteSpace: 'nowrap',
            }}
          >
            Launch
          </Link>
        </div>
      </div>

      {/* 1. HERO */}
      <section
        className="l-section"
        id="hero"
        style={{
          minHeight: '100vh',
          scrollSnapAlign: 'start',
          display: 'flex',
          alignItems: 'center',
          padding: '80px 64px',
          background: 'var(--bg-hero)',
        }}
      >
        <div
          className="l-grid2"
          style={{
            display: 'grid',
            gridTemplateColumns: '1.1fr 0.9fr',
            gap: 56,
            alignItems: 'center',
            maxWidth: 1240,
            margin: '0 auto',
            width: '100%',
          }}
        >
          <div>
            <div
              style={{
                fontWeight: 800,
                fontSize: 13,
                color: 'var(--accent)',
                letterSpacing: '0.1em',
                marginBottom: 22,
              }}
            >
              01 — RECONCILIATION, SOLVED
            </div>
            <h1
              className="l-hero-h1"
              style={{
                fontSize: 60,
                lineHeight: 0.98,
                fontWeight: 800,
                letterSpacing: '-0.03em',
                margin: 0,
                color: 'var(--fg-hero)',
              }}
            >
              GET PAID IN
              <br />
              STABLECOINS.
            </h1>
            <h1
              className="l-hero-h1"
              style={{
                fontSize: 60,
                lineHeight: 0.98,
                fontWeight: 700,
                fontStyle: 'var(--style-accent)' as 'italic',
                fontFamily: 'var(--font-accent)',
                letterSpacing: 'var(--ls-accent)',
                margin: '12px 0 28px',
                color: 'var(--accent)',
              }}
            >
              Reconcile like Stripe.
            </h1>
            <p
              style={{
                fontSize: 18,
                lineHeight: 1.55,
                color: 'var(--fgm-hero)',
                maxWidth: 460,
                margin: '0 0 36px',
              }}
            >
              Accepting a stablecoin payment isn't hard. Knowing which order it paid
              for is. Recon watches the chain, matches every payment to the right
              invoice, and tells your systems the second it lands.
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 28, flexWrap: 'wrap' }}>
              <a
                href="#demo"
                style={{
                  fontWeight: 800,
                  fontSize: 16,
                  background: 'var(--accent)',
                  color: '#1C1B18',
                  padding: '18px 34px',
                  borderRadius: 12,
                  display: 'inline-block',
                }}
              >
                See it work
              </a>
              <a
                href="#how"
                style={{
                  fontWeight: 700,
                  fontSize: 15,
                  color: 'var(--fg-hero)',
                  borderBottom: '1px solid var(--bd-hero)',
                  paddingBottom: 3,
                }}
              >
                How it works ↓
              </a>
            </div>
          </div>

          {/* Floating cards */}
          <div className="l-hero-visual" style={{ position: 'relative', height: 380 }}>
            <div
              className="animate-reconFloat2"
              style={{
                position: 'absolute',
                top: 10,
                left: 0,
                width: 250,
                background: '#26241F',
                border: '1px solid rgba(253,250,243,0.08)',
                borderRadius: 16,
                padding: 20,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 8,
                    background: 'var(--accent)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 900,
                    color: '#1C1B18',
                    fontSize: 14,
                    flexShrink: 0,
                  }}
                >
                  $
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 13.5, color: '#FDFAF3', whiteSpace: 'nowrap' }}>
                    Payment received
                  </div>
                  <div style={{ fontSize: 12, color: '#8A8578', whiteSpace: 'nowrap' }}>200.00 USDC</div>
                </div>
              </div>
              <div style={{ fontSize: 12, color: '#6B675E', fontFamily: 'JetBrains Mono, monospace' }}>
                from 0x71…4f2a
              </div>
            </div>

            <div
              className="animate-reconFloat1"
              style={{
                position: 'absolute',
                bottom: 0,
                right: 0,
                width: 250,
                background: '#26241F',
                border: '1px solid rgba(253,250,243,0.08)',
                borderRadius: 18,
                padding: 24,
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: '#8A8578',
                  letterSpacing: '0.06em',
                  marginBottom: 12,
                }}
              >
                INVOICE #1042
              </div>
              <div style={{ height: 8, width: '80%', background: 'rgba(253,250,243,0.08)', borderRadius: 4, marginBottom: 8 }} />
              <div style={{ height: 8, width: '55%', background: 'rgba(253,250,243,0.08)', borderRadius: 4, marginBottom: 18 }} />
              <div style={{ fontSize: 24, fontWeight: 800, color: '#FDFAF3', marginBottom: 14 }}>$200.00</div>
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  background: 'var(--accent-soft)',
                  color: 'var(--accent)',
                  fontWeight: 700,
                  fontSize: 12.5,
                  padding: '7px 13px',
                  borderRadius: 8,
                }}
              >
                Matched &amp; Paid
              </div>
            </div>

            <div
              style={{
                position: 'absolute',
                top: 130,
                left: 120,
                width: 100,
                height: 1,
                borderTop: '2px dashed rgba(253,250,243,0.15)',
              }}
            />
          </div>
        </div>
      </section>

      {/* 2. PROBLEM */}
      <section
        className="l-section"
        id="problem"
        style={{
          minHeight: '100vh',
          scrollSnapAlign: 'start',
          display: 'flex',
          alignItems: 'center',
          background: 'var(--bg-problem)',
          padding: '80px 64px',
        }}
      >
        <div style={{ maxWidth: 760, margin: '0 auto' }}>
          <div
            style={{
              fontWeight: 800,
              fontSize: 13,
              color: 'var(--accent)',
              letterSpacing: '0.1em',
              marginBottom: 24,
            }}
          >
            02 — THE PROBLEM
          </div>
          <h2
            className="l-h2"
            style={{
              fontSize: 38,
              fontWeight: 800,
              letterSpacing: '-0.02em',
              color: 'var(--fg-problem)',
              margin: '0 0 40px',
              maxWidth: 640,
            }}
          >
            Sound familiar?
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {[
              'You accepted a payment. Now which order was it for?',
              'Your Shopify has no idea the payment landed.',
              "You're pasting tx hashes into a spreadsheet, hoping you matched the right row.",
            ].map((line, i, arr) => (
              <div
                key={i}
                style={{
                  borderTop: '1px solid var(--bd-problem)',
                  borderBottom: i === arr.length - 1 ? '1px solid var(--bd-problem)' : undefined,
                  padding: '24px 0',
                }}
              >
                <p
                  style={{
                    margin: 0,
                    fontSize: 19,
                    fontFamily: "'Playfair Display', serif",
                    fontStyle: 'italic',
                    color: 'var(--fg-problem)',
                  }}
                >
                  {line}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 3. HOW IT WORKS */}
      <section
        className="l-section"
        id="how"
        style={{
          minHeight: '100vh',
          scrollSnapAlign: 'start',
          display: 'flex',
          alignItems: 'center',
          padding: '80px 64px',
          background: 'var(--bg-how)',
        }}
      >
        <div style={{ maxWidth: 1120, margin: '0 auto' }}>
          <div
            style={{
              fontWeight: 800,
              fontSize: 13,
              color: 'var(--accent)',
              letterSpacing: '0.1em',
              marginBottom: 24,
            }}
          >
            03 — HOW IT WORKS
          </div>
          <h2
            className="l-h2"
            style={{
              fontSize: 36,
              fontWeight: 800,
              letterSpacing: '-0.02em',
              color: 'var(--fg-how)',
              margin: '0 0 56px',
            }}
          >
            Three steps. No spreadsheets.
          </h2>
          <div className="l-grid3" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 40 }}>
            {[
              { n: 1, title: 'Create an invoice', body: 'Your checkout — or you, manually — creates an invoice on Recon with an amount and a reference.' },
              { n: 2, title: 'Customer pays', body: 'They send stablecoins from any wallet — no account, no app, no special instructions.' },
              { n: 3, title: 'Recon matches & notifies', body: 'We watch the chain, match the payment to the invoice, and POST to your webhook — same shape as Stripe\'s.' },
            ].map((step) => (
              <div key={step.n} style={{ borderTop: '2px solid var(--accent)', paddingTop: 22 }}>
                <div
                  style={{
                    fontFamily: 'var(--font-accent)',
                    fontStyle: 'italic',
                    fontSize: 34,
                    color: 'var(--accent)',
                    marginBottom: 16,
                  }}
                >
                  {step.n}
                </div>
                <h3 style={{ fontSize: 19, fontWeight: 800, color: 'var(--fg-how)', margin: '0 0 10px' }}>{step.title}</h3>
                <p style={{ color: 'var(--fgm-how)', fontSize: 15, lineHeight: 1.6, margin: 0 }}>{step.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 4. AI TIER 3 */}
      <section
        className="l-section"
        id="ai"
        style={{
          minHeight: '100vh',
          scrollSnapAlign: 'start',
          display: 'flex',
          alignItems: 'center',
          background: 'var(--bg-ai)',
          padding: '80px 64px',
        }}
      >
        <div
          className="l-grid2"
          style={{
            maxWidth: 1120,
            margin: '0 auto',
            display: 'grid',
            gridTemplateColumns: '1.1fr 0.9fr',
            gap: 56,
            alignItems: 'center',
          }}
        >
          <div>
            <div
              style={{
                fontWeight: 800,
                fontSize: 13,
                color: 'var(--accent)',
                letterSpacing: '0.1em',
                marginBottom: 24,
              }}
            >
              04 — THE AI PART
            </div>
            <h2
              className="l-h2"
              style={{
                fontSize: 32,
                fontWeight: 800,
                letterSpacing: '-0.02em',
                color: 'var(--fg-ai)',
                margin: '0 0 18px',
              }}
            >
              Most payments match themselves.
            </h2>
            <p style={{ color: 'var(--fgm-ai)', fontSize: 16.5, lineHeight: 1.6, margin: '0 0 16px' }}>
              Recon tries the easy stuff first: an exact reference, then an exact
              amount. Most payments match on one of those in under a second.
            </p>
            <p style={{ color: 'var(--fgm-ai)', fontSize: 16.5, lineHeight: 1.6, margin: '0 0 16px' }}>
              When neither works — a customer sends $199.50 for a $200 invoice, or
              forgets the reference — Claude reads the surrounding context and
              proposes a match, with a confidence score attached.
            </p>
            <p style={{ color: 'var(--fgm-ai)', fontSize: 16.5, lineHeight: 1.6, margin: 0 }}>
              You stay in control: anything below your threshold lands in a review
              queue instead of auto-matching.
            </p>
          </div>
          <div
            style={{
              background: '#1C1B18',
              borderRadius: 4,
              padding: 28,
              border: '1px solid rgba(28,27,24,0.06)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <div>
                <div style={{ fontSize: 12, color: '#8A8578', fontWeight: 700 }}>Payment received</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: '#FDFAF3' }}>$199.50</div>
              </div>
              <div style={{ fontSize: 22, color: '#4A4740' }}>→</div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 12, color: '#8A8578', fontWeight: 700 }}>Invoice #2231</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: '#FDFAF3' }}>$200.00</div>
              </div>
            </div>
            <div style={{ background: '#26241F', borderRadius: 4, padding: 18, marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                <span style={{ fontWeight: 700, fontSize: 13, color: '#FDFAF3' }}>AI matched</span>
                <span style={{ fontWeight: 800, fontSize: 13, color: 'var(--accent)' }}>95% confidence</span>
              </div>
              <div style={{ height: 6, background: 'rgba(253,250,243,0.1)', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: '95%', background: 'var(--accent)' }} />
              </div>
            </div>
            <p style={{ fontSize: 13, color: '#6B675E', lineHeight: 1.5, margin: 0 }}>
              Reasoning: amount within 0.25%, same customer wallet as invoice's
              last 3 payments, timestamp 4 minutes after invoice created.
            </p>
          </div>
        </div>
      </section>

      {/* 5. LIVE DEMO */}
      <section
        className="l-section"
        id="demo"
        style={{
          minHeight: '100vh',
          scrollSnapAlign: 'start',
          display: 'flex',
          alignItems: 'center',
          padding: '80px 64px',
          background: 'var(--bg-demo)',
        }}
      >
        <div style={{ maxWidth: 800, margin: '0 auto', width: '100%' }}>
          <div
            style={{
              fontWeight: 800,
              fontSize: 13,
              color: 'var(--accent)',
              letterSpacing: '0.1em',
              marginBottom: 24,
            }}
          >
            05 — LIVE
          </div>
          <h2
            className="l-h2"
            style={{
              fontSize: 34,
              fontWeight: 800,
              letterSpacing: '-0.02em',
              color: 'var(--fg-demo)',
              margin: '0 0 40px',
            }}
          >
            Watch it happen.
          </h2>
          <div
            style={{
              height: 340,
              overflow: 'hidden',
              position: 'relative',
              WebkitMaskImage:
                'linear-gradient(transparent, black 30px, black calc(100% - 30px), transparent)',
              maskImage:
                'linear-gradient(transparent, black 30px, black calc(100% - 30px), transparent)',
            }}
          >
            <div className="animate-reconMarquee" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {demoRowsDoubled.map((row, i) => (
                <div
                  key={i}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    background: '#26241F',
                    border: '1px solid rgba(253,250,243,0.06)',
                    borderRadius: 12,
                    padding: '16px 20px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    <div
                      style={{
                        width: 34,
                        height: 34,
                        borderRadius: 8,
                        background: 'var(--accent-soft)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 800,
                        color: 'var(--accent)',
                        fontSize: 14,
                      }}
                    >
                      $
                    </div>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 14.5, color: '#FDFAF3' }}>
                        ${row.amount} → {row.invoice}
                      </div>
                      <div style={{ fontSize: 12, color: '#6B675E', fontFamily: 'JetBrains Mono, monospace' }}>
                        {row.wallet}
                      </div>
                    </div>
                  </div>
                  <div
                    style={{
                      fontWeight: 800,
                      fontSize: 11.5,
                      padding: '6px 12px',
                      borderRadius: 999,
                      background: row.tierBg,
                      color: row.tierColor,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {row.tierLabel}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* 6. WHY HASHKEY */}
      <section
        className="l-section"
        id="hashkey"
        style={{
          minHeight: '100vh',
          scrollSnapAlign: 'start',
          display: 'flex',
          alignItems: 'center',
          background: 'var(--bg-hashkey)',
          padding: '80px 64px',
        }}
      >
        <div style={{ maxWidth: 700, margin: '0 auto' }}>
          <div
            style={{
              fontWeight: 800,
              fontSize: 13,
              color: 'var(--accent)',
              letterSpacing: '0.1em',
              marginBottom: 24,
            }}
          >
            06 — WHY HASHKEY
          </div>
          <h2
            className="l-h2"
            style={{
              fontSize: 30,
              fontWeight: 800,
              letterSpacing: '-0.02em',
              color: 'var(--fg-hashkey)',
              margin: '0 0 22px',
            }}
          >
            Why Recon runs on HashKey Chain
          </h2>
          <p
            style={{
              color: 'var(--fgm-hashkey)',
              fontSize: 17,
              lineHeight: 1.65,
              margin: 0,
            }}
          >
            Recon is built on HashKey Chain, which gives us fast block times and
            low transaction fees — so matching happens in seconds, not minutes,
            and the cost of settling a payment stays negligible. It's also
            designed with regulated payments in mind, which matters if you're a
            business that has to answer to auditors and payment processors, not
            just users.
          </p>
        </div>
      </section>

      {/* 7. FAQ */}
      <section
        className="l-section"
        id="faq"
        style={{
          minHeight: '100vh',
          scrollSnapAlign: 'start',
          display: 'flex',
          alignItems: 'center',
          padding: '80px 64px',
          background: 'var(--bg-faq)',
        }}
      >
        <div style={{ maxWidth: 720, margin: '0 auto', width: '100%' }}>
          <div
            style={{
              fontWeight: 800,
              fontSize: 13,
              color: 'var(--accent)',
              letterSpacing: '0.1em',
              marginBottom: 24,
            }}
          >
            07 — FAQ
          </div>
          <h2
            className="l-h2"
            style={{
              fontSize: 34,
              fontWeight: 800,
              letterSpacing: '-0.02em',
              color: 'var(--fg-faq)',
              margin: '0 0 40px',
            }}
          >
            Questions merchants ask us
          </h2>
          {faqs.map((f, i) => (
            <FAQItem key={i} q={f.q} a={f.a} />
          ))}
        </div>
      </section>

      {/* 8. FOOTER CTA */}
      <section
        className="l-section"
        style={{
          minHeight: '70vh',
          scrollSnapAlign: 'start',
          display: 'flex',
          alignItems: 'center',
          background: 'var(--accent)',
          padding: '80px 64px',
          textAlign: 'center',
        }}
      >
        <div style={{ maxWidth: 640, margin: '0 auto' }}>
          <h2
            className="l-cta-h2"
            style={{
              fontSize: 40,
              fontWeight: 800,
              letterSpacing: '-0.02em',
              color: '#1C1B18',
              margin: '0 0 18px',
            }}
          >
            Stop hand-matching payments.
          </h2>
          <p style={{ color: '#4A2E1E', fontSize: 17, margin: '0 0 36px' }}>
            Set up an invoice and watch a payment match itself, in under five
            minutes.
          </p>
          <Link
            href="/dashboard"
            style={{
              display: 'inline-block',
              fontWeight: 800,
              fontSize: 17,
              background: '#1C1B18',
              color: '#FDFAF3',
              padding: '19px 38px',
              borderRadius: 12,
              marginBottom: 24,
            }}
          >
            Launch
          </Link>
          <div>
            <a href="#" style={{ color: '#1C1B18', fontWeight: 700, fontSize: 14, opacity: 0.75 }}>
              For developers → API docs
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}
