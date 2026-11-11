## 2026-10-15 - Avoid Dynamic Sets on Keypress
**Learning:** In threads-unfollowers.js, rendering lists with search runs `tabCounts` and `visibleUsers` synchronously on input keystrokes. Creating `new Set(state.following.map(...))` on every keypress caused unnecessary O(N) memory allocations, risking UI jank.
**Action:** Use a pre-computed `state.followingIds` Set when dealing with large lists that update dynamically in render functions.

## 2026-11-11 - Cached Intl.Collator for Sorting
**Learning:** In threads-unfollowers.js, `String.prototype.localeCompare` inside a sort loop for large datasets blocks the main thread. Using a cached `Intl.Collator` instance is significantly faster for sorting arrays.
**Action:** Use a cached `Intl.Collator` instance instead of `localeCompare` when sorting lists of users.
