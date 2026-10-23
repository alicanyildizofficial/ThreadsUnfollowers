## 2026-10-15 - Avoid Dynamic Sets on Keypress
**Learning:** In threads-unfollowers.js, rendering lists with search runs `tabCounts` and `visibleUsers` synchronously on input keystrokes. Creating `new Set(state.following.map(...))` on every keypress caused unnecessary O(N) memory allocations, risking UI jank.
**Action:** Use a pre-computed `state.followingIds` Set when dealing with large lists that update dynamically in render functions.

## 2026-10-15 - Cached Intl.Collator vs String.prototype.localeCompare
**Learning:** Using `String.prototype.localeCompare` inside a `.sort()` callback for large datasets during synchronous UI renders blocks the main thread significantly. Instantiating it per call is very expensive.
**Action:** Always prefer initializing a cached `Intl.Collator` instance and using its `.compare` method when sorting arrays with locale-aware comparisons.
