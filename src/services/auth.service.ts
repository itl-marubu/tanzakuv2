import bcrypt from "bcryptjs";
import { createDb } from "../db/client";
import { dateForDb, parseDbDate } from "../lib/dates";
import { newCuid } from "../lib/id";
import { createRefreshToken, createToken } from "../lib/jwt";
import {
  AdminUserRepository,
  GoogleOauthRepository,
  RefreshTokenRepository
} from "../repositories/auth.repository";

// OAuth プロバイダから渡されるユーザー情報のうち使用するフィールド
export type OauthUser = {
  id?: string;
  email?: string;
};

export class AuthService {
  private readonly users: AdminUserRepository;
  private readonly googleOauths: GoogleOauthRepository;
  private readonly refreshTokens: RefreshTokenRepository;

  constructor(db: D1Database) {
    const client = createDb(db);
    this.users = new AdminUserRepository(client);
    this.googleOauths = new GoogleOauthRepository(client);
    this.refreshTokens = new RefreshTokenRepository(client);
  }

  async handleGoogleAuth(user: OauthUser | undefined, jwtSecret: string) {
    // GoogleOauth.id には Google の sub が入る(既存データ互換)
    const existing = await this.googleOauths.findById(user?.id ?? "");

    let sysuserId: string;
    if (existing) {
      const sysuser = await this.users.findById(existing.userId);
      if (!sysuser) {
        throw new Error("AdminUser not found for GoogleOauth");
      }
      sysuserId = sysuser.id;
    } else {
      const sysuser = await this.users.create({ email: user?.email || "" });
      await this.googleOauths.create({
        id: user?.id ?? "",
        email: user?.email || "",
        userId: sysuser.id
      });
      sysuserId = sysuser.id;
    }

    return this.createTokens(sysuserId, jwtSecret);
  }

  async signup(email: string, password: string, jwtSecret: string) {
    const user = await this.users.findByEmail(email);

    if (user) {
      throw new Error("User already exists");
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    const newUser = await this.users.create({
      email,
      password: hashedPassword
    });

    if (!newUser) {
      throw new Error("User creation failed");
    }

    return this.createTokens(newUser.id, jwtSecret);
  }

  async login(email: string, password: string, jwtSecret: string) {
    const user = await this.users.findByEmail(email);

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
    const token = await this.refreshTokens.findByToken(refreshToken);

    // expiresAt は TEXT 格納のため必ず Date 化してから比較する(字句比較は不可)
    if (!token || parseDbDate(token.expiresAt) < new Date()) {
      throw new Error("Invalid or expired refresh token");
    }

    // 古いリフレッシュトークンを削除
    await this.refreshTokens.deleteById(token.id);

    return this.createTokens(token.userId, jwtSecret);
  }

  private async createTokens(userId: string, jwtSecret: string) {
    try {
      const accessToken = await createToken(
        {
          uid: userId || "",
          jti: newCuid()
        },
        jwtSecret
      );

      const refreshToken = createRefreshToken();
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 30); // 30日間有効

      await this.refreshTokens.create({
        id: newCuid(),
        token: refreshToken,
        userId: userId,
        expiresAt: dateForDb(expiresAt)
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
