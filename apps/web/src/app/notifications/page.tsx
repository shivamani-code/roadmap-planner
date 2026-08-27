import { AppHeader } from "../../components/app-header";
import { CommunicationCenter } from "../../components/communication-center";

export default function NotificationsPage() {
  return (
    <main className="planner-page shell">
      <AppHeader active="notifications" />
      <section
        className="planner-heading"
        aria-labelledby="notifications-title"
      >
        <p className="eyebrow">Support without pressure</p>
        <h1 id="notifications-title">Inbox and communication</h1>
        <p>
          Choose each channel, protect quiet hours, and control optional AI
          wording separately. There are no default streak reminders.
        </p>
      </section>
      <CommunicationCenter />
    </main>
  );
}
