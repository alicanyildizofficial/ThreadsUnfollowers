## 2026-10-15 - Avoid Dynamic Sets on Keypress
**Learning:** In threads-unfollowers.js, rendering lists with search runs `tabCounts` and `visibleUsers` synchronously on input keystrokes. Creating `new Set(state.following.map(...))` on every keypress caused unnecessary O(N) memory allocations, risking UI jank.
**Action:** Use a pre-computed `state.followingIds` Set when dealing with large lists that update dynamically in render functions.

## 2026-11-05 - Optimize Sorting with Cached Intl.Collator
**Learning:** The application sorts large arrays of users dynamically during rendering, which happens frequently (e.g., on keystrokes). Using `String.prototype.localeCompare` directly inside a sort callback is synchronous and slow due to repeated creation and setup of the collator logic under the hood. For large datasets, this can block the main thread and cause UI jank.
**Action:** Use a pre-computed, cached `Intl.Collator` instance and its `.compare` method within the sort callback to significantly improve sorting performance during render cycles.
