## 2026-10-15 - Avoid Dynamic Sets on Keypress
**Learning:** In threads-unfollowers.js, rendering lists with search runs `tabCounts` and `visibleUsers` synchronously on input keystrokes. Creating `new Set(state.following.map(...))` on every keypress caused unnecessary O(N) memory allocations, risking UI jank.
**Action:** Use a pre-computed `state.followingIds` Set when dealing with large lists that update dynamically in render functions.

## 2026-11-10 - Cache Intl.Collator for Sorting
**Learning:** In threads-unfollowers.js, sorting large lists on the main thread using `String.prototype.localeCompare` within a callback can lead to significant synchronous blocking, as `localeCompare` initializes a new collator per call.
**Action:** Use a globally cached `Intl.Collator` instance for sorting large arrays in UI render paths.
