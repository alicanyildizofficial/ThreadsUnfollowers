## 2026-10-15 - Avoid Dynamic Sets on Keypress
**Learning:** In threads-unfollowers.js, rendering lists with search runs `tabCounts` and `visibleUsers` synchronously on input keystrokes. Creating `new Set(state.following.map(...))` on every keypress caused unnecessary O(N) memory allocations, risking UI jank.
**Action:** Use a pre-computed `state.followingIds` Set when dealing with large lists that update dynamically in render functions.

## 2026-10-15 - Cached Intl.Collator for Sorting Main Thread Bottlenecks
**Learning:** Using `String.prototype.localeCompare` inside a `sort` callback on large data structures (like arrays of users in UI rendering logic) blocks the main thread synchronously in JS.
**Action:** Instead of re-instantiating or using inline `localeCompare`, cache an `Intl.Collator` instance globally and use its `compare` method for significant performance gains in ES5 loops without relying on web workers.
