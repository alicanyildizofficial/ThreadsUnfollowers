## 2026-10-15 - Avoid Dynamic Sets on Keypress
**Learning:** In threads-unfollowers.js, rendering lists with search runs `tabCounts` and `visibleUsers` synchronously on input keystrokes. Creating `new Set(state.following.map(...))` on every keypress caused unnecessary O(N) memory allocations, risking UI jank.
**Action:** Use a pre-computed `state.followingIds` Set when dealing with large lists that update dynamically in render functions.
## 2026-10-28 - Cached Intl.Collator for Sorting
**Learning:** Using `String.prototype.localeCompare` inside a sort callback is highly inefficient for large lists because it creates a new `Intl.Collator` instance on every comparison (O(N log N) times). This causes unnecessary memory allocations and blocks the main thread during synchronous sorting of large lists (e.g., in `threads-unfollowers.js`).
**Action:** Use a pre-computed `Intl.Collator` instance (e.g., `const collator = new Intl.Collator('tr');`) and call `collator.compare(a, b)` inside the sort callback to prevent redundant instantiations.
