import { Title } from "@solidjs/meta";

export default function About() {
  return (
    <main class="mx-auto max-w-2xl space-y-5 px-5 py-6">
      <Title>About</Title>
      <h1 class="text-xl font-bold">About The Board</h1>
      <p class="text-[#5a5a6e]">
        The Board is a browse-first home for memes. Anyone can scroll the public
        feed and open a meme's detail page without signing in. Create an account
        to vote, upload your own memes, and manage the ones you've posted.
      </p>
      <p class="text-[#5a5a6e]">
        Every upload is checked for duplicates and reviewed by automated
        moderation before it's fully public — this can briefly hide new or
        flagged content while it's looked at. Admins can also hide any meme that
        breaks the rules below, or restore one that was hidden by mistake.
      </p>
      <div class="space-y-2">
        <h2 class="text-lg font-bold">House rules</h2>
        <ul class="list-disc space-y-1 pl-5 text-[#5a5a6e]">
          <li>Only post content you have the right to share.</li>
          <li>No illegal content, harassment, or hate speech.</li>
          <li>
            Duplicates are flagged for review, not auto-blocked — repeated or
            bad-faith reposting can still get a meme hidden.
          </li>
          <li>Admin decisions on visibility are final.</li>
        </ul>
      </div>
    </main>
  );
}
