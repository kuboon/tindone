import { clientEntry, css, type Handle, on } from "@remix-run/ui";
import { detectPushStatus } from "@kuboon/browser-how-to/push";

import { routes } from "../routes.ts";
import { color } from "../tokens.ts";
import { sessionStore } from "./_lib/session.ts";

type Status = "checking" | "blocked" | "off" | "on" | "busy";

/**
 * The bell in the home header: push notifications for this device, through id.kbn.one.
 *
 * The IdP owns the subscriptions and signs the pushes with its own VAPID key; this app only
 * registers the device (`POST ${idp}/push/subscriptions`, DPoP-bound) and runs the service worker
 * that shows them (`/sw.js`). When a task is moved through the API, the server asks the IdP to
 * notify the user — see `server/push.ts`.
 *
 * Whether this device *can* do push is `@kuboon/browser-how-to`'s question: an iPhone needs the app
 * on its home screen first, an in-app browser needs leaving, a denied permission needs re-enabling
 * in settings. Any of those opens its guide instead of failing quietly.
 *
 * - red dot: on — tap to send a test notification
 * - yellow dot: off — tap to turn on
 * - gray dot: this browser cannot, as things stand — tap for how to fix that
 */
export const PushButton = clientEntry(
  import.meta.url,
  function PushButton(handle: Handle<{ idpOrigin: string }>) {
    let status: Status = "checking";
    let subscriptionId: string | null = null;
    let message = "";

    const idp = (path: string) => `${handle.props.idpOrigin}${path}`;

    const setMessage = (text: string) => {
      message = text;
      handle.update();
      setTimeout(() => {
        if (message === text) {
          message = "";
          handle.update();
        }
      }, 4000);
    };

    const registration = async () => {
      await navigator.serviceWorker.register(routes.serviceWorker.href());
      return await navigator.serviceWorker.ready;
    };

    const refresh = async () => {
      if (detectPushStatus().support !== "ready") {
        status = "blocked";
        return;
      }
      await sessionStore.load(handle.props.idpOrigin);
      const current = await (await registration()).pushManager
        .getSubscription();
      subscriptionId = null;
      if (current && sessionStore.fetchDpop) {
        const response = await sessionStore.fetchDpop(
          idp("/push/subscriptions"),
        );
        if (response.ok) {
          const { subscriptions = [] } = await response.json() as {
            subscriptions?: { id: string; endpoint: string }[];
          };
          subscriptionId = subscriptions.find((s) =>
            s.endpoint === current.endpoint
          )?.id ??
            null;
        }
      }
      status = subscriptionId ? "on" : "off";
    };

    const subscribe = async () => {
      const fetchDpop = sessionStore.fetchDpop;
      if (!fetchDpop) throw new Error("no DPoP key");
      if (await Notification.requestPermission() !== "granted") {
        status = "blocked";
        return;
      }
      const keyResponse = await fetchDpop(idp("/push/vapid-key"));
      if (!keyResponse.ok) throw new Error(await keyResponse.text());
      const { publicKey } = await keyResponse.json() as { publicKey: string };
      const reg = await registration();
      const subscription = await reg.pushManager.getSubscription() ??
        await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: publicKey,
        });
      const response = await fetchDpop(idp("/push/subscriptions"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          subscription: subscription.toJSON(),
          metadata: {
            deviceName: deviceName(),
            userAgent: navigator.userAgent,
            language: navigator.language,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          },
        }),
      });
      if (!response.ok) throw new Error(await response.text());
      const data = await response.json() as { subscription?: { id?: string } };
      subscriptionId = data.subscription?.id ?? null;
      status = "on";
      setMessage("Notifications on");
    };

    const test = async () => {
      const response = await sessionStore.fetchDpop!(
        idp("/push/notifications/test"),
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ subscriptionId }),
        },
      );
      setMessage(response.ok ? "Test sent" : "Test failed");
    };

    const click = async () => {
      if (status === "checking" || status === "busy") return;
      if (status === "blocked") {
        const { showPushGuide } = await import(
          "@kuboon/browser-how-to/push/ui"
        );
        showPushGuide();
        return;
      }
      const was = status;
      status = "busy";
      handle.update();
      try {
        if (was === "on") {
          status = "on";
          await test();
        } else {
          await subscribe();
        }
      } catch (error) {
        console.error(error);
        status = was;
        setMessage("Could not enable notifications");
      }
      handle.update();
    };

    if (typeof document !== "undefined") {
      refresh().catch((error) => {
        console.error(error);
        status = "blocked";
      }).finally(() => handle.update());
    }

    return () => {
      const title = {
        checking: "Checking notifications…",
        busy: "Working…",
        blocked: "Notifications unavailable — tap for help",
        off: "Enable push notifications",
        on: "Notifications on — tap to send a test",
      }[status];
      const dot = status === "on"
        ? color.primary
        : status === "off"
        ? "#ffcc00"
        : color.muted;
      return (
        <span mix={wrapStyle}>
          {message ? <span mix={messageStyle}>{message}</span> : null}
          <button
            type="button"
            title={title}
            aria-label={title}
            disabled={status === "checking" || status === "busy"}
            mix={[bellStyle, on("click", () => void click())]}
          >
            <span mix={iconStyle}>🔔</span>
            <span mix={dotStyle} style={{ backgroundColor: dot }} />
          </button>
        </span>
      );
    };
  },
);

/** A readable name for this device, for the IdP's device list. */
function deviceName(): string {
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes("iphone")) return "iPhone";
  if (ua.includes("ipad")) return "iPad";
  if (ua.includes("android")) return "Android";
  if (ua.includes("windows")) return "Windows";
  if (ua.includes("mac os")) return "Mac";
  if (ua.includes("linux")) return "Linux";
  return "Browser";
}

const wrapStyle = css({
  display: "inline-flex",
  alignItems: "center",
  gap: "6px",
});

const messageStyle = css({ fontSize: "0.75rem", color: color.muted });

const bellStyle = css({
  position: "relative",
  padding: "4px",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
});

const iconStyle = css({ fontSize: "1.4rem" });

const dotStyle = css({
  position: "absolute",
  bottom: "2px",
  right: "2px",
  width: "8px",
  height: "8px",
  borderRadius: "50%",
  border: `1px solid ${color.bg}`,
});
