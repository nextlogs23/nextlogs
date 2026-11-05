import Link from "next/link";
import { ArrowLeft, BellRing, Clock3, Mail, ShieldCheck, Sparkles } from "lucide-react";

const plannedFeatures = [
  {
    icon: ShieldCheck,
    title: "Verified sender workflows",
    description: "Email tools designed around authenticated, permission-based communication.",
  },
  {
    icon: Mail,
    title: "Reusable templates",
    description: "Prepare consistent transactional and campaign layouts in one workspace.",
  },
  {
    icon: Sparkles,
    title: "Responsive previews",
    description: "Review polished email layouts across desktop and mobile before delivery.",
  },
];

export function EmailFlashingWorkspace() {
  return (
    <main className="email-coming-page">
      <section className="email-coming-card">
        <div className="email-coming-glow" aria-hidden="true" />
        <div className="email-coming-icon" aria-hidden="true">
          <Mail size={34} />
          <span><Clock3 size={15} /></span>
        </div>

        <p className="email-coming-badge"><BellRing size={14} /> Coming soon</p>
        <h1>Email Flashing is being prepared.</h1>
        <p className="email-coming-summary">
          We are building a safe, polished email workspace for verified sender identities.
          The service is not available for use yet, and no email can be created or sent from this page.
        </p>

        <div className="email-coming-actions">
          <Link href="/dashboard/services"><ArrowLeft size={16} /> Back to services</Link>
          <Link href="/dashboard">Go to dashboard</Link>
        </div>
      </section>

      <section className="email-coming-planned" aria-labelledby="email-coming-planned-title">
        <div className="email-coming-heading">
          <p className="ui-eyebrow">In development</p>
          <h2 id="email-coming-planned-title">What we are working on</h2>
          <p>These planned capabilities will remain unavailable until the service is ready.</p>
        </div>

        <div className="email-coming-grid">
          {plannedFeatures.map(({ icon: Icon, title, description }) => (
            <article key={title}>
              <span><Icon size={20} /></span>
              <div>
                <h3>{title}</h3>
                <p>{description}</p>
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
