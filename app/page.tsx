import Image from "next/image";
import Link from "next/link";
import { AuthControls } from "@/components/auth-controls";

const statuses = [
  {
    title: "Product and data contracts",
    detail: "Phase 1 scope, access boundaries, and publishing rules are documented.",
    status: "Recorded",
    state: "complete",
  },
  {
    title: "Visual design handoff",
    detail: "The UI design workspace owns the current screens and delivery record.",
    status: "In progress",
    state: "active",
  },
  {
    title: "Clerk identity",
    detail: "Sign-in renders and signed-out account access redirects correctly; a registered test account is still needed.",
    status: "Signed-out checks passed",
    state: "active",
  },
  {
    title: "InsForge data and files",
    detail: "The existing Pandabyte backend is linked and its read-only database connection passed; user access rules remain pending.",
    status: "Connected · user access pending",
    state: "pending",
  },
];

export default function Home() {
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to main content
      </a>
      <div className="site-shell">
        <header className="site-header">
          <Link className="brand" href="/" aria-label="PandaByte.in development preview home">
            <span className="brand-mark">
              <Image
                src="/brand/pandabyte-logo.png"
                alt=""
                width={558}
                height={564}
                priority
              />
            </span>
            <span className="brand-name">PandaByte.in</span>
          </Link>
          <a
            className="site-link"
            href="https://www.pandabyte.in/"
            target="_blank"
            rel="noopener noreferrer"
          >
            Current live site <span aria-hidden="true">↗</span>
          </a>
          <AuthControls />
        </header>

        <main id="main" className="main-content" tabIndex={-1}>
          <section className="intro" aria-labelledby="page-title">
            <p className="eyebrow">Phase 1 <span aria-hidden="true">/</span> Foundation</p>
            <h1 id="page-title">The PandaByte app foundation is initialized.</h1>
            <p className="intro-copy">
              This local preview tracks the foundation work and its handoffs. The
              product and data contracts are recorded while the visual design is
              being prepared for implementation.
            </p>
          </section>

          <section className="status-panel" aria-labelledby="status-title">
            <div className="panel-heading">
              <div>
                <p className="section-kicker">Project status</p>
                <h2 id="status-title">Foundation checklist</h2>
              </div>
              <span className="phase-label">Development preview</span>
            </div>
            <ul className="status-list">
              {statuses.map((item) => (
                <li className="status-item" key={item.title}>
                  <div className="status-copy">
                    <h3>{item.title}</h3>
                    <p>{item.detail}</p>
                  </div>
                  <span className={`status-label status-${item.state}`}>
                    {item.status}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <p className="availability-note">
            Clerk entry points and the InsForge database connection are checked.
            Authenticated account access and database permissions still need
            verification. Commerce and admin features remain unavailable.
          </p>
        </main>

        <footer className="site-footer">
          <span>Local development preview</span>
          <span>Phase 1 · Foundation</span>
        </footer>
      </div>
    </>
  );
}
