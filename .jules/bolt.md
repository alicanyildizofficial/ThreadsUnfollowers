## 2026-10-15 - Avoid Dynamic Sets on Keypress
**Learning:** In threads-unfollowers.js, rendering lists with search runs `tabCounts` and `visibleUsers` synchronously on input keystrokes. Creating `new Set(state.following.map(...))` on every keypress caused unnecessary O(N) memory allocations, risking UI jank.
**Action:** Use a pre-computed `state.followingIds` Set when dealing with large lists that update dynamically in render functions.

## 2026-10-15 - Cached Intl.Collator for sort operations
**Learning:** `String.prototype.localeCompare` used inside `Array.prototype.sort` callbacks blocks the main thread heavily when applied to large lists (like the users list in `threads-unfollowers.js`). Caching `new Intl.Collator` and using its `.compare` method provides significant performance improvements and prevents UI freezes during list filtering.
**Action:** When sorting strings dynamically, especially inside a render loop, prefer a cached `Intl.Collator` instance over calling `localeCompare` on each item.
