## 2026-10-15 - Avoid Dynamic Sets on Keypress
**Learning:** In threads-unfollowers.js, rendering lists with search runs `tabCounts` and `visibleUsers` synchronously on input keystrokes. Creating `new Set(state.following.map(...))` on every keypress caused unnecessary O(N) memory allocations, risking UI jank.
**Action:** Use a pre-computed `state.followingIds` Set when dealing with large lists that update dynamically in render functions.

## 2026-11-04 - Cache Intl.Collator for Sorting
**Learning:** Using `String.prototype.localeCompare` inside an array sort callback can cause performance issues because it initializes a new collator on every call. In `threads-unfollowers.js`, this was causing significant synchronous main thread blocking during keystrokes in the search box when sorting large lists.
**Action:** Always prefer initializing a cached `Intl.Collator` instance (e.g., `new Intl.Collator('tr')`) and using its `compare` method in the sort callback instead of `localeCompare`.
