import Link from "next/link";

const today = [
  {
    label: "DSA",
    title: "Binary search patterns",
    time: "40 min",
    reason: "Placement · prerequisite",
  },
  {
    label: "DBMS",
    title: "SQL joins extension",
    time: "35 min",
    reason: "College + Backend",
  },
  {
    label: "Project",
    title: "Define API schema",
    time: "45 min",
    reason: "Portfolio evidence",
  },
];

export default function LandingPage() {
  const startHref = "/onboarding";

  return (
    <main>
      <header className="site-header shell">
        <Link className="brand" href="/" aria-label="StudentOS home">
          <span className="brand-mark" aria-hidden="true">
            S
          </span>
          StudentOS
        </Link>
        <nav aria-label="Primary navigation">
          <a href="#how-it-works">How it works</a>
          <a href="#sample-plan">Sample plan</a>
          <Link className="button button-quiet" href={startHref}>
            Open app
          </Link>
        </nav>
      </header>

      <section className="hero shell" aria-labelledby="hero-title">
        <div className="hero-copy">
          <p className="eyebrow">Built for JNTUH R25 · Telangana</p>
          <h1 id="hero-title">Know what to study next—and why it matters.</h1>
          <p className="hero-summary">
            StudentOS connects your B.Tech curriculum, current skills, career
            goal, placement deadline, and real weekly time into one explainable
            plan.
          </p>
          <div className="hero-actions">
            <Link className="button button-primary" href={startHref}>
              Build my roadmap
            </Link>
            <a className="button button-secondary" href="#sample-plan">
              See a sample day
            </a>
          </div>
          <p className="support-note">
            No login or student database. Your answers stay in the open page;
            download the finished roadmap before leaving.
          </p>
        </div>

        <div className="analysis-card" aria-label="Example curriculum analysis">
          <div className="card-heading">
            <div>
              <p className="card-kicker">Example analysis</p>
              <h2>Backend Engineer</h2>
            </div>
            <span className="status-pill">22 months</span>
          </div>
          <div
            className="contribution"
            aria-label="Learning contribution example"
          >
            <div style={{ width: "29%" }} className="segment segment-current">
              <span>29%</span>
            </div>
            <div style={{ width: "34%" }} className="segment segment-college">
              <span>34%</span>
            </div>
            <div style={{ width: "37%" }} className="segment segment-external">
              <span>37%</span>
            </div>
          </div>
          <ul className="legend" aria-label="Contribution breakdown">
            <li>
              <span className="dot dot-current" />
              Known now <strong>29%</strong>
            </li>
            <li>
              <span className="dot dot-college" />
              College contributes <strong>34%</strong>
            </li>
            <li>
              <span className="dot dot-external" />
              Independent work <strong>37%</strong>
            </li>
          </ul>
          <div className="mapping-example">
            <span className="subject-icon" aria-hidden="true">
              DB
            </span>
            <div>
              <strong>DBMS · SQL joins</strong>
              <p>College foundation → backend extension → interview practice</p>
            </div>
          </div>
        </div>
      </section>

      <section className="proof-strip" aria-label="Product principles">
        <div className="shell proof-grid">
          <p>
            <strong>No generic roadmaps</strong>
            <span>Every item traces to a requirement.</span>
          </p>
          <p>
            <strong>No duplicate learning</strong>
            <span>College coverage is reused at the right depth.</span>
          </p>
          <p>
            <strong>No account required</strong>
            <span>Build privately, then download your plan.</span>
          </p>
        </div>
      </section>

      <section id="how-it-works" className="section shell">
        <div className="section-heading">
          <p className="eyebrow">How it works</p>
          <h2>From your current semester to an executable day.</h2>
          <p>
            Reviewed academic and career data are bundled into the website. The
            roadmap is calculated directly in your browser without an API.
          </p>
        </div>
        <ol className="steps">
          <li>
            <span>01</span>
            <h3>Tell us where you are</h3>
            <p>
              Select your regulation, branch, semester, skills, and available
              time.
            </p>
          </li>
          <li>
            <span>02</span>
            <h3>See the real gap</h3>
            <p>
              Understand what you know, what college will cover, and what needs
              extension.
            </p>
          </li>
          <li>
            <span>03</span>
            <h3>Work the next horizon</h3>
            <p>
              Review the daily, weekly and monthly plan, then download it or
              save it as a PDF.
            </p>
          </li>
        </ol>
      </section>

      <section id="sample-plan" className="section sample-section">
        <div className="shell sample-grid">
          <div className="section-heading">
            <p className="eyebrow">A calm daily experience</p>
            <h2>Your whole career plan does not belong on today's screen.</h2>
            <p>
              StudentOS reveals detail progressively: Today → Week → Month →
              Semester → Graduation.
            </p>
          </div>
          <article className="today-card">
            <div className="today-header">
              <div>
                <p>Tuesday · Week 7</p>
                <h3>Today's plan</h3>
              </div>
              <strong>120 min</strong>
            </div>
            <ul>
              {today.map((task, index) => (
                <li key={task.title}>
                  <span className="task-number">{index + 1}</span>
                  <div>
                    <span className="task-label">{task.label}</span>
                    <strong>{task.title}</strong>
                    <small>{task.reason}</small>
                  </div>
                  <time>{task.time}</time>
                </li>
              ))}
            </ul>
            <Link
              className="button button-primary full-button"
              href={startHref}
            >
              Start with my profile
            </Link>
          </article>
        </div>
      </section>

      <footer className="site-footer shell">
        <div>
          <strong>StudentOS</strong>
          <p>Preparation guidance, not a hiring or salary prediction.</p>
        </div>
        <div>
          <a href="mailto:support@studentos.app">Support</a>
          <Link href="/privacy">Privacy</Link>
        </div>
      </footer>
    </main>
  );
}
