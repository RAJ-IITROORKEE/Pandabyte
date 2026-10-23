
const statuses = [
  {
    title: "Product and data contracts",
    detail: "Phase 1 scope, access boundaries, and publishing rules are documented.",
    status: "Recorded",
    state: "complete",
  },
  {
    title: "Visual design handoff",
    detail: "The selected Superdesign navbar, footer and persistent theme form the shared site shell.",
    status: "Shell implemented",
    state: "active",
  },
  {
    title: "Clerk identity",
    detail: "Google signup, an active account session, and signed-out route protection are verified in the local preview.",
    status: "Session verified",
    state: "active",
  },
  {
    title: "InsForge data and files",
    detail: "Customer profile isolation, staff capability checks, and private text-file access pass live development tests.",
    status: "Access verified",
    state: "active",
  },
];

export default function Home() {
  return (
        <main id="main" className="main-content foundation-content" tabIndex={-1}>
          <section className="intro" aria-labelledby="page-title">
            <p className="eyebrow">Phase 2 <span aria-hidden="true">/</span> Access foundation</p>
            <h1 id="page-title">The PandaByte app foundation is initialized.</h1>
            <p className="intro-copy">
              This local preview tracks the foundation work and its handoffs. The
              product and data contracts are recorded while the visual design is
              selected for implementation.
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
            Clerk login and customer, staff, and private-file access are verified
            in development. The storefront, publishing, commerce, and full admin
            workflows remain under development.
          </p>
        </main>
  );
}
