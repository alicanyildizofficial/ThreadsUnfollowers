## 2026-10-15 - Avoid Dynamic Sets on Keypress
**Learning:** In threads-unfollowers.js, rendering lists with search runs `tabCounts` and `visibleUsers` synchronously on input keystrokes. Creating `new Set(state.following.map(...))` on every keypress caused unnecessary O(N) memory allocations, risking UI jank.
**Action:** Use a pre-computed `state.followingIds` Set when dealing with large lists that update dynamically in render functions.
## 2026-11-07 - Cached Intl.Collator for Sorting
**Learning:** Using `String.prototype.localeCompare` inside a sort callback dynamically creates a locale context on every invocation. For large arrays (like follower lists), this causes significant blocking of the main thread.
**Action:** Always instantiate and cache an `Intl.Collator` instance globally and reuse its `compare` method for array sorting to improve list rendering performance.
