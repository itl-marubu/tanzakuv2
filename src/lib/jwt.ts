import { createId } from "@paralleldrive/cuid2";
import { SignJWT, jwtVerify } from "jose";

type sessionPayload = {
  uid: string;
  jti: string;
};

export const createToken = async (payload: sessionPayload, secret: string) => {
  const jwt = new SignJWT(payload);
  const signKey = new TextEncoder().encode(secret);

  return jwt
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setIssuer("https://tanzakuv2.fuminori.workers.dev")
    .setAudience("https://tanzakuv2.fuminori.workers.dev")
    .setExpirationTime("10h")
    .sign(signKey);
};

export const createRefreshToken = () => {
  return createId();
};

export const verifyToken = async (token: string, secret: string) => {
  const verifyKey = new TextEncoder().encode(secret);
  const { payload } = await jwtVerify(token, verifyKey, {
    algorithms: ["HS256"],
    issuer: "https://tanzakuv2.fuminori.workers.dev",
    audience: "https://tanzakuv2.fuminori.workers.dev"
  });

  return payload as sessionPayload;
};
