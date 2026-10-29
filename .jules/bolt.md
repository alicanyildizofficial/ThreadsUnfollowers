## 2026-10-15 - Avoid Dynamic Sets on Keypress
**Learning:** In threads-unfollowers.js, rendering lists with search runs `tabCounts` and `visibleUsers` synchronously on input keystrokes. Creating `new Set(state.following.map(...))` on every keypress caused unnecessary O(N) memory allocations, risking UI jank.
**Action:** Use a pre-computed `state.followingIds` Set when dealing with large lists that update dynamically in render functions.

## 2023-10-29 - Optimize Array Sorting in Render Loop
**Learning:** Using `String.prototype.localeCompare` inside `Array.prototype.sort()` for large strings datasets on the main thread is significantly slower than using a cached `Intl.Collator` instance. The `visibleUsers` function runs dynamically on UI actions, and replacing the string sorting significantly reduces main thread blocking.
**Action:** When sorting large lists of strings, specifically in Javascript (like `threads-unfollowers.js`), prefer creating a cached `Intl.Collator` object instead of using `.localeCompare` directly in the sort callback to ensure a responsive UI.
