import { afterEach, describe, expect, it, vi } from "vitest";
import type { DatabaseService } from "../src/config/database.service.js";
import { loadConfig } from "../src/config/app-config.js";
import { IdentityService } from "../src/identity/identity.service.js";

function createSubject() {
  const verificationToken = {
    create: vi.fn().mockResolvedValue({}),
    deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
  };
  const database = {
    client: { verificationToken },
  } as unknown as DatabaseService;
  const config = loadConfig({
    NODE_ENV: "test",
    AUTH_MODE: "email",
    ALLOW_DEV_AUTH: "false",
    SESSION_SECRET: "test-session-secret-that-is-long-enough",
    PUBLIC_WEB_URL: "https://student.example.com",
    EMAIL_GATEWAY_URL: "https://email.example.com/send",
    EMAIL_GATEWAY_TOKEN: "test-email-gateway-token",
  });
  return {
    subject: new IdentityService(database, config),
    verificationToken,
  };
}

describe("magic-link email delivery", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("sends a one-use sign-in URL through the configured gateway", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(JSON.stringify({ messageId: "msg-1" })));
    vi.stubGlobal("fetch", fetchMock);
    const { subject, verificationToken } = createSubject();

    await expect(
      subject.requestMagicLink(" Student@Example.com "),
    ).resolves.toEqual({ accepted: true });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, request] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://email.example.com/send");
    expect(request?.headers).toMatchObject({
      authorization: "Bearer test-email-gateway-token",
      "content-type": "application/json",
    });
    expect(typeof request?.body).toBe("string");
    if (typeof request?.body !== "string")
      throw new Error("Expected JSON body");
    expect(JSON.parse(request.body)).toMatchObject({
      template: "studentos-magic-link",
      to: "student@example.com",
      subject: "Sign in to StudentOS",
      expiresInMinutes: 15,
      actionUrl: expect.stringMatching(
        /^https:\/\/student\.example\.com\/auth\/callback\?token=.+$/,
      ),
    });
    expect(verificationToken.deleteMany).not.toHaveBeenCalled();
  });

  it("removes the undelivered token and fails closed", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response(null, { status: 503 })),
    );
    const { subject, verificationToken } = createSubject();

    await expect(
      subject.requestMagicLink("student@example.com"),
    ).rejects.toMatchObject({
      response: { code: "SIGN_IN_DELIVERY_UNAVAILABLE" },
    });
    expect(verificationToken.deleteMany).toHaveBeenCalledOnce();
  });
});
