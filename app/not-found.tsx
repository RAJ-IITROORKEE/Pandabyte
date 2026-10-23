import Link from "next/link";

export default function NotFound() {
  return (
    <main id="main" className="foundation-content route-state" tabIndex={-1}>
      <p className="section-kicker">404</p>
      <h1 className="auth-title">Page not found.</h1>
      <p className="auth-description">Check the address or return to PandaByte home.</p>
      <p><Link className="site-link" href="/">Return home</Link></p>
    </main>
  );
}
