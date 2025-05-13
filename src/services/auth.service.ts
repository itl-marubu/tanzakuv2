import { createId } from "@paralleldrive/cuid2";
import { PrismaD1 } from "@prisma/adapter-d1";
import bcrypt from "bcryptjs";
import { PrismaClient } from "../generated/prisma/client";
import { createRefreshToken, createToken } from "../lib/jwt";

export class AuthService {
  private prisma: PrismaClient;

  constructor(db: D1Database) {
    const adapter = new PrismaD1(db);
    this.prisma = new PrismaClient({ adapter });
  }

  // biome-ignore lint/suspicious/noExplicitAny: API Responseなので無視
  async handleGoogleAuth(user: any, jwtSecret: string) {
    let sysuser = null;

    if (
      (await this.prisma.googleOauth.findUnique({
        where: { id: user?.id }
      })) !== null
    ) {
      const g = await this.prisma.googleOauth
        .findUnique({
          where: { id: user?.id }
        })
        .then(
          // biome-ignore lint/suspicious/noExplicitAny: API Responseなので無視
          (r: any) => {
            return r?.userId;
          },
          // biome-ignore lint/suspicious/noExplicitAny: API Responseなので無視
          (e: any) => {
            console.error(e);
            return null;
          }
        );

      sysuser = await this.prisma.adminUser.findUniqueOrThrow({
        where: { id: g || "" }
      });
    } else {
      sysuser = await this.prisma.adminUser.create({
        data: {
          email: user?.email || ""
        }
      });

      await this.prisma.googleOauth.create({
        data: {
          id: user?.id,
          email: user?.email || "",
          userId: sysuser.id
        }
      });
    }

    return this.createTokens(sysuser?.id, jwtSecret);
  }

  // biome-ignore lint/suspicious/noExplicitAny: API Responseなので無視
  async handleGithubAuth(user: any, jwtSecret: string) {
    let sysuser = null;
    if (
      (await this.prisma.gitHubOauth.findUnique({
        where: { id: user?.id }
      })) !== null
    ) {
      const g = await this.prisma.gitHubOauth
        .findUnique({
          where: { id: user?.id }
        })
        .then(
          // biome-ignore lint/suspicious/noExplicitAny: API Responseなので無視
          (r: any) => {
            return r?.userId;
          },
          // biome-ignore lint/suspicious/noExplicitAny: API Responseなので無視
          (e: any) => {
            console.error(e);
            return null;
          }
        );
      sysuser = await this.prisma.adminUser.findUniqueOrThrow({
        where: { id: g || "" }
      });
    } else {
      sysuser = await this.prisma.adminUser.create({
        data: {
          email: user?.email || ""
        }
      });
      await this.prisma.gitHubOauth.create({
        data: {
          id: user?.id || 0,
          email: user?.email || "",
          userId: sysuser.id
        }
      });
    }

    return this.createTokens(sysuser?.id, jwtSecret);
  }

  async signup(email: string, password: string, jwtSecret: string) {
    const user = await this.prisma.adminUser.findUnique({
      where: { email }
    });

    if (user) {
      throw new Error("User already exists");
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    const newUser = await this.prisma.adminUser.create({
      data: {
        email,
        password: hashedPassword
      }
    });

    if (!newUser) {
      throw new Error("User creation failed");
    }

    return this.createTokens(newUser.id, jwtSecret);
  }

  async login(email: string, password: string, jwtSecret: string) {
    const user = await this.prisma.adminUser.findUnique({
      where: { email }
    });

    if (!user) {
      throw new Error("User not found");
    }

    const isPasswordValid = await bcrypt.compare(password, user.password || "");
    if (!isPasswordValid) {
      throw new Error("Invalid password");
    }

    return this.createTokens(user.id, jwtSecret);
  }

  async refreshToken(refreshToken: string, jwtSecret: string) {
    const token = await this.prisma.refreshToken.findUnique({
      where: { token: refreshToken },
      include: { user: true }
    });

    if (!token || token.expiresAt < new Date()) {
      throw new Error("Invalid or expired refresh token");
    }

    // 古いリフレッシュトークンを削除
    await this.prisma.refreshToken.delete({
      where: { id: token.id }
    });

    return this.createTokens(token.userId, jwtSecret);
  }

  private async createTokens(userId: string, jwtSecret: string) {
    try {
      const accessToken = await createToken(
        {
          uid: userId || "",
          jti: createId()
        },
        jwtSecret
      );

      const refreshToken = createRefreshToken();
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 30); // 30日間有効

      await this.prisma.refreshToken.create({
        data: {
          token: refreshToken,
          userId: userId,
          expiresAt
        }
      });

      return {
        accessToken,
        refreshToken
      };
    } catch (e) {
      console.error(e);
      throw new Error("Token creation failed");
    }
  }
}
