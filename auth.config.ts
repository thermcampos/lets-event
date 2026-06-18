import type { NextAuthConfig } from "next-auth";

export const authConfig = {
  pages: {
    signIn: "/login",
  },
  trustHost:
    process.env.NODE_ENV === "development" ||
    process.env.NEXTAUTH_URL === "https://black-espresso-eventme.vercel.app",
  session: {
    strategy: "jwt",
  },
  callbacks: {
    async session({ session, token }) {
      if (token && session.user) {
        session.user.id = token.sub as string;
        session.accessToken = token.accessToken as string;
        session.refreshToken = token.refreshToken as string;
      }
      return session;
    },
    async jwt({ token, user, account }) {
      if (account) {
        token.accessToken = account.access_token;
        token.refreshToken = account.refresh_token;
      }
      if (user) {
        token.sub = user.id;
      }
      return token;
    },
  },
  providers: [],
} satisfies NextAuthConfig;
