## 2026-10-15 - Avoid Dynamic Sets on Keypress
**Learning:** In threads-unfollowers.js, rendering lists with search runs `tabCounts` and `visibleUsers` synchronously on input keystrokes. Creating `new Set(state.following.map(...))` on every keypress caused unnecessary O(N) memory allocations, risking UI jank.
**Action:** Use a pre-computed `state.followingIds` Set when dealing with large lists that update dynamically in render functions.

## 2026-10-15 - Cached Intl.Collator for sort performance
**Learning:** Using `String.prototype.localeCompare` directly in sort callbacks for large dynamically updating UI lists blocks the main thread synchronously.
**Action:** Use a pre-cached `Intl.Collator` instance instead (e.g. `var collator = new Intl.Collator('tr');`) to significantly reduce main thread blocking on each sorting operation.
