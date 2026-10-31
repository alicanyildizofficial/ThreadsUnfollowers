## 2026-10-15 - Avoid Dynamic Sets on Keypress
**Learning:** In threads-unfollowers.js, rendering lists with search runs `tabCounts` and `visibleUsers` synchronously on input keystrokes. Creating `new Set(state.following.map(...))` on every keypress caused unnecessary O(N) memory allocations, risking UI jank.
**Action:** Use a pre-computed `state.followingIds` Set when dealing with large lists that update dynamically in render functions.

## 2023-11-20 - Fast String Sorting with Cached Intl.Collator
**Learning:** Using `String.prototype.localeCompare` inside a `Array.prototype.sort()` callback function is significantly slower compared to using a cached `Intl.Collator().compare` method, causing synchronous blocking of the main thread during render loops.
**Action:** When sorting large lists of strings natively, create a cached instance of `Intl.Collator` and use its `compare` method in the sorting callback instead of `localeCompare`.
