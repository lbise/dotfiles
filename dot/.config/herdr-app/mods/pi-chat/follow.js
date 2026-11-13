// Shows the view the focused tab should have: what its session last chose, else
// the chat (at once, before Pi's state is read, so the terminal never flashes),
// else the terminal when Pi turns out not to have the chat extension. Every copy
// of the mod calls this from a timer; the state is shared, so whichever runs first does it.

import { focused } from "herdr";
import { feedFor, feedFree, feedLive, readFeed } from "./feeds.js";
import { preferredView, showView, target } from "./view.js";

// A Pi that just started has not written its state yet: look again a few times.
const LOOKS = 5;
const LOOK_EVERY = 2000;

const follow = { focus: "", settled: false, looks: 0, lookedAt: 0 };

function settle(mode) {
  follow.settled = true;
  showView(mode);
}

export function followFocus(cx) {
  const focus = focused();
  const pi = target();
  const key = `${focus ? focus.tab : ""}|${pi ? pi.key : ""}`;
  if (key !== follow.focus) Object.assign(follow, { focus: key, settled: false, looks: 0, lookedAt: 0 });
  if (follow.settled) return;
  if (!pi) return settle("terminal");
  const chosen = preferredView(pi.key);
  if (chosen) return settle(chosen);
  const feed = feedFor(pi);
  if (feedLive(feed, pi)) return settle("chat");
  if (follow.looks >= LOOKS && feed.reads + feed.failures > 0) return settle("terminal");
  showView("chat");
  if (!feedFree(feed) || Date.now() - follow.lookedAt < LOOK_EVERY) return;
  follow.looks++;
  follow.lookedAt = Date.now();
  cx.spawn(async (cx) => {
    if (await readFeed(feed)) cx.notify();
  });
}
