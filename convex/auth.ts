import { convexAuth } from "@convex-dev/auth/server";
import Google from "@auth/core/providers/google";

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [Google],
  callbacks: {
    async afterUserCreatedOrUpdated(ctx, { userId }) {
      const user = await ctx.db.get(userId);
      if (!user || user.isAdmin !== undefined) {
        return;
      }

      // We make sure that the first user of the application is made an admin.
      // This way we have at least one admin to start with, and the only way
      // to add more admins is for an admin to give them admin status.
      const firstUser = await ctx.db.query("users").order("asc").first();

      await ctx.db.patch(userId, {
        isAdmin: firstUser?._id === userId,
      });
    },
  },
});
