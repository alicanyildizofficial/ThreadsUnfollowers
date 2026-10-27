## 2026-10-15 - Avoid Dynamic Sets on Keypress
**Learning:** In threads-unfollowers.js, rendering lists with search runs `tabCounts` and `visibleUsers` synchronously on input keystrokes. Creating `new Set(state.following.map(...))` on every keypress caused unnecessary O(N) memory allocations, risking UI jank.
**Action:** Use a pre-computed `state.followingIds` Set when dealing with large lists that update dynamically in render functions.

## 2026-10-27 - Cache Intl.Collator for Sorting
**Learning:** String.prototype.localeCompare inside sort callbacks is synchronous and slow for large datasets. Recreating an Intl.Collator object inside the sort blocks the main thread and causes UI jank during keystrokes.
**Action:** Use a cached Intl.Collator instance for large dataset sorting in render loops.
