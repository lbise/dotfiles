// The conversation's scroller. Only the rows on screen (and a margin) are built,
// as ordinary elements, so a row can have its own clicks, hovers and motion (rows
// of the app's virtual lists cannot). Each row is measured once drawn. While
// following, the last row is pinned to the bottom of the view, so a growing answer
// needs no second layout pass; scrolling up lets go, reaching the bottom follows again.
//
// The measure-and-pin approach follows the timeline of herdr-chat (MIT),
// https://herdr.dev/mods; the code is ours.

import { div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";

const MARGIN = 500; // px built beyond the view, above and below
const ENTER = { duration: 160, easing: "ease-out" };
const RISE = 6;
const ENTERING_KEPT = 64;

export class Timeline {
  constructor() {
    this.reset();
    this.view = 0; // height of the view, design px
  }

  /** Another conversation: forget every measure and follow the bottom. */
  reset() {
    this.heights = new Map();
    this.offsets = new Map();
    this.seen = new Set();
    this.entering = new Set();
    this.armed = false;
    this.following = true;
    this.held = false;
    this.floor = 0; // the lowest `top` allowed: below zero while a short conversation is held
    this.top = 0;
    this.total = 0;
  }

  /** The newest row is out of view. */
  get away() {
    return !this.following && this.total - this.view - this.top > 2;
  }

  follow() {
    this.following = true;
    this.held = false;
    this.floor = 0;
  }

  /**
   * Stops following and keeps what is on screen where it is, so a row about to
   * grow opens downward. Lasts until the person scrolls, or the row shrinks back.
   */
  hold() {
    if (!this.following) return;
    this.following = false;
    this.held = true;
    this.top = this.total - this.view;
    this.floor = Math.min(0, this.top); // a short conversation hangs from the bottom: its top stays there
  }

  /** A row took another key (a sent message became part of the conversation): keep its place and skip its entrance. */
  rename(from, to) {
    if (this.heights.has(from)) this.heights.set(to, this.heights.get(from));
    this.seen.add(to);
  }

  scrollBy(dy) {
    if (this.following && (dy <= 0 || this.total <= this.view)) return;
    if (this.following) {
      this.following = false;
      this.top = this.total - this.view;
    }
    this.held = false;
    this.top = this.clamp(this.top - dy);
    if (this.top >= this.total - this.view - 2) this.follow();
  }

  clamp(top) {
    return Math.max(this.floor, Math.min(top, Math.max(this.floor, this.total - this.view)));
  }

  height(item) {
    return this.heights.get(item.key) ?? item.estimate;
  }

  /**
   * @param {object} options
   * @param {Array<{ key: string, estimate: number }>} options.items Every row, in order.
   * @param {(item: object) => import("gpui-kit").Element} options.row Draws one row.
   * @param {number} options.width The reading width.
   * @param {number} options.zoom The app's zoom: measured sizes include it, layout sizes do not.
   * @param {boolean} options.ready The conversation was read: rows that arrive from now on enter with motion.
   * @param {string} options.thumb The colour of the scroll thumb.
   */
  render({ items, row, width, zoom, ready, thumb }) {
    for (const item of items) {
      if (this.seen.has(item.key)) continue;
      this.seen.add(item.key);
      if (this.armed) this.entering.add(item.key);
    }
    if (ready) this.armed = true;
    for (const key of [...this.entering].slice(0, Math.max(0, this.entering.size - ENTERING_KEPT))) this.entering.delete(key);

    const offsets = new Array(items.length);
    let total = 0;
    for (let i = 0; i < items.length; i++) {
      offsets[i] = total;
      total += this.height(items[i]);
    }
    this.total = total;
    if (!this.following) this.top = this.clamp(this.top);

    const shown = [];
    let first = 0;
    if (this.following) {
      let i = items.length;
      for (let used = 0; i > 0 && used < this.view + MARGIN; ) used += this.height(items[--i]);
      for (; i < items.length; i++) shown.push(i);
      this.top = Math.max(0, total - this.view);
    } else {
      let i = 0;
      while (i < items.length && offsets[i] + this.height(items[i]) < this.top - MARGIN) i++;
      first = i < items.length ? offsets[i] : 0;
      for (; i < items.length && offsets[i] < this.top + this.view + MARGIN; i++) shown.push(i);
    }
    this.offsets = new Map(shown.map((i) => [items[i].key, offsets[i]]));

    const measured = (item) => {
      const enters = this.entering.has(item.key);
      const waiting = enters && !this.heights.has(item.key);
      return h_flex()
        .id(`pi-chat-row-${item.key}`)
        .w_full()
        .flex_none()
        .justify_center()
        .px(24)
        .when(enters, (el) => el.relative().opacity(waiting ? 0 : 1).top(waiting ? RISE : 0).transition("opacity", ENTER).transition("top", ENTER))
        .on_size_change((size, cx) => {
          const height = size.height / zoom;
          const old = this.heights.get(item.key);
          if (old !== undefined && Math.abs(old - height) < 0.5) return;
          this.heights.set(item.key, height);
          // A row above the view changed size: what is on screen stays where it is.
          const offset = this.offsets.get(item.key);
          if (!this.following && offset !== undefined && offset < this.top) this.top += height - (old ?? item.estimate);
          // A held row shrank back and the newest row is in view again: follow as before.
          if (this.held && old !== undefined && height < old && this.total - (old - height) - this.view - this.top <= 2) this.follow();
          // While following, a known row that grows is pinned to the bottom already.
          if (!this.following || old === undefined) cx.notify();
        })
        .child(div().w_full().max_w(width).child(row(item)));
    };

    const column = v_flex().absolute().left(0).right(0).children(shown.map((i) => measured(items[i])));
    const scrolls = total > this.view && this.view > 0;
    const thumbHeight = scrolls ? Math.max(28, (this.view * this.view) / total) : 0;
    const thumbTop = scrolls ? ((this.view - thumbHeight) * this.top) / Math.max(1, total - this.view) : 0;
    return div()
      .id("pi-chat-timeline")
      .relative()
      .flex_1()
      .min_h(0)
      .w_full()
      .overflow_hidden()
      .on_size_change((size, cx) => {
        const height = size.height / zoom;
        if (Math.abs(height - this.view) < 0.5) return;
        this.view = height;
        cx.notify();
      })
      .on_scroll_wheel((event, cx) => {
        const before = `${this.top}|${this.following}`;
        this.scrollBy(event.delta.y / zoom);
        if (before !== `${this.top}|${this.following}`) cx.notify();
      })
      .child(this.following ? column.bottom(0) : column.top(first - this.top))
      .when(scrolls, (el) => el.child(div().absolute().right(3).top(thumbTop).w(4).h(thumbHeight).rounded(2).bg(thumb)));
  }
}
