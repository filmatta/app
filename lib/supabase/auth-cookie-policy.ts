type AuthCookieRuntime = Readonly<{
  protocol?: string;
  vercel?: string;
  vercelEnv?: string;
  nodeEnv?: string;
}>;

export type AuthCookiePolicy = Readonly<{
  secure: boolean;
}>;

export function shouldUseSecureAuthCookies({
  protocol,
  vercel,
  vercelEnv,
  nodeEnv,
}: AuthCookieRuntime): boolean {
  if (protocol !== undefined) {
    return protocol.toLowerCase() === "https:";
  }

  return (
    vercel === "1" ||
    vercelEnv === "preview" ||
    vercelEnv === "production" ||
    nodeEnv === "production"
  );
}

export function getServerAuthCookiePolicy(): AuthCookiePolicy {
  return {
    secure: shouldUseSecureAuthCookies({
      vercel: process.env.VERCEL,
      vercelEnv: process.env.VERCEL_ENV,
      nodeEnv: process.env.NODE_ENV,
    }),
  };
}

export function getBrowserAuthCookiePolicy(): AuthCookiePolicy {
  if (typeof window === "undefined") {
    return getServerAuthCookiePolicy();
  }

  return {
    secure: shouldUseSecureAuthCookies({
      protocol: window.location.protocol,
    }),
  };
}

export function applyAuthCookiePolicy<T extends object>(
  options: T,
  policy: AuthCookiePolicy,
): T & AuthCookiePolicy {
  return {
    ...options,
    ...policy,
  };
}
