"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { mutationHeaders } from "../lib/http";

const apiUrl =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1";

interface TypePreference {
  type: string;
  inAppEnabled: boolean;
  emailEnabled: boolean;
}

interface Preferences {
  timezone: string;
  dailyReminderMinute: number;
  quietHoursEnabled: boolean;
  quietStartMinute: number;
  quietEndMinute: number;
  aiProcessingConsent: boolean;
  types: TypePreference[];
}

interface NotificationItem {
  id: string;
  type: string;
  title: string;
  body: string;
  actionUrl: string;
  createdAt: string;
  readAt: string | null;
}

function timeValue(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

function timeMinutes(value: string): number {
  const [hour = "0", minute = "0"] = value.split(":");
  return Number(hour) * 60 + Number(minute);
}

function typeLabel(value: string): string {
  return value
    .split("_")
    .map((word) => word.charAt(0) + word.slice(1).toLowerCase())
    .join(" ");
}

export function CommunicationCenter() {
  const [preferences, setPreferences] = useState<Preferences | null>(null);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [status, setStatus] = useState("Loading communication settings…");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    const [preferenceResponse, notificationResponse] = await Promise.all([
      fetch(`${apiUrl}/communication/preferences`, { credentials: "include" }),
      fetch(`${apiUrl}/notifications`, { credentials: "include" }),
    ]);
    const preferenceBody = (await preferenceResponse.json()) as Preferences & {
      detail?: string;
    };
    const notificationBody =
      (await notificationResponse.json()) as NotificationItem[] & {
        detail?: string;
      };
    if (!preferenceResponse.ok)
      throw new Error(
        preferenceBody.detail ?? "Preferences could not be loaded",
      );
    if (!notificationResponse.ok)
      throw new Error(
        notificationBody.detail ?? "Notifications could not be loaded",
      );
    setPreferences(preferenceBody);
    setNotifications(notificationBody);
    setStatus("");
  }, []);

  useEffect(() => {
    void load().catch((error: unknown) => {
      setStatus("");
      setMessage(
        error instanceof Error
          ? error.message
          : "Communication settings could not be loaded",
      );
    });
  }, [load]);

  const changeType = (
    type: string,
    field: "inAppEnabled" | "emailEnabled",
    enabled: boolean,
  ) => {
    setPreferences((current) =>
      current
        ? {
            ...current,
            types: current.types.map((preference) =>
              preference.type === type
                ? { ...preference, [field]: enabled }
                : preference,
            ),
          }
        : current,
    );
  };

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!preferences) return;
    setStatus("Saving preferences…");
    setMessage("");
    try {
      const response = await fetch(`${apiUrl}/communication/preferences`, {
        method: "PUT",
        credentials: "include",
        headers: mutationHeaders({ "content-type": "application/json" }),
        body: JSON.stringify(preferences),
      });
      const body = (await response.json()) as Preferences & { detail?: string };
      if (!response.ok)
        throw new Error(body.detail ?? "Preferences could not be saved");
      setPreferences(body);
      setMessage("Communication preferences saved.");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Preferences could not be saved",
      );
    } finally {
      setStatus("");
    }
  };

  const markRead = async (notificationId: string) => {
    const response = await fetch(
      `${apiUrl}/notifications/${notificationId}/read`,
      {
        method: "PATCH",
        credentials: "include",
        headers: mutationHeaders(),
      },
    );
    if (!response.ok) return;
    setNotifications((current) =>
      current.map((notification) =>
        notification.id === notificationId
          ? { ...notification, readAt: new Date().toISOString() }
          : notification,
      ),
    );
  };

  if (!preferences)
    return message ? (
      <p className="form-error" role="alert">
        {message}
      </p>
    ) : (
      <p role="status">{status}</p>
    );

  return (
    <div className="communication-layout">
      <section className="inbox-card" aria-labelledby="inbox-title">
        <div className="section-row">
          <div>
            <p className="eyebrow">Delivery-independent history</p>
            <h2 id="inbox-title">Inbox</h2>
          </div>
          <span>
            {notifications.filter(({ readAt }) => !readAt).length} unread
          </span>
        </div>
        {notifications.length === 0 ? (
          <p className="empty-state">
            No notifications. Types remain off until you opt in.
          </p>
        ) : (
          <ol className="inbox-list">
            {notifications.map((notification) => (
              <li
                key={notification.id}
                className={notification.readAt ? "" : "inbox-unread"}
              >
                <div>
                  <span>{typeLabel(notification.type)}</span>
                  <strong>{notification.title}</strong>
                  <p>{notification.body}</p>
                  <small>
                    {new Intl.DateTimeFormat("en-IN", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    }).format(new Date(notification.createdAt))}
                  </small>
                </div>
                <div className="inbox-actions">
                  <a
                    className="button button-quiet"
                    href={notification.actionUrl}
                  >
                    Open
                  </a>
                  {!notification.readAt ? (
                    <button
                      className="button button-quiet"
                      type="button"
                      onClick={() => void markRead(notification.id)}
                    >
                      Mark read
                    </button>
                  ) : null}
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>
      <form
        className="notification-settings"
        onSubmit={(event) => void save(event)}
      >
        <p className="eyebrow">Opt-in controls</p>
        <h2>Preferences</h2>
        <label>
          Timezone
          <input
            value={preferences.timezone}
            onChange={(event) =>
              setPreferences({ ...preferences, timezone: event.target.value })
            }
            maxLength={64}
            required
          />
        </label>
        <label>
          Daily reminder time
          <input
            type="time"
            value={timeValue(preferences.dailyReminderMinute)}
            onChange={(event) =>
              setPreferences({
                ...preferences,
                dailyReminderMinute: timeMinutes(event.target.value),
              })
            }
          />
        </label>
        <fieldset>
          <legend>Quiet hours</legend>
          <label className="check-row">
            <input
              type="checkbox"
              checked={preferences.quietHoursEnabled}
              onChange={(event) =>
                setPreferences({
                  ...preferences,
                  quietHoursEnabled: event.target.checked,
                })
              }
            />
            Pause all delivery during quiet hours
          </label>
          <div className="field-grid">
            <label>
              Starts
              <input
                type="time"
                value={timeValue(preferences.quietStartMinute)}
                onChange={(event) =>
                  setPreferences({
                    ...preferences,
                    quietStartMinute: timeMinutes(event.target.value),
                  })
                }
              />
            </label>
            <label>
              Ends
              <input
                type="time"
                value={timeValue(preferences.quietEndMinute)}
                onChange={(event) =>
                  setPreferences({
                    ...preferences,
                    quietEndMinute: timeMinutes(event.target.value),
                  })
                }
              />
            </label>
          </div>
        </fieldset>
        <fieldset>
          <legend>Notification types</legend>
          <div
            className="preference-table"
            role="table"
            aria-label="Notification channels"
          >
            <div role="row" className="preference-heading">
              <span role="columnheader">Type</span>
              <span role="columnheader">In-app</span>
              <span role="columnheader">Email</span>
            </div>
            {preferences.types.map((preference) => (
              <div role="row" key={preference.type}>
                <span role="cell">{typeLabel(preference.type)}</span>
                <label role="cell">
                  <span className="sr-only">
                    {typeLabel(preference.type)} in-app
                  </span>
                  <input
                    type="checkbox"
                    checked={preference.inAppEnabled}
                    onChange={(event) =>
                      changeType(
                        preference.type,
                        "inAppEnabled",
                        event.target.checked,
                      )
                    }
                  />
                </label>
                <label role="cell">
                  <span className="sr-only">
                    {typeLabel(preference.type)} email
                  </span>
                  <input
                    type="checkbox"
                    checked={preference.emailEnabled}
                    onChange={(event) =>
                      changeType(
                        preference.type,
                        "emailEnabled",
                        event.target.checked,
                      )
                    }
                  />
                </label>
              </div>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend>AI wording consent</legend>
          <label className="check-row">
            <input
              type="checkbox"
              checked={preferences.aiProcessingConsent}
              onChange={(event) =>
                setPreferences({
                  ...preferences,
                  aiProcessingConsent: event.target.checked,
                })
              }
            />
            Allow minimized, pseudonymous planning facts to be sent to the
            configured wording provider
          </label>
          <small>
            Turning this off keeps deterministic template guidance. AI never
            changes your plan, score, skills, evidence, dates, or resources.
          </small>
        </fieldset>
        {message ? <p role="status">{message}</p> : null}
        {status ? <p role="status">{status}</p> : null}
        <button className="button button-primary" disabled={Boolean(status)}>
          Save preferences
        </button>
      </form>
    </div>
  );
}
