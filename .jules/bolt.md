## 2026-10-15 - Avoid Dynamic Sets on Keypress
**Learning:** In threads-unfollowers.js, rendering lists with search runs `tabCounts` and `visibleUsers` synchronously on input keystrokes. Creating `new Set(state.following.map(...))` on every keypress caused unnecessary O(N) memory allocations, risking UI jank.
**Action:** Use a pre-computed `state.followingIds` Set when dealing with large lists that update dynamically in render functions.

## 2026-10-15 - Caching Intl.Collator for Synchronous Rendering
**Learning:** In threads-unfollowers.js, using `String.prototype.localeCompare` inside a `.sort()` callback for large datasets during synchronous UI updates (like keystroke rendering in `visibleUsers`) can block the main thread and cause UI jank.
**Action:** Prefer instantiating a cached `Intl.Collator` object (`new Intl.Collator()`) and using its `.compare` method instead of calling `.localeCompare` repeatedly inside loops or sorts.
