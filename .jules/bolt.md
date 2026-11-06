## 2026-10-15 - Avoid Dynamic Sets on Keypress
**Learning:** In threads-unfollowers.js, rendering lists with search runs `tabCounts` and `visibleUsers` synchronously on input keystrokes. Creating `new Set(state.following.map(...))` on every keypress caused unnecessary O(N) memory allocations, risking UI jank.
**Action:** Use a pre-computed `state.followingIds` Set when dealing with large lists that update dynamically in render functions.

## 2026-10-15 - Fast Locale Sorting
**Learning:** In `threads-unfollowers.js`, sorting large user lists dynamically using `String.prototype.localeCompare` inside the `sort` callback blocks the main thread synchronously.
**Action:** Always prefer using a cached `Intl.Collator` instance instead of `String.prototype.localeCompare` for sorting large datasets to prevent significant synchronous main thread blocking.
