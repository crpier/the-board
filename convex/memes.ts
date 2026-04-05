import { query } from "./_generated/server";

export const getPublicMeme = query({
  args: {},
  handler: async () => {
    return [{ _id: 1, title: "First meme", visibility: "public" }];
  },
});
