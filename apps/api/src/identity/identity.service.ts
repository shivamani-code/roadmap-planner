import { createHash, randomBytes } from "node:crypto";
import {
  Inject,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { normalizeEmail, uuidV7 } from "@studentos/domain";
import type { PublicUser } from "@studentos/contracts";
import { APP_CONFIG, type AppConfig } from "../config/app-config.js";
import { DatabaseService } from "../config/database.service.js";

const TOKEN_LIFETIME_MINUTES = 15;
const SESSION_LIFETIME_DAYS = 30;

export interface MagicLinkRequestResult {
  readonly accepted: true;
  readonly debugToken?: string;
}

export interface VerifiedSession {
  readonly token: string;
  readonly csrfToken: string;
  readonly expiresAt: Date;
  readonly user: PublicUser;
}

function hashSecret(value: string, secret: string): string {
  return createHash("sha256")
    .update(secret)
    .update("\0")
    .update(value)
    .digest("hex");
}

function publicUser(user: {
  id: string;
  email: string;
  displayName: string | null;
  locale: string;
  timezone: string;
}): PublicUser {
  return user;
}

@Injectable()
export class IdentityService {
  constructor(
    private readonly database: DatabaseService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async requestMagicLink(email: string): Promise<MagicLinkRequestResult> {
    const normalizedEmail = normalizeEmail(email);
    const token = randomBytes(32).toString("base64url");
    const tokenHash = hashSecret(token, this.config.SESSION_SECRET);
    const expiresAt = new Date(Date.now() + TOKEN_LIFETIME_MINUTES * 60_000);
    await this.database.client.verificationToken.create({
      data: {
        id: uuidV7(),
        normalizedEmail,
        tokenHash,
        purpose: "SIGN_IN",
        expiresAt,
      },
    });
    if (this.config.ALLOW_DEV_AUTH && this.config.NODE_ENV !== "production")
      return { accepted: true, debugToken: token };
    try {
      const response = await fetch(this.config.EMAIL_GATEWAY_URL!, {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.config.EMAIL_GATEWAY_TOKEN!}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          template: "studentos-magic-link",
          to: normalizedEmail,
          subject: "Sign in to StudentOS",
          actionUrl: `${this.config.PUBLIC_WEB_URL}/auth/callback?token=${encodeURIComponent(token)}`,
          expiresInMinutes: TOKEN_LIFETIME_MINUTES,
        }),
      });
      if (!response.ok)
        throw new Error(`Email gateway returned ${response.status}`);
      const body = (await response.json()) as { messageId?: string };
      if (!body.messageId) throw new Error("Email gateway omitted message ID");
    } catch {
      await this.database.client.verificationToken.deleteMany({
        where: { tokenHash, consumedAt: null },
      });
      throw new ServiceUnavailableException({
        code: "SIGN_IN_DELIVERY_UNAVAILABLE",
        message: "The sign-in email could not be sent. Please try again.",
      });
    }
    return { accepted: true };
  }

  async verifyMagicLink(token: string): Promise<VerifiedSession> {
    const tokenHash = hashSecret(token, this.config.SESSION_SECRET);
    const sessionToken = randomBytes(32).toString("base64url");
    const csrfToken = randomBytes(32).toString("base64url");
    const sessionHash = hashSecret(sessionToken, this.config.SESSION_SECRET);
    const sessionExpiresAt = new Date(
      Date.now() + SESSION_LIFETIME_DAYS * 86_400_000,
    );

    return this.database.client.$transaction(async (transaction) => {
      const verification = await transaction.verificationToken.findUnique({
        where: { tokenHash },
      });
      if (
        !verification ||
        verification.consumedAt ||
        verification.expiresAt <= new Date() ||
        verification.attemptCount >= 5
      ) {
        throw new UnauthorizedException({
          code: "MAGIC_LINK_INVALID",
          message: "The sign-in link is invalid or expired",
        });
      }
      let user = await transaction.user.findUnique({
        where: { normalizedEmail: verification.normalizedEmail },
      });
      if (user && user.status !== "ACTIVE")
        throw new UnauthorizedException({
          code: "ACCOUNT_UNAVAILABLE",
          message: "The account is unavailable",
        });
      const consumed = await transaction.verificationToken.updateMany({
        where: { id: verification.id, consumedAt: null },
        data: { consumedAt: new Date(), attemptCount: { increment: 1 } },
      });
      if (consumed.count !== 1) {
        throw new UnauthorizedException({
          code: "MAGIC_LINK_USED",
          message: "The sign-in link has already been used",
        });
      }
      if (!user) {
        user = await transaction.user.create({
          data: {
            id: uuidV7(),
            email: verification.normalizedEmail,
            normalizedEmail: verification.normalizedEmail,
            lastLoginAt: new Date(),
          },
        });
        await transaction.outboxEvent.create({
          data: {
            id: uuidV7(),
            aggregateType: "User",
            aggregateId: user.id,
            eventType: "identity.user-created.v1",
            payload: { source: "magic-link" },
          },
        });
      } else {
        user = await transaction.user.update({
          where: { id: user.id },
          data: { lastLoginAt: new Date() },
        });
      }
      const developmentRole =
        this.config.NODE_ENV !== "production" && this.config.ALLOW_DEV_AUTH
          ? this.config.DEV_CONTENT_EDITOR_EMAIL &&
            verification.normalizedEmail ===
              this.config.DEV_CONTENT_EDITOR_EMAIL
            ? ("CONTENT_EDITOR" as const)
            : this.config.DEV_CONTENT_REVIEWER_EMAIL &&
                verification.normalizedEmail ===
                  this.config.DEV_CONTENT_REVIEWER_EMAIL
              ? ("CONTENT_REVIEWER" as const)
              : undefined
          : undefined;
      if (developmentRole) {
        await transaction.adminMembership.upsert({
          where: { userId: user.id },
          create: {
            id: uuidV7(),
            userId: user.id,
            role: developmentRole,
          },
          update: { role: developmentRole, active: true },
        });
      }
      await transaction.session.create({
        data: {
          id: uuidV7(),
          userId: user.id,
          tokenHash: sessionHash,
          expiresAt: sessionExpiresAt,
        },
      });
      return {
        token: sessionToken,
        csrfToken,
        expiresAt: sessionExpiresAt,
        user: publicUser(user),
      };
    });
  }

  async authenticate(token: string): Promise<PublicUser> {
    const tokenHash = hashSecret(token, this.config.SESSION_SECRET);
    const session = await this.database.client.session.findUnique({
      where: { tokenHash },
      include: { user: true },
    });
    if (
      !session ||
      session.revokedAt ||
      session.expiresAt <= new Date() ||
      session.user.status !== "ACTIVE"
    ) {
      throw new UnauthorizedException({
        code: "SESSION_INVALID",
        message: "The session is invalid or expired",
      });
    }
    return publicUser(session.user);
  }

  async revoke(token: string): Promise<void> {
    const tokenHash = hashSecret(token, this.config.SESSION_SECRET);
    await this.database.client.session.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
